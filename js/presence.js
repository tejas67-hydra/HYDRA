/**
 * HYDRA — presence. Finds the face in front of the camera and turns the
 * companion towards it. Uses BlazeFace (TF.js) when it can load, the native
 * FaceDetector where it exists, and a motion centroid as a last resort.
 * Frames never leave the device.
 */

import { bus } from './utils.js';
import { loadFaceDetector } from './models.js';

const SMOOTHING = 0.35;
const INTERVAL = 150;

class Presence {
  constructor() {
    this.video = null;
    this.stream = null;
    this.ownsStream = false;
    this.canvas = null;
    this.ctx = null;
    this.previous = null;
    this.detector = null;
    this.native = null;
    this.timer = null;
    this.running = false;
    this.busy = false;
    this.source = 'none';
    this.smooth = { x: 0.5, y: 0.5, size: 0 };
    this.last = { detected: false, x: 0.5, y: 0.5, size: 0, source: 'none' };
  }

  async start(video) {
    if (this.running) return this.last;
    this.video = video || this.sharedVideo();
    if (!this.video) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      });
      this.video = document.createElement('video');
      this.video.playsInline = true;
      this.video.muted = true;
      this.video.srcObject = this.stream;
      await this.video.play();
      this.ownsStream = true;
      this.source = 'own';
    } else {
      this.source = 'vision';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = 64;
    this.canvas.height = 48;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    if ('FaceDetector' in window) {
      try {
        this.native = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 });
      } catch {
        this.native = null;
      }
    }

    this.running = true;
    this.loop();

    loadFaceDetector()
      .then((detector) => { this.detector = detector; })
      .catch(() => { this.detector = null; });

    return this.last;
  }

  /** Reuse the Vision camera instead of opening a second stream. */
  sharedVideo() {
    const element = document.querySelector('#vision-video');
    if (element?.srcObject && element.readyState >= 2) return element;
    return null;
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
    if (this.ownsStream) {
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      if (this.video) this.video.srcObject = null;
    }
    this.video = null;
    this.previous = null;
    this.last = { detected: false, x: 0.5, y: 0.5, size: 0, source: 'off' };
    bus.emit('presence:face', this.last);
  }

  async loop() {
    if (!this.running) return;
    if (!this.busy && this.video && this.video.readyState >= 2) {
      this.busy = true;
      try {
        const face = await this.detect();
        this.publish(face);
      } finally {
        this.busy = false;
      }
    }
    this.timer = setTimeout(() => this.loop(), INTERVAL);
  }

  async detect() {
    if (this.detector) {
      try {
        const faces = await this.detector.estimateFaces(this.video, { flipHorizontal: false });
        if (faces.length) {
          const box = faces.reduce((best, face) => {
            const area = (face.box?.width ?? 0) * (face.box?.height ?? 0);
            return area > (best.box?.width ?? 0) * (best.box?.height ?? 0) ? face : best;
          });
          const b = box.box;
          if (b) {
            const vw = this.video.videoWidth || 1;
            const vh = this.video.videoHeight || 1;
            return {
              detected: true,
              x: (b.xMin + b.width / 2) / vw,
              y: (b.yMin + b.height / 2) / vh,
              size: b.width / vw,
              source: 'blazeface',
            };
          }
        }
      } catch {
        /* the detector can throw on the first frames */
      }
    }
    if (this.native) {
      try {
        const faces = await this.native.detect(this.video);
        if (faces.length) {
          const b = faces[0].boundingBox;
          const vw = this.video.videoWidth || 1;
          const vh = this.video.videoHeight || 1;
          return {
            detected: true,
            x: (b.x + b.width / 2) / vw,
            y: (b.y + b.height / 2) / vh,
            size: b.width / vw,
            source: 'native',
          };
        }
      } catch {
        /* ignore */
      }
    }
    return this.motion();
  }

  publish(face) {
    if (!face) return;
    if (face.detected) {
      this.smooth.x += (face.x - this.smooth.x) * SMOOTHING;
      this.smooth.y += (face.y - this.smooth.y) * SMOOTHING;
      this.smooth.size += (face.size - this.smooth.size) * SMOOTHING;
      this.last = {
        detected: true,
        x: this.smooth.x,
        y: this.smooth.y,
        size: this.smooth.size,
        source: face.source,
        at: performance.now(),
      };
    } else if (this.last.detected) {
      this.last = { ...this.last, detected: false, at: performance.now() };
    } else {
      return;
    }
    bus.emit('presence:face', this.last);
  }

  motion() {
    if (!this.ctx || !this.video || this.video.readyState < 2) return { detected: false, x: 0.5, y: 0.5, size: 0, source: 'motion' };
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    const frame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = frame.data;
    if (!this.previous) {
      this.previous = data.slice();
      return { detected: false, x: 0.5, y: 0.5, size: 0, source: 'motion' };
    }
    let sx = 0;
    let sy = 0;
    let weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const diff = Math.abs(data[i] - this.previous[i])
        + Math.abs(data[i + 1] - this.previous[i + 1])
        + Math.abs(data[i + 2] - this.previous[i + 2]);
      if (diff > 60) {
        const pixel = i / 4;
        sx += (pixel % this.canvas.width) * diff;
        sy += Math.floor(pixel / this.canvas.width) * diff;
        weight += diff;
      }
    }
    this.previous = data.slice();
    if (weight < 60000) return { detected: false, x: 0.5, y: 0.5, size: 0, source: 'motion' };
    return {
      detected: true,
      x: sx / weight / this.canvas.width,
      y: sy / weight / this.canvas.height,
      size: 0.2,
      source: 'motion',
    };
  }
}

export const presence = new Presence();

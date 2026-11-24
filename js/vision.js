/**
 * HYDRA — vision module.
 * Camera frames stay on the device: motion is computed from a 64×48 grayscale
 * downsample and QR/barcode decoding uses the browser's BarcodeDetector when
 * it exists. Nothing is uploaded.
 */

import { $, bus, clamp, el } from './utils.js';
import { presence } from './presence.js';
import { ai } from './ai.js';
import { settings } from './settings.js';
import { objects } from './objects.js';
import { playHud, stopHud } from './lottie-fx.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load ' + src));
    document.head.append(script);
  });
}

const COLS = 8;
const ROWS = 6;
const MOTION_THRESHOLD = 26;

class VisionEngine {
  constructor() {
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.running = false;
    this.raf = null;
    this.detector = null;
    this.prevFrame = null;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._lastDetect = 0;
    this.motion = 0;
    this.lastCodes = [];
    this.objects = [];
    this.objectsOn = false;
    this.objectModel = null;
    this._objectTimer = 0;
    this._detecting = false;
    this.ocrWorker = null;
    this.ocrBusy = false;
    this.subtitlesOn = false;
    this.recognition = null;
    this.gestureOn = false;
    this._gesture = { x: null, y: null, dir: null, flips: [], lastAt: 0 };
    this.sample = document.createElement('canvas');
    this.sample.width = 64;
    this.sample.height = 48;
    this.sampleCtx = this.sample.getContext('2d', { willReadFrequently: true });
  }

  init() {
    this.video = $('#vision-video');
    this.canvas = $('#vision-overlay');
    this.ctx = this.canvas?.getContext('2d') ?? null;
    this.detector = 'BarcodeDetector' in window
      ? new window.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'code_128', 'code_39', 'upc_a'] })
      : null;

    if (!this.detector) {
      bus.emit('vision:capability', { barcode: false });
    }
    this.bindControls();
    return this;
  }

  get active() {
    return this.running;
  }

  async start() {
    if (this.running) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      bus.emit('notify', { title: 'Camera unavailable', body: 'This browser cannot access media devices.', tone: 'warn' });
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      $('#vision-empty')?.setAttribute('hidden', '');
      this.resizeOverlay();
      this.running = true;
      this.prevFrame = null;
      this.loop();
      if (settings.get('presenceAuto') !== false && !this.presenceOn) {
        presence.start(this.video)
          .then(() => { this.presenceOn = true; })
          .catch(() => { this.presenceOn = false; });
      }
      bus.emit('vision:state', { active: true });
      bus.emit('notify', { title: 'Camera live', body: 'Frames never leave this device.', tone: 'success', timeout: 2600 });
      return true;
    } catch (err) {
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      bus.emit('notify', {
        title: denied ? 'Camera permission denied' : 'Camera failed to start',
        body: denied ? 'Allow camera access and try again.' : String(err?.message ?? err),
        tone: 'warn',
      });
      return false;
    }
  }

  stop() {
    if (this.presenceOn) { presence.stop(); this.presenceOn = false; }
    this.running = false;
    this.objectsOn = false;
    this.objects = [];
    this.stopSubtitles();
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    $('#vision-empty')?.removeAttribute('hidden');
    const fpsEl = $('#vision-fps');
    if (fpsEl) fpsEl.textContent = '0 fps';
    bus.emit('vision:state', { active: false });
  }

  async toggle() {
    return this.running ? (this.stop(), false) : this.start();
  }

  resizeOverlay() {
    if (!this.canvas || !this.video) return;
    const rect = this.video.getBoundingClientRect();
    this.canvas.width = Math.max(2, Math.round(rect.width));
    this.canvas.height = Math.max(2, Math.round(rect.height));
    const resEl = $('#vision-res');
    if (resEl) resEl.textContent = `${this.video.videoWidth}×${this.video.videoHeight}`;
  }

  loop() {
    if (!this.running) return;
    const now = performance.now();
    this._fpsAccum += 16.7;
    this._fpsFrames += 1;

    this.draw();

    if (now - this._lastDetect > 280 && this.detector && this.video && this.video.readyState >= 2) {
      this._lastDetect = now;
      this.detectCodes();
    }
    if (this.objectsOn && this.objectModel && now - this._objectTimer > 850 && this.video && this.video.readyState >= 2) {
      this._objectTimer = now;
      this.detectObjects();
    }

    this.raf = requestAnimationFrame(() => this.loop());
  }

  draw() {
    if (!this.ctx || !this.canvas) return;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const blocks = this.detectMotion();
    const cellW = canvas.width / COLS;
    const cellH = canvas.height / ROWS;

    for (const block of blocks) {
      const x = block.col * cellW;
      const y = block.row * cellH;
      ctx.fillStyle = `hsl(268 91% 70% / ${clamp(block.energy / 90, 0.08, 0.32)})`;
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
      ctx.strokeStyle = 'hsl(190 92% 70% / 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
    }

    for (const code of this.lastCodes) {
      if (!code.box) continue;
      const { x, y, width, height } = code.box;
      const sx = canvas.width / (this.video.videoWidth || canvas.width);
      const sy = canvas.height / (this.video.videoHeight || canvas.height);
      ctx.strokeStyle = 'hsl(190 92% 66%)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x * sx, y * sy, width * sx, height * sy);
      ctx.fillStyle = 'hsl(190 92% 66%)';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(code.rawValue?.slice(0, 42) ?? '', x * sx + 4, Math.max(12, y * sy - 6));
    }

    for (const object of this.objects) {
      const [x, y, width, height] = object.bbox;
      const sx = canvas.width / (this.video.videoWidth || canvas.width);
      const sy = canvas.height / (this.video.videoHeight || canvas.height);
      ctx.strokeStyle = 'hsl(150 80% 62% / 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x * sx, y * sy, width * sx, height * sy);
      const label = object.class + ' ' + Math.round(object.score * 100) + '%';
      ctx.font = '600 12px ui-monospace, monospace';
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = 'hsl(150 70% 20% / 0.85)';
      ctx.fillRect(x * sx, Math.max(0, y * sy - 18), tw, 18);
      ctx.fillStyle = '#d1fae5';
      ctx.fillText(label, x * sx + 4, Math.max(12, y * sy - 5));
    }

    if (this._fpsAccum >= 500) {
      this.fps = Math.round((this._fpsFrames * 1000) / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
      const fpsEl = $('#vision-fps');
      if (fpsEl) fpsEl.textContent = `${this.fps} fps`;
    }
  }

  detectMotion() {
    if (!this.video || this.video.readyState < 2) return [];
    this.sampleCtx.drawImage(this.video, 0, 0, 64, 48);
    const frame = this.sampleCtx.getImageData(0, 0, 64, 48);
    const data = frame.data;

    if (!this.prevFrame) {
      this.prevFrame = new Uint8ClampedArray(data.length);
      this.prevFrame.set(data);
      return [];
    }

    const cellW = Math.floor(64 / COLS);
    const cellH = Math.floor(48 / ROWS);
    const energies = new Float32Array(COLS * ROWS);

    for (let y = 0; y < 48; y += 1) {
      const row = Math.floor(y / cellH);
      for (let x = 0; x < 64; x += 1) {
        const col = Math.floor(x / cellW);
        const i = (y * 64 + x) * 4;
        const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        const prevLum = (this.prevFrame[i] * 0.299 + this.prevFrame[i + 1] * 0.587 + this.prevFrame[i + 2] * 0.114);
        energies[row * COLS + col] += Math.abs(lum - prevLum);
      }
    }

    this.prevFrame.set(data);
    const perCell = cellW * cellH;
    const blocks = [];
    let total = 0;
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const energy = energies[row * COLS + col] / perCell;
        total += energy;
        if (energy > MOTION_THRESHOLD) blocks.push({ row, col, energy });
      }
    }
    this.motion = total / (COLS * ROWS);
    if (this.gestureOn) this.readGesture(blocks);
    return blocks;
  }

  async detectCodes() {
    if (!this.detector) return;
    try {
      const codes = await this.detector.detect(this.video);
      if (codes.length) {
        const signature = codes.map((c) => c.rawValue).join('|');
        const prevSignature = this.lastCodes.map((c) => c.rawValue).join('|');
        this.lastCodes = codes;
        if (signature !== prevSignature) {
          const value = codes[0].rawValue;
          this.setResult(`detected: ${codes[0].format}\n${value}`);
          bus.emit('vision:code', { value, format: codes[0].format });
          bus.emit('notify', { title: 'Code detected', body: String(value).slice(0, 90), tone: 'success' });
        }
      } else if (this.lastCodes.length) {
        this.lastCodes = [];
      }
    } catch {
      /* detector can throw on odd frames */
    }
  }

  bindControls() {
    document.querySelectorAll('[data-vision-act]').forEach((button) => {
      button.addEventListener('click', () => {
        const act = button.dataset.visionAct;
        if (act === 'ocr') this.ocr();
        if (act === 'objects') this.toggleObjects(button);
        if (act === 'gestures') this.toggleGestures(button);
        if (act === 'subtitles') this.toggleSubtitles(button);
        if (act === 'snapshot') this.snapshot();
        if (act === 'presence') this.togglePresence(button);
        if (act === 'identify') this.identify(button);
        if (act === 'thousand') this.detect1000(button);
        if (act === 'ask') this.askAnything();
      });
    });
  }

  async togglePresence(button) {
    if (!this.running) {
      bus.emit('notify', { title: 'Camera is off', body: 'Start the camera to follow you.', tone: 'warn' });
      return;
    }
    if (this.presenceOn) {
      presence.stop();
      this.presenceOn = false;
      button?.classList.remove('is-active');
      this.setResult('presence off');
      return;
    }
    try {
      await presence.start();
      this.presenceOn = true;
      button?.classList.add('is-active');
      this.setResult('presence on — HYDRA turns towards you');
      bus.emit('notify', { title: 'Following you', body: 'Face detection is running on this device.', tone: 'success' });
    } catch (err) {
      this.setResult('camera permission needed for presence');
      bus.emit('notify', { title: 'Presence unavailable', body: String(err?.message ?? err).slice(0, 90), tone: 'warn' });
    }
  }

  async identify(button) {
    if (!this.running) {
      bus.emit('notify', { title: 'Camera is off', body: 'Start the camera to identify what it sees.', tone: 'warn' });
      return;
    }
    button?.classList.add('is-active');
    this.setResult('looking at this frame…');
    const hud = document.createElement('div');
    hud.className = 'hud-lottie';
    (this.canvas?.parentElement || document.querySelector('#view-vision')).append(hud);
    const animation = await playHud(hud).catch(() => null);
    const dataUrl = this.frameCanvas().toDataURL('image/jpeg', 0.85);
    try {
      let text = '';
      try {
        text = await ai.describeImage(dataUrl);
      } catch {
        text = '';
      }
      if (text) {
        this.setResult(text);
        bus.emit('vision:identified', { text, mode: 'provider' });
        bus.emit('notify', { title: 'Scene identified', body: text.replace(/\s+/g, ' ').slice(0, 90), tone: 'success' });
        return;
      }
      this.setResult('no provider key — running on-device labels (first run downloads the model)…');
      const items = await Promise.race([
        objects.identify(dataUrl),
        new Promise((_, reject) => setTimeout(() => reject(new Error('model timeout')), 30000)),
      ]).catch(() => objects.localReport(dataUrl));
      const lines = items.map((p) => p.label + ' ' + Math.round(p.score * 100) + '%').join('\n');
      this.setResult('on-device identification:\n' + (lines || 'nothing confident in this frame'));
      bus.emit('vision:identified', { text: lines, mode: 'clip', items });
    } catch (err) {
      this.setResult('identification needs a provider key or the CLIP download (~90 MB).');
      bus.emit('notify', { title: 'Identify unavailable', body: String(err?.message ?? err).slice(0, 90), tone: 'warn' });
    } finally {
      button?.classList.remove('is-active');
      stopHud(animation);
      hud.remove();
    }
  }

  async detect1000(button) {
    if (!this.running) {
      bus.emit('notify', { title: 'Camera is off', body: 'Start the camera first.', tone: 'warn' });
      return;
    }
    button?.classList.add('is-active');
    this.setResult('loading the 1000-class model…');
    try {
      const predictions = await objects.classify(this.frameCanvas(), 6);
      this.setResult('1000 classes:\n' + predictions.map((p) => p.label + ' ' + Math.round(p.score * 100) + '%').join('\n'));
      bus.emit('vision:objects', { mode: 'imagenet', items: predictions });
    } catch (err) {
      this.setResult('the 1000-class model needs one network load.');
      bus.emit('notify', { title: 'Model unavailable', body: String(err?.message ?? err).slice(0, 90), tone: 'warn' });
    } finally {
      button?.classList.remove('is-active');
    }
  }

  async askAnything() {
    if (!this.running) {
      bus.emit('notify', { title: 'Camera is off', body: 'Start the camera first.', tone: 'warn' });
      return;
    }
    const input = $('#vision-query');
    const raw = input?.value.trim();
    if (!raw) {
      this.setResult('type what to look for, e.g. "cat, dog, laptop"');
      input?.focus();
      return;
    }
    const labels = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (labels.length < 2) labels.push('something else');
    this.setResult('loading open-vocabulary model… first run downloads about 90 MB');
    try {
      const output = await objects.ask(this.frameCanvas().toDataURL('image/jpeg', 0.9), labels);
      this.setResult('open vocabulary:\n' + output.map((p) => p.label + ' ' + Math.round(p.score * 100) + '%').join('\n'));
      bus.emit('vision:objects', { mode: 'clip', items: output });
    } catch (err) {
      this.setResult('open-vocabulary model needs a network load (~90 MB, cached after).');
      bus.emit('notify', { title: 'CLIP unavailable', body: String(err?.message ?? err).slice(0, 90), tone: 'warn' });
    }
  }

  frameCanvas() {
    const shot = document.createElement('canvas');
    shot.width = this.video.videoWidth;
    shot.height = this.video.videoHeight;
    shot.getContext('2d').drawImage(this.video, 0, 0);
    return shot;
  }

  async ocr() {
    if (!this.running) {
      bus.emit('notify', { title: 'Camera is off', body: 'Start the camera to read text.', tone: 'warn' });
      return null;
    }
    if (this.ocrBusy) return null;
    this.ocrBusy = true;
    this.setResult('reading text on this device…');
    try {
      if (!window.Tesseract) {
        await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      }
      if (!this.ocrWorker) this.ocrWorker = await window.Tesseract.createWorker('eng');
      const { data } = await this.ocrWorker.recognize(this.frameCanvas());
      const text = String(data.text || '').trim();
      if (text) {
        this.setResult('text read:\n' + text.slice(0, 700));
        bus.emit('vision:ocr', { text });
        bus.emit('notify', { title: 'Text read', body: text.slice(0, 80), tone: 'success' });
      } else {
        this.setResult('no readable text in this frame');
      }
      return text;
    } catch (err) {
      this.setResult('text reading needs one network load (tesseract.js).');
      bus.emit('notify', { title: 'OCR unavailable', body: String(err?.message ?? err).slice(0, 90), tone: 'warn' });
      return null;
    } finally {
      this.ocrBusy = false;
    }
  }

  async toggleObjects(button) {
    if (!this.running) {
      bus.emit('notify', { title: 'Camera is off', body: 'Start the camera first.', tone: 'warn' });
      return;
    }
    if (this.objectsOn) {
      this.objectsOn = false;
      this.objects = [];
      button?.classList.remove('is-active');
      this.setResult('object detection off');
      return;
    }
    this.setResult('loading object model…');
    try {
      if (!window.tf) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
      if (!window.cocoSsd) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
      if (!this.objectModel) this.objectModel = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
      this.objectsOn = true;
      button?.classList.add('is-active');
      this.setResult('object detection on');
    } catch (err) {
      this.setResult('object model needs one network load.');
      bus.emit('notify', { title: 'Object model unavailable', body: String(err?.message ?? err).slice(0, 90), tone: 'warn' });
    }
  }

  async detectObjects() {
    if (this._detecting || !this.objectModel || !this.running) return;
    this._detecting = true;
    try {
      const predictions = await this.objectModel.detect(this.video);
      this.objects = predictions.filter((p) => p.score > 0.5).slice(0, 8);
      if (this.objects.length) {
        const summary = this.objects.map((o) => o.class + ' ' + Math.round(o.score * 100) + '%').join(' · ');
        this.setResult('objects: ' + summary);
      }
    } catch {
      /* frame skipped */
    } finally {
      this._detecting = false;
    }
  }

  toggleGestures(button) {
    this.gestureOn = !this.gestureOn;
    button?.classList.toggle('is-active', this.gestureOn);
    this.setResult(this.gestureOn ? 'gestures on — swipe left, right, up or down' : 'gestures off');
  }

  readGesture(blocks) {
    if (!blocks.length) return;
    let sx = 0;
    let sy = 0;
    let weight = 0;
    for (const b of blocks) {
      sx += (b.col + 0.5) * (64 / COLS) * b.energy;
      sy += (b.row + 0.5) * (48 / ROWS) * b.energy;
      weight += b.energy;
    }
    if (!weight) return;
    const x = sx / weight;
    const y = sy / weight;
    const prev = this._gesture;
    if (prev.x == null) { prev.x = x; prev.y = y; return; }
    const dx = x - prev.x;
    const dy = y - prev.y;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    const now = performance.now();
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      if (dir !== prev.dir) {
        prev.flips.push({ dir, at: now });
        prev.flips = prev.flips.filter((f) => now - f.at < 1500);
      }
      if (now - prev.lastAt > 650) {
        prev.lastAt = now;
        const label = 'gesture: swipe ' + dir;
        this.setResult(label);
        bus.emit('vision:gesture', { gesture: 'swipe-' + dir });
      }
      prev.dir = dir;
    }
    prev.x = x;
    prev.y = y;
  }

  toggleSubtitles(button) {
    if (this.subtitlesOn) {
      this.stopSubtitles();
      button?.classList.remove('is-active');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      bus.emit('notify', { title: 'Subtitles unavailable', body: 'This browser has no speech recognition.', tone: 'warn' });
      return;
    }
    this.recognition = new SR();
    this.recognition.lang = navigator.language || 'en-US';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.onresult = (event) => {
      let line = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        line += event.results[i][0].transcript;
      }
      this.showSubtitle(line.trim());
    };
    this.recognition.onend = () => {
      if (this.subtitlesOn) {
        try { this.recognition.start(); } catch { /* restarting */ }
      }
    };
    try {
      this.recognition.start();
      this.subtitlesOn = true;
      button?.classList.add('is-active');
      this.showSubtitle('listening…');
      $('#vision-subtitles')?.removeAttribute('hidden');
    } catch {
      bus.emit('notify', { title: 'Subtitles blocked', body: 'Allow the microphone to show live subtitles.', tone: 'warn' });
    }
  }

  stopSubtitles() {
    this.subtitlesOn = false;
    try { this.recognition?.stop(); } catch { /* ignore */ }
    this.recognition = null;
    const node = $('#vision-subtitles');
    if (node) { node.hidden = true; node.textContent = ''; }
  }

  showSubtitle(text) {
    const node = $('#vision-subtitles');
    if (node) {
      node.hidden = false;
      node.textContent = text || 'listening…';
    }
  }

  setResult(text) {
    const node = $('#vision-result');
    if (node) node.textContent = text;
  }

  snapshot() {
    if (!this.video || !this.running) {
      bus.emit('notify', { title: 'Camera is off', body: 'Start the camera before taking a snapshot.', tone: 'warn' });
      return null;
    }
    const shot = document.createElement('canvas');
    shot.width = this.video.videoWidth;
    shot.height = this.video.videoHeight;
    shot.getContext('2d').drawImage(this.video, 0, 0);
    const dataUrl = shot.toDataURL('image/png');
    this.setResult(`snapshot: ${shot.width}×${shot.height}\n${new Date().toLocaleTimeString()}`);
    bus.emit('vision:snapshot', { dataUrl });
    return dataUrl;
  }

  describe() {
    return {
      active: this.running,
      barcode: Boolean(this.detector),
      fps: this.fps,
      motion: Math.round(this.motion),
      objects: this.objectsOn,
      gestures: this.gestureOn,
      subtitles: this.subtitlesOn,
      ocr: Boolean(this.ocrWorker),
    };
  }
}

export const vision = new VisionEngine();

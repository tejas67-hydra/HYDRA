/**
 * HYDRA — computer vision suite.
 * Face, pose, hand and person-mask models run locally through TF.js.
 * The camera stream is shared with vision.js; frames are never uploaded.
 */

import { $, $$, bus } from './utils.js';
import { vision } from './vision.js';

import { loadModel } from './models.js';

const MODELS = {
  faces: 'BlazeFace',
  pose: 'MoveNet Lightning',
  hands: 'MediaPipe Hand Landmarker',
  mask: 'BodyPix MobileNet',
};

const POSE_EDGES = [
  ['left_eye', 'right_eye'], ['left_eye', 'left_ear'], ['right_eye', 'right_ear'],
  ['left_shoulder', 'right_shoulder'], ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'], ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'], ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'], ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
];

const HAND_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
  [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const detectors = new Map();
async function ensure(mode) {
  if (!detectors.has(mode)) detectors.set(mode, loadModel(mode));
  return detectors.get(mode);
}

const state = {
  mode: null,
  gen: 0,
  busy: false,
  raf: 0,
  lastAt: 0,
  count: 0,
  latency: 0,
  error: null,
};

let canvas = null;
let ctx = null;
let maskCanvas = null;

function setStatus(text, tone) {
  const chip = $('#cv-status');
  if (chip) {
    chip.textContent = text;
    chip.dataset.tone = tone || '';
  }
}

function countLabel(mode, count) {
  const one = { faces: 'face', pose: 'pose', hands: 'hand', mask: 'person' }[mode] ?? mode;
  const many = { faces: 'faces', pose: 'poses', hands: 'hands', mask: 'people' }[mode] ?? mode;
  return `${count} ${count === 1 ? one : many}`;
}

function setMeta(text) {
  const meta = $('#cv-meta');
  if (meta) meta.textContent = text;
}

function syncCanvas() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(2, Math.round(rect.width));
  const height = Math.max(2, Math.round(rect.height));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/** Map a video-space box into the letterboxed canvas. */
function mapper() {
  const video = vision.video;
  const vw = video?.videoWidth || 1;
  const vh = video?.videoHeight || 1;
  const scale = Math.max(canvas.width / vw, canvas.height / vh);
  const ox = (canvas.width - vw * scale) / 2;
  const oy = (canvas.height - vh * scale) / 2;
  return {
    x: (v) => v * scale + ox,
    y: (v) => v * scale + oy,
    nx: (v) => v * vw * scale + ox,
    ny: (v) => v * vh * scale + oy,
    scale,
  };
}

function label(text, x, y, color) {
  ctx.font = '600 11px ui-monospace, monospace';
  const width = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(8, 4, 16, .78)';
  ctx.fillRect(x, Math.max(0, y - 15), width, 16);
  ctx.fillStyle = color;
  ctx.fillText(text, x + 4, Math.max(11, y - 3));
}

function drawFaces(faces, map) {
  faces.forEach((face, index) => {
    const box = face.box ?? {};
    const x = map.x(box.xMin ?? 0);
    const y = map.y(box.yMin ?? 0);
    const w = (box.width ?? 0) * map.scale;
    const h = (box.height ?? 0) * map.scale;
    ctx.strokeStyle = 'hsl(190 92% 66%)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    label(`face ${index + 1}`, x, y, '#a5f3fc');
    for (const point of face.keypoints ?? []) {
      ctx.beginPath();
      ctx.arc(map.x(point.x), map.y(point.y), 2, 0, Math.PI * 2);
      ctx.fillStyle = '#67e8f9';
      ctx.fill();
    }
  });
}

function drawPose(poses, map) {
  for (const pose of poses) {
    const points = new Map((pose.keypoints ?? []).map((point) => [point.name, point]));
    ctx.strokeStyle = 'hsl(268 91% 72%)';
    ctx.lineWidth = 3;
    for (const [a, b] of POSE_EDGES) {
      const p1 = points.get(a);
      const p2 = points.get(b);
      if (!p1 || !p2 || (p1.score ?? 1) < 0.3 || (p2.score ?? 1) < 0.3) continue;
      ctx.beginPath();
      ctx.moveTo(map.x(p1.x), map.y(p1.y));
      ctx.lineTo(map.x(p2.x), map.y(p2.y));
      ctx.stroke();
    }
    for (const point of pose.keypoints ?? []) {
      if ((point.score ?? 1) < 0.3) continue;
      ctx.beginPath();
      ctx.arc(map.x(point.x), map.y(point.y), 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#e9d5ff';
      ctx.fill();
    }
  }
  const nose = poses[0]?.keypoints?.find((point) => point.name === 'nose');
  if (nose) label(`pose ${Math.round((nose.score ?? 0) * 100)}%`, map.x(nose.x), map.y(nose.y) - 14, '#e9d5ff');
}

function drawHands(hands, map) {
  for (const hand of hands) {
    const points = hand.keypoints ?? [];
    ctx.strokeStyle = 'hsl(150 80% 62%)';
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_EDGES) {
      const p1 = points[a];
      const p2 = points[b];
      if (!p1 || !p2) continue;
      ctx.beginPath();
      ctx.moveTo(map.nx(p1.x), map.ny(p1.y));
      ctx.lineTo(map.nx(p2.x), map.ny(p2.y));
      ctx.stroke();
    }
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(map.nx(point.x), map.ny(point.y), 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#86efac';
      ctx.fill();
    }
    if (points[0]) label(hand.handedness || 'hand', map.nx(points[0].x), map.ny(points[0].y) - 14, '#86efac');
  }
}

function drawMask(segmentation) {
  const { width, height, data } = segmentation;
  if (!maskCanvas) maskCanvas = document.createElement('canvas');
  if (maskCanvas.width !== width || maskCanvas.height !== height) {
    maskCanvas.width = width;
    maskCanvas.height = height;
  }
  const mctx = maskCanvas.getContext('2d');
  const image = mctx.createImageData(width, height);
  for (let i = 0; i < data.length; i += 1) {
    const p = i * 4;
    if (data[i]) {
      image.data[p] = 168;
      image.data[p + 1] = 85;
      image.data[p + 2] = 247;
      image.data[p + 3] = 120;
    }
  }
  mctx.putImageData(image, 0, 0);
  const video = vision.video;
  const vw = video?.videoWidth || width;
  const vh = video?.videoHeight || height;
  const scale = Math.max(canvas.width / vw, canvas.height / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(maskCanvas, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
}

async function infer() {
  if (state.busy || !state.mode) return;
  const detector = detectors.get(state.mode);
  const video = vision.video;
  if (!detector || !video || video.readyState < 2) return;
  state.busy = true;
  const gen = state.gen;
  const started = performance.now();
  try {
    const map = mapper();
    const mode = state.mode;
    if (mode === 'faces') {
      const faces = await detector.estimateFaces(video, { flipHorizontal: false });
      if (gen !== state.gen) return;
      state.count = faces.length;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawFaces(faces, map);
    } else if (mode === 'pose') {
      const poses = await detector.estimatePoses(video);
      if (gen !== state.gen) return;
      state.count = poses.length;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawPose(poses, map);
    } else if (mode === 'hands') {
      const result = detector.detectForVideo(video, performance.now());
      if (gen !== state.gen) return;
      const hands = (result.landmarks ?? []).map((landmarks, index) => ({
        handedness: result.handednesses?.[index]?.[0]?.categoryName ?? 'hand',
        keypoints: landmarks.map((point, key) => ({ x: point.x, y: point.y, name: String(key) })),
      }));
      state.count = hands.length;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawHands(hands, map);
    } else if (mode === 'mask') {
      const segmentation = await detector.segmentPerson(video, {
        internalResolution: 'low', segmentationThreshold: 0.7,
      });
      if (gen !== state.gen) return;
      state.count = segmentation.data.some(Boolean) ? 1 : 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawMask(segmentation);
    }
    state.latency = Math.round(performance.now() - started);
    state.error = null;
    setMeta(`${MODELS[state.mode]} · ${countLabel(state.mode, state.count)} · ${state.latency} ms`);
    setStatus('live', 'ok');
  } catch (err) {
    if (gen !== state.gen) return;
    state.error = err;
    setStatus('error', 'warn');
    setMeta(String(err?.message ?? err).slice(0, 120));
  } finally {
    state.busy = false;
  }
}

function frame() {
  if (!state.mode) return;
  if (!vision.active) {
    state.raf = 0;
    return;
  }
  syncCanvas();
  const interval = state.mode === 'mask' ? 600 : 90;
  const now = performance.now();
  if (now - state.lastAt >= interval) {
    state.lastAt = now;
    infer();
  }
  state.raf = requestAnimationFrame(frame);
}

function startLoop() {
  if (state.raf) return;
  syncCanvas();
  state.raf = requestAnimationFrame(frame);
}

function stopLoop() {
  cancelAnimationFrame(state.raf);
  state.raf = 0;
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
  state.count = 0;
  state.latency = 0;
}

function markButtons() {
  for (const button of $$('[data-cv-mode]')) {
    button.classList.toggle('is-on', button.dataset.cvMode === state.mode);
    button.setAttribute('aria-pressed', String(button.dataset.cvMode === state.mode));
  }
}

async function select(mode) {
  if (state.mode === mode) {
    stop();
    return;
  }
  if (!vision.active) {
    const started = await vision.start();
    if (!started) {
      setStatus('camera off', 'warn');
      setMeta('Start the camera first, then pick a model.');
      return;
    }
  }
  state.gen += 1;
  state.mode = mode;
  markButtons();
  setStatus('loading…');
  setMeta(`Downloading ${MODELS[mode]} once; it runs on this device after that.`);
  try {
    await ensure(mode);
    setStatus('live', 'ok');
    setMeta(`${MODELS[mode]} ready.`);
    startLoop();
  } catch (err) {
    state.mode = null;
    markButtons();
    setStatus('model failed', 'warn');
    setMeta(String(err?.message ?? err).slice(0, 120));
    bus.emit('notify', {
      title: 'Model unavailable',
      body: 'Could not load ' + MODELS[mode] + '. Check the connection and retry.',
      tone: 'warn',
    });
  }
}

function stop() {
  state.gen += 1;
  stopLoop();
  state.mode = null;
  markButtons();
  setStatus('idle');
  setMeta('Pick a model. It downloads once, then runs on this device.');
}

export const cv = {
  init,
  select,
  stop,
  load: async (mode) => {
    await ensure(mode);
    return detectors.get(mode);
  },
  get mode() { return state.mode; },
  get loaded() { return [...detectors.keys()]; },
};

function init() {
  canvas = $('#vision-cv');
  ctx = canvas?.getContext('2d') ?? null;
  if (!canvas) return;

  for (const button of $$('[data-cv-mode]')) {
    button.addEventListener('click', () => select(button.dataset.cvMode));
  }
  const off = $('#cv-off');
  off?.addEventListener('click', stop);

  bus.on('vision:state', ({ active }) => {
    if (!active) {
      stopLoop();
      setStatus('idle');
      setMeta('Camera stopped. Pick a model to restart it.');
    } else if (state.mode) {
      setStatus('live', 'ok');
      startLoop();
    }
  });

  window.addEventListener('resize', syncCanvas);
}

/**
 * HYDRA — shared, cached model loaders.
 * Every loader resolves once and is reused by the CV panel and presence.
 */

const CDN = 'https://cdn.jsdelivr.net/npm/';
const SCRIPTS = {
  tf: CDN + '@tensorflow/tfjs@4.22.0/dist/tf.min.js',
  faces: CDN + '@tensorflow-models/face-detection@1.0.2/dist/face-detection.min.js',
  pose: CDN + '@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js',
  mask: CDN + '@tensorflow-models/body-pix@2.2.0/dist/body-pix.min.js',
};

const MP = {
  tasks: CDN + '@mediapipe/tasks-vision@0.10.14',
  wasm: CDN + '@mediapipe/tasks-vision@0.10.14/wasm',
  hands: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
};

const scripts = new Map();
export function loadScript(src) {
  if (scripts.has(src)) return scripts.get(src);
  const job = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Could not load ' + src.split('/').pop()));
    document.head.append(tag);
  });
  scripts.set(src, job);
  return job;
}

export async function ensureTf() {
  if (!window.tf) await loadScript(SCRIPTS.tf);
  await window.tf.ready();
  return window.tf;
}

const models = new Map();
function once(key, factory) {
  if (!models.has(key)) models.set(key, factory());
  return models.get(key);
}

export function loadFaceDetector() {
  return once('faces', async () => {
    await ensureTf();
    await loadScript(SCRIPTS.faces);
    return window.faceDetection.createDetector(
      window.faceDetection.SupportedModels.MediaPipeFaceDetector,
      { runtime: 'tfjs', maxFaces: 5, modelType: 'short' },
    );
  });
}

export function loadPoseDetector() {
  return once('pose', async () => {
    await ensureTf();
    await loadScript(SCRIPTS.pose);
    const pd = window.poseDetection;
    return pd.createDetector(pd.SupportedModels.MoveNet, {
      modelType: pd.movenet.modelType.SINGLEPOSE_LIGHTNING,
      enableSmoothing: true,
    });
  });
}

let mpTasks = null;
export function loadHandLandmarker() {
  return once('hands', async () => {
    if (!mpTasks) mpTasks = await import(MP.tasks);
    const fileset = await mpTasks.FilesetResolver.forVisionTasks(MP.wasm);
    const make = (delegate) => mpTasks.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MP.hands, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
    });
    try {
      return await make('GPU');
    } catch {
      return await make('CPU');
    }
  });
}

export function loadBodyPix() {
  return once('mask', async () => {
    await ensureTf();
    await loadScript(SCRIPTS.mask);
    return window.bodyPix.load({
      architecture: 'MobileNetV1', outputStride: 16, multiplier: 0.75, quantBytes: 2,
    });
  });
}

export function loadModel(mode) {
  return {
    faces: loadFaceDetector,
    pose: loadPoseDetector,
    hands: loadHandLandmarker,
    mask: loadBodyPix,
  }[mode]?.() ?? Promise.reject(new Error('Unknown mode ' + mode));
}

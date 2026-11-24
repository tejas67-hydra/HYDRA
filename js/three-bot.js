/**
 * HYDRA — 3D companion (Three.js). Rounded-rect shell, cat ears, glossy visor
 * with happy crescent eyes, chest emblem and glowing wheels. Breathes, blinks,
 * tracks the pointer or your face, reacts to pose and emotion.
 */

import { bus } from './utils.js';

const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://unpkg.com/three@0.160.0/build/three.module.js',
  'https://esm.sh/three@0.160.0',
];

const EYE_COLORS = {
  neutral: 0xc4b5fd, happy: 0xd8b4fe, excited: 0xe9d5ff, curious: 0xa78bfa,
  thinking: 0x8b5cf6, listening: 0x93c5fd, focused: 0x7dd3fc, concerned: 0xfca5a5,
  sad: 0x93a3f8, angry: 0xfb7185, love: 0xf9a8d4, sleepy: 0x8b7bb8,
  surprised: 0xfde68a, playful: 0xf0abfc, proud: 0xc084fc, scared: 0xbfdbfe,
};

let scene = null;

export function webglSupport() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

function autoMode() {
  const wide = window.matchMedia('(min-width: 981px)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  return wide && cores >= 4 && webglSupport() ? 'on' : 'off';
}

function roundedShape(THREE, width, height, radius) {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  return shape;
}

function roundedBox(THREE, width, height, radius, depth, material, bevel = 0.05) {
  const geometry = new THREE.ExtrudeGeometry(roundedShape(THREE, width, height, radius), {
    depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 5, curveSegments: 22,
  });
  geometry.center();
  return new THREE.Mesh(geometry, material);
}

function build(THREE) {
  const scene3 = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 460 / 520, 0.1, 100);
  camera.position.set(0, 0.55, 8.6);

  scene3.add(new THREE.AmbientLight(0x6d28d9, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3.5, 5, 5);
  scene3.add(key);
  const rim = new THREE.PointLight(0xa855f7, 60, 26);
  rim.position.set(-4.5, 2, -3.5);
  scene3.add(rim);
  const fill = new THREE.PointLight(0x38bdf8, 22, 22);
  fill.position.set(4.5, -1.5, 3);
  scene3.add(fill);

  const shell = new THREE.MeshPhysicalMaterial({
    color: 0xf2ecff, roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.22,
  });
  const black = new THREE.MeshPhysicalMaterial({
    color: 0x150b2b, roughness: 0.12, metalness: 0.8, clearcoat: 1, clearcoatRoughness: 0.1,
  });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x3b1a63, roughness: 0.4, metalness: 0.75 });
  const earMat = new THREE.MeshStandardMaterial({
    color: 0x5b21b6, emissive: 0x7c3aed, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.6, flatShading: true,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xe9d5ff, emissive: 0xb388ff, emissiveIntensity: 1.35, roughness: 0.28,
  });

  const rig = new THREE.Group();
  scene3.add(rig);

  const head = new THREE.Group();
  head.position.y = 0.86;
  rig.add(head);

  const skull = roundedBox(THREE, 2.24, 1.72, 0.62, 0.62, shell, 0.09);
  skull.scale.z = 1.05;
  head.add(skull);

  const faceRim = roundedBox(THREE, 2.06, 1.54, 0.56, 0.2, rimMat, 0.04);
  faceRim.position.z = 0.42;
  head.add(faceRim);

  const visor = roundedBox(THREE, 1.96, 1.44, 0.52, 0.3, black, 0.06);
  visor.position.z = 0.52;
  head.add(visor);

  // Face decals drawn on canvas: crisp crescents, lashes and a smile.
  const makeFaceTexture = (width, height, draw) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    draw(ctx, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  };

  const eyesTexture = makeFaceTexture(512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#f2e9ff';
    ctx.shadowColor = 'rgba(168,85,247,0.95)';
    ctx.shadowBlur = 26;
    ctx.lineCap = 'round';
    ctx.lineWidth = 30;
    for (const cx of [w * 0.27, w * 0.73]) {
      ctx.beginPath();
      ctx.arc(cx, h * 0.62, 64, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
      for (let i = 0; i < 3; i += 1) {
        const dir = cx < w / 2 ? -1 : 1;
        const x = cx + dir * (34 + i * 26);
        const y = h * 0.62 + 18 + i * 10;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dir * (16 + i * 6), y + 26);
        ctx.stroke();
      }
      ctx.lineWidth = 30;
    }
  });

  const mouthTexture = makeFaceTexture(256, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#f2e9ff';
    ctx.shadowColor = 'rgba(168,85,247,0.9)';
    ctx.shadowBlur = 18;
    ctx.lineCap = 'round';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.3, 46, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
  });

  const eyeMat = new THREE.MeshBasicMaterial({
    map: eyesTexture, transparent: true, depthWrite: false, depthTest: false,
  });
  const eyesMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.82, 0.91), eyeMat);
  eyesMesh.position.set(0, 0.18, 0.78);
  eyesMesh.renderOrder = 6;
  head.add(eyesMesh);

  const mouthMat = new THREE.MeshBasicMaterial({
    map: mouthTexture, transparent: true, depthWrite: false, depthTest: false,
  });
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.33), mouthMat);
  mouth.position.set(0, -0.34, 0.78);
  mouth.renderOrder = 6;
  head.add(mouth);

  // Cat ears.
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.92, 4), earMat);
    ear.scale.set(1.3, 1, 0.42);
    ear.position.set(side * 0.86, 0.98, 0.02);
    ear.rotation.z = side * -0.42;
    ear.rotation.y = Math.PI * 0.25;
    head.add(ear);
    ears.push(ear);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), glowMat.clone());
    tip.position.set(side * 1.16, 1.42, 0.02);
    head.add(tip);
    ears.push(tip);
  }

  const body = new THREE.Group();
  body.position.y = -0.52;
  rig.add(body);

  const torso = roundedBox(THREE, 1.36, 1.12, 0.42, 0.62, black, 0.07);
  body.add(torso);

  for (const side of [-1, 1]) {
    const panel = roundedBox(THREE, 0.34, 0.72, 0.14, 0.12, shell, 0.03);
    panel.position.set(side * 0.6, -0.02, 0.3);
    body.add(panel);
  }

  // Chest emblem: a small glowing diamond.
  const diamond = new THREE.Shape();
  diamond.moveTo(0, 0.2); diamond.lineTo(0.15, 0); diamond.lineTo(0, -0.2); diamond.lineTo(-0.15, 0);
  const emblemGeo = new THREE.ExtrudeGeometry(diamond, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 });
  emblemGeo.center();
  const core = new THREE.Mesh(emblemGeo, glowMat.clone());
  core.scale.setScalar(1.15);
  core.position.set(0, 0.06, 0.4);
  body.add(core);

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = roundedBox(THREE, 0.34, 0.62, 0.16, 0.28, shell, 0.04);
    arm.position.set(side * 0.82, -0.22, 0.08);
    arm.rotation.z = side * 0.22;
    body.add(arm);
    arms.push(arm);
  }

  const wheels = [];
  const wheelY = -1.42;
  for (const side of [-1, 1]) {
    const wheel = new THREE.Group();
    wheel.position.set(side * 0.72, wheelY, 0.02);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.26, 32), black);
    tyre.rotation.x = Math.PI / 2;
    wheel.add(tyre);
    const rimLight = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.028, 10, 40), glowMat.clone());
    rimLight.position.z = 0.13;
    wheel.add(rimLight);
    rig.add(wheel);
    wheels.push(wheel);
  }

  // Soft contact shadow.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 256;
  const ctx = shadowCanvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.55, 'rgba(20,6,40,0.34)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.5),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = wheelY - 0.36;
  rig.add(shadow);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.016, 8, 96), new THREE.MeshBasicMaterial({
    color: 0xa855f7, transparent: true, opacity: 0.5,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = wheelY - 0.3;
  rig.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.007, 8, 96), new THREE.MeshBasicMaterial({
    color: 0x7c3aed, transparent: true, opacity: 0.35,
  }));
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = wheelY - 0.3;
  rig.add(ring2);

  const starGeo = new THREE.BufferGeometry();
  const count = 600;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = 8 + Math.random() * 16;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.55;
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xd8b4fe, size: 0.055, transparent: true, opacity: 0.7, depthWrite: false,
  }));
  scene3.add(stars);

  return {
    scene3, camera, rig, head, eyesMesh, mouth, arms, ears, wheels, core, rings: [ring, ring2], stars,
  };
}

function mount(THREE, root, canvas) {
  const parts = build(THREE);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const state = {
    THREE, renderer, canvas, root, ...parts,
    look: { x: 0, y: 0 }, target: { x: 0, y: 0 }, lookRaw: { x: 0, y: 0 },
    face: null, faceAt: 0, pose: 'idle', emotion: 'neutral',
    blinkAt: performance.now() + 2400, blinking: 0, click: 0, raf: 0, alive: true, wheelSpin: 0,
    stand: 0, roamAt: performance.now() + 9000, last: performance.now(),
  };

  const resize = () => {
    const width = root.clientWidth || 420;
    const height = Math.round(width * (520 / 460));
    renderer.setSize(width, height, false);
    state.camera.aspect = 460 / 520;
    state.camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  state.observer = observer;

  const loop = (now) => {
    if (!state.alive) return;
    state.raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const t = now / 1000;
    const pose = state.pose;

    state.target = state.face && now - state.faceAt < 2600
      ? { x: -(state.face.x - 0.5) * 2, y: (state.face.y - 0.5) * 2 }
      : state.lookRaw;
    state.look.x += (state.target.x - state.look.x) * 0.07;
    state.look.y += (state.target.y - state.look.y) * 0.07;

    const dance = pose === 'dance';
    const dt = Math.min(0.05, (now - state.last) / 1000);
    state.last = now;

    if (state.stand < 1) state.stand = Math.min(1, state.stand + dt / 1.05);
    const e = state.stand;
    const overshoot = Math.sin(e * Math.PI) * 0.06;
    const standScale = 0.72 + 0.28 * e + overshoot;
    state.rig.scale.set(1, standScale, 1);


    const bob = Math.sin(t * (dance ? 7 : 1.2)) * (dance ? 0.14 : 0.055);
    const facing = root.dataset.facing === 'left' ? -1 : 1;
    const walkTurn = pose === 'walk' ? facing * 0.42 : 0;
    state.rig.rotation.y = state.look.x * 0.34 * (pose === 'walk' ? 0.4 : 1) + walkTurn;
    state.rig.rotation.x = state.look.y * 0.12;
    state.rig.rotation.z = Math.sin(t * 0.75) * 0.02 + (dance ? Math.sin(t * 7) * 0.04 : 0);
    state.rig.position.y = bob - 0.34 * (1 - e);
    if (pose === 'walk') state.rig.rotation.x = state.look.y * 0.12 + 0.05;
    if (state.click > 0) {
      state.rig.position.y += Math.sin(state.click * Math.PI) * 0.42;
      state.rig.rotation.z += Math.sin(state.click * Math.PI) * 0.12;
      state.click = Math.max(0, state.click - 0.035);
    }

    // Blink: squash the crescent eyes.
    if (now > state.blinkAt && !state.blinking) {
      state.blinking = 1;
      state.blinkAt = now + 2600 + Math.random() * 4200;
    }
    const blinkScale = state.blinking ? Math.max(0.08, 1 - state.blinking) : 1;
    if (state.blinking) state.blinking = Math.max(0, state.blinking - 0.085);
    state.eyesMesh.scale.y = Math.max(0.06, blinkScale);

    // Ears twitch, mouth talks.
    for (let i = 0; i < 2; i += 1) {
      const side = i === 0 ? -1 : 1;
      state.ears[i * 2].rotation.z = side * -0.34 + Math.sin(t * 1.7 + i) * 0.05 + (pose === 'listening' ? side * 0.1 : 0);
    }
    state.mouth.scale.y = 1 + (pose === 'talk' ? Math.abs(Math.sin(t * 14)) * 1.4 : 0);
    state.mouth.scale.x = pose === 'happy' ? 1.12 : 1;

    // Arms by pose.
    const wave = pose === 'wave' ? Math.sin(t * 9) * 0.7 : 0;
    state.arms[0].rotation.z = 0.22 + (dance ? Math.sin(t * 7) * 0.3 : 0);
    state.arms[1].rotation.z = -0.22 - wave - (dance ? Math.sin(t * 7 + 1) * 0.3 : 0);

    // Wheels roll when walking.
    const rolling = pose === 'walk' || dance;
    state.wheelSpin += rolling ? 0.16 : 0.01;
    for (const wheel of state.wheels) wheel.rotation.z = -state.wheelSpin;

    state.head.rotation.z = dance ? Math.sin(t * 7) * 0.07 : Math.sin(t * 0.85) * 0.015;
    state.head.rotation.y = state.look.x * 0.12;
    const breathe = 1 + Math.sin(t * 1.5) * 0.025;
    state.head.scale.setScalar(breathe);

    state.core.material.emissiveIntensity = 1.3 + Math.sin(t * 2.3) * 0.7;
    state.rings[0].rotation.z = t * 0.3;
    state.rings[1].rotation.z = -t * 0.2;
    state.stars.rotation.y = t * 0.01;

    renderer.render(state.scene3, state.camera);
  };
  state.raf = requestAnimationFrame(loop);

  state.dispose = () => {
    state.alive = false;
    cancelAnimationFrame(state.raf);
    state.observer?.disconnect();
    renderer.dispose();
  };
  return state;
}

export async function initThreeBot({ force } = {}) {
  const root = document.querySelector('#companion');
  const svg = root?.querySelector('.robot');
  if (!root || !svg) return false;
  const mode = force || autoMode();
  if (mode !== 'on') return false;
  if (scene) return true;

  let THREE = null;
  for (const url of THREE_URLS) {
    try {
      THREE = await import(url);
      break;
    } catch { /* try the next mirror */ }
  }
  if (!THREE) return false;

  const canvas = document.createElement('canvas');
  canvas.className = 'robot3d';
  canvas.setAttribute('aria-hidden', 'true');
  svg.after(canvas);

  try {
    scene = mount(THREE, root, canvas);
  } catch (err) {
    console.error('[three] mount failed', String(err && (err.stack || err.message) || err));
    canvas.remove();
    return false;
  }
  root.classList.add('is-3d');

  window.addEventListener('pointermove', (event) => {
    if (!scene) return;
    scene.lookRaw = {
      x: (event.clientX / window.innerWidth - 0.5) * 2,
      y: (event.clientY / window.innerHeight - 0.5) * 2,
    };
  }, { passive: true });

  new MutationObserver(() => {
    if (scene) scene.pose = root.dataset.pose || 'idle';
  }).observe(root, { attributes: true, attributeFilter: ['data-pose'] });

  const tint = () => {
    if (!scene) return;
    const color = EYE_COLORS[root.dataset.emotion || 'neutral'] || EYE_COLORS.neutral;
    if (scene.eyesMesh) scene.eyesMesh.material.color.setHex(color);
    scene.core.material.emissive.setHex(color);
  };
  tint();
  new MutationObserver(tint).observe(root, { attributes: true, attributeFilter: ['data-emotion'] });

  bus.on('presence:face', (face) => {
    if (scene && face?.detected) {
      scene.face = face;
      scene.faceAt = performance.now();
    }
  });

  root.addEventListener('click', () => { if (scene) scene.click = 1; });
  return true;
}

export function teardownThreeBot() {
  const root = document.querySelector('#companion');
  if (scene) {
    scene.dispose();
    scene.canvas.remove();
    scene = null;
  }
  root?.classList.remove('is-3d');
  root?.querySelector('.robot3d:not(.rive-bot)')?.remove();
}

export function toggleThreeBot(on) {
  if (on) return initThreeBot({ force: 'on' });
  teardownThreeBot();
  return Promise.resolve(false);
}

/**
 * HYDRA — Lottie playback. lottie-web is fetched on demand and every
 * animation uses inline data, so it works offline and inside the bundle.
 */

import { HUD } from './lottie-data.js';

let lib = null;
let loading = null;

function loadLib() {
  if (lib) return Promise.resolve(lib);
  if (!loading) {
    loading = new Promise((resolve) => {
      if (window.lottie) { lib = window.lottie; resolve(lib); return; }
      const tag = document.createElement('script');
      tag.src = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js';
      tag.onload = () => { lib = window.lottie || null; resolve(lib); };
      tag.onerror = () => { lib = null; resolve(null); };
      document.head.append(tag);
    });
  }
  return loading;
}

export async function playHud(container, { loop = true, speed = 1 } = {}) {
  const animation = await loadLib();
  if (!animation || !container) return null;
  container.textContent = '';
  const instance = animation.loadAnimation({
    container, renderer: 'svg', loop, autoplay: true, animationData: HUD,
  });
  instance.setSpeed(speed);
  return instance;
}

export function stopHud(instance) {
  try { instance?.destroy(); } catch { /* ignore */ }
}

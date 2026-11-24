/**
 * HYDRA — boot sequence and small motion helpers.
 */

import { $, el, sleep, clamp } from './utils.js';

const STAGES = [
  { progress: 8, stage: 'initialising core', log: 'cold start · hydra runtime 1.0.0' },
  { progress: 22, stage: 'mounting glass compositor', log: 'compositor · backdrop filters online' },
  { progress: 36, stage: 'calibrating particle field', log: 'ambient engine · adaptive density' },
  { progress: 50, stage: 'loading widget registry', log: 'widgets · 11 modules registered' },
  { progress: 64, stage: 'restoring memory index', log: 'memory · local vectors ready' },
  { progress: 76, stage: 'warming voice interface', log: 'voice · synthesis + recognition' },
  { progress: 88, stage: 'syncing local state', log: 'storage · settings and layout restored' },
  { progress: 100, stage: 'welcome back', log: 'hydra core · online' },
];

const sleepFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Play the startup sequence. Resolves once the overlay is fully dismissed.
 * @returns {Promise<void>}
 */
export function playBoot({ reduced = false, onComplete } = {}) {
  const boot = $('#boot');
  const bar = $('.boot__bar');
  const stageEl = $('.boot__stage');
  const logEl = $('#boot-log');
  const skip = $('#boot-skip');

  return new Promise((resolve) => {
    if (!boot) {
      onComplete?.();
      resolve();
      return;
    }

    let skipped = false;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (bar) bar.style.width = '100%';
      boot.classList.add('is-done');
      setTimeout(() => {
        boot.hidden = true;
        boot.style.display = 'none';
        onComplete?.();
        resolve();
      }, reduced ? 120 : 680);
    };

    skip?.addEventListener('click', () => {
      skipped = true;
      finish();
    }, { once: true });

    if (reduced) {
      finish();
      return;
    }

    const run = async () => {
      for (const step of STAGES) {
        if (skipped) return;
        if (bar) bar.style.width = `${step.progress}%`;
        if (stageEl) stageEl.textContent = step.stage;
        if (logEl) {
          logEl.append(el('li', {}, step.log));
          while (logEl.children.length > 4) logEl.firstElementChild.remove();
        }
        await sleep(step.progress === 100 ? 520 : 250 + Math.random() * 140);
      }
      finish();
    };

    // Give the browser one paint before starting so the first transition lands.
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  });
}

export async function typewriter(node, text, { speed = 14, chunk = 2 } = {}) {
  if (!node) return;
  node.textContent = '';
  for (let i = 0; i < text.length; i += chunk) {
    node.textContent += text.slice(i, i + chunk);
    if (i % (chunk * 6) === 0) await sleep(speed);
  }
}

export function countUp(node, target, { duration = 900, format = (v) => Math.round(v) } = {}) {
  const start = performance.now();
  const from = 0;
  const tick = (now) => {
    const t = clamp((now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    node.textContent = format(from + (target - from) * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function reveal(nodes, stagger = 40) {
  const list = Array.from(nodes);
  list.forEach((node, i) => {
    node.style.animation = `rise 460ms cubic-bezier(.22,1,.36,1) ${i * stagger}ms both`;
  });
}

/** Attach the ambient aurora blobs the CSS expects. */
export function mountAurora() {
  if ($('.aurora')) return;
  for (const name of ['a', 'b', 'c']) {
    const blob = el('div', { class: `aurora aurora--${name}`, 'aria-hidden': 'true' });
    document.body.prepend(blob);
  }
}

export { sleepFrame };

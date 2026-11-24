/**
 * HYDRA — entry point.
 */

import { boot } from './js/app.js';
import { bus } from './js/utils.js';

function fatal(err) {
  console.error('[HYDRA] boot failed', err);
  const boot = document.getElementById('boot');
  if (boot) {
    boot.hidden = false;
    boot.classList.remove('is-done');
    const stage = boot.querySelector('.boot__stage');
    if (stage) stage.textContent = 'boot failed · ' + (err?.message ?? err);
    const skip = document.getElementById('boot-skip');
    if (skip) skip.textContent = 'Reload';
    skip?.addEventListener('click', () => location.reload());
  }
}

const start = () => {
  boot().catch(fatal);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

window.addEventListener('unhandledrejection', (event) => {
  console.warn('[HYDRA] unhandled rejection', event.reason);
});

// Debug surface: intentionally small.
window.HYDRA = { bus, version: '1.0.0' };

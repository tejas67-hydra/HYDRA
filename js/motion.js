/**
 * HYDRA — motion controller: ripples, staggered views, dock bounce,
 * widget pop-in and the theme flash. Pure decoration; safe to skip.
 */

import { $, $$, bus } from './utils.js';

const reduced = () => document.documentElement.dataset.motion === 'off';

function ripple(event) {
  const host = event.target.closest?.('.btn, .ghost-btn, .dock__btn, .chip, .nav-item');
  if (!host || host.disabled || host.classList.contains('is-dragging')) return;
  const rect = host.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  if (!size) return;
  const dot = document.createElement('span');
  dot.className = 'ripple';
  dot.style.width = dot.style.height = size + 'px';
  dot.style.left = event.clientX - rect.left - size / 2 + 'px';
  dot.style.top = event.clientY - rect.top - size / 2 + 'px';
  host.append(dot);
  dot.addEventListener('animationend', () => dot.remove(), { once: true });
}

function stagger(view) {
  const panel = document.querySelector(`[data-view-panel="${view}"]`);
  if (!panel) return;
  [...panel.children].forEach((node, index) => node.style.setProperty('--i', String(index)));
}

function popWidget(node) {
  if (!(node instanceof HTMLElement) || !node.classList.contains('widget')) return;
  node.classList.add('is-new');
  node.addEventListener('animationend', () => node.classList.remove('is-new'), { once: true });
}

export function initMotion() {
  if (reduced()) return;

  const start = () => {
    if (document.body.classList.contains('motion-on')) return;
    document.body.classList.add('motion-on');
  
  };
  if (document.body.classList.contains('auth-locked')) {
    bus.on('auth:change', ({ user }) => { if (user) start(); });
  } else {
    start();
  }

  document.addEventListener('pointerdown', ripple, { passive: true });

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('.dock__btn');
    if (!button) return;
    button.classList.remove('is-bounce');
    void button.offsetWidth;
    button.classList.add('is-bounce');
    button.addEventListener('animationend', () => button.classList.remove('is-bounce'), { once: true });
  }, true);

  bus.on('view:change', (view) => {
    stagger(view);
  });

  bus.on('theme:change', () => {
    const flash = document.createElement('div');
    flash.className = 'theme-flash';
    document.body.append(flash);
    setTimeout(() => flash.remove(), 800);
  });


  const grid = $('#widget-grid');
  if (grid) {
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) popWidget(node);
      }
    }).observe(grid, { childList: true });
  }

  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  document.body.append(glow);
  let frame = 0;
  window.addEventListener('pointermove', (event) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      document.documentElement.style.setProperty('--mx', event.clientX + 'px');
      document.documentElement.style.setProperty('--my', event.clientY + 'px');
    });
  }, { passive: true });


}

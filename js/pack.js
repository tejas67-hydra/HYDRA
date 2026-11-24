/**
 * HYDRA — animation pack runtime: hologram app launches, scan beams,
 * digital rain, XP bursts and level rings. All decoration; skipped when
 * the Motion setting is Off.
 */

import { $, bus, el } from './utils.js';
import { gsapHologram } from './gsap-fx.js';

const off = () => document.documentElement.dataset.motion === 'off';

function layer(className, tag = 'div') {
  let node = document.querySelector('.' + className);
  if (!node) {
    node = el(tag, { class: className, 'aria-hidden': 'true' });
    document.body.append(node);
  }
  return node;
}

/** Purple ring expands from the trigger, then a glass frame flashes open. */
export function hologram(trigger) {
  if (off()) return;
  const rect = trigger?.getBoundingClientRect?.();
  if (rect?.width) {
    gsapHologram(rect.left + rect.width / 2, rect.top + rect.height / 2).then((ok) => {
      if (!ok) cssHologram(rect);
    });
    return;
  }
  cssHologram(rect);
}

function cssHologram(rect) {
  const host = layer('holo-layer');
  const ring = el('span', { class: 'holo-ring' });
  const frame = el('span', { class: 'holo-frame' });
  if (rect?.width) {
    ring.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
    ring.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
  }
  host.append(ring, frame);
  requestAnimationFrame(() => host.classList.add('is-on'));
  setTimeout(() => {
    host.classList.remove('is-on');
    ring.remove();
    frame.remove();
  }, 700);
}

/** Sweeping beam across a panel, used when the AI reads something. */
export function scan(target, ms = 1500) {
  if (off() || !target) return;
  const beam = el('span', { class: 'scan-beam' });
  target.append(beam);
  setTimeout(() => beam.remove(), ms);
}

export function xpBurst(text = '+XP', x = innerWidth / 2, y = innerHeight / 2) {
  if (off()) return;
  const node = el('span', { class: 'xp-burst' }, text);
  node.style.left = `${Math.round(x)}px`;
  node.style.top = `${Math.round(y)}px`;
  document.body.append(node);
  node.addEventListener('animationend', () => node.remove(), { once: true });
}

export function levelRing() {
  if (off()) return;
  const node = el('span', { class: 'level-ring' });
  document.body.append(node);
  node.addEventListener('animationend', () => node.remove(), { once: true });
}

/** Falling code behind the interface while the model is thinking. */
export function digitalRain(ms = 1800) {
  if (off()) return;
  const canvas = layer('rain-canvas', 'canvas');
  const ctx = canvas.getContext('2d');
  const width = (canvas.width = innerWidth);
  const height = (canvas.height = innerHeight);
  const size = 14;
  const cols = Math.ceil(width / size);
  const drops = Array.from({ length: cols }, () => Math.random() * -60);
  const glyphs = '01ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄHYDRA'.split('');
  const start = performance.now();
  let frame = 0;
  canvas.classList.add('is-on');

  const step = (now) => {
    ctx.fillStyle = 'rgba(10, 5, 22, .16)';
    ctx.fillRect(0, 0, width, height);
    ctx.font = `${size}px monospace`;
    for (let i = 0; i < cols; i += 1) {
      const glyph = glyphs[(Math.random() * glyphs.length) | 0];
      const y = drops[i] * size;
      ctx.fillStyle = Math.random() > 0.92 ? 'rgba(240, 230, 255, .95)' : 'rgba(168, 85, 247, .75)';
      ctx.fillText(glyph, i * size, y);
      drops[i] = y > height && Math.random() > 0.975 ? 0 : drops[i] + 0.85;
    }
    if (now - start < ms) {
      frame = requestAnimationFrame(step);
    } else {
      canvas.classList.remove('is-on');
      setTimeout(() => {
        cancelAnimationFrame(frame);
        ctx.clearRect(0, 0, width, height);
      }, 340);
    }
  };
  frame = requestAnimationFrame(step);
}

export function initPack() {
  bus.on('pack:scan', ({ target }) => scan(target || $('.view.is-active')));
  bus.on('pack:xp', ({ text, x, y }) => xpBurst(text, x, y));
  bus.on('pack:level', () => levelRing());
  bus.on('vision:identified', () => scan($('#view-vision')));
  bus.on('ai:stream:start', () => digitalRain(1200));
}

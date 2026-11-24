/**
 * HYDRA — ambient particle field.
 * A single canvas, a fixed budget of nodes, and a link pass that stays O(n²)
 * only because n is capped. Pointer interaction is a soft field, not a trap.
 */

import { bus, clamp, rand, randInt } from './utils.js';
import { settings, currentTheme } from './settings.js';

const DENSITY = { off: 0, low: 26, medium: 54, high: 96 };

class ParticleEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.ripples = [];
    this.pointer = { x: -9999, y: -9999, active: false };
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.running = false;
    this.frame = 0;
    this.lastTs = 0;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._onFrame = this._onFrame.bind(this);
    this._resize = this._resize.bind(this);
  }

  mount() {
    if (this.canvas) return;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fx-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    window.addEventListener('resize', this._resize, { passive: true });
    window.addEventListener('pointermove', (event) => {
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.pointer.active = true;
    }, { passive: true });
    window.addEventListener('pointerleave', () => { this.pointer.active = false; });
    window.addEventListener('pointerdown', (event) => this.burst(event.clientX, event.clientY), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });

    bus.on('particles:density', () => this.rebuild());
    bus.on('theme:change', () => this.rebuild());

    this._resize();
    this.rebuild();
  }

  get density() {
    return DENSITY[settings.get('particles')] ?? DENSITY.medium;
  }

  get hue() {
    const accent = settings.get('accentHue');
    return accent == null ? currentTheme().hue : accent;
  }

  get motionAllowed() {
    return !settings.get('reducedMotion');
  }

  _resize() {
    if (!this.canvas) return;
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const p of this.particles) {
      p.x = clamp(p.x, 0, this.width);
      p.y = clamp(p.y, 0, this.height);
    }
    this.renderStatic();
  }

  rebuild() {
    if (!this.canvas) return;
    const count = this.density;
    this.particles = Array.from({ length: count }, () => this.spawn());
    this.renderStatic();
    if (count > 0 && this.motionAllowed) this.start();
    else this.stop();
  }

  spawn() {
    const speed = this.motionAllowed ? rand(0.05, 0.26) : 0;
    return {
      x: rand(0, this.width),
      y: rand(0, this.height),
      vx: rand(-speed, speed),
      vy: rand(-speed, speed),
      r: rand(0.7, 2.1),
      hueShift: randInt(-24, 40),
      alpha: rand(0.18, 0.55),
      twinkle: rand(0, Math.PI * 2),
      twinkleSpeed: rand(0.006, 0.02),
    };
  }

  start() {
    if (this.running || !this.particles.length || !this.motionAllowed) return;
    this.running = true;
    this.lastTs = performance.now();
    requestAnimationFrame(this._onFrame);
  }

  stop() {
    this.running = false;
  }

  burst(x, y) {
    if (!this.motionAllowed) return;
    this.ripples.push({ x, y, r: 4, alpha: 0.42 });
    if (this.ripples.length > 6) this.ripples.shift();
  }

  _onFrame(ts) {
    if (!this.running) return;
    const dt = Math.min(48, ts - this.lastTs);
    this.lastTs = ts;

    this._fpsAccum += dt;
    this._fpsFrames += 1;
    if (this._fpsAccum >= 500) {
      this.fps = Math.round((this._fpsFrames * 1000) / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    const step = dt / 16.667;
    this.frame += 1;
    this.ctx.clearRect(0, 0, this.width, this.height);

    const hue = this.hue;
    const { ctx } = this;
    const pointer = this.pointer;
    const maxDist = this.width < 720 ? 96 : 132;
    const maxDistSq = maxDist * maxDist;

    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];

      if (pointer.active) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 190 * 190 && distSq > 0.01) {
          const force = (1 - Math.sqrt(distSq) / 190) * 0.05;
          p.vx += (dx / Math.sqrt(distSq)) * force * step;
          p.vy += (dy / Math.sqrt(distSq)) * force * step;
        }
      }

      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vx *= 0.996;
      p.vy *= 0.996;
      if (Math.abs(p.vx) < 0.008) p.vx += rand(-0.01, 0.01);
      if (Math.abs(p.vy) < 0.008) p.vy += rand(-0.01, 0.01);

      if (p.x < -12) p.x = this.width + 12;
      if (p.x > this.width + 12) p.x = -12;
      if (p.y < -12) p.y = this.height + 12;
      if (p.y > this.height + 12) p.y = -12;

      p.twinkle += p.twinkleSpeed * step;
      const twinkle = 0.72 + Math.sin(p.twinkle) * 0.28;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue + p.hueShift} 90% 72% / ${p.alpha * twinkle})`;
      ctx.fill();

      for (let j = i + 1; j < this.particles.length; j += 1) {
        const q = this.particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > maxDistSq) continue;
        const alpha = (1 - Math.sqrt(distSq) / maxDist) * 0.13;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.strokeStyle = `hsl(${hue + 8} 88% 70% / ${alpha})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    for (let i = this.ripples.length - 1; i >= 0; i -= 1) {
      const ripple = this.ripples[i];
      ripple.r += 5.5 * step;
      ripple.alpha *= 0.94;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2);
      ctx.strokeStyle = `hsl(${hue} 92% 76% / ${ripple.alpha})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (ripple.alpha < 0.01) this.ripples.splice(i, 1);
    }

    requestAnimationFrame(this._onFrame);
  }

  renderStatic() {
    if (!this.ctx) return;
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    const hue = this.hue;
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue + p.hueShift} 90% 72% / ${p.alpha * 0.6})`;
      ctx.fill();
    }
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resize);
    this.canvas?.remove();
    this.canvas = null;
  }
}

export const particles = new ParticleEngine();

export function initParticles() {
  particles.mount();
  return particles;
}

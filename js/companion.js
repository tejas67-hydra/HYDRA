/**
 * HYDRA — companion character.
 * A single SVG robot driven by CSS poses. This module owns its mood, idle
 * behaviour, speech bubble and reactions to the rest of the app.
 */

import { $, el, bus, clamp, sleep, randomOf, debounce } from './utils.js';
import { storage } from './storage.js';
import { settings } from './settings.js';
import { gsapEntrance } from './gsap-fx.js';

const GREETINGS = {
  morning: ['Morning, {name}. The light is good today.', 'Back at it, {name}? I made coffee. Metaphorically.'],
  afternoon: ['Afternoon, {name}. What are we making?', 'You are back. I kept your seat warm, {name}.'],
  evening: ['Evening, {name}. The world got quiet.', 'Good evening, {name}. Want something calm?'],
  night: ['Still awake, {name}? I will keep the lights low.', 'Late night, {name}. My favourite shift.'],
};

const IDLE_LINES = [
  'I like this room. The light never sits still.',
  'If you need me, just say the word.',
  'I reorganised my thoughts. There are fewer of them now.',
  'The stars are doing that thing again.',
  'I could play something ambient. Say the word.',
];

const MOOD_LABEL = {
  neutral: 'calm', happy: 'happy', curious: 'curious', focused: 'focused',
  concerned: 'concerned', listening: 'listening', thinking: 'thinking',
  sleepy: 'sleepy', excited: 'excited',
};

class Companion {
  constructor() {
    this.root = null;
    this.bubble = null;
    this.eyes = null;
    this.poseTimer = null;
    this.idleTimer = null;
    this.bubbleTimer = null;
    this.emotion = 'neutral';
    this.pose = 'idle';
    this.typing = null;
    this.lastInteract = Date.now();
  }

  init() {
    this.root = $('#companion');
    this.bubble = $('#companion-bubble');
    this.eyes = $('.robot__eyes', this.root);
    if (!this.root) return this;

    this.setScene();
    this.bind();
    this.scheduleIdle();
    this.startRoam();
    this.entrance();
    return this;
  }

  bind() {
    bus.on('emotion:change', ({ emotion }) => this.setEmotion(emotion));
    bus.on('ai:state', (state) => {
      if (state === 'thinking') this.pose = 'think';
      else if (state === 'idle') this.pose = 'idle';
      this.root.dataset.pose = this.pose;
    });
    bus.on('ai:stream:end', ({ content, emotion: tone, meta }) => {
      if (meta?.error) this.setEmotion('concerned');
      else if (tone) this.setEmotion(tone);
      if (content) this.say(content.replace(/[*#`>]/g, '').slice(0, 150), { hold: 5200 });
      if (!meta?.error) this.poseOnce('nod');
    });
    bus.on('voice:listening', (on) => {
      this.root.dataset.listening = on ? 'true' : 'false';
      if (on) this.setEmotion('listening');
    });
    bus.on('music:state', (state) => {
      this.root.dataset.music = state.playing ? 'on' : 'off';
      if (state.playing && this.pose === 'idle') this.poseOnce('bounce');
    });
    bus.on('weather:update', () => this.setScene());
    bus.on('settings:change', () => this.setScene());
    bus.on('companion:celebrate', () => this.celebrate());
    bus.on('presence:face', (face) => {
      if (!this.root) return;
      const detected = Boolean(face?.detected);
      this.root.dataset.presence = detected ? 'on' : 'off';
      if (!detected) {
        // Hold the last pose briefly: single missed frames should not snap back.
        clearTimeout(this._turnIdle);
        this._turnIdle = setTimeout(() => {
          this.root?.style.setProperty('--turn', '0');
        }, 1200);
        return;
      }
      clearTimeout(this._turnIdle);
      this._presenceAt = Date.now();
      // The camera preview is mirrored, so flip x back into screen space.
      const ux = 1 - face.x;
      const dx = clamp((ux - 0.5) * 2.4, -1, 1);
      const dy = clamp((face.y - 0.5) * 2.2, -1, 1);
      this.root.style.setProperty('--look-x', dx.toFixed(2));
      this.root.style.setProperty('--look-y', dy.toFixed(2));
      this.root.style.setProperty('--turn', (-dx * 16).toFixed(1));
      this.root.dataset.facing = ux < 0.5 ? 'left' : 'right';
    });

    bus.on('ai:message', ({ content }) => {
      if (!content) return;
      if (/\b(walk|come here|stretch your legs|move around)\b/i.test(content)) this.walk();
      else if (/\b(wave|say hi|hello hydra)\b/i.test(content)) this.wave();
      else if (/\b(dance|party|celebrate)\b/i.test(content)) this.dance();
      else if (/\b(jump)\b/i.test(content)) this.jump();
      else if (/\b(good night|go to sleep)\b/i.test(content)) this.poseOnce('sleep', 6000);
    });
    bus.on('companion:say', ({ text }) => this.say(text));

    const look = debounce((event) => {
      const rect = this.root.getBoundingClientRect();
      const dx = clamp((event.clientX - (rect.left + rect.width / 2)) / 260, -1, 1);
      const dy = clamp((event.clientY - (rect.top + rect.height * 0.35)) / 200, -1, 1);
      this.root.style.setProperty('--look-x', dx.toFixed(2));
      this.root.style.setProperty('--look-y', dy.toFixed(2));
      if (Date.now() - (this._presenceAt || 0) > 2500) {
        this.root.style.setProperty('--turn', (-dx * 14).toFixed(1));
      }
    }, 40);
    window.addEventListener('pointermove', look, { passive: true });
    this.root.addEventListener('click', (event) => {
      if (event.target.closest('button, a, input')) return;
      this.poseOnce('jump', 900);
    });
    window.addEventListener('pointerdown', () => { this.lastInteract = Date.now(); }, { passive: true });
  }

  setScene() {
    if (!this.root) return;
    const hour = new Date().getHours();
    const time = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'sunset' : 'night';
    this.root.dataset.time = time;
    const code = window.__hydraWeatherCode;
    const rain = code != null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95);
    const snow = code != null && ((code >= 71 && code <= 77) || code === 85 || code === 86);
    this.root.dataset.weather = snow ? 'snow' : rain ? 'rain' : 'clear';
    const world = $('#world');
    if (world) {
      world.dataset.time = time;
      world.dataset.weather = this.root.dataset.weather;
    }
  }

  setEmotion(emotion) {
    if (!this.root) return;
    this.emotion = emotion || 'neutral';
    this.root.dataset.emotion = this.emotion;
    const mood = $('#companion-mood');
    if (mood) mood.textContent = MOOD_LABEL[this.emotion] || 'calm';
  }

  poseOnce(name, duration = 1600) {
    if (!this.root) return;
    clearTimeout(this.poseTimer);
    this.root.dataset.pose = name;
    this.poseTimer = setTimeout(() => {
      this.root.dataset.pose = this.pose === 'think' ? 'think' : 'idle';
    }, duration);
  }

  walk(distance = null) {
    if (!this.root || settings.get('reducedMotion')) return;
    const max = Math.min(window.innerWidth * 0.26, 330);
    this.walkTo(distance ?? (Math.random() * 2 - 1) * max);
  }

  /** Travels to a screen offset and stays there, so the companion actually wanders. */
  walkTo(target = 0) {
    if (!this.root || settings.get('reducedMotion')) return;
    const max = Math.min(window.innerWidth * 0.26, 330);
    const x = Math.round(Math.max(-max, Math.min(max, target)));
    const from = this.roamX ?? 0;
    const distance = Math.abs(x - from);
    const ms = Math.round(Math.min(2800, 620 + distance * 3.4));
    this.roamX = x;
    this.root.style.setProperty('--walk-dur', ms + 'ms');
    this.root.dataset.facing = x < from ? 'left' : 'right';
    this.root.style.setProperty('--walk-x', x + 'px');
    this.poseOnce('walk', ms + 220);
  }

  startRoam() {
    if (this.roamTimer) return;
    this.roamX = this.roamX ?? 0;
    this.roamTimer = setInterval(() => {
      if (!this.root || document.hidden) return;
      if (settings.get('reducedMotion')) return;
      if (this.root.dataset.pose === 'sleep' || this.root.dataset.pose === 'think') return;
      if (Date.now() - this.lastInteract < 4500) return;
      const max = Math.min(window.innerWidth * 0.26, 330);
      const roll = Math.random();
      if (roll < 0.58) this.walkTo((Math.random() * 2 - 1) * max);
      else if (roll < 0.72) this.poseOnce('scan', 2100);
      else if (roll < 0.84) this.wave();
      else this.poseOnce('look', 2400);
    }, 6200);
  }

  wave() { this.poseOnce('wave', 2200); }
  jump() { this.poseOnce('jump', 900); }
  dance() { this.poseOnce('dance', 3400); }
  spin() { this.poseOnce('spin', 1200); }
  nod() { this.poseOnce('nod', 900); }

  celebrate() {
    this.poseOnce('dance', 3000);
    this.setEmotion('excited');
    this.say(randomOf(['Yes! That is the good stuff.', 'Beautiful. Let us do it again.', 'I felt that one.']), { hold: 3600 });
    bus.emit('confetti');
  }

  say(text, { hold = 4600, type = true } = {}) {
    if (!this.bubble || !text) return;
    clearTimeout(this.bubbleTimer);
    clearInterval(this.typing);
    const clean = String(text).replace(/\s+/g, ' ').trim();
    this.bubble.hidden = false;
    this.bubble.classList.add('is-live');
    const target = $('.bubble__text', this.bubble);
    if (!target) return;

    if (!type || settings.get('reducedMotion')) {
      target.textContent = clean;
    } else {
      target.textContent = '';
      let i = 0;
      this.typing = setInterval(() => {
        target.textContent = clean.slice(0, i);
        i += 2;
        if (i > clean.length) {
          clearInterval(this.typing);
          target.textContent = clean;
        }
      }, 18);
    }

    this.poseOnce('talk', Math.min(hold, 700 + clean.length * 22));
    this.bubbleTimer = setTimeout(() => {
      this.bubble.classList.remove('is-live');
      setTimeout(() => { this.bubble.hidden = true; }, 320);
    }, hold);
  }

  entrance() {
    const last = storage.get('companion.lastVisit', 0);
    const days = last ? Math.floor((Date.now() - last) / 86400000) : 0;
    storage.set('companion.lastVisit', Date.now());

    if (settings.get('reducedMotion')) {
      this.say(this.greetingLine(), { hold: 5200, type: false });
      return;
    }

    this.root.classList.add('is-entering');
    gsapEntrance(this.root).catch(() => {});
    setTimeout(() => {
      this.root.classList.remove('is-entering');
      this.wave();
      if (days >= 3) {
        this.setEmotion('concerned');
        this.say('It has been ' + days + ' days. I was starting to wonder where you went.', { hold: 14000 });
      } else {
        this.setEmotion('happy');
        this.say(this.greetingLine(), { hold: 14000 });
      }
      setTimeout(() => this.setEmotion('neutral'), 15000);
    }, 1400);
  }

  greetingLine() {
    const hour = new Date().getHours();
    const bucket = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : hour < 23 ? 'evening' : 'night';
    const name = settings.get('userName') || 'operator';
    return randomOf(GREETINGS[bucket]).replace('{name}', name);
  }

  scheduleIdle() {
    clearTimeout(this.idleTimer);
    const wait = 9000 + Math.random() * 9000;
    this.idleTimer = setTimeout(() => {
      if (!document.hidden && Date.now() - this.lastInteract > 6000) this.idleAction();
      this.scheduleIdle();
    }, wait);
  }

  idleAction() {
    if (settings.get('reducedMotion')) return;
    const hour = new Date().getHours();
    const sleepy = hour >= 23 || hour < 6;
    const roll = Math.random();
    if (sleepy && roll < 0.35) {
      this.setEmotion('sleepy');
      this.poseOnce('sleep', 7000);
      this.say(randomOf(['I might close my eyes for a minute.', 'Quiet hours. I will stay right here.']), { hold: 3200 });
      setTimeout(() => this.setEmotion('neutral'), 7200);
      return;
    }
    if (roll < 0.14) { this.wave(); }
    else if (roll < 0.24) { this.poseOnce('look', 2600); }
    else if (roll < 0.32) { this.poseOnce('stretch', 2200); }
    else if (roll < 0.4) { this.dance(); }
    else if (roll < 0.47) { this.walk(); }
    else if (roll < 0.52) { this.poseOnce('bounce', 1400); }
    else if (roll < 0.58) { this.poseOnce('scan', 1700); }
    else if (roll < 0.64) { this.poseOnce('play', 2600); }
    else if (roll < 0.7) { this.poseOnce('yawn', 2000); }
    else if (roll < 0.76) { this.poseOnce('spin', 1200); }
    else if (roll < 0.82) { this.poseOnce('charge', 2400); }
    else if (roll < 0.9) { this.say(randomOf(IDLE_LINES), { hold: 3800 }); }
    else { this.poseOnce('look', 2000); }
  }

  setMusic(on) {
    if (!this.root) return;
    this.root.dataset.music = on ? 'on' : 'off';
  }
}

export const companion = new Companion();

export function initCompanion() {
  return companion.init();
}

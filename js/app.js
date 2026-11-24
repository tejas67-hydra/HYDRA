/**
 * HYDRA — application bootstrap and UI wiring.
 */

import {
  $, $$, el, icon, bus, formatClock, greeting, markdown, download,
  clamp, debounce, formatRelative, pad2, DAYS, MONTHS, randomOf,
} from './utils.js';
import { storage } from './storage.js';
import { settings, initSettings, renderSettings, currentTheme, cycleTheme, THEMES } from './settings.js';
import { notifications } from './notifications.js';
import { mountNetworkBadge, internet } from './internet.js';
import { initParticles } from './particles.js';
import { playBoot, mountAurora } from './animation.js';
import { initWeather, weather, describeCode } from './weather.js';
import { initMusic, music, SCENE_LIST } from './music.js';
import { initVoice, voice } from './voice.js';
import { vision } from './vision.js';
import { cv } from './cv.js';
import { initAI, ai } from './ai.js';
import { emotion } from './emotion.js';
import { memory } from './memory.js';
import { dashboard } from './dashboard.js';
import { plugins } from './plugins.js';
import { initShortcuts, registerCommand, openPalette } from './shortcuts.js';
import { updater, VERSION } from './updater.js';
import { initCompanion, companion } from './companion.js';
import { initPack, hologram } from './pack.js';
import { initThreeBot, toggleThreeBot } from './three-bot.js';
import { initRiveBot, teardownRiveBot } from './rive-bot.js';
import { initExtras } from './extras.js';
import { initMotion } from './motion.js';
import { initWorkspace } from './workspace.js';
import { initDevice } from './device.js';
import { auth } from './auth.js';
import universal from './universal.js';
import { initAppSwitcher } from './app-switcher.js';
import { initDeck } from './deck.js';
import { presence } from './presence.js';
import { objects } from './objects.js';
import { learning } from './learning.js';

const VIEWS = ['home', 'dashboard', 'assistant', 'play', 'vision', 'music', 'memories', 'plugins', 'settings', 'workspace', 'files', 'games', 'stats', 'market', 'automations', 'device', 'windows'];
const VIEW_META = {
  home: 'Home', dashboard: 'Tools', assistant: 'Chat', play: 'Play',
  vision: 'Vision', music: 'Studio', memories: 'Memories', plugins: 'Plugins', settings: 'Settings',
  workspace: 'Workspace', files: 'Files', device: 'Device', games: 'Games', stats: 'Statistics', market: 'Marketplace', automations: 'Automations', windows: 'Windows',
};

const app = {
  currentView: 'home',
  booted: false,
};

/* ------------------------------- router ------------------------------ */
function initRobotRenderer() {
  const mode = settings.get('robot3d') || 'auto';
  if (mode === 'off') return;
  const start = async () => {
    const rive = settings.get('riveSrc');
    if (rive) {
      const live = await initRiveBot({ src: rive }).catch(() => false);
      if (live) return;
    }
    initThreeBot({ force: mode === 'on' ? 'on' : undefined })
      .then((ok) => { if (!ok) document.querySelector('#companion')?.classList.remove('is-3d'); })
      .catch(() => {});
  };
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2500 });
  else setTimeout(start, 900);
  bus.on('settings:change', ({ state }) => {
    const next = state.robot3d || 'auto';
    if (next === 'off') { toggleThreeBot(false); teardownRiveBot(); }
    else initThreeBot({ force: next === 'on' ? 'on' : undefined }).catch(() => {});
  });
}

function setView(view, { fromHash = false } = {}) {
  if (!VIEWS.includes(view)) view = 'home';
  const previous = app.currentView;
  if (previous && previous !== view) {
    hologram(document.querySelector(`.nav-item[data-view="${view}"]`)
      || document.querySelector(`.dock__btn[data-view="${view}"]`));
  }
  app.currentView = view;
  document.body.dataset.view = view;

  for (const panel of $$('[data-view-panel]')) {
    panel.classList.toggle('is-active', panel.dataset.viewPanel === view);
  }
  for (const nav of $$('.nav-item')) {
    nav.classList.toggle('is-active', nav.dataset.view === view);
  }
  for (const item of $$('.dock__btn')) {
    item.classList.toggle('is-active', item.dataset.view === view);
  }

  const title = $('#view-crumb');
  if (title) title.textContent = VIEW_META[view] || view;
  if (!fromHash) history.replaceState(null, '', '#' + view);
  $('#sidebar')?.classList.remove('is-open');
  document.querySelector('.nav-scrim')?.remove();

  if (view === 'assistant') setTimeout(() => $('#chat-input')?.focus(), 240);
  if (view === 'memories') renderMemories();
  if (view === 'settings') renderSettings($('#settings-root'));
  bus.emit('view:change', view);
}

function initRouter() {
  for (const nav of $$('.nav-item')) {
    nav.addEventListener('click', () => setView(nav.dataset.view));
  }
  for (const item of $$('[data-view-link]')) {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      setView(item.dataset.viewLink);
    });
  }
  window.addEventListener('hashchange', () => {
    setView(location.hash.replace('#', '') || 'home', { fromHash: true });
  });
  const initial = location.hash.replace('#', '');
  setView(VIEWS.includes(initial) ? initial : 'home', { fromHash: true });

  bus.on('ui:view', ({ view }) => setView(view));
  bus.on('ui:view-index', (index) => setView(VIEWS[index] || 'home'));
  bus.on('ui:sidebar', () => toggleSidebar());
  bus.on('ui:floating', () => toggleFloating());

  $('#btn-menu')?.addEventListener('click', () => toggleSidebar());
}

function toggleSidebar() {
  const sidebar = $('#sidebar');
  if (!sidebar) return;
  if (window.matchMedia('(max-width: 980px)').matches) {
    const open = sidebar.classList.toggle('is-open');
    if (open) {
      const scrim = el('div', { class: 'nav-scrim' });
      scrim.addEventListener('click', () => {
        sidebar.classList.remove('is-open');
        scrim.remove();
      });
      document.body.append(scrim);
    } else {
      document.querySelector('.nav-scrim')?.remove();
    }
  } else {
    document.body.classList.toggle('sidebar-collapsed');
  }
}

/* -------------------------------- chat ------------------------------- */
const streams = new Map();

function messageNode({ role, content, at = Date.now(), meta = {} }, { compact = false } = {}) {
  const isUser = role === 'user';
  const bubble = el('div', { class: 'msg__bubble', html: markdown(content) });
  const wrapper = el('div', { class: 'msg ' + (isUser ? 'msg--user' : 'msg--ai') }, [
    el('div', { class: 'msg__avatar' }, isUser ? 'YOU' : 'HD'),
    el('div', { class: 'grow' }, [
      bubble,
      el('div', { class: 'msg__meta' }, [
        el('span', {}, isUser ? 'you' : (meta.provider || 'HYDRA Core')),
        meta.model ? el('span', {}, meta.model) : null,
        meta.latency ? el('span', {}, meta.latency + ' ms') : null,
        el('span', {}, new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      ]),
      !compact && !isUser ? el('div', { class: 'msg__actions' }, [
        el('button', { type: 'button', onclick: () => copyText(content) }, 'copy'),
        el('button', { type: 'button', onclick: () => voice.speak(content) }, 'speak'),
      ]) : null,
    ]),
  ]);
  return { wrapper, bubble };
}

function copyText(text) {
  navigator.clipboard?.writeText(text).then(
    () => bus.emit('notify', { title: 'Copied', tone: 'success', timeout: 1200 }),
    () => bus.emit('notify', { title: 'Copy failed', tone: 'warn', timeout: 1600 }),
  );
}

function scrollChat(log) {
  if (log) log.scrollTop = log.scrollHeight;
}

function appendMessage(entry, { log = $('#chat-log'), compact = false } = {}) {
  if (!log) return null;
  const node = messageNode(entry, { compact });
  log.append(node.wrapper);
  scrollChat(log);
  return node;
}

function renderChatHistory() {
  const log = $('#chat-log');
  if (!log) return;
  log.replaceChildren();
  const history = memory.getHistory(60);
  if (!history.length) {
    log.append(el('div', { class: 'chat__empty' }, [
      el('p', {}, 'This is a fresh session. HYDRA remembers facts, not this scrollback.'),
    ]));
    return;
  }
  for (const entry of history) appendMessage(entry);
  scrollChat(log);
}

function initChat() {
  const form = $('#chat-form');
  const input = $('#chat-input');

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    sendMessage(text);
  });

  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form?.requestSubmit();
    }
  });
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(140, input.scrollHeight) + 'px';
  });

  for (const chip of $$('#chat-suggestions button')) {
    chip.addEventListener('click', () => {
      const text = chip.dataset.suggest;
      if (text) sendMessage(text);
    });
  }

  $('#btn-mic')?.addEventListener('click', () => {
    const listening = voice.toggle({ continuous: false });
    $('#btn-mic')?.classList.toggle('is-live', Boolean(listening));
  });

  $('#btn-new-chat')?.addEventListener('click', () => {
    memory.clearHistory();
    renderChatHistory();
    $('#chat-suggestions')?.removeAttribute('hidden');
    bus.emit('notify', { title: 'New session', body: 'Scrollback cleared, memory facts kept.', tone: 'info' });
    bus.emit('companion:say', { text: 'Clean slate. What should we start with?' });
  });

  $('#btn-export-chat')?.addEventListener('click', exportChat);

  bus.on('ai:message', (entry) => {
    appendMessage(entry);
    $('#chat-suggestions')?.setAttribute('hidden', '');
    const empty = $('#chat-log .chat__empty');
    if (empty) empty.remove();
  });

  bus.on('ai:stream:start', ({ id }) => {
    const log = $('#chat-log');
    const node = appendMessage({ role: 'assistant', content: '', at: Date.now() });
    if (!node) return;
    node.bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    streams.set(id, { node, text: '', frame: 0, log });
  });

  bus.on('ai:token', ({ id, delta }) => {
    const stream = streams.get(id);
    if (!stream) return;
    stream.text += delta;
    if (stream.frame) return;
    stream.frame = requestAnimationFrame(() => {
      stream.frame = 0;
      stream.node.bubble.innerHTML = markdown(stream.text) + '<span class="caret"></span>';
      scrollChat(stream.log);
    });
  });

  bus.on('ai:stream:end', ({ id, content, meta = {}, emotion: tone }) => {
    const stream = streams.get(id);
    const log = $('#chat-log');
    if (stream) {
      cancelAnimationFrame(stream.frame);
      stream.node.bubble.innerHTML = markdown(content);
      const metaRow = stream.node.wrapper.querySelector('.msg__meta');
      if (metaRow) {
        metaRow.replaceChildren(
          el('span', {}, meta.provider || 'HYDRA Core'),
          meta.model ? el('span', {}, meta.model) : null,
          meta.latency ? el('span', {}, meta.latency + ' ms') : null,
          el('span', {}, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
        );
      }
      const good = el('button', { type: 'button' }, 'good');
      const bad = el('button', { type: 'button' }, 'bad');
      good.addEventListener('click', () => {
        learning.rate({ text: content, rating: 1, meta });
        good.textContent = 'rated good';
        bad.disabled = true;
      });
      bad.addEventListener('click', () => {
        learning.rate({ text: content, rating: -1, meta });
        bad.textContent = 'rated bad';
        good.disabled = true;
      });
      const actions = el('div', { class: 'msg__actions' }, [
        el('button', { type: 'button', onclick: () => copyText(content) }, 'copy'),
        el('button', { type: 'button', onclick: () => voice.speak(content) }, 'speak'),
        good,
        bad,
      ]);
      stream.node.wrapper.querySelector('.grow')?.append(actions);
      streams.delete(id);
    } else {
      appendMessage({ role: 'assistant', content, meta, at: Date.now() });
    }
    scrollChat(log);
    if (tone) emotion.apply(tone, { hold: 3600 });
  });

  bus.on('ai:state', (state) => {
    const label = $('#ai-state-label');
    if (!label) return;
    const text = state === 'thinking' ? 'Thinking · composing a reply'
      : state === 'speaking' ? 'Speaking'
      : state === 'listening' ? 'Listening · go ahead'
      : 'Idle · listening for you';
    label.textContent = text;
    $('.pulse-dot', $('.assistant__state') || document)?.setAttribute('data-tone', state === 'thinking' ? 'busy' : '');
  });

  bus.on('voice:transcript', ({ text }) => {
    if (!text) return;
    if (app.currentView !== 'assistant') setView('assistant');
    const field = $('#chat-input');
    if (field) field.value = text;
    sendMessage(text);
    $('#btn-mic')?.classList.remove('is-live');
  });
  bus.on('voice:partial', (text) => {
    const field = $('#chat-input');
    if (field && document.activeElement !== field) field.value = text;
  });
  bus.on('voice:listening', (on) => $('#btn-mic')?.classList.toggle('is-live', on));

  renderChatHistory();
  initFloatingChat();
}

function sendMessage(text) {
  if (!text || ai.busy) return;
  if (app.currentView !== 'assistant' && !$('#floating-chat')?.hidden) {
    // floating chat keeps its own context but shares the AI core
  }
  ai.send(text, { source: 'chat' });
}

function exportChat() {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: VERSION,
    messages: memory.getHistory(),
    facts: memory.facts,
  };
  download('hydra-chat-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload, null, 2));
  bus.emit('notify', { title: 'Transcript exported', tone: 'success' });
}

/* --------------------------- floating chat -------------------------- */
function toggleFloating() {
  const panel = $('#floating-chat');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) $('#floating-input')?.focus();
}

function initFloatingChat() {
  $('#ai-orb')?.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 980px)').matches) setView('assistant');
    else toggleFloating();
  });
  $('#btn-close-floating')?.addEventListener('click', () => toggleFloating());

  const form = $('#floating-form');
  const input = $('#floating-input');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const log = $('#floating-log');
    appendMessage({ role: 'user', content: text, at: Date.now() }, { log, compact: true });
    ai.send(text, { source: 'floating' });
  });

  bus.on('ai:stream:end', ({ content, meta }) => {
    const log = $('#floating-log');
    if (!log || $('#floating-chat')?.hidden) return;
    appendMessage({ role: 'assistant', content, at: Date.now(), meta }, { log, compact: true });
  });
}

/* ---------------------------- attachments --------------------------- */
function initAttachments() {
  const btn = $('#btn-attach');
  if (!btn) return;
  const picker = el('input', { type: 'file', accept: 'image/*', hidden: true });
  document.body.append(picker);
  btn.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      notifications.push({ title: 'Image too large', body: 'Keep attachments under 8 MB.', tone: 'info' });
      return;
    }
    const log = $('#chat-log');
    if (!log) return;
    log.querySelector('.chat__empty')?.remove();
    log.append(el('div', { class: 'msg msg--user' }, [
      el('div', { class: 'msg__avatar' }, 'YOU'),
      el('div', { class: 'grow' }, [
        el('div', { class: 'msg__bubble' }, [
          el('img', { class: 'msg__img', src: URL.createObjectURL(file), alt: file.name }),
          el('span', { class: 'msg__file' }, file.name),
        ]),
        el('div', { class: 'msg__meta' }, [el('span', {}, 'you'), el('span', {}, 'local image')]),
      ]),
    ]));
    scrollChat(log);
    companion.say('Saved locally. Nothing left this device.');
  });
}

function initMemories() {
  $('#btn-export-memories')?.addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`hydra-memories-${stamp}.json`, JSON.stringify(memory.facts, null, 2));
    notifications.push({
      title: 'Memories exported',
      body: `${memory.facts.length} facts written to disk.`,
      tone: 'success',
    });
  });
}

/* ------------------------------ memories ---------------------------- */
function renderMemories() {
  const root = $('#memories-root');
  if (!root) return;
  root.replaceChildren();

  const addForm = el('form', { class: 'plugins__bar' }, [
    el('input', { type: 'text', placeholder: 'Remember something about you…', 'aria-label': 'New memory' }),
    el('button', { class: 'ghost-btn', type: 'submit' }, [icon('plus'), 'Remember']),
  ]);
  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const field = addForm.querySelector('input');
    const text = field.value.trim();
    if (!text) return;
    memory.remember(text, { tags: ['manual'] });
    field.value = '';
    renderMemories();
  });

  const list = el('div', { class: 'memory-list' });
  if (!memory.facts.length) {
    list.append(el('div', { class: 'grid-empty' }, [
      icon('book'),
      el('strong', {}, 'No memories yet'),
      el('span', {}, 'Ask HYDRA to remember something, or add it here.'),
    ]));
  }
  for (const fact of memory.facts) {
    list.append(el('article', { class: 'memory-card' }, [
      el('p', {}, fact.text),
      el('div', { class: 'memory-card__meta' }, [
        el('span', {}, formatRelative(fact.at)),
        el('span', {}, (fact.tags || []).join(' · ') || 'general'),
        el('button', {
          class: 'link-btn', type: 'button', style: { color: 'var(--danger)', marginLeft: 'auto' },
          onclick: () => { memory.forget(fact.id); renderMemories(); },
        }, 'Forget'),
      ]),
    ]));
  }

  root.append(addForm, list);
}

/* ------------------------------- studio ----------------------------- */
function initStudio() {
  const playBtn = $('#btn-play');
  const title = $('#track-title');
  const artist = $('#track-artist');
  const pos = $('#track-pos');
  const len = $('#track-len');
  const seek = $('#track-seek');
  const vol = $('#vol');
  const mute = $('#btn-mute');
  const queue = $('#music-queue');

  const draw = (state) => {
    if (title) title.textContent = state.title;
    if (artist) artist.textContent = state.artist;
    if (playBtn) playBtn.replaceChildren(icon(state.playing ? 'pause' : 'play'));
    if (pos) pos.textContent = formatClockFromMs(state.elapsed);
    if (len) len.textContent = state.duration ? formatClockFromMs(state.duration) : '∞';
    if (seek) {
      seek.max = String(Math.max(1, state.duration / 1000 || 100));
      seek.value = String(state.duration ? state.elapsed / 1000 : 0);
      seek.disabled = !state.duration;
    }
    if (vol) vol.value = String(Math.round(state.volume * 100));
    if (mute) mute.replaceChildren(icon(state.muted ? 'volume-x' : 'volume'));

    const mini = $('#mini-player');
    if (mini) {
      mini.hidden = !state.playing && !state.elapsed;
      mini.classList.toggle('is-paused', !state.playing);
      const mt = $('#mini-title');
      const ma = $('#mini-artist');
      if (mt) mt.textContent = state.title;
      if (ma) ma.textContent = state.artist;
      const mtBtn = $('#mini-toggle');
      if (mtBtn) mtBtn.replaceChildren(icon(state.playing ? 'pause' : 'play'));
    }

    if (queue) {
      for (const item of $$('.queue__item', queue)) {
        item.classList.toggle('is-active', item.dataset.id === state.trackId);
      }
    }
  };

  if (queue) {
    queue.replaceChildren();
    for (const scene of SCENE_LIST) {
      const item = el('button', { class: 'queue__item', type: 'button', dataset: { id: scene.id } }, [
        icon('music'),
        el('span', { class: 'grow' }, scene.title),
        el('small', {}, scene.bar + 's'),
      ]);
      item.addEventListener('click', () => music.play(scene.id));
      queue.append(item);
    }
  }

  playBtn?.addEventListener('click', () => music.toggle());
  $('#btn-next')?.addEventListener('click', () => music.next());
  $('#btn-prev')?.addEventListener('click', () => music.prev());
  $('#btn-mute')?.addEventListener('click', () => music.toggleMute());
  $('#mini-toggle')?.addEventListener('click', () => music.toggle());
  $('#mini-open')?.addEventListener('click', () => setView('music'));
  vol?.addEventListener('input', () => music.setVolume(Number(vol.value) / 100));
  seek?.addEventListener('input', () => music.seek(Number(seek.value)));

  $('#btn-load-audio')?.addEventListener('click', () => $('#audio-file')?.click());
  $('#audio-file')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) music.loadFile(file);
  });

  bus.on('music:state', draw);
  draw(music.state);
  initVisualizer();
}

function formatClockFromMs(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + pad2(s);
}

function initVisualizer() {
  const canvas = $('#viz');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const data = new Uint8Array(256);

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(2, Math.floor(rect.width * dpr));
    canvas.height = Math.max(2, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  let phase = 0;
  const frame = () => {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const analyser = music.analyser;
    const hue = settings.get('accentHue') ?? currentTheme().hue;
    phase += 0.02;

    if (analyser) {
      analyser.getByteFrequencyData(data);
      const bars = 56;
      const step = Math.floor(data.length / bars);
      const bw = w / bars;
      for (let i = 0; i < bars; i += 1) {
        let sum = 0;
        for (let j = 0; j < step; j += 1) sum += data[i * step + j];
        const value = (sum / step) / 255;
        const bh = Math.max(2, value * h * 0.86);
        ctx.fillStyle = 'hsl(' + (hue + i * 1.6) + ' 90% ' + (52 + value * 26) + '% / 0.85)';
        ctx.beginPath();
        ctx.roundRect?.(i * bw + 1, (h - bh) / 2, Math.max(1, bw - 2), bh, 3);
        if (ctx.roundRect) ctx.fill();
        else ctx.fillRect(i * bw + 1, (h - bh) / 2, Math.max(1, bw - 2), bh);
      }
    } else {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = h / 2 + Math.sin(x * 0.02 + phase) * (h * 0.12) * Math.sin(phase * 0.4);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'hsl(' + hue + ' 90% 66% / 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ------------------------------- vision ----------------------------- */
function initVision() {
  const btn = $('#btn-vision-toggle');
  btn?.addEventListener('click', async () => {
    const active = await vision.toggle();
    btn.replaceChildren(icon('camera'), active ? ' Stop camera' : ' Start camera');
  });
  bus.on('vision:state', ({ active }) => {
    if (btn) btn.replaceChildren(icon('camera'), active ? ' Stop camera' : ' Start camera');
    if (!active) $('#vision-empty')?.removeAttribute('hidden');
  });
  bus.on('vision:code', ({ value }) => {
    const node = $('#vision-result');
    if (node) node.textContent = 'detected: ' + value;
  });
  $('#vision-video')?.addEventListener('click', () => {
    const shot = vision.snapshot();
    if (shot) {
      const link = el('a', { href: shot, download: 'hydra-snapshot-' + Date.now() + '.png' });
      link.click();
      bus.emit('notify', { title: 'Snapshot saved', tone: 'success', timeout: 1800 });
    }
  });
  window.addEventListener('resize', debounce(() => vision.resizeOverlay(), 200));
  bus.on('action', (action) => {
    if (action.type === 'vision:start' && !vision.running) vision.start();
    if (action.type === 'vision:identify') {
      const run = () => document.querySelector('[data-vision-act="identify"]')?.click();
      if (vision.running) run();
      else vision.start().then((ok) => { if (ok) setTimeout(run, 600); });
    }
  });
}

/* -------------------------------- world ----------------------------- */
function initWorld() {
  const timeEl = $('#home-clock-time');
  const ampmEl = $('#home-clock-ampm');
  const dateEl = $('#home-clock-date');
  const greetEl = $('#home-greeting');

  const tick = () => {
    const now = new Date();
    const h24 = settings.get('clock24');
    let hours = now.getHours();
    if (!h24) {
      const suffix = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      if (ampmEl) ampmEl.textContent = suffix;
    } else if (ampmEl) {
      ampmEl.textContent = '';
    }
    if (timeEl) timeEl.textContent = pad2(hours) + ':' + pad2(now.getMinutes());
    if (dateEl) {
      dateEl.textContent = DAYS[now.getDay()].slice(0, 3) + ', ' + MONTHS[now.getMonth()].slice(0, 3) + ' ' + now.getDate() + ', ' + now.getFullYear();
    }
    if (greetEl) greetEl.textContent = greeting(now);
  };
  tick();
  setInterval(tick, 1000);
  bus.on('settings:change', tick);

  const drawWeather = (data) => {
    if (!data) return;
    const cond = describeCode(data.current.code);
    const iconEl = $('#home-weather-icon');
    const tempEl = $('#home-weather-temp');
    const condEl = $('#home-weather-cond');
    const placeEl = $('#home-weather-place');
    if (iconEl) { const name = data.current.code === 0 || data.current.code === 1 ? 'sun' : 'cloud'; iconEl.replaceChildren(icon(name)); }
    if (tempEl) tempEl.textContent = data.current.temp + '°';
    if (condEl) condEl.textContent = cond.label;
    if (placeEl) placeEl.textContent = data.place.label;
    const pill = $('#status-weather');
    if (pill) {
      const label = pill.querySelector('span');
      if (label) label.textContent = data.current.temp + '°';
      pill.title = cond.label + ' · ' + data.place.label;
    }
  };
  if (weather.data) drawWeather(weather.data);
  bus.on('weather:update', (data) => {
    window.__hydraWeatherCode = data?.current?.code ?? null;
    drawWeather(data);
    companion.setScene();
  });

  let battery = null;
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => { battery = b; }).catch(() => {});
  }
  const sysTick = () => {
    const fps = Math.round(window.__hydraFps ?? 60);
    const load = clamp(Math.round(12 + (60 - fps) * 0.6 + Math.random() * 6), 4, 99);
    const ram = performance.memory
      ? Math.round(performance.memory.usedJSHeapSize / (256 * 1024 * 1024) * 100)
      : 42;
    const net = navigator.connection?.downlink ? navigator.connection.downlink.toFixed(1) + ' MB/s' : (navigator.onLine ? 'online' : 'offline');
    const bat = battery ? Math.round(battery.level * 100) : 100;

    const set = (id, value) => { const n = $(id); if (n) n.textContent = value; };
    const bar = (id, pct) => { const n = $(id); if (n) n.style.width = clamp(pct, 2, 100) + '%'; };
    set('#home-cpu', load + '%');
    bar('#home-cpu-bar', load);
    set('#home-ram', ram + '%');
    bar('#home-ram-bar', ram);
    set('#home-battery', bat + '%');
    bar('#home-battery-bar', bat);
    set('#home-net', net);
  };
  sysTick();
  setInterval(sysTick, 2400);

  const drawUpcoming = () => {
    const list = $('#home-upcoming-list');
    if (!list) return;
    const tasks = storage.get('widget.tasks', []) ?? [];
    const open = tasks.filter((t) => !t.done).slice(0, 4);
    list.replaceChildren();
    if (!open.length) {
      list.append(el('li', { class: 'faint' }, 'Nothing scheduled. Add a task in Tools.'));
      return;
    }
    for (const task of open) {
      list.append(el('li', {}, [
        el('span', { class: 'upcoming__dot' }),
        el('div', {}, [
          el('strong', {}, task.text),
          el('span', {}, 'Today · open'),
        ]),
      ]));
    }
  };
  drawUpcoming();
  bus.on('tasks:change', drawUpcoming);

  const drawMusic = (state) => {
    const title = $('#home-music-title');
    const artist = $('#home-music-artist');
    const toggle = $('#home-music-toggle');
    if (title) title.textContent = state.title;
    if (artist) artist.textContent = state.artist;
    if (toggle) toggle.replaceChildren(icon(state.playing ? 'pause' : 'play'));
    const card = $('#home-music');
    card?.classList.toggle('is-playing', state.playing);
  };
  drawMusic(music.state);
  bus.on('music:state', drawMusic);
  $('#home-music-toggle')?.addEventListener('click', () => music.toggle());
  $('#home-music-next')?.addEventListener('click', () => music.next());
  $('#home-music-prev')?.addEventListener('click', () => music.prev());
}

/* ------------------------------- topbar ----------------------------- */
function initTopbar() {
  const clock = $('#topbar-clock');
  const tick = () => {
    if (!clock) return;
    const now = new Date();
    const time = clock.querySelector('.clock-pill__time');
    const date = clock.querySelector('.clock-pill__date');
    if (time) time.textContent = formatClock(now, { h24: settings.get('clock24') });
    if (date) date.textContent = DAYS[now.getDay()].slice(0, 3) + ' ' + now.getDate() + ' ' + MONTHS[now.getMonth()].slice(0, 3);
  };
  tick();
  setInterval(tick, 1000);

  $('#btn-theme')?.addEventListener('click', () => {
    const next = cycleTheme();
    bus.emit('notify', { title: 'Theme · ' + next.label, tone: 'info', timeout: 1500 });
    bus.emit('companion:say', { text: 'How does ' + next.label + ' feel?' });
  });
  $('#btn-settings')?.addEventListener('click', () => setView('settings'));

  const greet = $('#greeting-line');
  if (greet) greet.textContent = greeting() + (settings.get('userName') ? ', ' + settings.get('userName') : '');
  bus.on('settings:change', () => {
    if (greet) greet.textContent = greeting() + (settings.get('userName') ? ', ' + settings.get('userName') : '');
  });
}

/* ---------------------------- action router ------------------------- */
function initActions() {
  bus.on('action', (action) => {
    switch (action.type) {
      case 'music:play': music.play(action.trackId); break;
      case 'music:pause': music.pause(); break;
      case 'music:toggle': music.toggle(); break;
      case 'music:next': music.next(); break;
      case 'music:prev': music.prev(); break;
      case 'theme:set': settings.set({ theme: action.theme }); break;
      case 'theme:cycle': bus.emit('theme:cycle'); break;
      case 'ui:view': setView(action.view); break;
      case 'palette:open': openPalette(); break;
      case 'chat:clear': memory.clearHistory(); renderChatHistory(); break;
      case 'chat:export': exportChat(); break;
      case 'weather:refresh': weather.refresh({ force: true }); break;
      default: break;
    }
  });

  bus.on('palette:open', () => openPalette());
  bus.on('theme:cycle', () => {
    const next = cycleTheme();
    bus.emit('notify', { title: 'Theme · ' + next.label, tone: 'info', timeout: 1400 });
  });

  bus.on('confetti', () => burstConfetti());
}

function burstConfetti() {
  if (settings.get('reducedMotion')) return;
  const layer = el('div', { class: 'confetti-layer', 'aria-hidden': 'true' });
  const hue = settings.get('accentHue') ?? currentTheme().hue;
  for (let i = 0; i < 26; i += 1) {
    const piece = el('i', {
      style: {
        left: (35 + Math.random() * 30) + '%',
        background: 'hsl(' + (hue + Math.random() * 90) + ' 92% 68%)',
        animationDelay: (Math.random() * 0.25) + 's',
        '--dx': (Math.random() * 260 - 130) + 'px',
        '--rot': (Math.random() * 720 - 360) + 'deg',
      },
    });
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2400);
}

/* ------------------------------ commands ---------------------------- */
function registerCommands() {
  const go = (id, title, iconName, hint) => registerCommand({
    id: 'go-' + id, title, group: 'Navigate', icon: iconName, hint,
    keywords: ['open', 'show', id],
    run: () => setView(id),
  });
  go('home', 'Go home', 'grid', 'world', ['start', 'landing', 'companion']);
  go('dashboard', 'Open tools deck', 'layers', 'widgets', ['dashboard', 'tasks', 'notes', 'timers']);
  go('assistant', 'Open chat', 'sparkles', 'assistant', ['ai', 'ask', 'chat', 'conversation']);
  go('play', 'Open play room', 'gamepad', 'games', ['tic tac toe', 'rock paper scissors']);
  go('vision', 'Open vision', 'eye', 'camera', ['camera', 'ocr', 'text', 'qr', 'barcode', 'objects', 'gestures', 'subtitles']);
  go('music', 'Open studio', 'music', 'audio', ['music', 'sequencer', 'ambient', 'player']);
  go('memories', 'Open memories', 'book', 'memory', ['facts', 'history', 'recall']);
  go('workspace', 'Open AI workspace', 'book', 'documents', ['docs', 'notes', 'editor', 'summarise', 'summarize']);
  go('files', 'Open files', 'layers', 'explorer', ['explorer', 'documents', 'upload', 'folder']);
  go('games', 'Open games', 'gamepad', 'mini games', ['2048', 'memory match', 'play']);
  go('stats', 'Open stats', 'activity', 'performance', ['fps', 'learning', 'personality', 'developer', 'emotion', 'feelings', 'expressions']);
  go('market', 'Open marketplace', 'puzzle', 'extensions', ['plugins', 'install', 'store']);
  go('automations', 'Open automations', 'refresh', 'routines', ['schedule', 'reminder', 'automation']);
  go('device', 'Open device', 'cpu', 'pc control', ['bridge', 'screenshot', 'lock', 'volume', 'desktop', 'pc']);
  go('windows', 'Open windows', 'window', 'floating', ['floating', 'notes', 'calculator', 'timer']);
  go('plugins', 'Open plugins', 'puzzle', 'extensions', ['manifest', 'api']);
  go('settings', 'Open settings', 'settings', 'config', ['preferences', 'theme', 'api key', 'provider']);

  registerCommand({
    id: 'new-session', title: 'New chat session', group: 'Assistant', icon: 'plus',
    keywords: ['clear', 'reset', 'chat'], hint: 'clear scrollback',
    run: () => {
      memory.clearHistory();
      renderChatHistory();
      setView('assistant');
      bus.emit('notify', { title: 'New session', tone: 'info' });
    },
  });
  registerCommand({
    id: 'toggle-voice', title: 'Toggle voice input', group: 'Assistant', icon: 'mic',
    keywords: ['listen', 'speech'], hint: 'Ctrl+Shift+V',
    run: () => {
      const on = voice.toggle({ continuous: false });
      bus.emit('notify', { title: on ? 'Listening' : 'Microphone off', tone: 'info', timeout: 1500 });
    },
  });
  registerCommand({
    id: 'wake-word', title: 'Start wake-word listening', group: 'Assistant', icon: 'mic',
    keywords: ['continuous', 'hands free'], hint: 'says "' + (settings.get('wakeWord') || 'hydra') + '"',
    run: () => {
      voice.start({ continuous: true, wake: true });
      bus.emit('notify', { title: 'Wake word armed', body: 'Say "' + (settings.get('wakeWord') || 'hydra') + '" to talk.', tone: 'success' });
    },
  });
  registerCommand({
    id: 'speak-last', title: 'Speak last reply', group: 'Assistant', icon: 'volume',
    run: () => {
      const last = memory.getHistory().filter((m) => m.role === 'assistant').pop();
      if (last) voice.speak(last.content);
    },
  });

  registerCommand({
    id: 'play-music', title: 'Play generative music', group: 'Studio', icon: 'play',
    keywords: ['audio', 'ambient'], hint: 'Ctrl+M',
    run: () => music.play(),
  });
  registerCommand({
    id: 'next-track', title: 'Next scene', group: 'Studio', icon: 'next',
    run: () => music.next(),
  });
  registerCommand({
    id: 'snapshot', title: 'Snapshot from camera', group: 'Vision', icon: 'camera',
    keywords: ['snapshot', 'photo', 'capture'],
    run: () => {
      setView('vision');
      if (!vision.running) vision.start().then(() => setTimeout(() => vision.snapshot(), 900));
      else vision.snapshot();
    },
  });

  registerCommand({
    id: 'cycle-theme', title: 'Cycle theme', group: 'System', icon: 'palette',
    keywords: ['colour', 'color'], hint: 'Ctrl+Shift+L',
    run: () => bus.emit('theme:cycle'),
  });
  registerCommand({
    id: 'focus-25', title: 'Start 25 minute focus', group: 'System', icon: 'activity',
    keywords: ['pomodoro', 'timer'],
    run: () => {
      bus.emit('action', { type: 'focus:start', minutes: 25 });
      bus.emit('notify', { title: 'Focus started', body: '25 minutes. I will stay quiet.', tone: 'success' });
    },
  });
  registerCommand({
    id: 'reset-layout', title: 'Reset widget layout', group: 'System', icon: 'refresh',
    run: () => bus.emit('layout:reset'),
  });
  registerCommand({
    id: 'export-backup', title: 'Export full backup', group: 'System', icon: 'download',
    run: () => {
      download('hydra-backup-' + new Date().toISOString().slice(0, 10) + '.json', storage.export());
      bus.emit('notify', { title: 'Backup saved', tone: 'success' });
    },
  });
  registerCommand({
    id: 'check-updates', title: 'Check for updates', group: 'System', icon: 'refresh',
    run: () => updater.check({ silent: false }),
  });
  registerCommand({
    id: 'particles-off', title: 'Particles off', group: 'System', icon: 'layers',
    run: () => { settings.set({ particles: 'off' }); bus.emit('notify', { title: 'Particles off', tone: 'info' }); },
  });
  registerCommand({
    id: 'particles-on', title: 'Particles medium', group: 'System', icon: 'layers',
    run: () => { settings.set({ particles: 'medium' }); bus.emit('notify', { title: 'Particles on', tone: 'info' }); },
  });
  const openSettings = (needle) => {
    setView('settings');
    setTimeout(() => {
      const group = [...document.querySelectorAll('#view-settings .set-group')]
        .find((node) => node.querySelector('h3')?.textContent.toLowerCase().includes(needle.toLowerCase()));
      if (!group) return;
      group.scrollIntoView({ behavior: 'smooth', block: 'center' });
      group.classList.add('is-flash');
      setTimeout(() => group.classList.remove('is-flash'), 1400);
    }, 240);
  };
  const settingsCommand = (id, title, needle, keywords, iconName = 'settings') => registerCommand({
    id, title, group: 'Settings', icon: iconName, keywords: ['settings', 'open', ...keywords],
    run: () => openSettings(needle),
  });
  settingsCommand('set-appearance', 'Theme & appearance', 'Appearance', ['theme', 'colour', 'dark', 'amoled', 'rgb']);
  settingsCommand('set-ai', 'AI provider & keys', 'Intelligence', ['openai', 'gemini', 'ollama', 'model', 'key']);
  settingsCommand('set-voice', 'Voice & ElevenLabs', 'Voice', ['elevenlabs', 'speech', 'tts', 'rate', 'pitch']);
  settingsCommand('set-notifications', 'Notifications & quiet hours', 'Notifications', ['dnd', 'do not disturb', 'quiet', 'sound']);
  settingsCommand('set-weather', 'Weather location', 'Weather', ['city', 'location', 'units'], 'cloud');
  settingsCommand('set-updates', 'About & updates', 'About', ['version', 'update', 'offline', 'cache'], 'refresh');
  settingsCommand('set-data', 'Data, backup & reset', 'Data', ['export', 'import', 'backup', 'erase'], 'shield');

  registerCommand({
    id: 'vision-camera', title: 'Start camera', group: 'Vision', icon: 'camera',
    keywords: ['vision', 'camera', 'webcam'], run: () => { setView('vision'); vision.toggle(); },
  });
  registerCommand({
    id: 'vision-ocr', title: 'Read text (OCR)', group: 'Vision', icon: 'book',
    keywords: ['vision', 'ocr', 'text', 'scan'], run: () => { setView('vision'); vision.ocr(); },
  });
  registerCommand({
    id: 'vision-objects', title: 'Detect objects', group: 'Vision', icon: 'layers',
    keywords: ['vision', 'object', 'detection', 'coco'], run: () => { setView('vision'); document.querySelector('[data-vision-act="objects"]')?.click(); },
  });
  registerCommand({
    id: 'vision-subtitles', title: 'Live subtitles', group: 'Vision', icon: 'mic',
    keywords: ['vision', 'subtitles', 'captions', 'speech'], run: () => { setView('vision'); document.querySelector('[data-vision-act="subtitles"]')?.click(); },
  });
  registerCommand({
    id: 'vision-gestures', title: 'Gesture control', group: 'Vision', icon: 'eye',
    keywords: ['vision', 'gesture', 'swipe', 'wave'], run: () => { setView('vision'); document.querySelector('[data-vision-act="gestures"]')?.click(); },
  });

  registerCommand({
    id: 'workspace-new', title: 'New workspace document', group: 'Workspace', icon: 'plus',
    keywords: ['doc', 'note', 'write'], run: () => { setView('workspace'); bus.emit('workspace:new'); },
  });
  registerCommand({
    id: 'workspace-summarise', title: 'Summarise current document', group: 'Workspace', icon: 'sparkles',
    keywords: ['workspace', 'summary', 'ai'], run: () => { setView('workspace'); bus.emit('workspace:act', { kind: 'summarize' }); },
  });
  registerCommand({
    id: 'workspace-tasks', title: 'Extract action items', group: 'Workspace', icon: 'check',
    keywords: ['workspace', 'tasks', 'todo'], run: () => { setView('workspace'); bus.emit('workspace:act', { kind: 'tasks' }); },
  });

  registerCommand({
    id: 'files-new', title: 'New file', group: 'Files', icon: 'plus',
    keywords: ['files', 'create', 'document'], run: () => { setView('files'); setTimeout(() => document.querySelector('[data-file-act="new-file"]')?.click(), 180); },
  });
  registerCommand({
    id: 'automation-new', title: 'Create an automation', group: 'Automations', icon: 'plus',
    keywords: ['routine', 'schedule', 'reminder'], run: () => { setView('automations'); setTimeout(() => document.querySelector('#auto-name')?.focus(), 200); },
  });
  registerCommand({
    id: 'device-connect', title: 'Connect desktop bridge', group: 'Device', icon: 'cpu',
    keywords: ['pc', 'bridge', 'desktop', 'token'], run: () => { setView('device'); setTimeout(() => document.querySelector('#dev-token')?.focus(), 200); },
  });
  registerCommand({
    id: 'device-screenshot', title: 'Take a PC screenshot', group: 'Device', icon: 'camera',
    keywords: ['pc', 'desktop', 'capture'], run: () => { setView('device'); bus.emit('device:action', { action: 'screenshot' }); },
  });
  registerCommand({
    id: 'device-lock', title: 'Lock the PC', group: 'Device', icon: 'lock',
    keywords: ['pc', 'desktop', 'security'], run: () => { setView('device'); bus.emit('device:action', { action: 'lock' }); },
  });
  registerCommand({
    id: 'dnd-toggle', title: 'Toggle do not disturb', group: 'System', icon: 'bell',
    keywords: ['notifications', 'quiet', 'mute'], run: () => document.querySelector('#btn-dnd')?.click(),
  });
  registerCommand({
    id: 'learning-reset', title: 'Reset AI learning', group: 'System', icon: 'refresh',
    keywords: ['feedback', 'ratings', 'reset'], run: () => { setView('stats'); setTimeout(() => document.querySelector('#st-reset-learn')?.click(), 220); },
  });

  registerCommand({
    id: 'celebrate', title: 'Make HYDRA celebrate', group: 'Companion', icon: 'sparkles',
    run: () => companion.celebrate(),
  });
  registerCommand({
    id: 'dance', title: 'Ask HYDRA to dance', group: 'Companion', icon: 'music',
    run: () => companion.dance(),
  });
  registerCommand({
    id: 'walk', title: 'Walk around the room', group: 'Companion', icon: 'activity',
    keywords: ['walk', 'move', 'legs', 'step', 'come here'],
    run: () => companion.walk(),
  });
  registerCommand({
    id: 'wave', title: 'Wave hello', group: 'Companion', icon: 'sparkles',
    keywords: ['wave', 'hello', 'hi'],
    run: () => companion.wave(),
  });
  registerCommand({
    id: 'follow-me', title: 'Follow me with the camera', group: 'Companion', icon: 'eye',
    keywords: ['face', 'camera', 'presence', 'look at me', 'follow'],
    run: () => {
      setView('vision');
      setTimeout(() => document.querySelector('[data-vision-act="presence"]')?.click(), 420);
    },
  });
  registerCommand({
    id: 'identify-scene', title: 'Identify what the camera sees', group: 'Vision', icon: 'eye',
    keywords: ['what do you see', 'identify this', 'look at this', 'describe the room', 'what is this'],
    run: () => {
      setView('vision');
      setTimeout(() => document.querySelector('[data-vision-act="identify"]')?.click(), 420);
    },
  });
  registerCommand({
    id: 'vision-1000', title: 'Detect 1000 object classes', group: 'Vision', icon: 'scan',
    keywords: ['objects', 'imagenet', 'detect', 'classify', 'what is this'],
    run: () => {
      setView('vision');
      setTimeout(() => document.querySelector('[data-vision-act="thousand"]')?.click(), 420);
    },
  });
  registerCommand({
    id: 'emotion-lab', title: 'Open emotion lab', group: 'Companion', icon: 'eye',
    keywords: ['emotion', 'feelings', 'face', 'expressions', 'mood'],
    run: () => {
      setView('stats');
      setTimeout(() => $('#emotion-lab')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
    },
  });
}

/* -------------------------------- play ------------------------------ */
function initPlay() {
  const root = $('#play-root');
  if (!root) return;

  $('#btn-play-dance')?.addEventListener('click', () => {
    companion.dance();
    notifications.push({ title: 'Dance break', body: 'HYDRA is showing off its moves.', tone: 'success', silent: true });
  });

  const tttBoard = Array(9).fill(null);
  const tttGrid = el('div', { class: 'ttt' });
  const tttStatus = el('p', { class: 'play-status' }, 'You are X. Your move.');
  let tttOver = false;

  const winner = (board) => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,b,c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    return board.every(Boolean) ? 'draw' : null;
  };
  const aiMove = () => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const mark of ['O', 'X']) {
      for (const [a,b,c] of lines) {
        const line = [a,b,c];
        const marks = line.map((i) => tttBoard[i]);
        if (marks.filter((m) => m === mark).length === 2 && marks.includes(null)) {
          return line[marks.indexOf(null)];
        }
      }
    }
    if (!tttBoard[4]) return 4;
    const free = tttBoard.map((v, i) => (v ? null : i)).filter((v) => v != null);
    return free[Math.floor(Math.random() * free.length)];
  };
  const drawTTT = () => {
    tttGrid.replaceChildren();
    tttBoard.forEach((mark, i) => {
      const cell = el('button', { class: 'ttt__cell' + (mark ? ' is-' + mark.toLowerCase() : ''), type: 'button' }, mark || '');
      cell.addEventListener('click', () => {
        if (tttOver || tttBoard[i]) return;
        tttBoard[i] = 'X';
        let result = winner(tttBoard);
        if (!result) {
          const move = aiMove();
          if (move != null) tttBoard[move] = 'O';
          result = winner(tttBoard);
        }
        drawTTT();
        if (result) {
          tttOver = true;
          if (result === 'X') { tttStatus.textContent = 'You win. HYDRA is taking notes.'; companion.celebrate(); }
          else if (result === 'O') { tttStatus.textContent = 'HYDRA wins. Rematch?'; bus.emit('companion:say', { text: 'Good game. Again?' }); }
          else tttStatus.textContent = 'Draw. Perfectly balanced.';
        } else {
          tttStatus.textContent = 'Your move.';
        }
      });
      tttGrid.append(cell);
    });
  };
  const resetTTT = el('button', { class: 'ghost-btn', type: 'button' }, [icon('refresh'), 'Rematch']);
  resetTTT.addEventListener('click', () => {
    tttBoard.fill(null);
    tttOver = false;
    tttStatus.textContent = 'You are X. Your move.';
    drawTTT();
  });
  drawTTT();

  const rpsOptions = ['rock', 'paper', 'scissors'];
  const rpsStatus = el('p', { class: 'play-status' }, 'Pick your throw.');
  const rpsScore = el('p', { class: 'play-score' }, 'You 0 · HYDRA 0');
  let you = 0;
  let hydra = 0;
  const rpsButtons = el('div', { class: 'rps' });
  for (const option of rpsOptions) {
    const btn = el('button', { class: 'rps__btn', type: 'button' }, option);
    btn.addEventListener('click', () => {
      const pick = randomOf(rpsOptions);
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      let line;
      if (pick === option) line = 'Tie on ' + option + '.';
      else if (beats[option] === pick) { you += 1; line = option + ' beats ' + pick + '. Point to you.'; }
      else { hydra += 1; line = pick + ' beats ' + option + '. Point to me.'; }
      rpsStatus.textContent = line;
      rpsScore.textContent = 'You ' + you + ' · HYDRA ' + hydra;
      companion.poseOnce(you > hydra ? 'nod' : 'bounce', 1200);
    });
    rpsButtons.append(btn);
  }

  root.replaceChildren(
    el('div', { class: 'play-grid' }, [
      el('section', { class: 'play-card' }, [
        el('header', {}, [icon('grid'), el('h3', {}, 'Tic-tac-toe')]),
        tttStatus, tttGrid, resetTTT,
      ]),
      el('section', { class: 'play-card' }, [
        el('header', {}, [icon('gamepad'), el('h3', {}, 'Rock · paper · scissors')]),
        rpsStatus, rpsButtons, rpsScore,
      ]),
    ]),
  );
}

/* ---------------------------- settings view ------------------------- */
function initSettingsUI() {
  renderSettings($('#settings-root'));
  $('#btn-export-settings')?.addEventListener('click', () => {
    download('hydra-settings.json', JSON.stringify(settings.get(), null, 2));
    bus.emit('notify', { title: 'Settings exported', tone: 'success' });
  });
  bus.on('settings:change', () => {
    if (app.currentView === 'settings') renderSettings($('#settings-root'));
  });
}

function seedTasks() {
  if (storage.get('widget.tasks', null) !== null) return;
  const now = Date.now();
  storage.set('widget.tasks', [
    { id: 'seed-1', text: 'Review the HYDRA launch checklist', done: false, at: now },
    { id: 'seed-2', text: 'Try the voice wake word', done: false, at: now + 1 },
    { id: 'seed-3', text: 'Pick a theme for the evening', done: false, at: now + 2 },
  ]);
}

/* ------------------------------ fps meter --------------------------- */
function startFpsMeter() {
  let frames = 0;
  let last = performance.now();
  const loop = (now) => {
    frames += 1;
    if (now - last >= 1000) {
      window.__hydraFps = Math.round((frames * 1000) / (now - last));
      frames = 0;
      last = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* -------------------------------- boot ------------------------------ */
export async function boot() {
  if (app.booted) return;
  app.booted = true;

  mountAurora();
  initParticles();
  initSettings();
  notifications.init();
  mountNetworkBadge();
  emotion.init();
  initAI();
  initVoice();
  vision.init();
  cv.init();
  initMusic();
  initWeather();
  dashboard.init();
  plugins.init();
  initShortcuts();
  initRouter();
  initChat();
  initAttachments();
  initMemories();
  initStudio();
  initVision();
  initWorld();
  seedTasks();
  initTopbar();
  initActions();
  initPlay();
  initSettingsUI();
  registerCommands();
  initCompanion();
  initRobotRenderer();
  bus.on('robot:walk', () => companion.walk());
  initDeck();
  initExtras();
  initWorkspace();
  window.__hydra = { companion, emotion, setView, bus, presence, objects, cv, universal, memory, auth };
  try { initDevice(); } catch (err) { console.error('[device]', err); }
  try { auth.init(); } catch (err) {
    console.error('[auth]', err);
    document.querySelector('#auth')?.remove();
    document.body.classList.remove('auth-locked');
  }
  startUniversal();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // A new worker just took over: reload once so fresh CSS and JS apply.
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  const buildChip = document.querySelector('#build-chip');
  if (buildChip) buildChip.textContent = 'v' + VERSION;
  startFpsMeter();

  document.title = 'HYDRA · ' + currentTheme().label;

  const bootEl = $('#boot');
  const appEl = $('#app');
  if (appEl) appEl.hidden = false;

  if (settings.get('startupIntro')) {
    await playBoot({ reduced: settings.get('reducedMotion') });
  } else if (bootEl) {
    bootEl.hidden = true;
    bootEl.style.display = 'none';
  }

  document.body.classList.add('is-ready');
  if (appEl) appEl.classList.add('is-live');
  try { initMotion(); } catch (err) { console.error('[motion]', err); }
  try { initPack(); } catch (err) { console.error('[pack]', err); }

  const hour = new Date().getHours();
  setTimeout(() => {
    notifications.push({
      title: 'HYDRA is online',
      body: hour >= 23 || hour < 6 ? 'Quiet hours. I will keep the lights low.' : 'Offline core ready. Press Ctrl+K to ask anything.',
      tone: 'system',
      icon: 'shield',
      silent: true,
    });
  }, 900);

  updater.maybeCheck();
  bus.emit('app:ready');
}


/* --------------------- universal account bridge --------------------- */
async function startUniversal() {
  await universal.init();
  const local = auth.current();
  if (local && !universal.signedIn) await universal.adopt(local);
  memory.adoptShared(universal.memories(200));
  initAppSwitcher({ currentApp: 'companion' }).catch((err) => console.error('[switcher]', err));

  universal.on('memory', () => {
    const added = memory.adoptShared(universal.memories(200));
    if (added) bus.emit('memory:fact', memory.facts[0]);
  });

  universal.on('notify', () => {
    const latest = universal.notifications(1)[0];
    if (!latest || latest.app === 'companion') return;
    bus.emit('notify', { title: latest.title, body: latest.body, tone: latest.tone || 'info' });
    companion.say(`${latest.title}.`, { hold: 3600 });
  });

  universal.on('session', () => {
    if (!universal.signedIn) auth.signOut();
  });

  bus.on('auth:change', async ({ user }) => {
    if (!user) return;
    await universal.init();
    if (!universal.signedIn) await universal.adopt(user);
  });
}

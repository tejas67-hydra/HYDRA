/**
 * HYDRA — settings store, theme application and the settings surface.
 */

import { $, el, icon, bus, download, clamp } from './utils.js';
import { createStore, storage } from './storage.js';
import { updater, VERSION, BUILD } from './updater.js';
import { auth } from './auth.js';

export const THEMES = [
  { id: 'nebula', label: 'Neon Purple', hue: 268, color: '#8b5cf6' },
  { id: 'obsidian', label: 'Cyber Blue', hue: 200, color: '#22a8e0' },
  { id: 'ember', label: 'Crimson', hue: 354, color: '#f43f5e' },
  { id: 'matrix', label: 'Matrix Green', hue: 140, color: '#22c55e' },
  { id: 'frost', label: 'Ice', hue: 192, color: '#22d3ee' },
  { id: 'dawn', label: 'Arctic White', hue: 262, color: '#d8c9f5' },
  { id: 'galaxy', label: 'Galaxy', hue: 285, color: '#c026d3' },
  { id: 'rgb', label: 'RGB Pulse', hue: 300, color: 'conic-gradient(#f43f5e,#f59e0b,#22c55e,#22d3ee,#8b5cf6,#f43f5e)' },
  { id: 'mono', label: 'Mono', hue: 220, color: '#94a3b8' },
];

export const PROVIDERS = [
  { id: 'local', label: 'HYDRA Core (offline)', needsKey: false, hint: 'No network, no key. Rule-based local brain.' },
  { id: 'openai', label: 'OpenAI compatible', needsKey: true, hint: 'Any /v1/chat/completions endpoint.' },
  { id: 'gemini', label: 'Google Gemini', needsKey: true, hint: 'Generative Language API.' },
  { id: 'ollama', label: 'Ollama (local models)', needsKey: false, hint: 'Runs against your machine on port 11434.' },
];

export const DEFAULTS = {
  theme: 'nebula',
  accentHue: null,
  particles: 'medium',
  reducedMotion: false,
  motionLevel: 'full',
  robot3d: 'auto',
  presenceAuto: true,
  clock24: true,
  showSeconds: true,
  compact: false,
  startupIntro: true,
  userName: '',
  aiProvider: 'local',
  aiModel: '',
  openaiBase: 'https://api.openai.com/v1',
  apiKeys: { openai: '', gemini: '', ollama: '' },
  ollamaUrl: 'http://localhost:11434',
  temperature: 0.7,
  systemPrompt: '',
  voiceOutput: false,
  voiceRate: 1,
  voicePitch: 1,
  elevenKey: '',
  elevenVoice: '21m00Tcm4TlvDq8ikWAM',
  elevenModel: 'eleven_multilingual_v2',
  dnd: false,
  quietStart: '22:00',
  quietEnd: '08:00',
  notifSound: true,
  bridgeUrl: 'http://127.0.0.1:8765',
  bridgeToken: '',
  wakeWord: 'hydra',
  autoListen: false,
  weatherCity: '',
  weatherLat: null,
  weatherLon: null,
  units: 'metric',
  soundEnabled: true,
  devMode: false,
};

export const settings = createStore(DEFAULTS, { key: 'settings' });

// Replies used to be spoken by default. Silence anyone who never chose it.
if (!localStorage.getItem('hydra.voice.quiet')) {
  settings.set({ voiceOutput: false });
  localStorage.setItem('hydra.voice.quiet', '1');
}

export const setSetting = (key, value) => settings.set({ [key]: value });

export function currentTheme() {
  return THEMES.find((t) => t.id === settings.get('theme')) ?? THEMES[0];
}

export function applySettings(state = settings.get()) {
  const root = document.documentElement;
  root.dataset.theme = state.theme;

  const motion = state.motionLevel || (state.reducedMotion ? 'off' : 'full');
  root.dataset.motion = motion;
  if (state.reducedMotion !== (motion === 'off')) state.reducedMotion = motion === 'off';

  if (state.accentHue == null) root.style.removeProperty('--accent-hue');
  else root.style.setProperty('--accent-hue', String(state.accentHue));

  root.classList.toggle('reduce-motion', Boolean(state.reducedMotion));
  document.body.classList.toggle('is-compact', Boolean(state.compact));
  document.body.classList.toggle('is-dev', Boolean(state.devMode));
}

export function cycleTheme() {
  const idx = THEMES.findIndex((t) => t.id === settings.get('theme'));
  const next = THEMES[(idx + 1) % THEMES.length];
  settings.set({ theme: next.id });
  return next;
}

/* ----------------------------- UI helpers ---------------------------- */

function switchRow({ label, hint, value, onChange, id }) {
  const input = el('input', { type: 'checkbox', checked: Boolean(value), id });
  input.addEventListener('change', () => onChange(input.checked));
  return el('div', { class: 'set-row' }, [
    el('div', { class: 'set-row__text' }, [
      el('strong', {}, label),
      hint ? el('span', {}, hint) : null,
    ]),
    el('div', { class: 'set-row__control' }, [
      el('label', { class: 'switch', for: id }, [input, el('span')]),
    ]),
  ]);
}

function textRow({ label, hint, value, placeholder, type = 'text', onInput, width }) {
  const input = el('input', {
    type,
    value: value ?? '',
    placeholder: placeholder ?? '',
    autocomplete: 'off',
    spellcheck: false,
  });
  if (width) input.style.width = width;
  input.addEventListener('input', () => onInput(input.value));
  return el('div', { class: 'set-row' }, [
    el('div', { class: 'set-row__text' }, [
      el('strong', {}, label),
      hint ? el('span', {}, hint) : null,
    ]),
    el('div', { class: 'set-row__control' }, [input]),
  ]);
}

function selectRow({ label, hint, value, options, onChange }) {
  const select = el('select', {});
  for (const opt of options) {
    const option = el('option', { value: opt.value }, opt.label);
    if (String(opt.value) === String(value)) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  return el('div', { class: 'set-row' }, [
    el('div', { class: 'set-row__text' }, [
      el('strong', {}, label),
      hint ? el('span', {}, hint) : null,
    ]),
    el('div', { class: 'set-row__control' }, [select]),
  ]);
}

function rangeRow({ label, hint, value, min = 0, max = 1, step = 0.1, format, onChange }) {
  const out = el('b', { class: 'mono', style: { fontSize: '11px', minWidth: '34px', textAlign: 'right' } },
    format ? format(value) : String(value));
  const input = el('input', { type: 'range', min, max, step, value });
  input.style.width = '150px';
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format ? format(v) : String(v);
    onChange(v);
  });
  return el('div', { class: 'set-row' }, [
    el('div', { class: 'set-row__text' }, [
      el('strong', {}, label),
      hint ? el('span', {}, hint) : null,
    ]),
    el('div', { class: 'set-row__control' }, [input, out]),
  ]);
}

function group({ title, hint, iconName, rows }) {
  return el('section', { class: 'set-group' }, [
    el('header', { class: 'set-group__head' }, [
      icon(iconName),
      el('h3', {}, title),
      hint ? el('p', {}, hint) : null,
    ]),
    el('div', { class: 'set-group__body' }, rows.filter(Boolean)),
  ]);
}

/* ------------------------------- render ------------------------------ */

export function renderSettings(container) {
  if (!container) return;
  const state = settings.get();
  container.replaceChildren();

  /* Appearance */
  const swatches = el('div', { class: 'theme-swatches' });
  for (const theme of THEMES) {
    const btn = el('button', {
      class: `theme-swatch${state.theme === theme.id ? ' is-on' : ''}`,
      type: 'button',
      title: theme.label,
      'aria-label': `Use ${theme.label} theme`,
      style: { background: theme.color },
    }, [el('span')]);
    btn.addEventListener('click', () => {
      settings.set({ theme: theme.id });
      renderSettings(container);
    });
    swatches.append(btn);
  }

  const hueOut = el('b', { class: 'mono', style: { fontSize: '11px', minWidth: '34px' } },
    state.accentHue == null ? 'auto' : `${state.accentHue}°`);
  const hueInput = el('input', {
    type: 'range', min: 0, max: 360, step: 1,
    value: state.accentHue ?? currentTheme().hue,
    class: 'hue-slider',
  });
  hueInput.addEventListener('input', () => {
    const hue = Number(hueInput.value);
    hueOut.textContent = `${hue}°`;
    settings.set({ accentHue: hue });
  });

  const resetHue = el('button', { class: 'link-btn', type: 'button' }, 'Auto');
  resetHue.addEventListener('click', () => {
    settings.set({ accentHue: null });
    hueOut.textContent = 'auto';
    hueInput.value = currentTheme().hue;
  });

  const appearance = group({
    title: 'Appearance',
    hint: 'theme · motion · density',
    iconName: 'palette',
    rows: [
      el('div', { class: 'set-row' }, [
        el('div', { class: 'set-row__text' }, [
          el('strong', {}, 'Theme'),
          el('span', {}, 'Nine tuned palettes. Every surface follows the tokens.'),
        ]),
        el('div', { class: 'set-row__control' }, [swatches]),
      ]),
      el('div', { class: 'set-row' }, [
        el('div', { class: 'set-row__text' }, [
          el('strong', {}, 'Accent hue'),
          el('span', {}, 'Override the theme accent with a custom hue.'),
        ]),
        el('div', { class: 'set-row__control' }, [hueInput, hueOut, resetHue]),
      ]),
      selectRow({
        label: 'Particle density',
        hint: 'Ambient engine load. Turn it off to save battery.',
        value: state.particles,
        options: [
          { value: 'off', label: 'Off' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
        onChange: (v) => settings.set({ particles: v }),
      }),
      selectRow({
        label: 'Motion',
        hint: 'Full keeps the robot and the whole interface alive. Subtle keeps the bot but drops the entrances. Off stills everything.',
        value: state.motionLevel || 'full',
        options: [
          { value: 'full', label: 'Full' },
          { value: 'subtle', label: 'Subtle' },
          { value: 'off', label: 'Off' },
        ],
        onChange: (v) => settings.set({ motionLevel: v, reducedMotion: v === 'off' }),
      }),
      textRow({
        label: 'Rive asset',
        hint: 'Optional .riv URL. Inputs named lookX, lookY, talking and emotion are driven automatically.',
        value: state.riveSrc || '',
        placeholder: 'assets/robot.riv',
        onInput: (v) => settings.set({ riveSrc: v.trim() }),
      }),
      selectRow({
        label: 'Companion renderer',
        hint: 'Auto uses the WebGL robot on capable desktops and the SVG robot elsewhere.',
        value: state.robot3d || 'auto',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'on', label: '3D (WebGL)' },
          { value: 'off', label: '2D (SVG)' },
        ],
        onChange: (v) => settings.set({ robot3d: v }),
      }),
      switchRow({
        id: 'set-presence',
        label: 'Look at me',
        hint: 'When the camera is on, turn the companion towards your face. Runs on-device.',
        value: state.presenceAuto,
        onChange: (v) => settings.set({ presenceAuto: v }),
      }),
      switchRow({
        id: 'set-compact',
        label: 'Compact widgets',
        hint: 'Tighter grid rows for smaller screens.',
        value: state.compact,
        onChange: (v) => settings.set({ compact: v }),
      }),
      switchRow({
        id: 'set-intro',
        label: 'Startup sequence',
        hint: 'Show the cinematic boot animation on load.',
        value: state.startupIntro,
        onChange: (v) => settings.set({ startupIntro: v }),
      }),
    ],
  });

  /* Clock */
  const clockGroup = group({
    title: 'Clock & locale',
    hint: 'dashboard · topbar',
    iconName: 'clock',
    rows: [
      textRow({
        label: 'Your name',
        hint: 'Used in greetings and the assistant persona.',
        value: state.userName,
        placeholder: 'Operator',
        onInput: (v) => settings.set({ userName: v.trim().slice(0, 40) }),
      }),
      switchRow({
        id: 'set-clock24',
        label: '24-hour clock',
        hint: 'Off switches the interface to 12-hour time.',
        value: state.clock24,
        onChange: (v) => settings.set({ clock24: v }),
      }),
      switchRow({
        id: 'set-seconds',
        label: 'Show seconds',
        hint: 'Seconds tick in the dashboard clock widget.',
        value: state.showSeconds,
        onChange: (v) => settings.set({ showSeconds: v }),
      }),
    ],
  });

  /* AI */
  const provider = PROVIDERS.find((p) => p.id === state.aiProvider) ?? PROVIDERS[0];
  const providerSelect = el('select', {});
  for (const p of PROVIDERS) {
    const option = el('option', { value: p.id }, p.label);
    if (p.id === state.aiProvider) option.selected = true;
    providerSelect.append(option);
  }
  providerSelect.addEventListener('change', () => {
    settings.set({ aiProvider: providerSelect.value, aiModel: '' });
    renderSettings(container);
  });

  const aiRows = [
    el('div', { class: 'set-row' }, [
      el('div', { class: 'set-row__text' }, [
        el('strong', {}, 'Provider'),
        el('span', {}, provider.hint),
      ]),
      el('div', { class: 'set-row__control' }, [providerSelect]),
    ]),
  ];

  if (state.aiProvider !== 'local') {
    aiRows.push(textRow({
      label: 'Model',
      hint: state.aiProvider === 'openai' ? 'e.g. gpt-4o-mini, llama-3.3-70b' : state.aiProvider === 'gemini' ? 'e.g. gemini-2.0-flash' : 'e.g. llama3.2',
      value: state.aiModel,
      placeholder: state.aiProvider === 'openai' ? 'gpt-4o-mini' : state.aiProvider === 'gemini' ? 'gemini-2.0-flash' : 'llama3.2',
      onInput: (v) => settings.set({ aiModel: v.trim() }),
    }));
  }
  if (state.aiProvider === 'openai') {
    aiRows.push(textRow({
      label: 'API key',
      hint: 'Stored only in this browser. Never leaves the device except to the provider.',
      value: state.apiKeys.openai,
      type: 'password',
      placeholder: 'sk-…',
      onInput: (v) => settings.set({ apiKeys: { ...settings.get('apiKeys'), openai: v.trim() } }),
    }));
    aiRows.push(textRow({
      label: 'Base URL',
      hint: 'Point at any OpenAI-compatible gateway.',
      value: state.openaiBase,
      placeholder: 'https://api.openai.com/v1',
      onInput: (v) => settings.set({ openaiBase: v.trim() }),
    }));
  }
  if (state.aiProvider === 'gemini') {
    aiRows.push(textRow({
      label: 'API key',
      hint: 'Google AI Studio key. Stored locally.',
      value: state.apiKeys.gemini,
      type: 'password',
      placeholder: 'AIza…',
      onInput: (v) => settings.set({ apiKeys: { ...settings.get('apiKeys'), gemini: v.trim() } }),
    }));
  }
  if (state.aiProvider === 'ollama') {
    aiRows.push(textRow({
      label: 'Ollama URL',
      hint: 'Enable CORS on the Ollama server (OLLAMA_ORIGINS=*).',
      value: state.ollamaUrl,
      placeholder: 'http://localhost:11434',
      onInput: (v) => settings.set({ ollamaUrl: v.trim() }),
    }));
  }

  aiRows.push(rangeRow({
    label: 'Temperature',
    hint: 'Lower is precise, higher is playful.',
    value: state.temperature,
    min: 0, max: 1.5, step: 0.05,
    format: (v) => Number(v).toFixed(2),
    onChange: (v) => settings.set({ temperature: v }),
  }));
  aiRows.push(switchRow({
    id: 'set-voice-out',
    label: 'Speak replies',
    hint: 'Read assistant messages aloud with the system voice.',
    value: state.voiceOutput,
    onChange: (v) => settings.set({ voiceOutput: v }),
  }));
  aiRows.push(textRow({
    label: 'Wake word',
    hint: 'Say this while continuous listening is on.',
    value: state.wakeWord,
    placeholder: 'hydra',
    onInput: (v) => settings.set({ wakeWord: v.trim().toLowerCase().slice(0, 24) }),
  }));
  aiRows.push(switchRow({
    id: 'set-dev',
    label: 'Developer mode',
    hint: 'Expose the command log, provider latency and raw events.',
    value: state.devMode,
    onChange: (v) => settings.set({ devMode: v }),
  }));

  const aiGroup = group({
    title: 'Intelligence',
    hint: 'providers · behaviour',
    iconName: 'sparkles',
    rows: aiRows,
  });

  /* Weather */
  const useLocation = el('button', { class: 'ghost-btn', type: 'button' }, [
    icon('scan'), 'Use my location',
  ]);
  useLocation.addEventListener('click', () => {
    if (!navigator.geolocation) {
      bus.emit('notify', { title: 'Geolocation unavailable', body: 'This browser cannot share a location.', tone: 'warn' });
      return;
    }
    useLocation.disabled = true;
    useLocation.textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        settings.set({
          weatherLat: Number(pos.coords.latitude.toFixed(4)),
          weatherLon: Number(pos.coords.longitude.toFixed(4)),
          weatherCity: '',
        });
        bus.emit('notify', { title: 'Location set', body: 'Weather will follow you.', tone: 'success' });
        renderSettings(container);
      },
      () => {
        useLocation.disabled = false;
        useLocation.replaceChildren(icon('scan'), 'Use my location');
        bus.emit('notify', { title: 'Location denied', body: 'Type a city instead.', tone: 'warn' });
      },
      { timeout: 8000 },
    );
  });

  const weatherGroup = group({
    title: 'Weather',
    hint: 'open-meteo · no key',
    iconName: 'cloud',
    rows: [
      textRow({
        label: 'City',
        hint: 'Geocoded through Open-Meteo. Leave empty to auto-detect.',
        value: state.weatherCity,
        placeholder: 'e.g. Berlin',
        onInput: (v) => settings.set({ weatherCity: v.trim() }),
      }),
      el('div', { class: 'set-row' }, [
        el('div', { class: 'set-row__text' }, [
          el('strong', {}, 'Precise location'),
          el('span', {}, state.weatherLat != null ? `${state.weatherLat}, ${state.weatherLon}` : 'Not set — using city or a default.'),
        ]),
        el('div', { class: 'set-row__control' }, [useLocation]),
      ]),
      selectRow({
        label: 'Units',
        hint: 'Metric uses °C and km/h.',
        value: state.units,
        options: [
          { value: 'metric', label: 'Metric (°C)' },
          { value: 'imperial', label: 'Imperial (°F)' },
        ],
        onChange: (v) => settings.set({ units: v }),
      }),
    ],
  });

  /* Data */
  const sizeKb = (storage.size() / 1024).toFixed(1);
  const exportBtn = el('button', { class: 'ghost-btn', type: 'button' }, [icon('download'), 'Export backup']);
  exportBtn.addEventListener('click', () => {
    download(`hydra-backup-${new Date().toISOString().slice(0, 10)}.json`, storage.export());
    bus.emit('notify', { title: 'Backup saved', body: 'Settings, memory and layouts exported.', tone: 'success' });
  });

  const importInput = el('input', { type: 'file', accept: 'application/json', hidden: true });
  const importBtn = el('button', { class: 'ghost-btn', type: 'button' }, [icon('upload'), 'Import backup']);
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const count = storage.import(await file.text());
      bus.emit('notify', { title: 'Backup restored', body: `${count} records imported. Reloading…`, tone: 'success' });
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      bus.emit('notify', { title: 'Import failed', body: err.message, tone: 'error' });
    }
  });

  const wipe = el('button', { class: 'ghost-btn', type: 'button', style: { color: 'var(--danger)' } }, [icon('trash'), 'Erase everything']);
  wipe.addEventListener('click', () => {
    if (!window.confirm('Erase all HYDRA data on this device? This cannot be undone.')) return;
    storage.clear();
    location.reload();
  });

  const dataGroup = group({
    title: 'Data & privacy',
    hint: `${sizeKb} KB stored locally`,
    iconName: 'shield',
    rows: [
      el('div', { class: 'set-row' }, [
        el('div', { class: 'set-row__text' }, [
          el('strong', {}, 'Local-first'),
          el('span', {}, 'Chats, memory, layouts and keys live in localStorage. Nothing is synced anywhere.'),
        ]),
        el('div', { class: 'set-row__control' }, [exportBtn, importBtn, importInput]),
      ]),
      el('div', { class: 'set-row' }, [
        el('div', { class: 'set-row__text' }, [
          el('strong', {}, 'Reset'),
          el('span', {}, 'Deletes every record and returns HYDRA to factory defaults.'),
        ]),
        el('div', { class: 'set-row__control' }, [wipe]),
      ]),
    ],
  });

  /* Voice */
  const testVoice = el('button', { class: 'ghost-btn', type: 'button' }, [icon('volume'), 'Test voice']);
  testVoice.addEventListener('click', () => {
    bus.emit('voice:speak', 'HYDRA voice check. All systems listening.');
  });
  const voiceGroup = group({
    title: 'Voice',
    hint: state.elevenKey ? 'elevenlabs' : 'system speech',
    iconName: 'mic',
    rows: [
      textRow({
        label: 'ElevenLabs API key',
        hint: 'Optional. When set, replies use ElevenLabs instead of the system voice. Stored locally.',
        value: state.elevenKey,
        type: 'password',
        placeholder: 'sk_…',
        onInput: (v) => settings.set({ elevenKey: v.trim() }),
      }),
      textRow({
        label: 'ElevenLabs voice ID',
        hint: 'Find voice IDs in the ElevenLabs voice library.',
        value: state.elevenVoice,
        placeholder: '21m00Tcm4TlvDq8ikWAM',
        onInput: (v) => settings.set({ elevenVoice: v.trim() }),
      }),
      rangeRow({
        label: 'Rate',
        hint: 'Speaking speed for the system voice.',
        value: state.voiceRate,
        min: 0.6, max: 1.6, step: 0.05,
        format: (v) => Number(v).toFixed(2) + '×',
        onChange: (v) => settings.set({ voiceRate: v }),
      }),
      rangeRow({
        label: 'Pitch',
        hint: 'Lower is calm, higher is bright.',
        value: state.voicePitch,
        min: 0.5, max: 1.8, step: 0.05,
        format: (v) => Number(v).toFixed(2),
        onChange: (v) => settings.set({ voicePitch: v }),
      }),
      el('div', { class: 'set-row' }, [
        el('div', { class: 'set-row__text' }, [
          el('strong', {}, 'Preview'),
          el('span', {}, 'Hear the current voice with the current settings.'),
        ]),
        el('div', { class: 'set-row__control' }, [testVoice]),
      ]),
    ],
  });

  /* Notifications */
  const notifGroup = group({
    title: 'Notifications',
    hint: 'priority · quiet hours',
    iconName: 'bell',
    rows: [
      switchRow({
        id: 'set-dnd',
        label: 'Do not disturb',
        hint: 'Mutes toasts and sounds. Events still land in the log.',
        value: state.dnd,
        onChange: (v) => settings.set({ dnd: v }),
      }),
      textRow({
        label: 'Quiet from',
        hint: '24-hour time. Toasts pause inside this window.',
        value: state.quietStart,
        type: 'time',
        placeholder: '22:00',
        onInput: (v) => settings.set({ quietStart: v || '22:00' }),
      }),
      textRow({
        label: 'Quiet until',
        hint: 'Crossing midnight is supported.',
        value: state.quietEnd,
        type: 'time',
        placeholder: '08:00',
        onInput: (v) => settings.set({ quietEnd: v || '08:00' }),
      }),
      switchRow({
        id: 'set-notif-sound',
        label: 'Notification sound',
        hint: 'Short chime for non-error events.',
        value: state.notifSound,
        onChange: (v) => settings.set({ notifSound: v }),
      }),
    ],
  });

  /* About & updates */
  const updateStatus = el('span', {}, 'not checked yet');
  const checkBtn = el('button', { class: 'ghost-btn', type: 'button' }, [icon('refresh'), 'Check for updates']);
  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;
    updateStatus.textContent = 'checking…';
    const status = await updater.check({ silent: false });
    checkBtn.disabled = false;
    updateStatus.textContent = status === 'available'
      ? 'update available: ' + updater.available.version
      : 'you are on the latest build';
    renderSettings(container);
  });
  const offlineChip = el('span', { class: 'chip' },
    'service worker' in navigator ? (navigator.serviceWorker.controller ? 'offline ready' : 'caching on first load') : 'offline cache unavailable');
  const accountUser = auth.current();
  const accountGroup = group({
    title: 'Account',
    hint: accountUser ? 'signed in as ' + accountUser : 'guest',
    iconName: 'shield',
    rows: [
      el('div', { class: 'set-row' }, [
        el('div', { class: 'set-row__text' }, [
          el('strong', {}, accountUser || 'Guest'),
          el('span', {}, 'Local account — credentials never leave this browser.'),
        ]),
        el('div', { class: 'set-row__control' }, [
          el('button', {
            class: 'btn btn--ghost btn--sm', type: 'button',
            onclick: () => { auth.signOut(); renderSettings(container); },
          }, 'Sign out'),
        ]),
      ]),
      el('div', { class: 'set-row' }, [
        el('div', { class: 'set-row__text' }, [
          el('strong', {}, 'Lock screen'),
          el('span', {}, 'Return to the sign-in screen without signing out.'),
        ]),
        el('div', { class: 'set-row__control' }, [
          el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => auth.show() }, 'Lock'),
        ]),
      ]),
    ],
  });

  const aboutGroup = group({
    title: 'About & updates',
    hint: 'v' + VERSION,
    iconName: 'refresh',
    rows: [
      el('div', { class: 'set-row' }, [
        el('div', { class: 'set-row__text' }, [
          el('strong', {}, 'HYDRA ' + VERSION),
          el('span', {}, 'Build ' + BUILD + ' · 17 views · local-first'),
        ]),
        el('div', { class: 'set-row__control' }, [updateStatus, checkBtn]),
      ]),
      el('div', { class: 'set-row' }, [
        el('div', { class: 'set-row__text' }, [
          el('strong', {}, 'Repair & refresh'),
          el('span', {}, 'Clears the offline cache and reloads if a release looks stale.'),
        ]),
        el('div', { class: 'set-row__control' }, [
          el('button', {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            onclick: async () => {
              try {
                const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
                await Promise.all(regs.map((reg) => reg.unregister()));
                const keys = await caches?.keys?.() || [];
                await Promise.all(keys.map((key) => caches.delete(key)));
              } catch { /* ignore */ }
              location.reload();
            },
          }, 'Repair now'),
        ]),
      ]),
      el('div', { class: 'set-row' }, [
        el('div', { class: 'set-row__text' }, [
          el('strong', {}, 'Offline mode'),
          el('span', {}, 'The shell, themes and local features keep working without a network.'),
        ]),
        el('div', { class: 'set-row__control' }, [offlineChip]),
      ]),
    ],
  });

  container.append(appearance, clockGroup, aiGroup, voiceGroup, notifGroup, weatherGroup, accountGroup, aboutGroup, dataGroup);
}

/** Wire the store to the document and cross-module events. */
export function initSettings() {
  applySettings(settings.get());
  settings.subscribe((state, prev) => {
    applySettings(state);
    bus.emit('settings:change', { state, prev });
    if (state.particles !== prev.particles) bus.emit('particles:density', state.particles);
    if (state.theme !== prev.theme) bus.emit('theme:change', state.theme);
  });
  bus.on('theme:cycle', () => {
    const next = cycleTheme();
    bus.emit('notify', { title: 'Theme', body: next.label, tone: 'info', timeout: 1600 });
  });
  return settings;
}

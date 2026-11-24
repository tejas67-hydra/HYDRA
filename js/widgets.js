/**
 * HYDRA — widget registry.
 * Each widget owns a small piece of DOM, its own timers, and its own cleanup.
 * The dashboard only handles chrome, layout and persistence.
 */

import { el, icon, bus, formatClock, pad2, DAYS, MONTHS, formatDuration, clamp, uid, randomOf } from './utils.js';
import { settings } from './settings.js';
import { emotion } from './emotion.js';
import { storage } from './storage.js';
import { weather, describeCode } from './weather.js';
import { music, SCENE_LIST } from './music.js';
import { notifications } from './notifications.js';

export const WIDGETS = new Map();

function define(def) {
  WIDGETS.set(def.id, def);
}

function lifecycle(node) {
  const cleanups = [];
  node.__cleanup = () => {
    for (const fn of cleanups) {
      try { fn(); } catch { /* ignore */ }
    }
    cleanups.length = 0;
  };
  return (fn) => cleanups.push(fn);
}

function body(...children) {
  const node = el('div', { class: 'widget__body' }, children);
  return node;
}

/* ------------------------------- clock ------------------------------- */
define({
  id: 'clock',
  name: 'Clock',
  icon: 'clock',
  description: 'Large local time with day progress.',
  size: { w: 4, h: 2 },
  render() {
    const time = el('div', { class: 'clock-big' });
    const sub = el('div', { class: 'clock-sub' });
    const bar = el('div', { class: 'clock-bar' }, [el('span')]);
    const node = body(time, sub, bar);
    const track = lifecycle(node);

    const tick = () => {
      const now = new Date();
      const h24 = settings.get('clock24');
      const showSeconds = settings.get('showSeconds');
      const parts = formatClock(now, { h24 }).split(':');
      time.replaceChildren(
        el('span', {}, parts[0]),
        el('span', {}, ':'),
        el('span', {}, parts[1]),
        showSeconds ? el('small', {}, pad2(now.getSeconds())) : null,
      );
      sub.replaceChildren(
        el('span', {}, DAYS[now.getDay()]),
        el('span', { class: 'dot' }),
        el('span', {}, MONTHS[now.getMonth()] + ' ' + now.getDate()),
        el('span', { class: 'dot' }),
        el('span', {}, now.toLocaleTimeString(undefined, { timeZoneName: 'short' }).split(' ').pop()),
      );
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      bar.firstElementChild.style.width = ((now.getTime() - dayStart) / 86400000 * 100).toFixed(2) + '%';
    };
    tick();
    const timer = setInterval(tick, 1000);
    track(() => clearInterval(timer));
    return node;
  },
});

/* ------------------------------ weather ------------------------------ */
define({
  id: 'weather',
  name: 'Weather',
  icon: 'cloud',
  description: 'Live conditions and a 12 hour strip.',
  size: { w: 4, h: 3 },
  render() {
    const node = body(el('div', { class: 'widget__loading' }, [
      el('span', { class: 'skeleton' }), el('span', { class: 'skeleton' }), el('span', { class: 'skeleton' }),
    ]));
    const track = lifecycle(node);

    const draw = (data) => {
      if (!data) {
        node.replaceChildren(el('p', { class: 'faint' }, 'Weather unavailable offline.'));
        return;
      }
      const { current, place, hourly, daily, symbol } = data;
      const cond = describeCode(current.code);
      const iconBox = el('div', { class: 'wx-icon' }, cond.icon);
      const temp = el('div', { class: 'wx-temp' }, [String(current.temp), el('sup', {}, symbol)]);
      const meta = el('div', {}, [
        el('div', { class: 'wx-cond' }, cond.label),
        el('div', { class: 'wx-loc' }, place.label),
      ]);
      const strip = el('div', { class: 'wx-strip' });
      hourly.slice(0, 6).forEach((hour, i) => {
        const time = new Date(hour.time);
        strip.append(el('div', { class: 'wx-hour' + (i === 0 ? ' is-now' : '') }, [
          el('span', {}, i === 0 ? 'now' : pad2(time.getHours()) + ':00'),
          el('span', {}, describeCode(hour.code).icon),
          el('strong', {}, hour.temp + '°'),
        ]));
      });
      const foot = el('div', { class: 'wx-foot' }, [
        el('span', {}, 'H ' + (daily[0]?.max ?? '—') + '°'),
        el('span', {}, 'L ' + (daily[0]?.min ?? '—') + '°'),
        el('span', {}, 'wind ' + current.wind),
        el('span', {}, 'humidity ' + current.humidity + '%'),
      ]);
      node.replaceChildren(el('div', { class: 'w-weather__main' }, [iconBox, el('div', {}, [temp, meta])]), strip, foot);
    };

    draw(weather.data);
    track(bus.on('weather:update', draw));
    if (!weather.data) weather.refresh();
    return node;
  },
});

/* ----------------------------- calendar ----------------------------- */
define({
  id: 'calendar',
  name: 'Calendar',
  icon: 'calendar',
  description: 'Month view with today highlighted.',
  size: { w: 4, h: 3 },
  render() {
    const head = el('div', { class: 'cal-head' });
    const grid = el('div', { class: 'cal-grid' });
    const node = body(head, grid);
    let view = new Date();
    view.setDate(1);

    const draw = () => {
      const year = view.getFullYear();
      const month = view.getMonth();
      head.replaceChildren(
        el('strong', {}, MONTHS[month] + ' ' + year),
        el('div', { class: 'cal-nav' }, [
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous month', onclick: () => { view = new Date(year, month - 1, 1); draw(); } }, [icon('prev')]),
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next month', onclick: () => { view = new Date(year, month + 1, 1); draw(); } }, [icon('next')]),
        ]),
      );
      grid.replaceChildren();
      for (const dow of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) grid.append(el('div', { class: 'cal-dow' }, dow));
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const days = new Date(year, month + 1, 0).getDate();
      const prevDays = new Date(year, month, 0).getDate();
      const today = new Date();
      const total = Math.ceil((offset + days) / 7) * 7;
      for (let i = 0; i < total; i += 1) {
        let day;
        let out = false;
        if (i < offset) { day = prevDays - offset + i + 1; out = true; }
        else if (i >= offset + days) { day = i - offset - days + 1; out = true; }
        else day = i - offset + 1;
        const isToday = !out && day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        const key = year + '-' + pad2(month + 1) + '-' + pad2(day);
        const events = storage.get('calendar.events', {})?.[key] ?? [];
        const cell = el('div', {
          class: 'cal-cell' + (out ? ' is-out' : '') + (isToday ? ' is-today' : '') + (events.length ? ' has-event' : ''),
          title: events.length ? key + '\n' + events.join('\n') : key + ' · click to add an event',
        }, String(day));
        if (!out) {
          cell.addEventListener('click', () => {
            const all = storage.get('calendar.events', {}) || {};
            const current = all[key] || [];
            const value = window.prompt(
              key + (current.length ? '\n' + current.map((e, i) => (i + 1) + '. ' + e).join('\n') : '') + '\n\nAdd an event:',
              '',
            );
            if (value && value.trim()) {
              all[key] = [...current, value.trim().slice(0, 80)];
              storage.set('calendar.events', all);
              draw();
            }
          });
          cell.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            const all = storage.get('calendar.events', {}) || {};
            const current = all[key] || [];
            if (!current.length) return;
            const index = Number(window.prompt('Remove which event?\n' + current.map((e, i) => (i + 1) + '. ' + e).join('\n'), '1'));
            if (index >= 1 && index <= current.length) {
              current.splice(index - 1, 1);
              if (current.length) all[key] = current;
              else delete all[key];
              storage.set('calendar.events', all);
              draw();
            }
          });
        }
        grid.append(cell);
      }
    };
    draw();
    return node;
  },
});

/* ------------------------------- music ------------------------------ */
define({
  id: 'music',
  name: 'Now playing',
  icon: 'music',
  description: 'Generative player controls and a mini equaliser.',
  size: { w: 4, h: 2 },
  render() {
    const title = el('strong', {}, 'Nebula Drift');
    const artist = el('span', {}, 'HYDRA generative');
    const bars = el('div', { class: 'w-music__bars' }, [el('i'), el('i'), el('i'), el('i'), el('i')]);
    const art = el('div', { class: 'w-music__art' }, [icon('music')]);
    const progress = el('div', { class: 'w-music__progress' }, [el('span')]);
    const node = body(
      el('div', { class: 'w-music__row' }, [art, el('div', { class: 'w-music__meta' }, [title, artist]), bars]),
      el('div', { class: 'w-music__ctl' }, [
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous', onclick: () => music.prev() }, [icon('prev')]),
        el('button', { class: 'play-mini', type: 'button', 'aria-label': 'Play', onclick: () => music.toggle() }, [icon('play')]),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next', onclick: () => music.next() }, [icon('next')]),
        progress,
      ]),
    );
    const track = lifecycle(node);

    const draw = (state) => {
      title.textContent = state.title;
      artist.textContent = state.artist;
      bars.classList.toggle('is-paused', !state.playing);
      const playBtn = node.querySelector('.play-mini');
      if (playBtn) playBtn.replaceChildren(icon(state.playing ? 'pause' : 'play'));
      const elapsed = state.duration ? state.elapsed / state.duration : 0;
      progress.firstElementChild.style.width = (clamp(elapsed, 0, 1) * 100).toFixed(1) + '%';
      if (!state.duration) progress.firstElementChild.style.width = state.playing ? '100%' : '0%';
    };
    draw(music.state);
    track(bus.on('music:state', draw));
    return node;
  },
});

/* ------------------------------- focus ------------------------------ */
define({
  id: 'focus',
  name: 'Focus timer',
  icon: 'activity',
  description: 'Pomodoro ring driven by the assistant too.',
  size: { w: 3, h: 3 },
  render() {
    const ring = el('div', { class: 'focus-ring', style: { '--p': '0' } }, [
      el('div', {}, [el('div', { class: 'focus-time' }, '25:00'), el('div', { class: 'focus-label' }, 'focus')]),
    ]);
    const startBtn = el('button', { class: 'ghost-btn', type: 'button' }, 'Start');
    const stopBtn = el('button', { class: 'ghost-btn', type: 'button' }, 'Reset');
    const node = body(ring, el('div', { class: 'focus-btns' }, [startBtn, stopBtn]));
    const track = lifecycle(node);

    let total = 25 * 60;
    let left = total;
    let running = false;
    let timer = null;

    const draw = () => {
      const time = ring.querySelector('.focus-time');
      const label = ring.querySelector('.focus-label');
      time.textContent = formatDuration(left * 1000);
      label.textContent = running ? 'focus' : left === total ? 'ready' : 'paused';
      ring.style.setProperty('--p', String((1 - left / total) * 100));
    };
    const stop = () => {
      running = false;
      clearInterval(timer);
      timer = null;
      draw();
    };
    const start = (minutes = 25) => {
      total = minutes * 60;
      left = total;
      running = true;
      clearInterval(timer);
      timer = setInterval(() => {
        left = Math.max(0, left - 1);
        draw();
        if (left === 0) {
          stop();
          bus.emit('notify', { title: 'Focus complete', body: minutes + ' minutes done. Stand up, look far away.', tone: 'success' });
          bus.emit('companion:celebrate');
        }
      }, 1000);
      draw();
    };

    startBtn.addEventListener('click', () => {
      if (running) { stop(); }
      else start(Math.round(total / 60));
    });
    stopBtn.addEventListener('click', () => {
      stop();
      left = total;
      draw();
    });
    track(bus.on('action', (action) => {
      if (action.type === 'focus:start') start(action.minutes || 25);
      if (action.type === 'focus:stop') { stop(); left = total; draw(); }
    }));
    draw();
    return node;
  },
});

/* ------------------------------- tasks ------------------------------ */
define({
  id: 'tasks',
  name: 'Tasks',
  icon: 'check',
  description: 'A local checklist the assistant can write to.',
  size: { w: 4, h: 3 },
  render() {
    const list = el('div', { class: 'w-tasks__list' });
    const input = el('input', { type: 'text', placeholder: 'Add a task…', 'aria-label': 'New task' });
    const add = el('button', { type: 'button', 'aria-label': 'Add task' }, [icon('plus')]);
    const node = body(list, el('form', { class: 'tasks-add' }, [input, add]));
    const track = lifecycle(node);

    const read = () => storage.get('widget.tasks', []) ?? [];
    const write = (items) => { storage.set('widget.tasks', items); bus.emit('tasks:change', items); };

    const draw = () => {
      const items = read();
      list.replaceChildren();
      if (!items.length) {
        list.append(el('p', { class: 'faint', style: { fontSize: '11.5px' } }, 'Nothing open. Add one below.'));
        return;
      }
      for (const item of items) {
        const checkbox = el('input', { type: 'checkbox', checked: item.done });
        checkbox.addEventListener('change', () => {
          write(read().map((t) => (t.id === item.id ? { ...t, done: checkbox.checked } : t)));
        });
        const del = el('button', { class: 'task__del', type: 'button', 'aria-label': 'Delete task' }, [icon('close')]);
        del.addEventListener('click', () => write(read().filter((t) => t.id !== item.id)));
        list.append(el('label', { class: 'task' }, [
          checkbox,
          el('span', { class: 'task__box' }, [icon('check')]),
          el('span', { class: 'task__text' }, item.text),
          del,
        ]));
      }
    };

    const submit = (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      write([{ id: uid('t'), text, done: false, at: Date.now() }, ...read()]);
      input.value = '';
    };
    node.querySelector('form').addEventListener('submit', submit);
    add.addEventListener('click', submit);
    track(bus.on('tasks:change', draw));
    draw();
    return node;
  },
});

/* ------------------------------- notes ------------------------------ */
define({
  id: 'notes',
  name: 'Notes',
  icon: 'book',
  description: 'Scratchpad shared with the assistant.',
  size: { w: 4, h: 3 },
  render() {
    const area = el('textarea', { placeholder: 'Scratch anything here…', 'aria-label': 'Notes' });
    const count = el('span', {}, '0 chars');
    const saved = el('span', {}, 'saved locally');
    const node = body(area, el('div', { class: 'w-notes__foot' }, [count, saved]));
    node.classList.add('w-notes');
    const track = lifecycle(node);

    area.value = storage.get('widget.notes', '') ?? '';
    count.textContent = area.value.length + ' chars';
    let timer = null;
    area.addEventListener('input', () => {
      count.textContent = area.value.length + ' chars';
      clearTimeout(timer);
      timer = setTimeout(() => {
        storage.set('widget.notes', area.value);
        saved.textContent = 'saved ' + new Date().toLocaleTimeString();
      }, 400);
    });
    track(() => clearTimeout(timer));
    track(bus.on('notes:change', (text) => {
      if (document.activeElement === area) return;
      area.value = text;
      count.textContent = text.length + ' chars';
    }));
    return node;
  },
});

/* ------------------------------ system ------------------------------ */
define({
  id: 'system',
  name: 'System',
  icon: 'cpu',
  description: 'Render, memory and storage telemetry.',
  size: { w: 4, h: 3 },
  render() {
    const rows = ['render', 'memory', 'storage', 'network'].map((key) => {
      const value = el('b', {}, '—');
      const bar = el('span');
      return el('div', { class: 'sys-row' }, [
        el('div', { class: 'sys-row__top' }, [el('span', {}, key), value]),
        el('div', { class: 'sys-bar' }, [bar]),
        el('span', { hidden: true, dataset: { key } }),
      ]);
    });
    const foot = el('div', { class: 'sys-foot' }, [el('span', {}, 'uptime 0m'), el('span', {}, 'local')]);
    const node = body(...rows, foot);
    const track = lifecycle(node);

    const update = () => {
      const fps = Math.round(window.__hydraFps ?? 60);
      const mem = performance.memory
        ? performance.memory.usedJSHeapSize / 1048576
        : (performance.now() / 60000) % 120;
      const storageKb = storage.size() / 1024;
      const net = navigator.onLine ? 'online' : 'offline';
      const values = [
        { pct: clamp(fps / 60, 0, 1) * 100, label: fps + ' fps' },
        { pct: clamp(mem / 256, 0, 1) * 100, label: mem.toFixed(0) + ' MB' },
        { pct: clamp(storageKb / 1024, 0, 1) * 100, label: storageKb.toFixed(1) + ' KB' },
        { pct: navigator.onLine ? 100 : 0, label: net },
      ];
      rows.forEach((row, i) => {
        row.querySelector('b').textContent = values[i].label;
        row.querySelector('.sys-bar span').style.width = values[i].pct.toFixed(0) + '%';
        row.querySelector('.sys-bar').classList.toggle('is-warn', i === 1 && values[i].pct > 82);
      });
      foot.firstElementChild.textContent = 'uptime ' + Math.round(performance.now() / 60000) + 'm';
      foot.lastElementChild.textContent = navigator.onLine ? 'synced' : 'offline';
    };
    update();
    const timer = setInterval(update, 2000);
    track(() => clearInterval(timer));
    return node;
  },
});

/* ------------------------------- quote ------------------------------ */
const QUOTES = [
  ['Dream • Create • Explore • Together', 'HYDRA'],
  ['Simplicity is prerequisite for reliability.', 'Dijkstra'],
  ['Make it work, make it right, make it fast.', 'Kent Beck'],
  ['The best way to predict the future is to invent it.', 'Alan Kay'],
  ['Talk is cheap. Show me the code.', 'Linus Torvalds'],
  ['Stay curious. It scales better than certainty.', 'HYDRA'],
];

define({
  id: 'quote',
  name: 'Quote',
  icon: 'sparkles',
  description: 'Rotating lines for the wall.',
  size: { w: 4, h: 2 },
  render() {
    const text = el('blockquote', { class: 'quote-text' });
    const author = el('div', { class: 'quote-author' });
    const dots = el('div', { class: 'quote-dots' });
    const node = body(text, author, dots);
    node.classList.add('w-quote');
    const track = lifecycle(node);
    let index = Math.floor(Math.random() * QUOTES.length);

    const draw = () => {
      const [quote, who] = QUOTES[index];
      text.textContent = quote;
      author.textContent = '— ' + who;
      dots.replaceChildren(...QUOTES.map((_, i) => el('i', { class: i === index ? 'is-on' : '' })));
    };
    draw();
    const timer = setInterval(() => { index = (index + 1) % QUOTES.length; draw(); }, 18000);
    track(() => clearInterval(timer));
    return node;
  },
});

/* ----------------------------- launcher ----------------------------- */
define({
  id: 'launcher',
  name: 'Launcher',
  icon: 'grid',
  description: 'Six one-tap actions.',
  size: { w: 4, h: 2 },
  render() {
    const actions = [
      { icon: 'sparkles', label: 'Chat', run: () => bus.emit('ui:view', { view: 'assistant' }) },
      { icon: 'camera', label: 'Vision', run: () => bus.emit('ui:view', { view: 'vision' }) },
      { icon: 'music', label: 'Studio', run: () => bus.emit('ui:view', { view: 'music' }) },
      { icon: 'activity', label: 'Focus', run: () => bus.emit('action', { type: 'focus:start', minutes: 25 }) },
      { icon: 'command', label: 'Palette', run: () => bus.emit('palette:open') },
      { icon: 'palette', label: 'Theme', run: () => bus.emit('theme:cycle') },
      { icon: 'gamepad', label: 'Play', run: () => bus.emit('ui:view', { view: 'play' }) },
      { icon: 'settings', label: 'Settings', run: () => bus.emit('ui:view', { view: 'settings' }) },
    ];
    const grid = el('div', { class: 'launcher' });
    for (const action of actions) {
      const btn = el('button', { class: 'launcher__btn', type: 'button' }, [icon(action.icon), el('span', {}, action.label)]);
      btn.addEventListener('click', action.run);
      grid.append(btn);
    }
    return body(grid);
  },
});

/* ------------------------------- stats ------------------------------ */
define({
  id: 'stats',
  name: 'Session stats',
  icon: 'activity',
  description: 'Messages, memories and uptime.',
  size: { w: 4, h: 2 },
  render() {
    const make = (label) => {
      const value = el('b', {}, '0');
      return { node: el('div', { class: 'stat' }, [value, el('span', {}, label)]), value };
    };
    const messages = make('messages');
    const facts = make('memories');
    const tasksCount = make('tasks');
    const minutes = make('minutes');
    const node = body(el('div', { class: 'stat-grid' }, [messages.node, facts.node, tasksCount.node, minutes.node]));
    const track = lifecycle(node);

    const update = () => {
      const history = storage.get('chat.history', []) ?? [];
      const mem = storage.get('memory.facts', []) ?? [];
      const list = storage.get('widget.tasks', []) ?? [];
      messages.value.textContent = String(history.length);
      facts.value.textContent = String(mem.length);
      tasksCount.value.textContent = String(list.filter((t) => !t.done).length);
      minutes.value.textContent = String(Math.round(performance.now() / 60000));
    };
    update();
    const timer = setInterval(update, 3000);
    track(() => clearInterval(timer));
    return node;
  },
});

export function widgetCatalog() {
  return [...WIDGETS.values()].map((w) => ({
    id: w.id, name: w.name, icon: w.icon, description: w.description, size: w.size,
  }));
}

/* ------------------------------- mood -------------------------------- */
define({
  id: 'mood',
  name: 'Mood',
  icon: 'sparkles',
  description: 'The companion emotion, with quick presets.',
  size: { w: 4, h: 2 },
  render() {
    const name = el('strong', { class: 'mood-name' }, 'neutral');
    const bar = el('div', { class: 'clock-bar' }, [el('span')]);
    const quick = el('div', { class: 'mood-quick' }, ['happy', 'calm', 'focused', 'curious'].map((state) =>
      el('button', { class: 'chip', type: 'button', onclick: () => emotion.preview(state) }, state)));
    const node = body(el('div', { class: 'mood-head' }, [name]), bar, quick);
    const track = lifecycle(node);
    const update = () => {
      name.textContent = emotion.current;
      const width = Math.round((emotion.intensity ?? 0.7) * 100);
      bar.firstElementChild.style.width = width + '%';
    };
    update();
    const off = bus.on('emotion:change', update);
    track(() => { if (typeof off === 'function') off(); });
    return node;
  },
});

/* ------------------------------ uptime ------------------------------- */
define({
  id: 'uptime',
  name: 'Uptime',
  icon: 'activity',
  description: 'Session age, messages and stored memories.',
  size: { w: 4, h: 2 },
  render() {
    const started = Date.now();
    const big = el('div', { class: 'clock-big' }, '0m');
    const sub = el('div', { class: 'clock-sub' });
    const node = body(big, sub);
    const track = lifecycle(node);
    const tick = () => {
      const mins = Math.floor((Date.now() - started) / 60000);
      big.textContent = mins < 60 ? mins + 'm' : Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
      const history = storage.get('chat.history', []) ?? [];
      const facts = storage.get('memory.facts', []) ?? [];
      sub.replaceChildren(
        el('span', {}, history.length + ' messages'),
        el('span', { class: 'dot' }),
        el('span', {}, facts.length + ' memories'),
      );
    };
    tick();
    const timer = setInterval(tick, 30000);
    track(() => clearInterval(timer));
    return node;
  },
});

/**
 * HYDRA — home deck: feature grid, activity, tasks, themes, sparklines.
 */

import { $, $$, el, bus, clamp, icon } from './utils.js';
import { storage } from './storage.js';
import { settings, THEMES } from './settings.js';

const activity = [];
let sparkHistory = { cpu: [], ram: [], net: [] };

function go(view) {
  const nav = document.querySelector('.nav-item[data-view="' + view + '"]');
  if (nav) nav.click();
}

function logActivity(text) {
  activity.unshift({ text, at: Date.now() });
  if (activity.length > 6) activity.pop();
  drawActivity();
}

function drawActivity() {
  const list = $('#home-activity-list');
  if (!list) return;
  list.replaceChildren();
  if (!activity.length) {
    list.append(el('li', {}, [el('b', {}, 'HYDRA is ready'), el('small', {}, 'now')]));
    return;
  }
  for (const item of activity.slice(0, 4)) {
    const mins = Math.round((Date.now() - item.at) / 60000);
    list.append(el('li', {}, [
      el('b', {}, item.text),
      el('small', {}, mins < 1 ? 'now' : mins + 'm ago'),
    ]));
  }
}

function drawTasks() {
  const list = $('#home-task-list');
  if (!list) return;
  const tasks = storage.get('widget.tasks', []) ?? [];
  list.replaceChildren();
  if (!tasks.length) {
    list.append(el('li', { class: 'faint' }, 'No tasks yet. Add one above.'));
    return;
  }
  tasks.slice(0, 5).forEach((task, index) => {
    const box = el('input', {
      type: 'checkbox', checked: task.done ? 'checked' : null,
      onchange: (event) => {
        const next = tasks.map((t, i) => (i === index ? { ...t, done: event.target.checked } : t));
        storage.set('widget.tasks', next);
        bus.emit('tasks:change');
        drawTasks();
      },
    });
    list.append(el('li', { class: task.done ? 'done' : '' }, [box, el('b', {}, task.text)]));
  });
}

function drawThemes() {
  const row = $('#home-themes');
  if (!row) return;
  const current = settings.get('theme');
  row.replaceChildren();
  for (const theme of THEMES.slice(0, 6)) {
    row.append(el('button', {
      class: 'theme-dot' + (theme.id === current ? ' is-on' : ''),
      type: 'button', title: theme.label,
      style: 'background:' + (theme.color.startsWith('conic') ? theme.color : theme.color),
      onclick: () => {
        settings.set({ theme: theme.id });
        drawThemes();
        logActivity('Theme → ' + theme.label);
      },
    }));
  }
}

function spark(key, value) {
  const row = document.querySelector('.spark[data-spark="' + key + '"]');
  if (!row) return;
  const history = sparkHistory[key];
  history.push(value);
  if (history.length > 8) history.shift();
  const bars = row.querySelectorAll('i');
  bars.forEach((bar, index) => {
    const sample = history[index] ?? value;
    bar.style.height = clamp(18 + sample * 0.82, 14, 100) + '%';
  });
}

function tickSparklines() {
  const cpuText = $('#home-cpu')?.textContent ?? '18%';
  const ramText = $('#home-ram')?.textContent ?? '42%';
  const cpu = parseInt(cpuText, 10) || 18;
  const ram = parseInt(ramText, 10) || 42;
  const netText = $('#home-net')?.textContent ?? '1.0';
  const net = clamp((parseFloat(netText) || 1) * 8, 8, 100);
  spark('cpu', cpu + (Math.random() * 14 - 7));
  spark('ram', ram + (Math.random() * 8 - 4));
  spark('net', net + (Math.random() * 20 - 10));
}

export function initDeck() {
  if (!$('.world-hud.deck')) return;

  drawThemes();
  drawTasks();
  drawActivity();
  tickSparklines();
  setInterval(tickSparklines, 2400);
  setTimeout(() => bus.emit('tasks:change'), 400);

  bus.on('tasks:change', drawTasks);
  bus.on('notify', (payload) => {
    if (payload?.title) logActivity(payload.title);
  });
  bus.on('view:change', (view) => {
    for (const button of $$('.deck-nav [data-view]')) {
      button.classList.toggle('is-on', button.dataset.view === view);
    }
    const names = { assistant: 'Opened chat', vision: 'Opened vision', games: 'Opened games', music: 'Opened studio', settings: 'Opened settings' };
    if (names[view]) logActivity(names[view]);
  });
  bus.on('theme:change', drawThemes);
  bus.on('settings:change', drawThemes);

  $('#home-add-task')?.addEventListener('click', () => {
    const text = window.prompt('New task');
    if (!text) return;
    const tasks = storage.get('widget.tasks', []) ?? [];
    storage.set('widget.tasks', [...tasks, { text, done: false }]);
    bus.emit('tasks:change');
    drawTasks();
    logActivity('Added task: ' + text);
  });

  document.addEventListener('click', (event) => {
    const viewButton = event.target.closest('.deck [data-view], .deck-nav [data-view]');
    if (viewButton) {
      go(viewButton.dataset.view);
      return;
    }
    const action = event.target.closest('[data-deck-action]')?.dataset.deckAction;
    if (action === 'emotion') {
      go('stats');
      setTimeout(() => $('#emotion-lab')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 420);
    } else if (action === 'voice') {
      go('assistant');
      setTimeout(() => $('#btn-mic')?.click(), 380);
    } else if (action === 'search') {
      const input = $('#omni-input');
      input?.focus();
      input?.select();
    }
    const game = event.target.closest('[data-game]')?.dataset.game;
    if (game) {
      go('games');
      logActivity('Launched ' + game);
    }
  });
}

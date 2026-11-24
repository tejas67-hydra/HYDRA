/**
 * HYDRA — command registry, command palette and global keybindings.
 */

import { $, $$, el, icon, bus, debounce } from './utils.js';

const commands = new Map();
let cursor = 0;
let results = [];
let isOpen = false;

export function registerCommand(command) {
  if (!command?.id || typeof command.run !== 'function') return;
  commands.set(command.id, { group: 'Actions', icon: 'sparkles', keywords: [], ...command });
}

export function unregisterCommand(id) {
  commands.delete(id);
}

export function getCommands() {
  return [...commands.values()];
}

function subsequence(haystack, term) {
  let index = 0;
  for (const char of haystack) {
    if (char === term[index]) index += 1;
    if (index === term.length) return true;
  }
  return false;
}

function score(command, query) {
  if (!query) return 1;
  const title = command.title.toLowerCase();
  const haystack = (command.title + ' ' + command.group + ' ' + (command.hint || '') + ' ' + command.keywords.join(' ')).toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const term of terms) {
    if (haystack.includes(term)) total += 4;
    else if (term.length >= 4 && (subsequence(title, term) || command.keywords.some((k) => subsequence(String(k).toLowerCase(), term)))) total += 1.5;
    else return 0;
  }
  if (title.startsWith(query.toLowerCase())) total += 8;
  if (title.includes(query.toLowerCase())) total += 3;
  return total;
}

function render(query = '') {
  const box = $('#palette-results');
  if (!box) return;
  const list = getCommands()
    .map((c) => ({ command: c, s: score(c, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 24)
    .map((r) => r.command);

  results = list;
  cursor = Math.min(cursor, Math.max(0, list.length - 1));
  box.replaceChildren();

  if (!list.length) {
    if (query.trim().length > 1) {
      const ask = el('button', { class: 'palette__item', type: 'button' }, [
        icon('sparkles'),
        el('span', { class: 'grow' }, 'Ask HYDRA: “' + query.trim() + '”'),
        el('small', {}, 'enter'),
      ]);
      ask.addEventListener('click', () => {
        const text = query.trim();
        closePalette();
        bus.emit('ai:ask', { text, source: 'palette' });
      });
      box.append(ask);
      results = [{ id: 'ask', run: () => bus.emit('ai:ask', { text: query.trim(), source: 'palette' }) }];
      cursor = 0;
      return;
    }
    box.append(el('div', { class: 'palette__empty' }, 'No commands match.'));
    return;
  }

  let group = '';
  list.forEach((command, index) => {
    if (command.group !== group) {
      group = command.group;
      box.append(el('div', { class: 'palette__group' }, group));
    }
    const item = el('button', {
      class: 'palette__item' + (index === cursor ? ' is-cursor' : ''),
      type: 'button',
      dataset: { index: String(index) },
    }, [
      icon(command.icon || 'sparkles'),
      el('span', { class: 'grow' }, command.title),
      command.hint ? el('small', {}, command.hint) : null,
    ]);
    item.addEventListener('click', () => run(index));
    item.addEventListener('pointermove', () => {
      if (cursor === index) return;
      cursor = index;
      $$('.palette__item', box).forEach((n, i) => n.classList.toggle('is-cursor', i === index));
    });
    box.append(item);
  });
}

function run(index = cursor) {
  const command = results[index];
  if (!command) return;
  closePalette();
  const omni = $('#omni-input');
  if (omni) omni.value = '';
  try {
    command.run();
  } catch (err) {
    console.error('[palette]', err);
  }
}

export function setPaletteQuery(query = '') {
  const palette = $('#palette');
  const input = $('#palette-input');
  if (!palette || !input) return;
  if (!isOpen) {
    palette.hidden = false;
    isOpen = true;
  }
  input.value = query;
  cursor = 0;
  render(query);
}

export function runFirst() {
  if (results.length) run(0);
}

export function openPalette(prefill = '', { focus = true } = {}) {
  const palette = $('#palette');
  const input = $('#palette-input');
  if (!palette || !input) return;
  palette.hidden = false;
  isOpen = true;
  cursor = 0;
  input.value = prefill;
  render(prefill);
  if (focus) {
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }
}

export function closePalette() {
  const palette = $('#palette');
  if (palette) palette.hidden = true;
  isOpen = false;
}

export function togglePalette() {
  if (isOpen) closePalette();
  else openPalette();
}

const isTyping = (target) => {
  const tag = target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
};

export function initShortcuts() {
  const input = $('#palette-input');
  if (input) {
    const onInput = debounce(() => {
      cursor = 0;
      render(input.value);
    }, 60);
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        cursor = Math.min(cursor + 1, results.length - 1);
        render(input.value);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        cursor = Math.max(cursor - 1, 0);
        render(input.value);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        run();
      }
    });
  }

  const omni = $('#omni-input');
  omni?.addEventListener('focus', () => setPaletteQuery(omni.value));
  omni?.addEventListener('input', () => setPaletteQuery(omni.value));
  omni?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runFirst();
      omni.blur();
    } else if (event.key === 'Escape') {
      closePalette();
      omni.blur();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      openPalette(omni.value);
    }
  });
  $('#palette')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-palette-close]')) closePalette();
  });

  document.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (mod && (key === 'k' || (key === 'p' && event.shiftKey))) {
      event.preventDefault();
      togglePalette();
      return;
    }
    if (event.key === 'Escape') {
      if (isOpen) closePalette();
      else {
        $('#notif-drawer')?.setAttribute('hidden', '');
        $('#widget-sheet')?.setAttribute('hidden', '');
        $('#floating-chat')?.setAttribute('hidden', '');
      }
      return;
    }
    if (isTyping(event.target) && !mod) return;

    if (mod && key === 'b') {
      event.preventDefault();
      bus.emit('ui:sidebar');
    } else if (mod && key === 'j') {
      event.preventDefault();
      bus.emit('ui:floating');
    } else if (mod && key === 'm' && !event.shiftKey) {
      event.preventDefault();
      bus.emit('music:toggle');
    } else if (mod && event.shiftKey && key === 'l') {
      event.preventDefault();
      bus.emit('theme:cycle');
    } else if (event.altKey && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      bus.emit('ui:view-index', Number(event.key) - 1);
    } else if (key === '/' && !mod && !isTyping(event.target)) {
      event.preventDefault();
      openPalette();
    }
  });

  return { openPalette, closePalette, togglePalette };
}

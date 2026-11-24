/**
 * HYDRA — extra modules: files, games, stats, market, automations, windows.
 */

import { $, el, icon, bus, uid, clamp, formatDuration } from './utils.js';
import { storage } from './storage.js';
import { settings, cycleTheme } from './settings.js';
import { music } from './music.js';
import { learning } from './learning.js';
import { emotion, EMOTIONS } from './emotion.js';
import { plugins } from './plugins.js';

const viewActive = (name) => document.body.dataset.view === name;
const notify = (payload) => bus.emit('notify', payload);

/* =============================== FILES =============================== */

const FILES_KEY = 'files.nodes';

function seedFiles() {
  const now = Date.now();
  return [
    { id: 'root', name: 'Workspace', type: 'folder', parent: null },
    { id: 'n1', name: 'Projects', type: 'folder', parent: 'root' },
    { id: 'n2', name: 'Archive', type: 'folder', parent: 'root' },
    { id: 'n3', name: 'welcome.md', type: 'file', parent: 'root', content: '# Welcome to HYDRA\n\nThis workspace lives in your browser.\nCreate notes, folders and import text files.\n', updated: now },
    { id: 'n4', name: 'ideas.txt', type: 'file', parent: 'root', content: '1. Build something impossible.\n2. Make it look easy.\n', updated: now },
    { id: 'n5', name: 'roadmap.md', type: 'file', parent: 'n1', content: '## Roadmap\n- Voice\n- Vision\n- Automation\n', updated: now },
  ];
}

let nodes = storage.get(FILES_KEY, null) || seedFiles();
let cwd = 'root';
let editing = null;

const saveFiles = () => storage.set(FILES_KEY, nodes);

function childrenOf(id) {
  return nodes.filter((n) => n.parent === id).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
}

function crumbs(id) {
  const chain = [];
  let node = nodes.find((n) => n.id === id);
  while (node) {
    chain.unshift(node);
    node = nodes.find((n) => n.id === node.parent);
  }
  return chain;
}

function humanSize(node) {
  if (node.type === 'folder') return childrenOf(node.id).length + ' items';
  const bytes = new Blob([node.content || '']).size;
  return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB';
}

function renderFiles() {
  const app = $('#files-app');
  if (!app) return;
  const crumbEl = $('#files-crumbs');
  const grid = $('#files-grid');
  if (!crumbEl || !grid) return;

  crumbEl.replaceChildren();
  crumbs(cwd).forEach((node, i, arr) => {
    crumbEl.append(el('button', {
      class: 'crumb' + (i === arr.length - 1 ? ' is-current' : ''),
      type: 'button',
      onclick: () => { cwd = node.id; renderFiles(); },
    }, node.name));
    if (i < arr.length - 1) crumbEl.append(el('span', { class: 'crumb-sep' }, '/'));
  });

  grid.replaceChildren();
  const items = childrenOf(cwd);
  if (!items.length) {
    grid.append(el('p', { class: 'empty-note' }, 'This folder is empty. Create a file to get started.'));
    return;
  }

  for (const node of items) {
    const card = el('article', { class: 'file-card', dataset: { type: node.type } }, [
      el('div', { class: 'file-card__icon' }, [icon(node.type === 'folder' ? 'layers' : 'book')]),
      el('div', { class: 'file-card__body' }, [
        el('strong', {}, node.name),
        el('span', {}, humanSize(node)),
      ]),
      el('div', { class: 'file-card__acts' }, [
        el('button', { class: 'icon-btn', type: 'button', title: 'Rename', onclick: () => renameNode(node) }, [icon('refresh')]),
        el('button', { class: 'icon-btn', type: 'button', title: 'Delete', onclick: () => deleteNode(node) }, [icon('trash')]),
      ]),
    ]);
    card.addEventListener('dblclick', () => openNode(node));
    card.addEventListener('click', (e) => {
      if (e.target.closest('.file-card__acts')) return;
      grid.querySelectorAll('.file-card').forEach((n) => n.classList.remove('is-selected'));
      card.classList.add('is-selected');
    });
    grid.append(card);
  }
}

function openNode(node) {
  if (node.type === 'folder') {
    cwd = node.id;
    renderFiles();
    return;
  }
  editing = node.id;
  const editor = $('#files-editor');
  if (!editor) return;
  editor.hidden = false;
  $('#files-editor-name').value = node.name;
  $('#files-editor-body').value = node.content || '';
  $('#files-editor-body').focus();
}

function closeEditor() {
  const editor = $('#files-editor');
  if (editor) editor.hidden = true;
  editing = null;
}

function renameNode(node) {
  const name = window.prompt('Rename', node.name);
  if (!name || !name.trim()) return;
  node.name = name.trim().slice(0, 60);
  saveFiles();
  renderFiles();
}

function deleteNode(node) {
  if (!window.confirm('Delete "' + node.name + '"?')) return;
  const drop = new Set([node.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parent && drop.has(n.parent) && !drop.has(n.id)) { drop.add(n.id); grew = true; }
    }
  }
  nodes = nodes.filter((n) => !drop.has(n.id));
  saveFiles();
  renderFiles();
  notify({ title: 'Deleted', body: node.name, tone: 'info' });
}

function createNode(type) {
  const label = type === 'folder' ? 'Folder name' : 'File name';
  const name = window.prompt(label, type === 'folder' ? 'New folder' : 'untitled.txt');
  if (!name || !name.trim()) return;
  nodes.push({ id: uid('n'), name: name.trim().slice(0, 60), type, parent: cwd, content: type === 'file' ? '' : undefined, updated: Date.now() });
  saveFiles();
  renderFiles();
}

function downloadNode(node) {
  const blob = new Blob([node.content || ''], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: node.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function initFiles() {
  const app = $('#files-app');
  if (!app) return;
  app.innerHTML = `
    <div class="files__bar">
      <div class="crumbs" id="files-crumbs"></div>
      <div class="files__acts">
        <button class="btn btn--ghost btn--sm" type="button" data-file-act="new-folder">${icon('plus').outerHTML}New folder</button>
        <button class="btn btn--ghost btn--sm" type="button" data-file-act="new-file">${icon('plus').outerHTML}New file</button>
        <button class="btn btn--ghost btn--sm" type="button" data-file-act="import">${icon('upload').outerHTML}Import</button>
        <input type="file" id="files-import" multiple hidden accept=".txt,.md,.json,.csv,.html,.css,.js">
      </div>
    </div>
    <div class="files__grid" id="files-grid"></div>
    <div class="files__editor" id="files-editor" hidden>
      <div class="files__editor-head">
        <input id="files-editor-name" class="input" aria-label="File name">
        <div class="files__editor-acts">
          <button class="btn btn--primary btn--sm" type="button" id="files-save">Save</button>
          <button class="btn btn--ghost btn--sm" type="button" id="files-download">Download</button>
          <button class="icon-btn" type="button" id="files-close" aria-label="Close">${icon('close').outerHTML}</button>
        </div>
      </div>
      <textarea id="files-editor-body" class="files__editor-body" spellcheck="false"></textarea>
    </div>`;

  app.addEventListener('click', (event) => {
    const act = event.target.closest('[data-file-act]')?.dataset.fileAct;
    if (act === 'new-folder') createNode('folder');
    if (act === 'new-file') createNode('file');
    if (act === 'import') $('#files-import')?.click();
  });

  $('#files-import')?.addEventListener('change', async (event) => {
    for (const file of event.target.files) {
      const content = await file.text();
      nodes.push({ id: uid('n'), name: file.name.slice(0, 60), type: 'file', parent: cwd, content: content.slice(0, 200000), updated: Date.now() });
    }
    saveFiles();
    renderFiles();
    notify({ title: 'Imported', body: event.target.files.length + ' file(s)', tone: 'success' });
    event.target.value = '';
  });

  $('#files-save')?.addEventListener('click', () => {
    const node = nodes.find((n) => n.id === editing);
    if (!node) return;
    node.name = $('#files-editor-name').value.trim().slice(0, 60) || node.name;
    node.content = $('#files-editor-body').value;
    node.updated = Date.now();
    saveFiles();
    renderFiles();
    notify({ title: 'Saved', body: node.name, tone: 'success', timeout: 1800 });
  });

  $('#files-download')?.addEventListener('click', () => {
    const node = nodes.find((n) => n.id === editing);
    if (node) downloadNode(node);
  });

  $('#files-close')?.addEventListener('click', closeEditor);

  renderFiles();
}

/* =============================== GAMES =============================== */

const SIZE = 4;
let board = [];
let score = 0;
let best = storage.get('games.best2048', 0);
let won = false;

function spawnTile() {
  const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!empty.length) return;
  const index = empty[Math.floor(Math.random() * empty.length)];
  board[index] = Math.random() < 0.9 ? 2 : 4;
}

function newGame() {
  board = Array(SIZE * SIZE).fill(0);
  score = 0;
  won = false;
  spawnTile();
  spawnTile();
  drawBoard();
}

function slide(line) {
  const values = line.filter((v) => v);
  const merged = [];
  let gained = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === values[i + 1]) {
      const value = values[i] * 2;
      merged.push(value);
      gained += value;
      if (value === 2048) won = true;
      i += 1;
    } else merged.push(values[i]);
  }
  while (merged.length < SIZE) merged.push(0);
  return { line: merged, gained };
}

function move(dir) {
  const before = board.join(',');
  let gained = 0;
  for (let i = 0; i < SIZE; i += 1) {
    let line;
    if (dir === 'left') line = board.slice(i * SIZE, i * SIZE + SIZE);
    if (dir === 'right') line = board.slice(i * SIZE, i * SIZE + SIZE).reverse();
    if (dir === 'up') line = [0, 1, 2, 3].map((r) => board[r * SIZE + i]);
    if (dir === 'down') line = [0, 1, 2, 3].map((r) => board[r * SIZE + i]).reverse();
    const result = slide(line);
    gained += result.gained;
    if (dir === 'left') result.line.forEach((v, k) => { board[i * SIZE + k] = v; });
    if (dir === 'right') result.line.reverse().forEach((v, k) => { board[i * SIZE + k] = v; });
    if (dir === 'up') result.line.forEach((v, k) => { board[k * SIZE + i] = v; });
    if (dir === 'down') result.line.reverse().forEach((v, k) => { board[k * SIZE + i] = v; });
  }
  if (board.join(',') === before) return;
  score += gained;
  if (score > best) { best = score; storage.set('games.best2048', best); }
  spawnTile();
  drawBoard();
  if (won) { won = false; notify({ title: '2048!', body: 'You reached the tile.', tone: 'success' }); }
  if (!board.includes(0) && !canMove()) notify({ title: 'Game over', body: 'Final score ' + score, tone: 'info' });
}

function canMove() {
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const v = board[i];
    if (i % SIZE < SIZE - 1 && v === board[i + 1]) return true;
    if (i + SIZE < SIZE * SIZE && v === board[i + SIZE]) return true;
  }
  return false;
}

function drawBoard() {
  const grid = $('#game-2048');
  if (!grid) return;
  grid.replaceChildren();
  board.forEach((value, i) => {
    grid.append(el('div', {
      class: 'tile' + (value ? ' tile--' + Math.min(value, 4096) : ' is-empty'),
      dataset: { v: value || '' },
    }, value ? String(value) : ''));
  });
  const s = $('#g2048-score');
  const b = $('#g2048-best');
  if (s) s.textContent = score;
  if (b) b.textContent = best;
}

function initGames() {
  const app = $('#games-app');
  if (!app) return;

  app.innerHTML = `
    <div class="seg" role="tablist">
      <button class="seg__btn is-active" type="button" data-game="2048">2048</button>
      <button class="seg__btn" type="button" data-game="memory">Memory</button>
    </div>
    <div class="game-panel" data-panel="2048">
      <div class="game-top">
        <div class="score-box"><span>Score</span><strong id="g2048-score">0</strong></div>
        <div class="score-box"><span>Best</span><strong id="g2048-best">0</strong></div>
        <button class="btn btn--primary btn--sm" type="button" id="g2048-new">New game</button>
      </div>
      <div class="board-2048" id="game-2048" tabindex="0" aria-label="2048 board"></div>
      <p class="hint">Arrow keys, WASD or swipe. Merge tiles to reach 2048.</p>
    </div>
    <div class="game-panel" data-panel="memory" hidden>
      <div class="game-top">
        <div class="score-box"><span>Moves</span><strong id="mem-moves">0</strong></div>
        <div class="score-box"><span>Pairs</span><strong id="mem-pairs">0 / 8</strong></div>
        <button class="btn btn--primary btn--sm" type="button" id="mem-new">Shuffle</button>
      </div>
      <div class="board-memory" id="game-memory"></div>
    </div>`;

  const show = (game) => {
    app.querySelectorAll('[data-game]').forEach((b) => b.classList.toggle('is-active', b.dataset.game === game));
    app.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== game; });
    if (game === 'memory') drawMemory();
  };
  app.querySelectorAll('[data-game]').forEach((b) => b.addEventListener('click', () => show(b.dataset.game)));

  newGame();
  $('#g2048-new')?.addEventListener('click', newGame);

  const keyMap = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
  window.addEventListener('keydown', (event) => {
    if (!viewActive('games') || app.querySelector('[data-panel="2048"]').hidden) return;
    const dir = keyMap[event.key];
    if (!dir) return;
    event.preventDefault();
    move(dir);
  });

  let start = null;
  const boardEl = $('#game-2048');
  boardEl.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; });
  boardEl.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    start = null;
  });

  /* memory */
  const SYMBOLS = ['✦', '◈', '❖', '✧', '◍', '⬢', '☾', '♡'];
  let deck = [];
  let flipped = [];
  let matched = 0;
  let moves = 0;

  function resetMemory() {
    deck = [...SYMBOLS, ...SYMBOLS]
      .map((symbol, i) => ({ id: i, symbol, open: false, done: false }))
      .sort(() => Math.random() - 0.5);
    flipped = [];
    matched = 0;
    moves = 0;
    drawMemory();
  }

  function drawMemory() {
    const grid = $('#game-memory');
    if (!grid) return;
    if (!deck.length) { resetMemory(); return; }
    grid.replaceChildren();
    deck.forEach((card) => {
      grid.append(el('button', {
        class: 'mem-card' + (card.open || card.done ? ' is-open' : '') + (card.done ? ' is-done' : ''),
        type: 'button',
        onclick: () => flip(card),
      }, card.open || card.done ? card.symbol : ''));
    });
    const m = $('#mem-moves');
    const p = $('#mem-pairs');
    if (m) m.textContent = moves;
    if (p) p.textContent = matched + ' / 8';
  }

  function flip(card) {
    if (card.open || card.done || flipped.length === 2) return;
    card.open = true;
    flipped.push(card);
    if (flipped.length === 2) {
      moves += 1;
      const [a, b] = flipped;
      if (a.symbol === b.symbol) {
        a.done = b.done = true;
        matched += 1;
        flipped = [];
        if (matched === 8) notify({ title: 'Cleared', body: 'All pairs in ' + moves + ' moves.', tone: 'success' });
      } else {
        setTimeout(() => {
          a.open = b.open = false;
          flipped = [];
          drawMemory();
        }, 620);
      }
    }
    drawMemory();
  }

  $('#mem-new')?.addEventListener('click', resetMemory);
  resetMemory();
}

/* =============================== STATS =============================== */

const fpsHistory = [];

function initStats() {
  const app = $('#stats-app');
  if (!app) return;

  app.innerHTML = `
    <div class="stat-grid">
      <article class="stat-card"><span>Uptime</span><strong id="st-uptime">0m</strong><small>this session</small></article>
      <article class="stat-card"><span>Messages</span><strong id="st-messages">0</strong><small>chat history</small></article>
      <article class="stat-card"><span>Memories</span><strong id="st-memories">0</strong><small>stored facts</small></article>
      <article class="stat-card"><span>Plugins</span><strong id="st-plugins">0</strong><small>installed</small></article>
      <article class="stat-card"><span>Storage</span><strong id="st-storage">0 KB</strong><small>local data</small></article>
      <article class="stat-card"><span>FPS</span><strong id="st-fps">60</strong><small>render loop</small></article>
    </div>
    <div class="stats-2col">
      <section class="panel-card">
        <header><h3>Frame rate</h3><span class="chip" id="st-perf">smooth</span></header>
        <canvas id="st-canvas" width="520" height="140" aria-label="FPS history"></canvas>
      </section>
      <section class="panel-card">
        <header><h3>AI learning</h3><span class="chip" id="st-learned">0 topics</span></header>
        <div id="st-topics" class="topic-list"></div>
      </section>
    </div>
    <section class="panel-card">
      <header><h3>Personality</h3><span class="chip">shapes the companion</span></header>
      <div class="persona-grid" id="persona-grid"></div>
    </section>
    <section class="panel-card">
      <header><h3>Emotion lab</h3><span class="chip">${EMOTIONS.length} states</span></header>
      <p class="faint" style="font-size:10.5px;margin:0 0 10px">Tap a feeling — eyes, brows, mouth and glow change immediately. HYDRA picks these from what you say.</p>
      <div class="emotion-lab" id="emotion-lab"></div>
    </section>
    <section class="panel-card">
      <header><h3>Reply feedback</h3><span class="chip" id="st-feedback">0 ratings</span></header>
      <div class="stat-grid">
        <article class="stat-card"><span>Good</span><strong id="st-good">0</strong><small>rated helpful</small></article>
        <article class="stat-card"><span>Bad</span><strong id="st-bad">0</strong><small>rated unhelpful</small></article>
        <article class="stat-card"><span>Preferred length</span><strong id="st-pref">—</strong><small>characters</small></article>
      </div>
      <p class="faint" style="font-size:10.5px;margin-top:8px">Ratings adapt the personality dials and the model prompt. Everything stays on this device.</p>
      <button class="link-btn" type="button" id="st-reset-learn">Reset learning</button>
    </section>
    <section class="panel-card">
      <header><h3>Developer mode</h3><button class="link-btn" type="button" id="dev-toggle">Show log</button></header>
      <pre class="dev-log" id="dev-log" hidden></pre>
    </section>`;

  const lab = $('#emotion-lab');
  if (lab) {
    for (const name of EMOTIONS) {
      lab.append(el('button', {
        class: 'emotion-chip', type: 'button', 'data-emotion-chip': name,
        onclick: () => {
          emotion.preview(name);
          for (const chip of lab.querySelectorAll('.emotion-chip')) chip.classList.toggle('is-on', chip.dataset.emotionChip === name);
        },
      }, name));
    }
  }

  const persona = [
    { key: 'personaWarmth', label: 'Warmth', value: 0.7 },
    { key: 'personaHumor', label: 'Humor', value: 0.4 },
    { key: 'personaCuriosity', label: 'Curiosity', value: 0.8 },
    { key: 'personaVerbosity', label: 'Verbosity', value: 0.5 },
  ];
  const grid = $('#persona-grid');
  for (const p of persona) {
    const current = settings.get(p.key) ?? p.value;
    const out = el('output', {}, Math.round(current * 100) + '%');
    const input = el('input', {
      type: 'range', min: '0', max: '100', value: String(Math.round(current * 100)),
      oninput: (e) => {
        const v = Number(e.target.value) / 100;
        out.textContent = Math.round(v * 100) + '%';
        settings.set({ [p.key]: v });
      },
    });
    grid.append(el('label', { class: 'persona-row' }, [el('span', {}, p.label), input, out]));
  }

  const log = [];
  bus.on('notify', (payload) => {
    log.unshift(new Date().toLocaleTimeString() + '  ' + (payload.title || 'event') + (payload.body ? ' — ' + payload.body : ''));
    if (log.length > 60) log.pop();
    const pre = $('#dev-log');
    if (pre && !pre.hidden) pre.textContent = log.join('\n');
  });
  window.addEventListener('error', (e) => log.unshift(new Date().toLocaleTimeString() + '  ERROR ' + e.message));

  $('#st-reset-learn')?.addEventListener('click', () => {
    learning.reset();
    notify({ title: 'Learning reset', body: 'Feedback history cleared.', tone: 'info' });
    update();
  });

  $('#dev-toggle')?.addEventListener('click', (e) => {
    const pre = $('#dev-log');
    if (!pre) return;
    pre.hidden = !pre.hidden;
    e.target.textContent = pre.hidden ? 'Show log' : 'Hide log';
    pre.textContent = log.join('\n') || 'No events yet.';
  });

  const update = () => {
    if (!viewActive('stats')) return;
    const history = storage.get('chat.history', []) ?? [];
    const facts = storage.get('memory.facts', []) ?? [];
    const installed = plugins.list().filter((p) => !p.bundled).length;
    const learned = learning.profile();
    const fb = $('#st-feedback');
    if (fb) fb.textContent = learned.total + ' rating' + (learned.total === 1 ? '' : 's');
    const good = $('#st-good');
    if (good) good.textContent = String(learned.ups);
    const bad = $('#st-bad');
    if (bad) bad.textContent = String(learned.downs);
    const pref = $('#st-pref');
    if (pref) pref.textContent = learned.preferredLength ? '~' + learned.preferredLength : '—';
    let bytes = 0;
    try { for (const key of Object.keys(localStorage)) bytes += (localStorage.getItem(key) || '').length; } catch { /* ignore */ }
    const fps = Math.round(window.__hydraFps ?? 60);
    fpsHistory.push(fps);
    if (fpsHistory.length > 90) fpsHistory.shift();

    const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
    set('#st-uptime', formatDuration(performance.now()));
    set('#st-messages', history.length);
    set('#st-memories', facts.length);
    set('#st-plugins', installed);
    set('#st-storage', (bytes / 1024).toFixed(1) + ' KB');
    set('#st-fps', fps);
    set('#st-perf', fps > 50 ? 'smooth' : fps > 30 ? 'stable' : 'heavy');

    const words = {};
    const stop = new Set(['the', 'and', 'you', 'that', 'this', 'with', 'have', 'what', 'your', 'for', 'are', 'can', 'how', 'not', 'but', 'from', 'about', 'will', 'just', 'like']);
    for (const message of history) {
      for (const word of String(message.content || '').toLowerCase().match(/[a-z]{4,}/g) || []) {
        if (!stop.has(word)) words[word] = (words[word] || 0) + 1;
      }
    }
    const top = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 8);
    set('#st-learned', top.length + ' topics');
    const topics = $('#st-topics');
    if (topics) {
      topics.replaceChildren();
      if (!top.length) topics.append(el('p', { class: 'empty-note' }, 'Chat with HYDRA to build a topic profile.'));
      for (const [word, count] of top) {
        topics.append(el('div', { class: 'topic' }, [
          el('span', {}, word),
          el('div', { class: 'topic__bar' }, [el('i', { style: { width: Math.min(100, count * 12) + '%' } })]),
          el('b', {}, count),
        ]));
      }
    }

    const canvas = $('#st-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(192,132,252,.55)');
      grad.addColorStop(1, 'rgba(124,58,237,0)');
      ctx.beginPath();
      fpsHistory.forEach((v, i) => {
        const x = (i / Math.max(1, fpsHistory.length - 1)) * w;
        const y = h - clamp(v / 70, 0, 1) * (h - 12) - 6;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
  };

  update();
  bus.on('learning:update', update);
  setInterval(update, 2000);
}

/* =============================== MARKET ============================== */

const CATALOG = [
  { id: 'focus-timer', name: 'Focus Timer', version: '1.2.0', author: 'hydra.labs', description: 'Pomodoro sessions with ambient cues.', permissions: ['notifications'] },
  { id: 'code-runner', name: 'Code Runner', version: '2.0.1', author: 'forge', description: 'Run small JavaScript snippets in a sandbox.', permissions: ['storage'] },
  { id: 'weather-pro', name: 'Weather Pro', version: '1.4.2', author: 'aether', description: 'Hourly forecast and severe alerts.', permissions: ['network'] },
  { id: 'voice-lab', name: 'Voice Lab', version: '0.9.4', author: 'echo', description: 'Custom wake words and voice presets.', permissions: ['microphone'] },
  { id: 'wallpaper-studio', name: 'Wallpaper Studio', version: '1.0.3', author: 'prism', description: 'Generative wallpapers from prompts.', permissions: ['storage'] },
  { id: 'task-sync', name: 'Task Sync', version: '1.1.0', author: 'relay', description: 'Two-way sync for tasks and reminders.', permissions: ['network'] },
  { id: 'music-visualizer', name: 'Visualizer', version: '3.2.0', author: 'waveform', description: 'Spectrum and particle reactions.', permissions: ['audio'] },
  { id: 'study-notes', name: 'Study Notes', version: '1.0.0', author: 'atlas', description: 'Summarise notes into flashcards.', permissions: ['storage'] },
];

function initMarket() {
  const app = $('#market-app');
  if (!app) return;

  app.innerHTML = `
    <div class="market-bar">
      <label class="search-inline">
        ${icon('search').outerHTML}
        <input id="market-search" type="search" placeholder="Search plugins">
      </label>
      <span class="chip" id="market-count">${CATALOG.length} extensions</span>
    </div>
    <div class="market-grid" id="market-grid"></div>`;

  const grid = $('#market-grid');
  if (grid) {
    const original = app;
    // render into the grid container
    const paint = (query = '') => {
      grid.replaceChildren();
      const q = query.toLowerCase();
      const list = CATALOG.filter((p) => !q || (p.name + ' ' + p.description).toLowerCase().includes(q));
      const installed = new Set(plugins.list().map((p) => p.id));
      if (!list.length) grid.append(el('p', { class: 'empty-note' }, 'Nothing matches that search.'));
      for (const item of list) {
        const isInstalled = installed.has(item.id);
        grid.append(el('article', { class: 'market-card' }, [
          el('div', { class: 'market-card__icon' }, [icon('puzzle')]),
          el('div', { class: 'market-card__body' }, [
            el('div', { class: 'market-card__title' }, [el('strong', {}, item.name), el('span', { class: 'chip' }, 'v' + item.version)]),
            el('p', {}, item.description),
            el('small', {}, item.author + ' · ' + item.permissions.join(', ')),
          ]),
          el('button', {
            class: 'btn ' + (isInstalled ? 'btn--ghost' : 'btn--primary') + ' btn--sm',
            type: 'button',
            onclick: () => {
              if (isInstalled) { plugins.remove(item.id); notify({ title: 'Removed', body: item.name, tone: 'info' }); }
              else plugins.install({ ...item });
              paint($('#market-search')?.value || '');
            },
          }, isInstalled ? 'Remove' : 'Install'),
        ]));
      }
    };
    paint();
    $('#market-search')?.addEventListener('input', (e) => paint(e.target.value));
  }
}

/* ============================ AUTOMATIONS =========================== */

const AUTOMATIONS_KEY = 'automations.items';

const DEFAULT_AUTOMATIONS = [
  { id: 'a1', kind: 'prompt', name: 'Morning briefing', prompt: 'Summarise my day: tasks, weather and any reminders.', schedule: 'daily', enabled: true, lastRun: null },
  { id: 'a2', kind: 'theme', name: 'Evening palette', prompt: 'galaxy', schedule: 'daily', enabled: false, lastRun: null },
  { id: 'a3', kind: 'music', name: 'Start the ambience', prompt: '', schedule: 'manual', enabled: true, lastRun: null },
];

const AUTO_KINDS = [
  { id: 'prompt', label: 'Ask the assistant' },
  { id: 'theme', label: 'Switch theme' },
  { id: 'music', label: 'Toggle music' },
  { id: 'view', label: 'Open a view' },
  { id: 'notify', label: 'Post a reminder' },
  { id: 'desktop', label: 'Desktop action (bridge)' },
];

function initAutomations() {
  const app = $('#automations-app');
  if (!app) return;
  let items = storage.get(AUTOMATIONS_KEY, null) || DEFAULT_AUTOMATIONS;
  const save = () => storage.set(AUTOMATIONS_KEY, items);

  const paint = () => {
    const list = $('#auto-list');
    if (!list) return;
    list.replaceChildren();
    if (!items.length) list.append(el('p', { class: 'empty-note' }, 'No automations yet.'));
    for (const item of items) {
      list.append(el('article', { class: 'auto-card' }, [
        el('div', { class: 'auto-card__top' }, [
          el('div', { class: 'auto-card__icon' }, [icon('refresh')]),
          el('div', { class: 'grow' }, [
            el('strong', {}, item.name),
            el('span', {}, item.schedule + (item.lastRun ? ' · last run ' + new Date(item.lastRun).toLocaleTimeString() : ' · never run')),
          ]),
          el('button', {
            class: 'switch' + (item.enabled ? ' is-on' : ''),
            type: 'button',
            'aria-label': 'Toggle ' + item.name,
            onclick: () => { item.enabled = !item.enabled; save(); paint(); },
          }, [el('i')]),
        ]),
        el('p', {}, (item.kind && item.kind !== 'prompt' ? 'action: ' + item.kind + (item.prompt ? ' → ' + item.prompt : '') + ' · ' : '') + item.prompt),
        el('div', { class: 'auto-card__acts' }, [
          el('button', {
            class: 'btn btn--primary btn--sm', type: 'button',
            onclick: () => runAutomation(item, save, paint),
          }, 'Run now'),
          el('button', {
            class: 'link-btn', type: 'button',
            onclick: () => { items = items.filter((x) => x.id !== item.id); save(); paint(); },
          }, 'Delete'),
        ]),
      ]));
    }
  };

  app.innerHTML = `
    <div class="auto-form">
      <input class="input" id="auto-name" placeholder="Automation name" maxlength="48">
      <select class="input" id="auto-kind">
        ${AUTO_KINDS.map((k) => `<option value="${k.id}">${k.label}</option>`).join('')}
      </select>
      <input class="input" id="auto-prompt" placeholder="Prompt, theme name or view id">
      <select class="input" id="auto-schedule">
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="hourly">Hourly</option>
        <option value="manual">Manual</option>
      </select>
      <button class="btn btn--primary btn--sm" type="button" id="auto-add">Add</button>
    </div>
    <div class="auto-list" id="auto-list"></div>`;

  $('#auto-add')?.addEventListener('click', () => {
    const name = $('#auto-name').value.trim();
    const kind = $('#auto-kind').value;
    const prompt = $('#auto-prompt').value.trim();
    if (!name) { notify({ title: 'Missing name', body: 'Give the automation a name.', tone: 'warn' }); return; }
    if (kind === 'prompt' && !prompt) { notify({ title: 'Missing prompt', body: 'Tell HYDRA what to do.', tone: 'warn' }); return; }
    items.unshift({ id: uid('a'), kind, name, prompt, schedule: $('#auto-schedule').value, enabled: true, lastRun: null });
    save();
    $('#auto-name').value = '';
    $('#auto-prompt').value = '';
    paint();
  });

  const runAutomation = (item, save, paint) => {
    item.lastRun = Date.now();
    save();
    paint();
    if (item.kind === 'theme') {
      const next = cycleTheme();
      notify({ title: 'Theme switched', body: next.label, tone: 'success' });
    } else if (item.kind === 'music') {
      music.toggle();
      notify({ title: 'Music', body: 'Toggled by automation.', tone: 'info' });
    } else if (item.kind === 'view') {
      bus.emit('ui:view', { view: item.prompt || 'dashboard' });
    } else if (item.kind === 'notify') {
      notify({ title: item.name, body: item.prompt || 'Scheduled reminder', tone: 'info', timeout: 7000 });
    } else if (item.kind === 'desktop') {
      import('./bridge.js').then(({ bridge }) => {
        const [action, ...rest] = String(item.prompt || 'screenshot').trim().split(/\s+/);
        bridge.run(action, action === 'volume' ? { level: Number(rest[0] || 50) } : action === 'open_url' ? { url: rest.join(' ') } : {});
      });
    } else {
      bus.emit('ui:view', { view: 'assistant' });
      setTimeout(() => bus.emit('ai:ask', { text: item.prompt, source: 'automation' }), 320);
      notify({ title: 'Running', body: item.name, tone: 'success' });
    }
  };

  paint();
}

/* ============================== WINDOWS ============================= */

const WINDOW_DEFS = {
  notes: { title: 'Notes', icon: 'book' },
  calc: { title: 'Calculator', icon: 'grid' },
  timer: { title: 'Timer', icon: 'clock' },
  stats: { title: 'Live stats', icon: 'activity' },
};

function initWindows() {
  const stage = $('#windows-stage');
  if (!stage) return;
  let z = 10;
  let offset = 0;

  const spawn = (kind) => {
    const def = WINDOW_DEFS[kind];
    if (!def) return;
    const win = el('section', { class: 'wm-win', dataset: { kind } }, [
      el('header', { class: 'wm-win__bar' }, [
        el('span', { class: 'wm-win__title' }, [icon(def.icon), def.title]),
        el('div', { class: 'wm-win__acts' }, [
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Minimise', onclick: () => win.classList.toggle('is-min') }, [icon('chevron-down')]),
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => win.remove() }, [icon('close')]),
        ]),
      ]),
      el('div', { class: 'wm-win__body' }),
    ]);
    const body = win.querySelector('.wm-win__body');
    if (kind === 'notes') {
      const area = el('textarea', { class: 'wm-notes', placeholder: 'Scratchpad…' });
      area.value = storage.get('wm.notes', '') ?? '';
      area.addEventListener('input', () => storage.set('wm.notes', area.value));
      body.append(area);
    }
    if (kind === 'calc') {
      const screen = el('div', { class: 'wm-calc__screen' }, '0');
      let expr = '';
      const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+'];
      const grid = el('div', { class: 'wm-calc__keys' });
      for (const key of keys) {
        grid.append(el('button', {
          class: 'wm-key' + (key === '=' ? ' is-eq' : ''), type: 'button',
          onclick: () => {
            if (key === '=') {
              try {
                const safe = expr.replace(/[^0-9+\-*/.() ]/g, '');
                const value = Function('"use strict";return (' + (safe || '0') + ')')();
                screen.textContent = String(Math.round(value * 1e10) / 1e10);
                expr = String(value);
              } catch { screen.textContent = 'Error'; expr = ''; }
            } else {
              expr += key;
              screen.textContent = expr;
            }
          },
        }, key));
      }
      body.append(screen, grid);
    }
    if (kind === 'timer') {
      const display = el('div', { class: 'wm-timer__display' }, '25:00');
      const input = el('input', { class: 'input', type: 'number', min: '1', max: '90', value: '25' });
      let left = 25 * 60;
      let timer = null;
      const paint = () => { display.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0'); };
      const start = () => {
        if (timer) return;
        timer = setInterval(() => {
          left = Math.max(0, left - 1);
          paint();
          if (left === 0) { clearInterval(timer); timer = null; notify({ title: 'Timer done', body: 'Focus block complete.', tone: 'success' }); }
        }, 1000);
      };
      body.append(display, el('div', { class: 'wm-row' }, [
        input,
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: start }, 'Start'),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { clearInterval(timer); timer = null; left = Number(input.value) * 60; paint(); } }, 'Reset'),
      ]));
    }
    if (kind === 'stats') {
      const out = el('div', { class: 'wm-stats' });
      body.append(out);
      const paint = () => {
        out.innerHTML = '';
        const rows = [
          ['FPS', Math.round(window.__hydraFps ?? 60)],
          ['Memory', Math.round(performance.memory?.usedJSHeapSize / 1048576 || 0) + ' MB'],
          ['Messages', (storage.get('chat.history', []) ?? []).length],
        ];
        for (const [label, value] of rows) {
          out.append(el('div', { class: 'wm-stat' }, [el('span', {}, label), el('strong', {}, String(value))]));
        }
      };
      paint();
      setInterval(paint, 1500);
    }

    const rect = stage.getBoundingClientRect();
    win.style.left = Math.min(rect.width - 300, 40 + offset) + 'px';
    win.style.top = Math.min(rect.height - 240, 30 + offset) + 'px';
    offset = (offset + 28) % 140;
    win.style.zIndex = String(++z);
    stage.append(win);

    const bar = win.querySelector('.wm-win__bar');
    bar.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      win.style.zIndex = String(++z);
      const startX = event.clientX;
      const startY = event.clientY;
      const originLeft = parseFloat(win.style.left) || 0;
      const originTop = parseFloat(win.style.top) || 0;
      bar.setPointerCapture(event.pointerId);
      const onMove = (e) => {
        win.style.left = clamp(originLeft + e.clientX - startX, 0, stage.clientWidth - 120) + 'px';
        win.style.top = clamp(originTop + e.clientY - startY, 0, stage.clientHeight - 60) + 'px';
      };
      const onUp = () => { bar.removeEventListener('pointermove', onMove); bar.removeEventListener('pointerup', onUp); };
      bar.addEventListener('pointermove', onMove);
      bar.addEventListener('pointerup', onUp);
    });
  };

  $('#view-windows')?.querySelectorAll('[data-wm]').forEach((button) => {
    button.addEventListener('click', () => spawn(button.dataset.wm));
  });
  spawn('notes');
}

/* =============================== INIT =============================== */

export function initExtras() {
  initFiles();
  initGames();
  initStats();
  initMarket();
  initAutomations();
  initWindows();
}

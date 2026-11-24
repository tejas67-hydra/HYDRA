/**
 * HYDRA — dashboard: layout persistence, drag reordering, widget lifecycle.
 */

import { $, $$, el, icon, bus, uid, clamp } from './utils.js';
import { storage } from './storage.js';
import { WIDGETS, widgetCatalog } from './widgets.js';

const LAYOUT_KEY = 'dashboard.layout';

const DEFAULT_LAYOUT = [
  { type: 'clock', w: 4, h: 2 },
  { type: 'weather', w: 4, h: 3 },
  { type: 'music', w: 4, h: 2 },
  { type: 'tasks', w: 4, h: 3 },
  { type: 'calendar', w: 4, h: 3 },
  { type: 'focus', w: 3, h: 3 },
  { type: 'system', w: 4, h: 3 },
  { type: 'notes', w: 5, h: 3 },
  { type: 'quote', w: 4, h: 2 },
  { type: 'launcher', w: 4, h: 2 },
  { type: 'stats', w: 4, h: 2 },
];

class Dashboard {
  constructor() {
    this.grid = null;
    this.items = [];
    this.drag = null;
  }

  init() {
    this.grid = $('#widget-grid');
    const saved = storage.get(LAYOUT_KEY, null);
    this.items = Array.isArray(saved) && saved.length
      ? saved.filter((item) => WIDGETS.has(item.type)).map((item) => ({ id: item.id || uid('w'), ...item }))
      : DEFAULT_LAYOUT.map((item) => ({ id: uid('w'), ...item }));

    this.renderAll();
    this.bind();
    return this;
  }

  bind() {
    $('#btn-add-widget')?.addEventListener('click', () => this.openCatalog());
    $('#btn-reset-layout')?.addEventListener('click', () => this.reset());
    $('#widget-sheet')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-sheet-close]')) this.closeCatalog();
    });
    bus.on('widget:add', ({ type }) => this.add(type));
    bus.on('layout:reset', () => this.reset());
  }

  renderAll() {
    if (!this.grid) return;
    this.grid.replaceChildren();
    for (const item of this.items) {
      const node = this.build(item);
      if (node) this.grid.append(node);
    }
    if (!this.items.length) {
      this.grid.append(el('div', { class: 'grid-empty' }, [
        icon('grid'),
        el('strong', {}, 'Your deck is empty'),
        el('span', {}, 'Add a widget to start building the workspace.'),
      ]));
    }
  }

  build(item) {
    const def = WIDGETS.get(item.type);
    if (!def) return null;
    const node = el('article', {
      class: 'widget',
      dataset: { id: item.id, type: item.type },
      style: { '--w': String(item.w ?? def.size.w), '--h': String(item.h ?? def.size.h) },
    });

    const actions = el('div', { class: 'widget__actions' }, [
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Resize widget', title: 'Cycle size', onclick: () => this.cycleSize(item) }, [icon('maximize')]),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove widget', title: 'Remove', onclick: () => this.remove(item.id) }, [icon('close')]),
    ]);

    const head = el('header', { class: 'widget__head' }, [
      el('span', { class: 'widget__title' }, [icon(def.icon), def.name]),
      actions,
    ]);

    node.append(head);
    try {
      const content = def.render({ item, dashboard: this });
      if (content) node.append(content);
    } catch (err) {
      node.append(el('div', { class: 'widget__body' }, el('p', { class: 'faint' }, 'Widget failed to render.')));
      console.error('[widget]', def.id, err);
    }

    head.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.widget__actions')) return;
      this.startDrag(event, node, item);
    });
    return node;
  }

  startDrag(event, node, item) {
    if (event.button != null && event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;

    const move = (moveEvent) => {
      if (!active) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 7) return;
        active = true;
        node.classList.add('is-dragging');
        this.grid.classList.add('is-sorting');
        document.body.style.cursor = 'grabbing';
      }
      const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('.widget');
      if (!under || under === node) return;
      const rect = under.getBoundingClientRect();
      const after = moveEvent.clientX > rect.left + rect.width / 2;
      if (after) under.after(node);
      else under.before(node);
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      node.classList.remove('is-dragging');
      this.grid.classList.remove('is-sorting');
      document.body.style.cursor = '';
      if (active) this.commitOrder();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    event.preventDefault();
  }

  commitOrder() {
    const ids = $$('.widget', this.grid).map((n) => n.dataset.id);
    const order = ids.map((id) => this.items.find((i) => i.id === id)).filter(Boolean);
    if (order.length === this.items.length) this.items = order;
    this.save();
    bus.emit('notify', { title: 'Layout saved', tone: 'info', timeout: 1400 });
  }

  save() {
    storage.set(LAYOUT_KEY, this.items);
  }

  cycleSize(item) {
    const sizes = [[3, 2], [4, 2], [4, 3], [6, 3], [6, 4], [12, 3]];
    const index = sizes.findIndex(([w, h]) => w === item.w && h === item.h);
    const [w, h] = sizes[(index + 1) % sizes.length];
    item.w = w;
    item.h = h;
    const node = this.grid?.querySelector('[data-id="' + item.id + '"]');
    if (node) {
      node.style.setProperty('--w', String(w));
      node.style.setProperty('--h', String(h));
    }
    this.save();
  }

  add(type) {
    if (!WIDGETS.has(type)) return;
    if (this.items.some((item) => item.type === type)) {
      bus.emit('notify', { title: 'Already on the deck', body: 'That widget is already here.', tone: 'info' });
      return;
    }
    const def = WIDGETS.get(type);
    const item = { id: uid('w'), type, w: def.size.w, h: def.size.h };
    this.items.push(item);
    this.save();
    this.renderAll();
    this.closeCatalog();
    bus.emit('notify', { title: 'Widget added', body: def.name, tone: 'success', timeout: 1600 });
  }

  remove(id) {
    const node = this.grid?.querySelector('[data-id="' + id + '"]');
    node?.__cleanup?.();
    node?.remove();
    this.items = this.items.filter((item) => item.id !== id);
    this.save();
    if (!this.items.length) this.renderAll();
  }

  reset() {
    for (const node of $$('.widget', this.grid)) node.__cleanup?.();
    this.items = DEFAULT_LAYOUT.map((item) => ({ id: uid('w'), ...item }));
    this.save();
    this.renderAll();
    bus.emit('notify', { title: 'Layout reset', body: 'Default deck restored.', tone: 'info' });
  }

  openCatalog() {
    const sheet = $('#widget-sheet');
    const body = $('#widget-catalog');
    if (!sheet || !body) return;
    body.replaceChildren();
    const grid = el('div', { class: 'catalog' });
    for (const def of widgetCatalog()) {
      const present = this.items.some((item) => item.type === def.id);
      const btn = el('button', {
        class: 'catalog__item',
        type: 'button',
        disabled: present,
        onclick: () => this.add(def.id),
      }, [
        icon(def.icon),
        el('strong', {}, def.name),
        el('span', {}, present ? 'Already on the deck' : def.description),
      ]);
      grid.append(btn);
    }
    body.append(grid);
    sheet.hidden = false;
  }

  closeCatalog() {
    const sheet = $('#widget-sheet');
    if (sheet) sheet.hidden = true;
  }
}

export const dashboard = new Dashboard();

/**
 * HYDRA — notification centre: ephemeral toasts plus a persistent log.
 */

import { $, el, icon, bus, formatRelative, uid } from './utils.js';
import { storage } from './storage.js';
import { settings } from './settings.js';

const MAX_ITEMS = 60;
const TONE_ICON = {
  info: 'sparkles',
  success: 'check',
  warn: 'bell',
  error: 'close',
  system: 'cpu',
};

class NotificationCenter {
  constructor() {
    this.items = storage.get('notifications', []) ?? [];
    this.unread = 0;
    this.toastStack = null;
    this.listEl = null;
    this.badgeEl = null;
    this.audio = null;
  }

  init() {
    this.toastStack = $('#toast-stack');
    this.listEl = $('#notif-list');
    this.badgeEl = $('#notif-badge');

    $('#btn-notifications')?.addEventListener('click', () => this.toggleDrawer());
    $('#btn-close-notifs')?.addEventListener('click', () => this.closeDrawer());
    $('#btn-clear-notifs')?.addEventListener('click', () => this.clear());

    $('#btn-dnd')?.addEventListener('click', () => this.toggleDnd());
    this.syncDnd();
    bus.on('notify', (payload) => this.push(payload));
    this.renderBadge();
    this.renderList();
  }

  /* ------------------------------ toasts ----------------------------- */
  toast({ title, body, tone = 'info', timeout = 4200, icon: iconName } = {}) {
    if (!this.toastStack) return;
    const node = el('div', { class: 'toast', dataset: { tone }, role: 'status' }, [
      el('span', { class: 'toast__icon' }, [icon(iconName || TONE_ICON[tone] || 'sparkles')]),
      el('div', { class: 'toast__body' }, [
        title ? el('strong', {}, title) : null,
        body ? el('span', {}, body) : null,
      ]),
      el('button', {
        class: 'toast__close',
        type: 'button',
        'aria-label': 'Dismiss',
        onclick: () => dismiss(),
      }, [icon('close')]),
    ]);

    const dismiss = () => {
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 240);
    };

    this.toastStack.append(node);
    while (this.toastStack.children.length > 3) this.toastStack.firstElementChild.remove();
    if (timeout > 0) setTimeout(dismiss, timeout);
    this.chime(tone);
    return dismiss;
  }

  quietNow() {
    if (settings.get('dnd')) return true;
    const start = String(settings.get('quietStart') || '');
    const end = String(settings.get('quietEnd') || '');
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return false;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const toMin = (v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
    const a = toMin(start);
    const b = toMin(end);
    return a <= b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
  }

  priorityFor(tone) {
    if (tone === 'error') return 'high';
    if (tone === 'warn') return 'high';
    if (tone === 'success') return 'normal';
    return 'low';
  }

  toggleDnd() {
    const next = !settings.get('dnd');
    settings.set({ dnd: next });
    this.syncDnd();
    this.toast({
      title: next ? 'Do not disturb on' : 'Do not disturb off',
      body: next ? 'Toasts and sound are paused. Events still log here.' : 'Alerts are back.',
      tone: 'info',
      timeout: 2200,
    });
  }

  syncDnd() {
    const button = $('#btn-dnd');
    if (!button) return;
    const on = Boolean(settings.get('dnd'));
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-pressed', String(on));
    button.title = on ? 'Do not disturb is on' : 'Do not disturb';
  }

  chime(tone) {
    if (!settings.get('soundEnabled') || !settings.get('notifSound')) return;
    if (this.quietNow()) return;
    if (tone === 'error' || tone === 'warn') return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.audio ??= new Ctx();
      const ctx = this.audio;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone === 'success' ? 880 : 660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(tone === 'success' ? 1320 : 990, ctx.currentTime + 0.09);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
    } catch { /* audio is a nicety */ }
  }

  /* --------------------------- persistent log ------------------------ */
  push({ title, body, tone = 'info', icon: iconName, silent = false, timeout } = {}) {
    if (!title && !body) return;
    const quiet = this.quietNow();
    const recent = this.items.find((n) => n.title === (title || 'Notification') && Date.now() - n.at < 10000);
    if (recent) {
      recent.count = (recent.count || 1) + 1;
      recent.at = Date.now();
      recent.body = body || recent.body;
      this.persist();
      this.renderBadge();
      this.renderList();
      if (!silent && !quiet) this.toast({ title: recent.title, body: recent.body + ' ×' + recent.count, tone, icon: recent.icon, timeout });
      return recent;
    }
    const item = {
      id: uid('n'),
      title: title || 'Notification',
      body: body || '',
      tone,
      icon: iconName || TONE_ICON[tone] || 'sparkles',
      at: Date.now(),
      read: false,
      priority: this.priorityFor(tone),
      count: 1,
    };
    this.items.unshift(item);
    if (this.items.length > MAX_ITEMS) this.items.length = MAX_ITEMS;
    this.persist();
    this.unread += 1;
    this.renderBadge();
    this.renderList();
    if (!silent && !quiet) this.toast({ title: item.title, body: item.body, tone, icon: item.icon, timeout });
    return item;
  }

  persist() {
    storage.set('notifications', this.items);
  }

  renderBadge() {
    if (!this.badgeEl) return;
    const count = this.items.filter((i) => !i.read).length;
    this.unread = count;
    this.badgeEl.hidden = count === 0;
    this.badgeEl.textContent = count > 9 ? '9+' : String(count);
  }

  renderList() {
    if (!this.listEl) return;
    this.listEl.replaceChildren();
    if (!this.items.length) {
      this.listEl.append(el('div', { class: 'palette__empty' }, 'Nothing yet. HYDRA will log system events here.'));
      return;
    }
    for (const item of this.items.slice(0, 40)) {
      const row = el('article', {
        class: 'plugin-card notif-row',
        dataset: { priority: item.priority || 'low' },
        style: { padding: '12px', cursor: 'pointer', opacity: item.read ? '0.62' : '1' },
      }, [
        el('div', { class: 'plugin-card__top' }, [
          el('div', { class: 'plugin-card__icon' }, [icon(item.icon)]),
          el('div', { class: 'grow' }, [
            el('strong', {}, item.title + (item.count > 1 ? ' ×' + item.count : '')),
            el('span', {}, formatRelative(item.at) + (item.priority === 'high' ? ' · high priority' : '')),
          ]),
        ]),
        item.body ? el('p', {}, item.body) : null,
      ]);
      row.addEventListener('click', () => {
        item.read = true;
        this.persist();
        this.renderBadge();
        this.renderList();
      });
      this.listEl.append(row);
    }
  }

  toggleDrawer() {
    const drawer = $('#notif-drawer');
    if (!drawer) return;
    if (drawer.hidden) this.openDrawer();
    else this.closeDrawer();
  }

  openDrawer() {
    const drawer = $('#notif-drawer');
    if (!drawer) return;
    drawer.hidden = false;
    this.items.forEach((item) => { item.read = true; });
    this.persist();
    this.renderBadge();
    this.renderList();
  }

  closeDrawer() {
    const drawer = $('#notif-drawer');
    if (drawer) drawer.hidden = true;
  }

  clear() {
    this.items = [];
    this.persist();
    this.renderBadge();
    this.renderList();
    this.toast({ title: 'Notifications cleared', tone: 'info', timeout: 1800 });
  }

  async requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return Notification.requestPermission();
  }
}

export const notifications = new NotificationCenter();

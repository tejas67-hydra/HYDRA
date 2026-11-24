/**
 * HYDRA — shared utilities, DOM helpers, event bus, formatting, safe markdown.
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (v == null) continue;
        if (prop.startsWith('--')) node.style.setProperty(prop, String(v));
        else node.style[prop] = v;
      }
    }
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== 'list') node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function icon(name, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/* ------------------------------- math ------------------------------- */
export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (min, max) => Math.random() * (max - min) + min;
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const randomOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const round = (v, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
export const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/* ------------------------------ strings ----------------------------- */
export const pad2 = (n) => String(n).padStart(2, '0');
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const escapeHtml = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const truncate = (s, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const plural = (n, word, suffix = 's') => `${n} ${word}${n === 1 ? '' : suffix}`;

export function debounce(fn, wait = 200) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function throttle(fn, wait = 100) {
  let last = 0;
  let timer;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer);
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };
}

/* ------------------------------ time -------------------------------- */
export function formatClock(date = new Date(), { seconds = false, h24 = true } = {}) {
  let h = date.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  if (!h24) h = h % 12 || 12;
  const base = `${h24 ? pad2(h) : h}:${pad2(date.getMinutes())}`;
  return seconds ? `${base}:${pad2(date.getSeconds())}` : base + (h24 ? '' : ` ${suffix}`);
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

export function formatRelative(ts) {
  const diff = Date.now() - ts;
  if (diff < 45_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.round(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Still awake';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  if (h < 23) return 'Good evening';
  return 'Late night session';
}

export function timezoneLabel() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return tz.split('/').pop().replace(/_/g, ' ');
  } catch {
    return 'local';
  }
}

/* ------------------------------ media ------------------------------- */
export function prefersReducedMotion() {
  return document.documentElement.dataset.motion === 'off';
}

export function clampText(text, max) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/* ---------------------------- markdown ------------------------------ */
const SAFE_URL = /^(https?:\/\/|mailto:|\/|#)/i;

function inline(text) {
  return text
    .replace(/`([^`\n]+)`/g, (_, code) => `<code>${code}</code>`)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label, url) =>
      SAFE_URL.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : match);
}

/**
 * Minimal, XSS-safe markdown subset: fences, inline code, bold/italic,
 * links, headings, ordered/unordered lists and paragraphs.
 */
export function markdown(source = '') {
  const escaped = escapeHtml(String(source)).replace(/\r\n/g, '\n');
  const fences = [];
  let text = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, body) => {
    fences.push(`<pre><code class="lang-${lang || 'text'}">${body.replace(/\n$/, '')}</code></pre>`);
    return `\u0000FENCE${fences.length - 1}\u0000`;
  });

  const blocks = text.split(/\n{2,}/);
  const out = blocks.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (/^\u0000FENCE\d+\u0000$/.test(trimmed)) {
      return trimmed.replace(/\u0000FENCE(\d+)\u0000/g, (_, i) => fences[Number(i)]);
    }
    if (/^#{1,3}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)[0].length;
      return `<h${level + 2}>${inline(trimmed.replace(/^#+\s/, ''))}</h${level + 2}>`;
    }
    const lines = trimmed.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    }
    return `<p>${inline(lines.join('<br>'))}</p>`;
  });

  return out.join('').replace(/\u0000FENCE(\d+)\u0000/g, (_, i) => fences[Number(i)]);
}

/* --------------------------- event bus ------------------------------ */
class EventBus {
  constructor() {
    this.map = new Map();
    this.debug = false;
  }

  on(type, handler) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(handler);
    return () => this.off(type, handler);
  }

  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(type, handler) {
    this.map.get(type)?.delete(handler);
  }

  emit(type, payload) {
    if (this.debug) console.debug('[bus]', type, payload);
    for (const handler of this.map.get(type) ?? []) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[bus] handler for "${type}" failed`, err);
      }
    }
    for (const handler of this.map.get('*') ?? []) {
      try { handler({ type, payload }); } catch (err) { console.error('[bus]', err); }
    }
  }

  clear() {
    this.map.clear();
  }
}

export const bus = new EventBus();

/* --------------------------- tiny helpers --------------------------- */
export function download(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/** Basic arithmetic evaluator — supports + - * / % ^ and parentheses only. */
export function evalMath(expression) {
  const cleaned = expression.replace(/[,\s]/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**');
  if (!/^[\d+\-*/%.()]+$/.test(cleaned) || cleaned.length > 120) return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict";return (${cleaned})`)();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

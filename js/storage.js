/**
 * HYDRA — persistence layer.
 * Everything lives in localStorage under a single versioned namespace so a
 * future schema change can migrate (or discard) cleanly.
 */

import { safeJsonParse } from './utils.js';

const NAMESPACE = 'hydra.v1';
const VERSION = 1;

function probe() {
  try {
    const k = `${NAMESPACE}.__probe`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const available = probe();
const memory = new Map();

function readRaw(key) {
  if (!available) return memory.get(key) ?? null;
  try {
    return localStorage.getItem(`${NAMESPACE}.${key}`);
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  if (!available) {
    memory.set(key, value);
    return true;
  }
  try {
    localStorage.setItem(`${NAMESPACE}.${key}`, value);
    return true;
  } catch (err) {
    // Quota exceeded: drop the least critical payloads and retry once.
    try {
      localStorage.removeItem(`${NAMESPACE}.chat.history`);
      localStorage.setItem(`${NAMESPACE}.${key}`, value);
      return true;
    } catch {
      console.warn('[storage] write failed', err);
      return false;
    }
  }
}

export const storage = {
  available,

  get(key, fallback = null) {
    const raw = readRaw(key);
    if (raw == null) return fallback;
    const parsed = safeJsonParse(raw, undefined);
    return parsed === undefined ? fallback : parsed;
  },

  set(key, value) {
    return writeRaw(key, JSON.stringify(value));
  },

  remove(key) {
    if (!available) {
      memory.delete(key);
      return;
    }
    try {
      localStorage.removeItem(`${NAMESPACE}.${key}`);
    } catch { /* ignore */ }
  },

  keys() {
    if (!available) return [...memory.keys()];
    const prefix = `${NAMESPACE}.`;
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  },

  all() {
    return Object.fromEntries(this.keys().map((k) => [k, this.get(k)]));
  },

  clear() {
    for (const key of this.keys()) this.remove(key);
    memory.clear();
  },

  export() {
    return JSON.stringify({ version: VERSION, exportedAt: new Date().toISOString(), data: this.all() }, null, 2);
  },

  import(json) {
    const parsed = typeof json === 'string' ? safeJsonParse(json) : json;
    if (!parsed || typeof parsed.data !== 'object') throw new Error('Invalid HYDRA backup file');
    for (const [key, value] of Object.entries(parsed.data)) this.set(key, value);
    return Object.keys(parsed.data).length;
  },

  size() {
    if (!available) return 0;
    return this.keys().reduce((total, key) => total + (readRaw(key)?.length ?? 0), 0);
  },
};

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

/**
 * Observable, optionally persisted state container.
 */
export function createStore(initial, { key = null } = {}) {
  let state = { ...initial };
  if (key) {
    const saved = storage.get(key, null);
    if (isPlainObject(saved)) state = deepMerge(initial, saved);
  }

  const subscribers = new Set();

  const api = {
    get(keyName) {
      if (keyName === undefined) return state;
      return state[keyName];
    },

    set(patch, meta = {}) {
      const prev = state;
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      if (key) storage.set(key, state);
      for (const fn of subscribers) {
        try {
          fn(state, prev, meta);
        } catch (err) {
          console.error('[store] subscriber failed', err);
        }
      }
      return state;
    },

    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    reset() {
      state = { ...initial };
      if (key) storage.set(key, state);
      for (const fn of subscribers) fn(state, state, { reason: 'reset' });
      return state;
    },
  };

  return api;
}

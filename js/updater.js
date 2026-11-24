/**
 * HYDRA — version and update checks. There is no server: an optional
 * version.json next to index.html can advertise a newer build.
 */

import { bus } from './utils.js';
import { storage } from './storage.js';

export const VERSION = '2.6.2';
export const BUILD = '2026.11.30';
const CHECK_KEY = 'updater.lastCheck';
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

class Updater {
  constructor() {
    this.status = 'idle';
    this.available = null;
    this.lastCheck = storage.get(CHECK_KEY, 0);
  }

  async check({ silent = true } = {}) {
    this.status = 'checking';
    bus.emit('updater:state', this.status);
    try {
      const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('no manifest');
      const json = await res.json();
      const newer = compare(json.version, VERSION) > 0;
      this.available = newer ? json : null;
      this.status = newer ? 'available' : 'current';
      if (newer && !silent) {
        bus.emit('notify', { title: 'Update available', body: 'HYDRA ' + json.version + ' is ready.', tone: 'info' });
      }
    } catch {
      this.status = 'current';
    }
    this.lastCheck = Date.now();
    storage.set(CHECK_KEY, this.lastCheck);
    bus.emit('updater:state', this.status);
    return this.status;
  }

  maybeCheck() {
    if (Date.now() - this.lastCheck > CHECK_INTERVAL) this.check({ silent: true });
  }

  info() {
    return { version: VERSION, build: BUILD, status: this.status, available: this.available };
  }
}

function compare(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

export const updater = new Updater();

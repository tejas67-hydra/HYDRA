/**
 * HYDRA — client for the local desktop bridge (bridge/hydra_bridge.py).
 * The bridge is optional: when it is not running every call fails soft.
 */

import { bus } from './utils.js';
import { settings } from './settings.js';

const TIMEOUT = 7000;

class Bridge {
  constructor() {
    this.connected = false;
    this.info = null;
    this.log = [];
  }

  get url() {
    return String(settings.get('bridgeUrl') || 'http://127.0.0.1:8765').replace(/\/+$/, '');
  }

  get token() {
    return String(settings.get('bridgeToken') || '').trim();
  }

  record(line, tone = 'info') {
    this.log.unshift({ at: Date.now(), line, tone });
    if (this.log.length > 40) this.log.pop();
    bus.emit('bridge:log', this.log);
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const response = await fetch(this.url + path, {
        ...options,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-HYDRA-Token': this.token, ...(options.headers || {}) },
      });
      if (response.status === 401) throw new Error('token rejected');
      if (!response.ok) throw new Error('bridge ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async probe() {
    if (!this.token) {
      this.connected = false;
      this.info = null;
      bus.emit('bridge:state', { connected: false, reason: 'no-token' });
      return false;
    }
    try {
      const info = await this.request('/health');
      this.connected = Boolean(info.ok);
      this.info = info;
      bus.emit('bridge:state', { connected: this.connected, info });
      return this.connected;
    } catch (err) {
      this.connected = false;
      this.info = null;
      bus.emit('bridge:state', { connected: false, reason: String(err?.message ?? err) });
      return false;
    }
  }

  async run(action, args = {}, { quiet = false } = {}) {
    try {
      const result = await this.request('/run', {
        method: 'POST',
        body: JSON.stringify({ action, args }),
      });
      if (!result.ok) throw new Error(result.error || 'action failed');
      this.connected = true;
      this.record(action + ' → ok', 'success');
      if (!quiet) {
        bus.emit('notify', { title: 'Desktop', body: action + ' ran on your machine.', tone: 'success', timeout: 2400 });
      }
      return result;
    } catch (err) {
      this.connected = false;
      this.record(action + ' → ' + String(err?.message ?? err), 'error');
      if (!quiet) {
        bus.emit('notify', {
          title: 'Bridge offline',
          body: 'Start bridge/hydra_bridge.py and check the token in Device.',
          tone: 'warn',
        });
      }
      return { ok: false, error: String(err?.message ?? err) };
    }
  }
}

export const bridge = new Bridge();

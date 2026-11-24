/**
 * HYDRA — network awareness.
 */

import { $, bus, el } from './utils.js';

class InternetMonitor {
  constructor() {
    this.online = navigator.onLine;
    this.lastChange = Date.now();
    this.latency = null;
    this._bound = false;
  }

  init() {
    if (this._bound) return;
    this._bound = true;
    window.addEventListener('online', () => this.update(true));
    window.addEventListener('offline', () => this.update(false));
    this.update(navigator.onLine, { silent: true });
  }

  update(online, { silent = false } = {}) {
    const changed = this.online !== online;
    this.online = online;
    if (changed) this.lastChange = Date.now();

    const pill = $('#status-net');
    if (pill) {
      pill.classList.toggle('is-offline', !online);
      const label = pill.querySelector('span');
      if (label) label.textContent = online ? 'online' : 'offline';
      const use = pill.querySelector('use');
      if (use) use.setAttribute('href', online ? '#i-wifi' : '#i-wifi-off');
    }

    if (changed && !silent) {
      bus.emit('notify', {
        title: online ? 'Back online' : 'Connection lost',
        body: online ? 'Live services are reachable again.' : 'HYDRA keeps working offline.',
        tone: online ? 'success' : 'warn',
      });
      bus.emit('internet:change', online);
    }
  }

  isOnline() {
    return this.online;
  }

  /** Round-trip probe used by the system widget and developer mode. */
  async ping(timeout = 4000) {
    if (!this.online) {
      this.latency = null;
      return null;
    }
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      await fetch(`https://www.gstatic.com/generate_204?t=${Date.now()}`, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      this.latency = Math.round(performance.now() - started);
    } catch {
      this.latency = null;
    } finally {
      clearTimeout(timer);
    }
    return this.latency;
  }
}

export const internet = new InternetMonitor();

export function mountNetworkBadge() {
  internet.init();
  return internet;
}

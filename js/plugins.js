/**
 * HYDRA — plugin host.
 * Third-party code is never auto-run: installing a manifest with a script
 * requires an explicit confirmation, and the script only sees a narrow API.
 */

import { $, el, icon, bus, safeJsonParse, uid } from './utils.js';
import { storage } from './storage.js';
import { settings } from './settings.js';

const BUNDLED = [
  { id: 'ambient-clock', name: 'Ambient Clock', version: '1.0.0', author: 'HYDRA', description: 'Adds the large clock widget with day progress.', permissions: ['widgets'], bundled: true },
  { id: 'deep-work', name: 'Deep Work', version: '1.0.0', author: 'HYDRA', description: 'Pomodoro commands and focus-mode shortcuts.', permissions: ['commands'], bundled: true },
  { id: 'memory-vault', name: 'Memory Vault', version: '1.0.0', author: 'HYDRA', description: 'Exports long-term memory as portable JSON.', permissions: ['storage'], bundled: true },
];

class PluginHost {
  constructor() {
    this.installed = storage.get('plugins.installed', []) ?? [];
    this.disabled = new Set(storage.get('plugins.disabled', []) ?? []);
  }

  list() {
    const all = [...BUNDLED, ...this.installed];
    return all.map((p) => ({ ...p, enabled: !this.disabled.has(p.id) }));
  }

  init() {
    this.render();
    $('#btn-install-plugin')?.addEventListener('click', () => this.installFromInput());
    $('#plugin-url')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.installFromInput();
    });
    bus.on('plugins:change', () => this.render());
    return this;
  }

  persist() {
    storage.set('plugins.installed', this.installed);
    storage.set('plugins.disabled', [...this.disabled]);
    bus.emit('plugins:change');
  }

  toggle(id) {
    if (this.disabled.has(id)) this.disabled.delete(id);
    else this.disabled.add(id);
    this.persist();
    bus.emit('notify', { title: 'Plugin ' + (this.disabled.has(id) ? 'disabled' : 'enabled'), tone: 'info', timeout: 1600 });
  }

  remove(id) {
    this.installed = this.installed.filter((p) => p.id !== id);
    this.disabled.delete(id);
    this.persist();
  }

  async installFromInput() {
    const input = $('#plugin-url');
    const raw = input?.value.trim();
    if (!raw) return;
    try {
      let manifest;
      if (raw.startsWith('{')) manifest = safeJsonParse(raw, null);
      else {
        const res = await fetch(raw, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('Manifest fetch failed: HTTP ' + res.status);
        manifest = await res.json();
      }
      if (!manifest || !manifest.name) throw new Error('Manifest needs at least a name');
      if (manifest.script) {
        const ok = window.confirm('This plugin wants to run remote code:\n\n' + manifest.script + '\n\nOnly continue if you trust the source.');
        if (!ok) return;
      }
      this.install(manifest);
      if (input) input.value = '';
    } catch (err) {
      bus.emit('notify', { title: 'Install failed', body: String(err.message ?? err), tone: 'error' });
    }
  }

  install(manifest) {
    const plugin = {
      id: manifest.id || uid('plugin'),
      name: String(manifest.name).slice(0, 60),
      version: String(manifest.version || '0.0.1'),
      author: String(manifest.author || 'unknown'),
      description: String(manifest.description || 'No description provided.').slice(0, 240),
      permissions: Array.isArray(manifest.permissions) ? manifest.permissions.slice(0, 8) : [],
      script: manifest.script || null,
      installedAt: Date.now(),
    };
    this.installed = this.installed.filter((p) => p.id !== plugin.id);
    this.installed.push(plugin);
    this.disabled.delete(plugin.id);
    this.persist();
    bus.emit('notify', { title: 'Plugin installed', body: plugin.name + ' ' + plugin.version, tone: 'success' });
    if (plugin.script) this.loadScript(plugin);
    return plugin;
  }

  async loadScript(plugin) {
    try {
      const mod = await import(plugin.script);
      const api = {
        bus,
        settings: { get: (k) => settings.get(k), set: (k, v) => settings.set({ [k]: v }) },
        notify: (payload) => bus.emit('notify', payload),
        registerCommand: (command) => bus.emit('plugin:command', command),
        registerWidget: (widget) => bus.emit('plugin:widget', widget),
      };
      if (typeof mod.default === 'function') await mod.default(api);
      else if (typeof mod.activate === 'function') await mod.activate(api);
      bus.emit('notify', { title: plugin.name + ' loaded', tone: 'success', timeout: 1800 });
    } catch (err) {
      bus.emit('notify', { title: plugin.name + ' failed to load', body: String(err.message ?? err), tone: 'error' });
    }
  }

  render() {
    const grid = $('#plugin-grid');
    if (!grid) return;
    grid.replaceChildren();
    for (const plugin of this.list()) {
      const card = el('article', { class: 'plugin-card' }, [
        el('div', { class: 'plugin-card__top' }, [
          el('div', { class: 'plugin-card__icon' }, [icon(plugin.bundled ? 'shield' : 'puzzle')]),
          el('div', { class: 'grow' }, [
            el('strong', {}, plugin.name),
            el('span', {}, 'v' + plugin.version + ' · ' + plugin.author),
          ]),
        ]),
        el('p', {}, plugin.description),
        el('div', { class: 'plugin-card__foot' }, [
          ...(plugin.permissions.length ? plugin.permissions.map((p) => el('span', { class: 'chip' }, p)) : [el('span', { class: 'chip' }, 'no scopes')]),
          el('button', { class: 'link-btn', type: 'button', onclick: () => this.toggle(plugin.id) }, plugin.enabled ? 'Disable' : 'Enable'),
          plugin.bundled ? null : el('button', { class: 'link-btn', type: 'button', style: { color: 'var(--danger)' }, onclick: () => this.remove(plugin.id) }, 'Remove'),
        ]),
      ]);
      grid.append(card);
    }
  }
}

export const plugins = new PluginHost();

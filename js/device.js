/**
 * HYDRA — Device view: real PC actions through the optional local bridge.
 */

import { $, el, icon, bus } from './utils.js';
import { settings } from './settings.js';
import { bridge } from './bridge.js';
import { install } from './install.js';

const ACTIONS = [
  { action: 'screenshot', label: 'Screenshot', hint: 'Captures the whole screen' },
  { action: 'lock', label: 'Lock PC', hint: 'Locks the session' },
  { action: 'volume', label: 'Volume 50%', hint: 'Sets system volume', args: { level: 50 } },
  { action: 'open_path', label: 'Open Downloads', hint: 'Opens ~/Downloads', args: { path: '~/Downloads' } },
  { action: 'notify', label: 'Test notification', hint: 'Native toast', args: { title: 'HYDRA', body: 'Desktop bridge is live.' } },
];

class Device {
  init() {
    const root = $('#device-app');
    if (!root) return;
    root.innerHTML = `
      <div class="device">
        <section class="panel-card device__hero">
          <div>
            <h3>Put HYDRA everywhere</h3>
            <p class="faint">Install as an app, pin it to your taskbar or dock, or send it to your phone.</p>
          </div>
          <button class="btn btn--primary" type="button" id="dev-add">+ Add HYDRA</button>
        </section>

        <section class="panel-card device__status">
          <header>
            <h3><span class="device__dot" id="dev-dot"></span> Desktop bridge</h3>
            <span class="chip" id="dev-state">not connected</span>
          </header>
          <p class="faint" id="dev-info">Run the bridge on the machine you want HYDRA to control.</p>
          <div class="device__connect">
            <input class="input" id="dev-url" placeholder="http://127.0.0.1:8765" aria-label="Bridge URL">
            <input class="input" id="dev-token" placeholder="Bridge token" aria-label="Bridge token" type="password">
            <button class="btn btn--primary btn--sm" type="button" id="dev-connect">Connect</button>
          </div>
          <div class="device__help">
            <code>python3 bridge/hydra_bridge.py</code>
            <a class="link-btn" href="bridge/hydra_bridge.py" download>Download the script</a>
          </div>
        </section>

        <section class="panel-card">
          <header><h3>Actions</h3><span class="chip">runs on this computer</span></header>
          <div class="device__grid" id="dev-actions"></div>
          <div class="device__url">
            <input class="input" id="dev-open-url" placeholder="https://example.com" aria-label="URL to open">
            <button class="btn btn--ghost btn--sm" type="button" id="dev-open">Open URL</button>
          </div>
        </section>

        <section class="panel-card">
          <header><h3>Last screenshot</h3><button class="link-btn" type="button" id="dev-shot-clear">Clear</button></header>
          <div class="device__shot" id="dev-shot"><span class="faint">No screenshot yet.</span></div>
        </section>

        <section class="panel-card">
          <header><h3>Bridge log</h3><span class="chip" id="dev-log-count">0</span></header>
          <div class="device__log" id="dev-log"></div>
        </section>
      </div>`;

    const urlInput = $('#dev-url');
    const tokenInput = $('#dev-token');
    urlInput.value = settings.get('bridgeUrl') || 'http://127.0.0.1:8765';
    tokenInput.value = settings.get('bridgeToken') || '';

    $('#dev-connect')?.addEventListener('click', async () => {
      settings.set({ bridgeUrl: urlInput.value.trim() || 'http://127.0.0.1:8765', bridgeToken: tokenInput.value.trim() });
      const ok = await bridge.probe();
      bus.emit('notify', ok
        ? { title: 'Bridge connected', body: (bridge.info?.system || 'desktop') + ' · ' + (bridge.info?.host || ''), tone: 'success' }
        : { title: 'Bridge offline', body: 'Start the script and paste its token.', tone: 'warn' });
      this.renderState();
    });

    const grid = $('#dev-actions');
    for (const item of ACTIONS) {
      grid.append(el('button', {
        class: 'device__action', type: 'button',
        onclick: async () => {
          const result = await bridge.run(item.action, item.args || {});
          if (item.action === 'screenshot' && result?.ok && result.image) this.showShot(result);
        },
      }, [
        el('strong', {}, item.label),
        el('span', {}, item.hint),
      ]));
    }

    $('#dev-open')?.addEventListener('click', () => {
      const url = $('#dev-open-url').value.trim();
      if (url) bridge.run('open_url', { url });
    });

    $('#dev-shot-clear')?.addEventListener('click', () => {
      const shot = $('#dev-shot');
      if (shot) shot.innerHTML = '<span class="faint">No screenshot yet.</span>';
    });

    $('#dev-add')?.addEventListener('click', () => this.openAdd());
    bus.on('device:action', (payload) => this.runAction(payload?.action || 'screenshot', payload?.args || {}));
    bus.on('bridge:state', () => this.renderState());
    bus.on('bridge:log', () => this.renderLog());
    this.renderState();
    this.renderLog();
    bridge.probe();
  }

  openAdd() {
    const existing = $('#add-modal');
    if (existing) existing.remove();
    const url = location.href;
    const platform = install.platform();
    const names = { ios: 'iPhone / iPad', android: 'Android phone', windows: 'Windows laptop', mac: 'Mac', linux: 'Linux desktop' };
    const phone = install.isPhone();
    const steps = el('ol', { class: 'add__steps' });
    for (const line of install.steps()) steps.append(el('li', {}, line));

    const installBtn = el('button', { class: 'btn btn--primary btn--block', type: 'button' }, 'Install HYDRA');
    if (install.canInstall()) {
      installBtn.addEventListener('click', async () => {
        const ok = await install.prompt();
        installBtn.textContent = ok ? 'Installed' : 'Install cancelled';
        if (ok) installBtn.disabled = true;
      });
    } else {
      installBtn.textContent = phone ? 'Add to home screen' : 'Install from the browser';
      installBtn.addEventListener('click', () => {
        steps.scrollIntoView({ behavior: 'smooth', block: 'center' });
        steps.classList.add('is-flash');
        setTimeout(() => steps.classList.remove('is-flash'), 1200);
      });
    }

    const shortcutBtn = el('button', { class: 'btn btn--ghost btn--block', type: 'button' }, 'Download shortcut file');
    shortcutBtn.addEventListener('click', () => {
      const name = 'HYDRA';
      let content = '';
      let file = name + '.url';
      let type = 'text/plain';
      if (platform === 'windows') {
        content = '[InternetShortcut]\r\nURL=' + url + '\r\nIconIndex=0\r\n';
      } else if (platform === 'mac') {
        file = name + '.webloc';
        type = 'application/x-plist';
        content = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>' + url + '</string></dict></plist>';
      } else {
        file = name + '.desktop';
        type = 'application/x-desktop';
        content = '[Desktop Entry]\nType=Link\nName=' + name + '\nURL=' + url + '\nIcon=applications-internet\nTerminal=false\n';
      }
      const blob = new Blob([content], { type });
      const link = el('a', { href: URL.createObjectURL(blob), download: file });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      shortcutBtn.textContent = 'Saved to Downloads';
    });

    const copyBtn = el('button', { class: 'btn btn--ghost btn--block', type: 'button' }, 'Copy link');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = 'Copied';
      } catch {
        copyBtn.textContent = url;
      }
    });

    const actions = [installBtn, shortcutBtn, copyBtn];
    if (bridge.connected) {
      const saveBtn = el('button', { class: 'btn btn--ghost btn--block', type: 'button' }, 'Save shortcut to Desktop (bridge)');
      saveBtn.addEventListener('click', async () => {
        saveBtn.textContent = 'Creating…';
        const result = await bridge.run('create_shortcut', { url, name: 'HYDRA' }, { quiet: true });
        saveBtn.textContent = result.ok ? 'Saved to Desktop' : 'Bridge error';
        if (result.ok) bus.emit('notify', { title: 'Shortcut created', body: result.path, tone: 'success' });
      });
      actions.push(saveBtn);
    }

    const box = el('div', { class: 'add__box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Add HYDRA' }, [
      el('header', { class: 'add__head' }, [
        el('div', {}, [el('h3', {}, 'Add HYDRA'), el('p', { class: 'faint' }, names[platform] + (install.isStandalone() ? ' · already installed' : ''))]),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => modal.remove() }, [icon('close')]),
      ]),
      el('div', { class: 'add__body' }, [
        el('div', { class: 'add__actions' }, actions),
        el('p', { class: 'add__note faint' }, bridge.connected
          ? 'The bridge is connected, so it can write the shortcut straight to your Desktop.'
          : 'No bridge needed: the shortcut file downloads to your Downloads folder — drag it to the Desktop, taskbar or dock.'),
        el('h4', {}, phone ? 'Add to your phone' : 'Pin it'),
        steps,
        el('div', { class: 'add__qr' }, [
          el('img', { src: install.qr(url), alt: 'QR code for this HYDRA address', width: '190', height: '190' }),
          el('small', { class: 'faint' }, phone ? 'Scan with your phone camera to open HYDRA there.' : 'Scan to open HYDRA on a phone, then “Add to Home Screen”.'),
        ]),
        el('p', { class: 'add__note faint' }, 'Shortcuts point to ' + url + '. Pinning to the taskbar is done by the browser after install.'),
      ]),
    ]);

    const modal = el('div', { class: 'add-modal', id: 'add-modal' }, [
      el('div', { class: 'add-modal__backdrop', onclick: () => modal.remove() }),
      box,
    ]);
    document.body.append(modal);
  }

  async runAction(action, args = {}) {
    const result = await bridge.run(action, args);
    if (action === 'screenshot' && result?.ok && result.image) this.showShot(result);
    return result;
  }

  showShot(result) {
    const shot = $('#dev-shot');
    if (!shot) return;
    shot.replaceChildren(
      el('img', { src: 'data:image/png;base64,' + result.image, alt: 'Desktop screenshot' }),
      el('small', {}, result.path || ''),
    );
  }

  renderState() {
    const dot = $('#dev-dot');
    const state = $('#dev-state');
    const info = $('#dev-info');
    if (dot) dot.classList.toggle('is-live', bridge.connected);
    if (state) state.textContent = bridge.connected ? 'connected' : 'not connected';
    if (info) {
      info.textContent = bridge.connected
        ? `Linked to ${bridge.info?.host || 'this computer'} (${bridge.info?.system || 'desktop'}). ${bridge.info?.actions?.length || 0} actions available.`
        : 'Run the bridge on the machine you want HYDRA to control.';
    }
  }

  renderLog() {
    const log = $('#dev-log');
    const count = $('#dev-log-count');
    if (count) count.textContent = String(bridge.log.length);
    if (!log) return;
    log.replaceChildren();
    if (!bridge.log.length) {
      log.append(el('span', { class: 'faint' }, 'Nothing yet.'));
      return;
    }
    for (const entry of bridge.log.slice(0, 12)) {
      log.append(el('div', { class: 'device__log-row', dataset: { tone: entry.tone } }, [
        el('span', {}, new Date(entry.at).toLocaleTimeString()),
        el('strong', {}, entry.line),
      ]));
    }
  }
}

const device = new Device();

export function initDevice() {
  device.init();
  return device;
}

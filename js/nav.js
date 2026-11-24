/**
 * HYDRA — shared navigation bar.
 *
 * One bar for every app on the origin: ecosystem switch, search (apps and
 * commands), fullscreen, profile picture and Add to device. Written as a
 * classic script so it works beside the bundle and beside plain modules.
 */
(function () {
  if (window.__hydraNavLoaded) return;
  window.__hydraNavLoaded = true;

  const APPS = [
    { id: 'companion', name: 'Companion', href: 'index.html', tag: 'Voice, vision, presence' },
    { id: 'workspace', name: 'Workspace', href: 'emo.html', tag: 'Tasks, notes, shared memory' },
    { id: 'classic', name: 'Classic', href: 'fullhydra.html', tag: 'Tri-core console' },
  ];

  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  // The single-file build is the companion app with everything inlined.
  const page = file === 'hydra.html' ? 'index.html' : file;
  const PAGES = {
    'account.html': { id: 'account', name: 'Account', tag: 'Account settings' },
    'profile.html': { id: 'profile', name: 'Profile', tag: 'Name, photo, prompt' },
    'install.html': { id: 'install', name: 'Install', tag: 'Add to device' },
    'install-app.html': { id: 'install', name: 'Install', tag: 'Add to device' },
  };
  const current = APPS.find((app) => app.href.toLowerCase() === page) ||
    { ...(PAGES[page] || { id: 'account', name: 'Account', tag: 'Account settings' }), href: page };

  const api = () => String(window.HYDRA_API || localStorage.getItem('hydra.api') || '').replace(/\/+$/, '');
  const token = () => localStorage.getItem('hydra.token');
  const ppKey = 'hydra.pp';

  const CSS = `
  :root { --hydra-nav-h: 46px; }
  body.has-hydra-nav { padding-top: var(--hydra-nav-h) !important; }
  body.has-hydra-nav .device-statusbar { top: var(--hydra-nav-h) !important; }
  body.has-hydra-nav .fullscreen-btn { display: none !important; }
  body.has-hydra-nav .wakeword-btn { top: calc(var(--hydra-nav-h) + 52px) !important; }

  #hydra-nav {
    position: fixed; inset: 0 0 auto; z-index: 10050; height: var(--hydra-nav-h);
    display: flex; align-items: center; gap: 8px; padding: 0 12px;
    background: rgba(9, 5, 18, .86); border-bottom: 1px solid rgba(168, 85, 247, .28);
    backdrop-filter: blur(18px); color: #efe8ff;
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; font-size: 13px;
  }
  #hydra-nav *, #hydra-nav *::before, #hydra-nav *::after { box-sizing: border-box; }
  #hydra-nav a { color: inherit; text-decoration: none; }
  #hydra-nav .nav-brand {
    display: flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: .18em;
    font-size: 11px; text-transform: uppercase; color: #d8b4fe; padding-right: 6px; white-space: nowrap;
  }
  #hydra-nav .nav-brand b { color: #efe8ff; letter-spacing: .1em; }
  #hydra-nav .nav-sep { width: 1px; height: 22px; background: rgba(168, 85, 247, .25); flex: none; }
  #hydra-nav button.nav-btn {
    display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px;
    border-radius: 10px; border: 1px solid rgba(168, 85, 247, .3); background: rgba(168, 85, 247, .12);
    color: #efe8ff; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap;
  }
  #hydra-nav button.nav-btn:hover { background: rgba(168, 85, 247, .24); border-color: rgba(168, 85, 247, .6); }
  #hydra-nav button.nav-btn:focus-visible, #hydra-nav input:focus-visible { outline: 2px solid #a855f7; outline-offset: 2px; }
  #hydra-nav button.nav-btn.is-on { background: rgba(74, 222, 128, .16); border-color: rgba(74, 222, 128, .5); }
  #hydra-nav .nav-spacer { flex: 1; }
  #hydra-nav .nav-search { position: relative; flex: 1; max-width: 420px; min-width: 120px; }
  #hydra-nav .nav-search input {
    width: 100%; height: 32px; padding: 0 12px 0 32px; border-radius: 10px;
    border: 1px solid rgba(168, 85, 247, .28); background: rgba(6, 3, 12, .75);
    color: #efe8ff; font: inherit; font-size: 12.5px;
  }
  #hydra-nav .nav-search input::placeholder { color: #8f83ab; }
  #hydra-nav .nav-search svg { position: absolute; left: 10px; top: 9px; width: 14px; height: 14px; opacity: .6; }
  #hydra-nav .nav-results {
    position: absolute; top: 38px; left: 0; right: 0; max-height: min(60vh, 420px); overflow: auto;
    background: rgba(16, 9, 29, .98); border: 1px solid rgba(168, 85, 247, .3); border-radius: 12px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, .55); padding: 6px; display: none;
  }
  #hydra-nav .nav-results.on { display: block; }
  #hydra-nav .nav-result {
    display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 0;
    border-radius: 8px; background: none; color: #efe8ff; font: inherit; font-size: 12.5px;
    cursor: pointer; text-align: left;
  }
  #hydra-nav .nav-result small { margin-left: auto; color: #8f83ab; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
  #hydra-nav .nav-result.is-active, #hydra-nav .nav-result:hover { background: rgba(168, 85, 247, .22); }
  #hydra-nav .nav-result b { font-weight: 600; }
  #hydra-nav .nav-empty { padding: 12px; color: #8f83ab; font-size: 12px; }
  #hydra-nav .nav-icon { width: 14px; height: 14px; flex: none; }
  #hydra-nav .nav-pp {
    width: 32px; height: 32px; padding: 0; border-radius: 50%; overflow: hidden; flex: none;
    border: 1px solid rgba(168, 85, 247, .5); background: linear-gradient(140deg, #a855f7, #38bdf8);
    color: #0b0714; font-weight: 800; font-size: 12px; display: grid; place-items: center; cursor: pointer;
  }
  #hydra-nav .nav-pp img { width: 100%; height: 100%; object-fit: cover; display: block; }
  #hydra-nav .nav-who { font-size: 11px; color: #a99bc9; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #hydra-nav .nav-menu {
    position: absolute; top: 42px; right: 10px; width: 232px; padding: 6px; border-radius: 12px;
    background: rgba(16, 9, 29, .98); border: 1px solid rgba(168, 85, 247, .3);
    box-shadow: 0 24px 60px rgba(0, 0, 0, .55); display: none;
  }
  #hydra-nav .nav-menu.on { display: block; }
  #hydra-nav .nav-menu button, #hydra-nav .nav-menu a {
    display: block; width: 100%; padding: 9px 10px; border: 0; border-radius: 8px; background: none;
    color: #efe8ff; font: inherit; font-size: 12.5px; text-align: left; cursor: pointer;
  }
  #hydra-nav .nav-menu button:hover, #hydra-nav .nav-menu a:hover { background: rgba(168, 85, 247, .22); }
  #hydra-nav .nav-menu hr { border: 0; border-top: 1px solid rgba(168, 85, 247, .2); margin: 5px 4px; }
  #hydra-nav-switch { display: flex; align-items: center; flex: none; }
  #hydra-nav-switch .app-switch-btn {
    width: auto !important; max-width: 210px !important; margin: 0 !important; height: 32px !important;
    padding: 0 12px !important; font-size: 12px !important; line-height: 1 !important;
    background: rgba(168, 85, 247, .12); border-color: rgba(168, 85, 247, .3);
  }
  #hydra-nav-switch .app-switch-btn > * { font-size: 12px !important; line-height: 1 !important; }
  #hydra-nav-switch .app-switch-btn .name {
    flex: 1 1 auto !important; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  #hydra-nav-switch .app-switch-btn .dot {
    width: 6px !important; height: 6px !important; flex: none; border-radius: 50% !important;
  }
  #hydra-nav-switch .app-switch-btn .caret { display: none; }

  .hydra-modal {
    position: fixed; inset: 0; z-index: 10060; display: grid; place-items: center;
    background: rgba(4, 2, 10, .72); backdrop-filter: blur(12px); padding: 20px;
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; color: #efe8ff;
  }
  .hydra-modal__panel {
    width: min(460px, 94vw); padding: 22px; border-radius: 20px; background: rgba(18, 10, 32, .98);
    border: 1px solid rgba(168, 85, 247, .34); box-shadow: 0 40px 120px rgba(0, 0, 0, .6);
  }
  .hydra-modal h2 { margin: 0 0 6px; font-size: 13px; letter-spacing: .18em; text-transform: uppercase; color: #c4b5fd; }
  .hydra-modal p { margin: 0 0 14px; font-size: 12.5px; line-height: 1.6; color: #a99bc9; }
  .hydra-modal .choice {
    display: flex; gap: 12px; align-items: center; width: 100%; padding: 12px 14px; margin-bottom: 8px;
    border-radius: 12px; border: 1px solid rgba(168, 85, 247, .26); background: rgba(168, 85, 247, .1);
    color: #efe8ff; font: inherit; font-size: 13px; text-align: left; cursor: pointer;
  }
  .hydra-modal .choice:hover { background: rgba(168, 85, 247, .24); border-color: rgba(168, 85, 247, .6); }
  .hydra-modal .choice b { display: block; font-size: 13px; }
  .hydra-modal .choice span { font-size: 11px; color: #a99bc9; }
  .hydra-modal .choice i { font-style: normal; font-size: 18px; }
  .hydra-modal .close {
    margin-top: 6px; width: 100%; padding: 9px; border-radius: 10px; border: 1px solid rgba(168, 85, 247, .24);
    background: none; color: #a99bc9; font: inherit; font-size: 12px; cursor: pointer;
  }
  @media (max-width: 720px) {
    #hydra-nav .nav-brand b, #hydra-nav .nav-who, #hydra-nav .nav-label { display: none; }
    #hydra-nav .nav-search { max-width: none; }
  }
  `;

  const style = document.createElement('style');
  style.id = 'hydra-nav-style';
  style.textContent = CSS;
  document.head.append(style);

  const nav = document.createElement('nav');
  nav.id = 'hydra-nav';
  nav.setAttribute('aria-label', 'HYDRA navigation');
  nav.innerHTML = `
    <a class="nav-brand" href="index.html"><b>HYDRA</b><span>${current.name}</span></a>
    <span class="nav-sep" aria-hidden="true"></span>
    <div id="hydra-nav-switch"></div>
    <div class="nav-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="hydra-nav-search" type="search" placeholder="Search apps and actions…" autocomplete="off" aria-label="Search HYDRA" />
      <div class="nav-results" id="hydra-nav-results" role="listbox" aria-label="Search results"></div>
    </div>
    <span class="nav-spacer"></span>
    <button class="nav-btn" id="hydra-nav-install" type="button" title="Add HYDRA to your device">
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v11"/><path d="M8 10l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
      <span class="nav-label">Add to device</span>
    </button>
    <button class="nav-btn" id="hydra-nav-full" type="button" title="Fullscreen" aria-pressed="false">
      <svg class="nav-icon" id="hydra-nav-full-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 9V4h5"/><path d="M20 15v5h-5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/></svg>
      <span class="nav-label">Fullscreen</span>
    </button>
    <button class="nav-pp" id="hydra-nav-pp" type="button" title="Profile" aria-haspopup="menu">H</button>
    <input type="file" id="hydra-nav-pp-file" accept="image/*" hidden />
    <div class="nav-menu" id="hydra-nav-menu" role="menu"></div>
  `;

  const start = () => {
    document.body.classList.add('has-hydra-nav');
    document.body.prepend(nav);
    wire();
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });

  /* ------------------------------ account ------------------------------ */

  const me = { name: '', email: '', avatar: '' };
  const ppButton = () => document.getElementById('hydra-nav-pp');
  const menu = () => document.getElementById('hydra-nav-menu');

  function paintAvatar() {
    const button = ppButton();
    if (!button) return;
    const label = me.name || me.email || 'H';
    if (me.avatar) button.innerHTML = `<img src="${me.avatar}" alt="" />`;
    else button.textContent = label.trim().charAt(0).toUpperCase() || 'H';
    button.title = me.email ? `Profile — ${me.email}` : 'Profile';
  }

  async function loadAccount() {
    me.avatar = localStorage.getItem(ppKey) || '';
    const u = window.hydraUniversal;
    if (u) {
      try {
        await u.init();
        if (u.signedIn) {
          me.name = u.profile?.displayName || '';
          me.email = u.profile?.email || u.state?.account?.email || '';
          if (!me.avatar && u.profile?.avatar) me.avatar = u.profile.avatar;
        }
      } catch { /* the bar still works without the account */ }
    } else if (api() && token()) {
      try {
        const res = await fetch(api() + '/api/account', { headers: { Authorization: `Bearer ${token()}` } });
        if (res.ok) {
          const data = await res.json();
          me.name = data.user?.name || '';
          me.email = data.user?.email || '';
        }
      } catch { /* offline */ }
    }
    paintAvatar();
    paintMenu();
  }

  function paintMenu() {
    const box = menu();
    if (!box) return;
    box.innerHTML = '';
    const add = (label, run, href) => {
      const node = document.createElement(href ? 'a' : 'button');
      node.textContent = label;
      if (href) node.href = href;
      else {
        node.type = 'button';
        node.addEventListener('click', () => { box.classList.remove('on'); run(); });
      }
      box.append(node);
    };

    const head = document.createElement('div');
    head.style.cssText = 'padding:8px 10px 10px;font-size:11px;color:#8f83ab;letter-spacing:.08em';
    head.textContent = me.email ? me.email : 'Not signed in';
    box.append(head);

    add('Profile studio', null, 'profile.html');
    add('Change profile picture', () => pickPicture());
    add('Account settings', null, 'account.html');
    box.append(document.createElement('hr'));
    for (const app of APPS) {
      if (app.id === current.id) continue;
      add(`Open ${app.name}`, () => { location.href = app.href; });
    }
    box.append(document.createElement('hr'));
    add('Add to device', () => installDialog());
    if (me.email) add('Sign out', async () => {
      if (window.hydraUniversal) await window.hydraUniversal.signOut();
      localStorage.removeItem('hydra.token');
      location.reload();
    });
  }

  function pickPicture() {
    document.getElementById('hydra-nav-pp-file')?.click();
  }

  async function storePicture(file) {
    if (!file) return;
    const data = await shrink(file);
    if (!data) return;
    me.avatar = data;
    localStorage.setItem(ppKey, data);
    paintAvatar();
    const u = window.hydraUniversal;
    if (u) {
      try { await u.updateProfile({ avatar: data }); } catch { /* keep it local */ }
    }
    document.dispatchEvent(new CustomEvent('hydra:pp', { detail: { avatar: data } }));
    toast('Profile picture updated');
  }

  function shrink(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const size = 192;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const side = Math.min(image.width, image.height);
          ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        image.onerror = () => resolve(String(reader.result || ''));
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  /* ------------------------------ search ------------------------------- */

  function commands() {
    const list = [
      { label: 'Add to device', hint: 'Install', run: () => installDialog() },
      { label: 'Fullscreen', hint: 'View', run: toggleFullscreen },
      { label: 'Profile studio', hint: 'Name, photo, prompt', run: () => { location.href = 'profile.html'; } },
      { label: 'Account settings', hint: 'Account', run: () => { location.href = 'account.html'; } },
      { label: 'Change profile picture', hint: 'Account', run: pickPicture },
    ];
    for (const app of APPS) {
      const here = app.id === current.id;
      list.push({
        label: here ? `${app.name} (current app)` : `Open ${app.name}`,
        hint: here ? 'You are here' : 'App',
        run: () => { location.href = app.href; },
      });
    }
    const u = window.hydraUniversal;
    if (u?.signedIn) {
      for (const task of (u.list('tasks') || []).slice(0, 6)) {
        list.push({ label: task.text, hint: task.done ? 'Task · done' : 'Task', run: () => { location.href = 'emo.html'; } });
      }
      for (const note of (u.list('notes') || []).slice(0, 4)) {
        list.push({ label: note.text, hint: 'Note', run: () => { location.href = 'emo.html'; } });
      }
      for (const memory of (u.memories(20) || []).slice(0, 6)) {
        list.push({ label: memory.text, hint: 'Memory', run: () => { location.href = 'emo.html'; } });
      }
    }
    return list;
  }

  let active = 0;
  let shown = [];

  function runSearch() {
    const input = document.getElementById('hydra-nav-search');
    const box = document.getElementById('hydra-nav-results');
    if (!input || !box) return;
    const q = input.value.trim().toLowerCase();
    const all = commands();
    shown = q
      ? all.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(q)).slice(0, 12)
      : all.slice(0, 8);
    active = 0;
    box.replaceChildren();
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'nav-empty';
      empty.textContent = 'Nothing matched. Try “install”, “account” or an app name.';
      box.append(empty);
    } else {
      shown.forEach((item, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `nav-result${index === active ? ' is-active' : ''}`;
        row.setAttribute('role', 'option');
        const text = document.createElement('span');
        text.textContent = item.label;
        const hint = document.createElement('small');
        hint.textContent = item.hint;
        row.append(text, hint);
        row.addEventListener('mousedown', (event) => event.preventDefault());
        row.addEventListener('click', () => choose(index));
        box.append(row);
      });
    }
    box.classList.add('on');
  }

  function choose(index) {
    const item = shown[index];
    closeSearch();
    if (item) item.run();
  }

  function closeSearch() {
    const box = document.getElementById('hydra-nav-results');
    box?.classList.remove('on');
    const input = document.getElementById('hydra-nav-search');
    if (input) input.value = '';
  }

  /* ------------------------------ install ------------------------------ */

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    document.getElementById('hydra-nav-install')?.classList.add('is-on');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    document.getElementById('hydra-nav-install')?.classList.remove('is-on');
    toast('HYDRA installed');
  });

  function installDialog() {
    const modal = document.createElement('div');
    modal.className = 'hydra-modal';
    modal.innerHTML = `
      <div class="hydra-modal__panel" role="dialog" aria-modal="true" aria-label="Add HYDRA to your device">
        <h2>Add to device</h2>
        <p>Install just this app, or all three HYDRA apps at once. Installed apps open in their own window and work offline.</p>
        <button class="choice" type="button" data-choice="one">
          <i aria-hidden="true">◈</i>
          <span><b>${current.name} only</b><span>Installs ${current.name} — ${current.tag}</span></span>
        </button>
        <button class="choice" type="button" data-choice="all">
          <i aria-hidden="true">⬡</i>
          <span><b>All three apps</b><span>One HYDRA app with Companion, Workspace and Classic inside</span></span>
        </button>
        <button class="close" type="button">Close</button>
      </div>`;
    document.body.append(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    modal.querySelector('.close').addEventListener('click', close);
    modal.querySelector('[data-choice="one"]').addEventListener('click', async () => {
      close();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
        deferredPrompt = null;
        document.getElementById('hydra-nav-install')?.classList.remove('is-on');
        if (choice.outcome === 'accepted') toast(`${current.name} installed`);
        return;
      }
      stepsDialog(`Install ${current.name}`, installSteps());
    });
    modal.querySelector('[data-choice="all"]').addEventListener('click', () => {
      close();
      window.open('install.html?all=1', '_blank', 'noopener');
    });
  }

  function installSteps() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return ['Open this page in Safari.', 'Tap Share.', 'Choose “Add to Home Screen”.'];
    if (/Android/i.test(ua)) return ['Open the browser menu (⋮).', 'Tap “Install app” or “Add to Home screen”.', 'Confirm.'];
    if (/Macintosh/i.test(ua)) return ['Open the page in Chrome or Edge.', 'Click the install icon in the address bar.', 'Confirm “Install”.'];
    return ['Open the page in Chrome or Edge.', 'Click the install icon in the address bar (or ⋮ → Cast, save and share → Install page as app).', 'Confirm “Install”.'];
  }

  function stepsDialog(title, steps) {
    const modal = document.createElement('div');
    modal.className = 'hydra-modal';
    modal.innerHTML = `
      <div class="hydra-modal__panel" role="dialog" aria-modal="true">
        <h2>${title}</h2>
        <p>This browser did not offer an install prompt, so add it by hand:</p>
        <ol style="margin:0 0 14px 18px;padding:0;font-size:12.5px;line-height:1.9;color:#d8cff0">
          ${steps.map((step) => `<li>${step}</li>`).join('')}
        </ol>
        <button class="close" type="button">Got it</button>
      </div>`;
    document.body.append(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    modal.querySelector('.close').addEventListener('click', close);
  }

  /* ----------------------------- fullscreen ---------------------------- */

  function toggleFullscreen() {
    const root = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else (root.requestFullscreen || root.webkitRequestFullscreen || (() => {})).call(root).catch?.(() => {});
  }

  function paintFullscreen() {
    const button = document.getElementById('hydra-nav-full');
    if (!button) return;
    const on = Boolean(document.fullscreenElement);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    const icon = document.getElementById('hydra-nav-full-icon');
    if (icon) icon.innerHTML = on
      ? '<path d="M9 4v5H4"/><path d="M15 20v-5h5"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/>'
      : '<path d="M4 9V4h5"/><path d="M20 15v5h-5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/>';
  }

  /* ------------------------------- toast ------------------------------- */

  function toast(text) {
    let node = document.getElementById('hydra-nav-toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'hydra-nav-toast';
      node.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:10070;' +
        'padding:10px 16px;border-radius:12px;background:rgba(20,11,36,.97);border:1px solid rgba(168,85,247,.4);' +
        "color:#efe8ff;font:12.5px 'Inter','Segoe UI',system-ui,sans-serif;opacity:0;transition:.22s;pointer-events:none";
      document.body.append(node);
    }
    node.textContent = text;
    node.style.opacity = '1';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.style.opacity = '0'; }, 2400);
  }

  /* ------------------------------- wiring ------------------------------ */

  function wire() {
    const input = document.getElementById('hydra-nav-search');
    input?.addEventListener('input', runSearch);
    input?.addEventListener('focus', runSearch);
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { closeSearch(); input.blur(); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!shown.length) return;
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
        [...document.querySelectorAll('.nav-result')].forEach((row, index) => row.classList.toggle('is-active', index === active));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        choose(active);
      }
    });

    document.addEventListener('click', (event) => {
      if (!nav.contains(event.target)) { closeSearch(); menu()?.classList.remove('on'); }
    });
    document.addEventListener('keydown', (event) => {
      const typing = /input|textarea|select/i.test(event.target?.tagName || '');
      if (!typing && (event.key === '/' || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)))) {
        event.preventDefault();
        input?.focus();
        input?.select();
      }
    });

    document.getElementById('hydra-nav-pp')?.addEventListener('click', (event) => {
      event.stopPropagation();
      menu()?.classList.toggle('on');
    });
    document.getElementById('hydra-nav-full')?.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', paintFullscreen);
    document.getElementById('hydra-nav-install')?.addEventListener('click', installDialog);
    document.getElementById('hydra-nav-pp-file')?.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      storePicture(file);
      event.target.value = '';
    });

    window.addEventListener('hydra:session', loadAccount);
    document.addEventListener('hydra:pp', (event) => {
      if (event.detail?.avatar) { me.avatar = event.detail.avatar; paintAvatar(); }
    });
    window.addEventListener('storage', (event) => {
      if (event.key === ppKey) { me.avatar = event.newValue || ''; paintAvatar(); }
    });

    paintFullscreen();
    // universal.js may boot after this script, so retry once the page settles.
    loadAccount();
    window.addEventListener('load', loadAccount);
    setTimeout(loadAccount, 1500);

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  window.hydraNav = { install: installDialog, fullscreen: toggleFullscreen, toast, refreshAccount: loadAccount };
})();

/**
 * App switcher — one HYDRA account across every app on this origin.
 * Injects its own markup so the shell markup stays untouched.
 */

import universal from './universal.js';

const STYLE = `
.app-switch-btn {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px;
  margin: 0 0 10px; border-radius: 12px; border: 1px solid rgba(168,85,247,.22);
  background: rgba(168,85,247,.1); color: var(--text, #efe8ff); font: inherit;
  font-size: 12px; letter-spacing: .04em; cursor: pointer;
}
.app-switch-btn:hover { border-color: rgba(168,85,247,.5); background: rgba(168,85,247,.18); }
.app-switch-btn .dot { width: 6px; height: 6px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 10px #4ade80; }
.app-switch-btn .name { flex: 1; text-align: left; opacity: .9; }
.app-switch-btn .caret { opacity: .5; }
.app-switch-btn--floating {
  position: fixed; right: 16px; bottom: 16px; width: auto; margin: 0; z-index: 8900;
  padding: 9px 15px; border-radius: 999px; backdrop-filter: blur(18px);
  background: rgba(20,11,36,.9); box-shadow: 0 12px 30px rgba(0,0,0,.5);
  border-color: rgba(168,85,247,.45);
}

.app-switch {
  position: fixed; inset: 0; z-index: 9000; display: grid; place-items: center;
  background: rgba(5,2,12,.62); backdrop-filter: blur(18px); opacity: 0; pointer-events: none;
  transition: opacity .28s ease;
}
.app-switch.on { opacity: 1; pointer-events: auto; }
.app-switch__panel {
  width: min(560px, 92vw); padding: 22px; border-radius: 24px;
  background: rgba(20,11,36,.92); border: 1px solid rgba(168,85,247,.28);
  box-shadow: 0 40px 120px rgba(0,0,0,.6); transform: translateY(14px) scale(.97);
  transition: transform .32s cubic-bezier(.2,.9,.2,1);
}
.app-switch.on .app-switch__panel { transform: none; }
.app-switch h2 { margin: 0 0 4px; font-size: 15px; letter-spacing: .16em; text-transform: uppercase; color: #c4b5fd; }
.app-switch p.sub { margin: 0 0 18px; font-size: 12px; color: #a99bc9; }
.app-switch__apps { display: grid; gap: 10px; }
.app-card {
  display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 16px;
  border: 1px solid rgba(168,85,247,.2); background: rgba(12,6,24,.7); cursor: pointer;
  color: #efe8ff; font: inherit; text-align: left; width: 100%;
}
.app-card:hover { border-color: rgba(168,85,247,.55); background: rgba(168,85,247,.14); }
.app-card.is-current { border-color: rgba(74,222,128,.45); }
.app-card__badge {
  width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex: none;
  background: linear-gradient(140deg, #a855f7, #38bdf8); color: #0b0714; font-weight: 800;
}
.app-card__name { font-weight: 600; font-size: 14px; }
.app-card__tag { font-size: 11px; color: #a99bc9; }
.app-card__state { margin-left: auto; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: #4ade80; }
.app-switch__account {
  margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(168,85,247,.18);
  display: flex; align-items: center; gap: 12px; font-size: 12px; color: #a99bc9;
}
.app-switch__account strong { color: #efe8ff; font-weight: 600; }
.app-switch__actions { margin-left: auto; display: flex; gap: 8px; }
.app-switch__actions button {
  padding: 7px 12px; border-radius: 10px; font: inherit; font-size: 11px; cursor: pointer;
  background: rgba(168,85,247,.14); color: #efe8ff; border: 1px solid rgba(168,85,247,.28);
}
.app-switch__actions button:hover { background: rgba(168,85,247,.26); }
.app-switch__security {
  margin-top: 12px; display: grid; gap: 8px; font-size: 12px; color: #a99bc9;
}
.app-switch__security .line { display: flex; align-items: center; gap: 10px; }
.app-switch__security .line strong { color: #efe8ff; font-weight: 600; }
.app-switch__security .line button {
  margin-left: auto; padding: 6px 10px; border-radius: 9px; font: inherit; font-size: 11px;
  cursor: pointer; background: rgba(168,85,247,.14); color: #efe8ff; border: 1px solid rgba(168,85,247,.28);
}
.app-switch__security input {
  width: 96px; padding: 6px 9px; border-radius: 9px; border: 1px solid rgba(168,85,247,.3);
  background: rgba(8,4,16,.8); color: #efe8ff; font: inherit; font-size: 12px; letter-spacing: .18em;
}
.app-switch__secret {
  font-family: ui-monospace, monospace; font-size: 11px; color: #d8b4fe; word-break: break-all;
  background: rgba(168,85,247,.1); padding: 8px 10px; border-radius: 9px;
}
.app-switch__close {
  position: absolute; top: 14px; right: 16px; background: none; border: 0; color: #a99bc9;
  font-size: 20px; cursor: pointer; line-height: 1;
}
.switch-veil {
  position: fixed; inset: 0; z-index: 9500; background: #05020c; opacity: 0; pointer-events: none;
  transition: opacity .4s ease; backdrop-filter: blur(20px);
}
.switch-veil.on { opacity: 1; pointer-events: auto; }
`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

export async function initAppSwitcher({ mount = null, currentApp = 'companion' } = {}) {
  await universal.init();

  if (!document.getElementById('app-switch-style')) {
    const style = document.createElement('style');
    style.id = 'app-switch-style';
    style.textContent = STYLE;
    document.head.append(style);
  }

  const button = el('button', { class: 'app-switch-btn', type: 'button', title: 'Switch HYDRA app' },
    el('span', { class: 'dot' }),
    el('span', { class: 'name' }, 'HYDRA ecosystem'),
    el('span', { class: 'caret' }, '⌄'));

  const target = mount || document.querySelector('.sidebar__brand, .sidebar__top, .sidebar');
  if (target) target.append(button);
  else {
    button.classList.add('app-switch-btn--floating');
    document.body.append(button);
  }

  const overlay = el('div', { class: 'app-switch', id: 'app-switch' });
  const veil = el('div', { class: 'switch-veil', id: 'switch-veil' });
  const panel = el('div', { class: 'app-switch__panel' });
  overlay.append(panel);
  document.body.append(overlay, veil);

  const close = () => overlay.classList.remove('on');

  function render() {
    const profile = universal.profile;
    const name = profile.displayName || profile.email || 'Guest';
    panel.replaceChildren(
      el('button', { class: 'app-switch__close', type: 'button', onclick: close }, '×'),
      el('h2', {}, 'HYDRA apps'),
      el('p', { class: 'sub' }, universal.signedIn
        ? `Signed in as ${name} — one account, one memory.`
        : 'Sign in to Companion to unlock every HYDRA app.'),
      el('div', { class: 'app-switch__apps' },
        ...universal.apps.map((app) => el('button', {
          class: `app-card ${app.id === currentApp ? 'is-current' : ''}`,
          type: 'button',
          onclick: () => go(app),
        },
        el('span', { class: 'app-card__badge' }, app.glyph || app.name.split(' ').pop()[0]),
        el('span', {},
          el('div', { class: 'app-card__name' }, app.name),
          el('div', { class: 'app-card__tag' }, app.tagline)),
        el('span', { class: 'app-card__state' }, app.id === currentApp ? 'open' : 'switch'))),
      ),
      securityPanel(),
      el('div', { class: 'app-switch__account' },
        el('span', {}, 'Account ', el('strong', {}, name),
          universal.signedIn ? ` · ${universal.devices().length} device(s)` : ' · not signed in'),
        el('div', { class: 'app-switch__actions' },
          el('button', {
            type: 'button',
            onclick: async () => {
              await universal.signOut();
              location.reload();
            },
          }, 'Sign out'),
          el('button', {
            type: 'button',
            onclick: async () => {
              await universal.signOut({ all: true });
              location.reload();
            },
          }, 'Sign out everywhere'))),
    );
  }


  function securityPanel() {
    if (!universal.signedIn) return el('div');
    const security = universal.state?.security || {};
    const twoFactor = security.twoFactor || {};
    const rows = [
      el('div', { class: 'line' },
        el('span', {}, 'Two-factor ', el('strong', {}, twoFactor.enabled ? 'on' : 'off')),
        el('button', {
          type: 'button',
          onclick: async (event) => {
            if (twoFactor.enabled) {
              await universal.disable2FA();
              render();
              return;
            }
            const { secret, uri } = await universal.enable2FA();
            const holder = event.target.closest('.line').parentElement;
            const box = el('div', {},
              el('div', { class: 'app-switch__secret' }, `Secret: ${secret}`),
              el('div', { class: 'line', style: 'margin-top:8px' },
                el('input', { id: 'totp-code', placeholder: '123456', maxlength: '6', inputmode: 'numeric' }),
                el('button', {
                  type: 'button',
                  onclick: async () => {
                    try {
                      await universal.confirm2FA(document.getElementById('totp-code').value);
                      box.remove();
                      render();
                    } catch (err) {
                      box.querySelector('.app-switch__secret').textContent = err.message;
                    }
                  },
                }, 'Confirm'),
                el('a', {
                  href: uri, style: 'font-size:11px;color:#c4b5fd;margin-left:auto',
                }, 'Add to authenticator')),
            );
            holder.append(box);
          },
        }, twoFactor.enabled ? 'Disable' : 'Enable')),
      el('div', { class: 'line' },
        el('span', {}, 'Biometric ', el('strong', {}, security.webauthn ? 'registered' : 'not set')),
        el('button', {
          type: 'button',
          onclick: async () => {
            try {
              await universal.enableBiometric();
              render();
            } catch (err) {
              alert(err.message);
            }
          },
        }, security.webauthn ? 'Re-register' : 'Register')),
      el('div', { class: 'line' },
        el('span', {}, 'Devices ', el('strong', {}, String(universal.devices().length))),
        el('span', { style: 'margin-left:auto;font-size:11px' },
          universal.devices().map((d) => d.name).slice(0, 3).join(', '))),
      el('div', { class: 'line app-switch__api' },
        el('span', {}, 'API ', el('strong', {}, universal.apiUrl ? 'connected' : 'offline')),
        el('input', {
          class: 'app-switch__api-input',
          id: 'api-url',
          placeholder: 'https://your-api.onrender.com',
          value: universal.apiUrl || '',
        }),
        el('button', { class: 'app-switch__btn', id: 'api-save', type: 'button' }, 'Save')),
    ];
    return el('div', { class: 'app-switch__security' }, ...rows);
  }

  function go(app) {
    if (app.id === currentApp) {
      close();
      return;
    }
    veil.classList.add('on');
    setTimeout(() => { location.href = app.url; }, 380);
  }

  button.addEventListener('click', () => {
    render();
    overlay.classList.add('on');
  });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  overlay.addEventListener('click', (event) => {
    if (event.target.id !== 'api-save') return;
    const value = (overlay.querySelector('#api-url')?.value || '').trim().replace(/\/+$/, '');
    if (value) localStorage.setItem('hydra.api', value);
    else localStorage.removeItem('hydra.api');
    location.reload();
  });

  universal.on('session', render);
  universal.on('profile', render);

  /* Theme travels with the account, both directions. */
  const root = document.documentElement;
  if (universal.profile.theme && root.dataset.theme !== universal.profile.theme) {
    root.dataset.theme = universal.profile.theme;
  }
  let themeTimer = 0;
  new MutationObserver(() => {
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => {
      if (root.dataset.theme && root.dataset.theme !== universal.profile.theme) {
        universal.updateProfile({ theme: root.dataset.theme }).catch(() => {});
      }
    }, 500);
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  universal.on('profile', () => {
    if (universal.profile.theme && root.dataset.theme !== universal.profile.theme) {
      root.dataset.theme = universal.profile.theme;
    }
  });

  return { open: () => { render(); overlay.classList.add('on'); }, close };
}

export default initAppSwitcher;

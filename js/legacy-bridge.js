/**
 * Bridge for the original HYDRA app (fullhydra.html).
 *
 * That app expects a Node backend at /api for login, profile and session
 * checks. GitHub Pages has no backend, which is why its login never worked
 * there. This bridge answers those endpoints from the universal account, so
 * one HYDRA sign-in covers every app, and adds the shared app switcher.
 */

import universal from './universal.js';
import { initAppSwitcher } from './app-switcher.js';

const realFetch = window.fetch.bind(window);
const apiBase = () => String(window.HYDRA_API || localStorage.getItem('hydra.api') || '').replace(/\/+$/, '');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function profilePayload() {
  const user = universal.user || {};
  const profile = universal.profile;
  return {
    id: user.id,
    email: profile.email,
    name: profile.displayName || 'Operator',
    preferred_display_name: profile.displayName || 'Operator',
    plan: profile.plan || 'free',
    role: 'Operator',
    theme: profile.theme,
    language: profile.language,
    timezone: profile.timezone,
    avatar: profile.avatar,
    created_at: user.createdAt,
    last_login: Date.now(),
    login_count: universal.sessions().length,
    devices: universal.devices().length,
    memories: universal.memories(20).length,
  };
}

function bodyOf(init) {
  try {
    return init?.body ? JSON.parse(init.body) : {};
  } catch {
    return {};
  }
}

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';

  // Their voice path calls the local Python relay; send it to the API instead.
  if (url.includes('127.0.0.1:4174/speak') && apiBase()) {
    let text = '';
    try {
      text = JSON.parse(init.body || '{}').text || '';
    } catch {
      text = '';
    }
    return realFetch(`${apiBase()}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  }

  if (url.includes('/api/') && apiBase()) {
    try {
      const token = localStorage.getItem('hydra.token');
      const headers = { ...(init.headers || {}) };
      if (token) headers.Authorization = `Bearer ${token}`;
      const proxied = await realFetch(apiBase() + url.replace(/^.*?\/api\//, '/api/'), {
        credentials: 'include',
        ...init,
        headers,
      });
      if (proxied.ok && /\/(login|register)$/.test(url)) {
        proxied.clone().json()
          .then((data) => { if (data?.token) localStorage.setItem('hydra.token', data.token); })
          .catch(() => {});
      }
      // 401 means the server does not know this account (or has no session for
      // it), and 502/504 mean the host is asleep: both use the on-device account.
      const fallback = proxied.status === 401 || [502, 504].includes(proxied.status);
      if (!fallback) return proxied;
    } catch {
      /* offline or API asleep: fall back to the on-device account */
    }
  }

  if (!url.includes('/api/')) return realFetch(input, init);

  const path = '/' + url.split('/api/')[1].split('?')[0];
  const method = String(init.method || 'GET').toUpperCase();
  const body = bodyOf(init);

  if (path === '/login' && method === 'POST') {
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    if (!email || !password) return json({ error: 'Email and password are required' }, 400);
    await universal.init();
    try {
      if (!universal.signedIn && !universal.state.security.password) {
        await universal.signUp({ email, password, name: email.split('@')[0] });
      } else if (!universal.signedIn) {
        await universal.signIn({ email, password });
      }
      return json({ user: profilePayload() });
    } catch (err) {
      return json({ error: err.message }, 401);
    }
  }

  if (path === '/register' && method === 'POST') {
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    try {
      await universal.init();
      await universal.signUp({ email, password, name: body.name || email.split('@')[0] });
      return json({ user: profilePayload() });
    } catch (err) {
      return json({ error: err.message }, 400);
    }
  }

  if (path === '/logout') {
    await universal.init();
    await universal.signOut();
    localStorage.removeItem('hydra.auth.user');
    return json({ ok: true });
  }

  if (path === '/profile/full' || path === '/profile' || path === '/preferences') {
    await universal.init();
    if (!universal.signedIn) return json({ error: 'Not signed in' }, 401);
    return json(profilePayload());
  }

  if (path === '/recommendations') return json([]);
  if (path === '/notifications') return json({ items: universal.notifications(10) });
  if (path === '/last' || path === '/analytics') return json({});
  if (path === '/heartbeat' || path === '/log' || path === '/verify') return json({ ok: true });

  return json({ error: 'Not available without the HYDRA Cloud backend' }, 503);
};

function hideLoginModal() {
  const modal = document.getElementById('mainGoogleLogin');
  if (!modal) return;
  modal.classList.remove('is-visible');
  modal.setAttribute('aria-hidden', 'true');
}

function paintSignedIn() {
  const profile = universal.profile;
  const name = profile.displayName || profile.email || 'Operator';
  localStorage.setItem('hydra.auth.user', JSON.stringify({
    id: universal.user?.id,
    email: profile.email,
    name,
    plan: profile.plan,
    provider: universal.user?.provider,
    role: 'Operator',
  }));
  hideLoginModal();
  try {
    window.checkAuthState?.();
    window.updateAuthUI?.();
  } catch (err) {
    console.warn('[bridge]', err);
  }
  const greeting = document.getElementById('greetingTitle');
  const subtitle = document.getElementById('greetingSubtitle');
  if (greeting) greeting.textContent = `Welcome back, ${name}`;
  if (subtitle) subtitle.textContent = 'Signed in with your HYDRA account — every app, one memory.';
}

/** Their app keeps facts as one newline-separated string. */
function mergeMemory() {
  const shared = universal.memories(60).map((m) => m.text).filter(Boolean);
  if (!shared.length) return;
  const key = 'hydra.memory';
  const existing = localStorage.getItem(key) || '';
  const known = new Set(existing.split('\n').map((line) => line.trim().toLowerCase()).filter(Boolean));
  const fresh = shared.filter((text) => !known.has(text.trim().toLowerCase()));
  if (!fresh.length) return;
  localStorage.setItem(key, [existing.trim(), ...fresh].filter(Boolean).join('\n'));
}

async function boot() {
  await universal.init();
  if (universal.signedIn) paintSignedIn();
  mergeMemory();
  initAppSwitcher({ currentApp: 'legacy' }).catch((err) => console.error('[switcher]', err));

  universal.on('session', () => {
    if (universal.signedIn) paintSignedIn();
    else localStorage.removeItem('hydra.auth.user');
  });
  universal.on('memory', mergeMemory);

  // Their boot sequence shows the login modal a moment after load.
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (universal.signedIn) paintSignedIn();
    if (tries > 12) clearInterval(timer);
  }, 500);
}

boot();

/**
 * HYDRA universal account — one identity, one memory, every HYDRA app.
 *
 * The account document lives in localStorage, encrypted with a non-extractable
 * AES-GCM key held in IndexedDB. Every open app mirrors it through a
 * BroadcastChannel, so Companion and Workspace stay in lockstep on one origin.
 * A backend is optional: set window.HYDRA_API to a service implementing the
 * contract in docs/universal-api.md and writes are queued and flushed to it.
 */

const LS_KEY = 'hydra.universal.v1';
const CHANNEL_NAME = 'hydra.universal.v1';
const DEVICE_KEY = 'hydra.universal.device';
const DB_NAME = 'hydra-universal';
const DB_STORE = 'keys';

export const APPS = [
  { id: 'companion', name: 'HYDRA Companion', tagline: 'Robot AI', url: 'index.html' },
  { id: 'workspace', name: 'HYDRA Workspace', tagline: 'AI productivity', url: 'emo.html' },
];

const listeners = new Map();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
let state = null;
let cryptoKey = null;
const queue = [];

const now = () => Date.now();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${now()}-${Math.random().toString(16).slice(2)}`);

function blank() {
  return {
    v: 1,
    rev: 0,
    account: null,
    profile: {
      displayName: '', username: '', email: '', avatar: '', theme: 'purple', accent: '#a855f7',
      language: 'en', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      voice: 'aurora', personality: 'warm', plan: 'free',
    },
    security: { password: null, twoFactor: { enabled: false, secret: '' }, webauthn: null },
    devices: [],
    sessions: [],
    memory: [],
    notifications: [],
    data: { tasks: [], notes: [], files: [], achievements: [], bookmarks: [], projects: [] },
    relationship: { level: 1, points: 0 },
    authEpoch: 0,
    updatedAt: now(),
  };
}

/* ------------------------------- storage ------------------------------- */

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getKey() {
  if (cryptoKey) return cryptoKey;
  if (!globalThis.crypto?.subtle) return null;
  try {
    let key = await idbGet('aes');
    if (!key) {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await idbSet('aes', key);
    }
    cryptoKey = key;
    return key;
  } catch {
    return null;
  }
}

const b64 = {
  encode: (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))),
  decode: (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
};

async function persist() {
  if (!state) return;
  state.updatedAt = now();
  state.rev += 1;
  const key = await getKey();
  try {
    if (key) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = new TextEncoder().encode(JSON.stringify(state));
      const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
      localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, enc: true, iv: b64.encode(iv), data: b64.encode(cipher) }));
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, enc: false, data: state }));
    }
  } catch {
    localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, enc: false, data: state }));
  }
}

async function readStored() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!envelope.enc) return envelope.data || null;
  const key = await getKey();
  if (!key) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64.decode(envelope.iv) }, key, b64.decode(envelope.data),
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

/* ------------------------------- events -------------------------------- */

function emit(type, detail) {
  for (const cb of listeners.get(type) || []) {
    try {
      cb(detail);
    } catch (err) {
      console.error('[universal]', err);
    }
  }
}

function broadcast(type) {
  channel?.postMessage({ type, rev: state?.rev ?? 0 });
  emit(type, state);
}

async function reload(origin = 'remote') {
  const next = await readStored();
  if (!next) return;
  const previous = state;
  state = { ...blank(), ...next };
  if (previous && previous.authEpoch !== state.authEpoch) emit('session', state);
  if (previous && JSON.stringify(previous.profile) !== JSON.stringify(state.profile)) emit('profile', state);
  emit('change', { state, origin });
}

channel?.addEventListener('message', (event) => {
  if (!event.data?.type) return;
  reload('broadcast').then(() => emit(event.data.type, state));
});

window.addEventListener('storage', (event) => {
  if (event.key === LS_KEY) reload('storage').then(() => emit('change', { state, origin: 'storage' }));
});

window.addEventListener('online', () => flushQueue());

/* ------------------------------ identity ------------------------------- */

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = uid();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS device';
  if (/Android/.test(ua)) return 'Android device';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Browser';
}

async function pbkdf2(password, saltB64) {
  const salt = b64.decode(saltB64);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, 256);
  return b64.encode(bits);
}

function registerDevice() {
  const id = deviceId();
  state.devices = (state.devices || []).filter((d) => d.id !== id);
  state.devices.unshift({ id, name: deviceName(), ua: navigator.userAgent.slice(0, 120), lastSeen: now(), current: true });
  state.devices = state.devices.slice(0, 12).map((d) => ({ ...d, current: d.id === id }));
}

function openSession(provider) {
  const id = uid();
  state.sessions = (state.sessions || []).filter((s) => s.deviceId !== deviceId());
  state.sessions.unshift({ id, deviceId: deviceId(), provider, startedAt: now(), current: true });
  state.sessions = state.sessions.slice(0, 12).map((s) => ({ ...s, current: s.deviceId === deviceId() }));
}

function applyAccount({ email, name, provider, avatar = '' }) {
  const existing = state.account;
  state.account = {
    id: existing?.id || uid(),
    email,
    provider,
    createdAt: existing?.createdAt || now(),
    plan: state.profile.plan || 'free',
  };
  state.profile.email = email || state.profile.email;
  state.profile.displayName = name || state.profile.displayName || (email || '').split('@')[0];
  state.profile.username = state.profile.username || ((email || '').split('@')[0] || 'operator');
  state.profile.avatar = avatar || state.profile.avatar;
  registerDevice();
  openSession(provider);
}

export const universal = {
  async init() {
    state = (await readStored()) || blank();
    if (!state.account) registerDevice();
    emit('change', { state, origin: 'init' });
    return state;
  },

  get state() { return state; },
  get signedIn() { return Boolean(state?.account); },
  get user() { return state?.account || null; },
  get profile() { return state?.profile || blank().profile; },

  apps: APPS,
  registerApp(app) { if (!APPS.some((a) => a.id === app.id)) APPS.push(app); },

  on(type, cb) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(cb);
    return () => listeners.get(type)?.delete(cb);
  },

  async signUp({ email, password, name }) {
    await this.init();
    if (!email || !password) throw new Error('Email and password are required');
    if (state.security.password && state.account?.email === email) throw new Error('That account already exists — sign in instead');
    const salt = b64.encode(crypto.getRandomValues(new Uint8Array(16)));
    state.security.password = { salt, hash: await pbkdf2(password, salt), at: now() };
    applyAccount({ email, name, provider: 'password' });
    state.memory.push({ id: uid(), text: `Account created for ${name || email}`, tags: ['account'], at: now(), source: 'system' });
    await persist();
    broadcast('session');
    return state.account;
  },

  async signIn({ email, password }) {
    await this.init();
    if (!email || !password) throw new Error('Email and password are required');
    if (!state.security.password) throw new Error('No account on this device yet — create one first');
    if (state.account?.email && state.account.email !== email) throw new Error('That is not the account saved on this device');
    const hash = await pbkdf2(password, state.security.password.salt);
    if (hash !== state.security.password.hash) throw new Error('Wrong password');
    applyAccount({ email, name: state.profile.displayName, provider: 'password' });
    await persist();
    broadcast('session');
    return state.account;
  },

  /** OAuth providers need a real backend; fail honestly instead of faking a login. */
  async signInWithProvider(provider) {
    await this.init();
    if (!window.HYDRA_API) {
      throw new Error(`${provider} sign-in needs the HYDRA Cloud backend. Guest and email sign-in work offline.`);
    }
    window.location.href = `${window.HYDRA_API}/auth/${provider}?redirect=${encodeURIComponent(location.href)}`;
    return null;
  },

  async guest(name = 'Guest') {
    await this.init();
    applyAccount({ email: `guest-${deviceId().slice(0, 8)}@local`, name, provider: 'guest' });
    await persist();
    broadcast('session');
    return state.account;
  },

  /** Turns an existing local login into the universal identity. */
  async adopt(name) {
    await this.init();
    if (state.account) return state.account;
    return this.guest(name || 'Operator');
  },

  async updateProfile(patch = {}) {
    await this.init();
    state.profile = { ...state.profile, ...patch };
    await persist();
    broadcast('profile');
    return state.profile;
  },

  async signOut({ all = false } = {}) {
    await this.init();
    const id = deviceId();
    if (all) {
      state.authEpoch += 1;
      state.sessions = [];
      state.devices = [];
      state.account = null;
    } else {
      state.sessions = (state.sessions || []).filter((s) => s.deviceId !== id);
      state.account = null;
    }
    await persist();
    broadcast('session');
  },

  /* ------------------------------ memory ------------------------------- */

  async remember(text, { tags = [], source = 'chat' } = {}) {
    await this.init();
    const clean = String(text || '').trim();
    if (!clean) return null;
    const existing = state.memory.find((m) => m.text.toLowerCase() === clean.toLowerCase());
    if (existing) return existing;
    const entry = { id: uid(), text: clean, tags, at: now(), source };
    state.memory.unshift(entry);
    state.memory = state.memory.slice(0, 800);
    state.relationship.points += 1;
    state.relationship.level = Math.min(99, 1 + Math.floor(state.relationship.points / 25));
    await persist();
    broadcast('memory');
    return entry;
  },

  async forget(id) {
    await this.init();
    state.memory = state.memory.filter((m) => m.id !== id);
    await persist();
    broadcast('memory');
  },

  async forgetText(text) {
    await this.init();
    const key = String(text || '').trim().toLowerCase();
    state.memory = state.memory.filter((m) => m.text.toLowerCase() !== key);
    await persist();
    broadcast('memory');
  },

  memories(limit = 100) { return (state?.memory || []).slice(0, limit); },

  recall(query, limit = 5) {
    const words = String(query || '').toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    return (state?.memory || [])
      .map((m) => ({ ...m, score: words.reduce((n, w) => n + (m.text.toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score || b.at - a.at)
      .slice(0, limit);
  },

  /* --------------------------- notifications --------------------------- */

  async notify({ title, body = '', app = 'companion', tone = 'info' }) {
    await this.init();
    const entry = { id: uid(), title, body, app, tone, at: now(), read: false };
    state.notifications.unshift(entry);
    state.notifications = state.notifications.slice(0, 60);
    await persist();
    broadcast('notify');
    return entry;
  },

  notifications(limit = 30) { return (state?.notifications || []).slice(0, limit); },

  async markRead(id) {
    await this.init();
    const item = state.notifications.find((n) => n.id === id);
    if (item) item.read = true;
    await persist();
    broadcast('notify');
  },

  /* ------------------------------- data -------------------------------- */

  async put(coll, item) {
    await this.init();
    const bucket = state.data[coll] || (state.data[coll] = []);
    const entry = { id: item.id || uid(), at: item.at || now(), ...item };
    const index = bucket.findIndex((row) => row.id === entry.id);
    if (index >= 0) bucket[index] = { ...bucket[index], ...entry, updatedAt: now() };
    else bucket.unshift(entry);
    state.data[coll] = bucket.slice(0, 400);
    await persist();
    broadcast('data');
    return entry;
  },

  async remove(coll, id) {
    await this.init();
    state.data[coll] = (state.data[coll] || []).filter((row) => row.id !== id);
    await persist();
    broadcast('data');
  },

  list(coll) { return (state?.data?.[coll] || []).slice(); },

  /* ------------------------------ security ----------------------------- */

  async enable2FA() {
    await this.init();
    const secret = base32(crypto.getRandomValues(new Uint8Array(20)));
    state.security.twoFactor = { enabled: false, secret, pending: true };
    await persist();
    broadcast('security');
    const label = encodeURIComponent(state.profile.email || 'user');
    return { secret, uri: `otpauth://totp/HYDRA:${label}?secret=${secret}&issuer=HYDRA&algorithm=SHA1&digits=6&period=30` };
  },

  async confirm2FA(code) {
    await this.init();
    const { secret } = state.security.twoFactor;
    if (!secret) throw new Error('Start two-factor setup first');
    if (!(await totpValid(secret, code))) throw new Error('That code is not valid — check your authenticator clock');
    state.security.twoFactor = { enabled: true, secret, at: now() };
    await persist();
    broadcast('security');
    return true;
  },

  async disable2FA() {
    await this.init();
    state.security.twoFactor = { enabled: false, secret: '' };
    await persist();
    broadcast('security');
  },

  async enableBiometric() {
    await this.init();
    if (!window.PublicKeyCredential) throw new Error('This browser has no platform authenticator');
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'HYDRA', id: location.hostname },
        user: {
          id: new TextEncoder().encode(state.account?.id || deviceId()),
          name: state.profile.email || 'hydra@local',
          displayName: state.profile.displayName || 'HYDRA operator',
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
      },
    });
    state.security.webauthn = { id: b64.encode(credential.rawId), at: now() };
    await persist();
    broadcast('security');
    return true;
  },

  async signInBiometric() {
    await this.init();
    const stored = state.security.webauthn;
    if (!stored) throw new Error('No biometric key registered on this device');
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: b64.decode(stored.id), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    applyAccount({ email: state.profile.email, name: state.profile.displayName, provider: 'biometric' });
    await persist();
    broadcast('session');
    return state.account;
  },

  devices() { return state?.devices || []; },
  sessions() { return state?.sessions || []; },

  /* ------------------------------- sync -------------------------------- */

  /** Queues a write for the optional backend; local state is always saved. */
  async push(op) {
    if (!window.HYDRA_API) return;
    const job = { ...op, at: now(), device: deviceId() };
    if (!navigator.onLine) {
      queue.push(job);
      localStorage.setItem('hydra.universal.queue', JSON.stringify(queue));
      return;
    }
    try {
      await fetch(`${window.HYDRA_API}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: state?.account?.id, ops: [job] }),
      });
    } catch {
      queue.push(job);
      localStorage.setItem('hydra.universal.queue', JSON.stringify(queue));
    }
  },
};

async function flushQueue() {
  if (!window.HYDRA_API || !queue.length) return;
  const jobs = queue.splice(0);
  try {
    await fetch(`${window.HYDRA_API}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: universal.user?.id, ops: jobs }),
    });
  } catch {
    queue.unshift(...jobs);
  }
  localStorage.setItem('hydra.universal.queue', JSON.stringify(queue));
}

/* -------------------------------- TOTP --------------------------------- */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = B32.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function totp(secret, counter) {
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setUint32(4, counter);
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buffer));
  const offset = hmac[hmac.length - 1] & 15;
  const code = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1000000).padStart(6, '0');
}

async function totpValid(secret, code) {
  const step = Math.floor(now() / 30000);
  for (const drift of [-1, 0, 1]) {
    if ((await totp(secret, step + drift)) === String(code).trim()) return true;
  }
  return false;
}

export default universal;

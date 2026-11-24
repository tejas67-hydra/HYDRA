/**
 * HYDRA — local sign-in. Accounts never leave this device.
 */

import { $, bus } from './utils.js';
import { storage } from './storage.js';
import universal from './universal.js';

const ACCOUNT = 'auth.account';
const SESSION = 'auth.session';

async function hash(text) {
  const value = String(text);
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode('hydra:' + value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let out = 0;
  for (let i = 0; i < value.length; i += 1) out = (out * 31 + value.charCodeAt(i)) >>> 0;
  return 'f' + out.toString(16);
}

class Auth {
  init() {
    const overlay = $('#auth');
    if (!overlay) return;
    this.overlay = overlay;
    this.note = $('#auth-note');
    this.form = $('#auth-form');
    this.user = $('#auth-user');
    this.pass = $('#auth-pass');
    this.eye = $('#auth-eye');

    if (storage.get(SESSION)) this.hide();
    else this.show();

    this.form?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.signIn().catch((err) => this.fail(err));
    });

    $('#auth-create')?.addEventListener('click', () => this.create().catch((err) => this.fail(err)));
    $('#auth-guest')?.addEventListener('click', () => this.enter('Guest', 'Continuing as guest'));
    $('#auth-recover')?.addEventListener('click', async () => {
      await universal.init();
      if (universal.apiUrl) {
        location.href = 'account.html';
        return;
      }
      this.say('No HYDRA API is configured, so the account only exists on this device. Create it with the same name to set a new password.', 'ok');
    });
    this.eye?.addEventListener('click', () => {
      const shown = this.pass.type === 'text';
      this.pass.type = shown ? 'password' : 'text';
      this.eye.classList.toggle('is-on', !shown);
      this.eye.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
    });
  }

  fail(err) {
    this.say('Sign-in error: ' + (err?.message || err), 'error');
    this.shake();
    console.error('[auth]', err);
  }

  say(text, tone = '') {
    if (!this.note) return;
    this.note.textContent = text;
    this.note.dataset.tone = tone;
  }

  async signIn() {
    const name = this.user.value.trim();
    const pass = this.pass.value;
    if (!name || !pass) {
      this.say('Enter a username and a password.', 'error');
      this.shake();
      return;
    }
    await universal.init();
    if (universal.apiUrl) {
      const email = name.includes('@') ? name : `${name}@hydra.local`;
      try {
        await universal.signIn({ email, password: pass });
        this.enter(name, 'Signed in');
        return;
      } catch (err) {
        const offline = /fetch|network|load failed|unavailable/i.test(err?.message || '');
        if (!offline) {
          this.say(err?.message || 'Sign-in failed.', 'error');
          this.shake();
          return;
        }
      }
    }
    const account = storage.get(ACCOUNT);
    if (!account) {
      await this.create(name, pass, 'Local account created');
      return;
    }
    const digest = await hash(pass);
    if (account.user.toLowerCase() !== name.toLowerCase() || account.hash !== digest) {
      this.say('That username or password does not match.', 'error');
      this.shake();
      return;
    }
    this.enter(account.user);
  }

  shake() {
    const card = this.overlay.querySelector('.auth__card');
    if (!card) return;
    card.classList.remove('is-shake');
    void card.offsetWidth;
    card.classList.add('is-shake');
  }

  async create(nameArg, passArg, message = 'Account created') {
    const name = (nameArg ?? this.user.value).trim() || 'Operator';
    const pass = passArg ?? this.pass.value;
    if (pass.length < 4) {
      this.say('Choose a password with at least 4 characters.', 'error');
      this.pass.focus();
      this.shake();
      return;
    }
    await universal.init();
    if (universal.apiUrl && !name.includes('@local')) {
      const email = name.includes('@') ? name : `${name}@hydra.local`;
      try {
        await universal.signUp({ email, password: pass, name });
      } catch (err) {
        const offline = /fetch|network|load failed|unavailable/i.test(err?.message || '');
        if (!offline) {
          this.say(err?.message || 'Could not create the account.', 'error');
          this.shake();
          return;
        }
      }
    }
    const account = { user: name, hash: await hash(pass), at: Date.now() };
    storage.set(ACCOUNT, account);
    this.enter(name, message);
  }

  enter(user, message = 'Signed in') {
    storage.set(SESSION, { user, at: Date.now(), guest: user === 'Guest' });
    this.hide();
    this.pass.value = '';
    bus.emit('notify', { title: message, body: 'Welcome back, ' + user + '.', tone: 'success' });
    bus.emit('auth:change', { user });
  }

  signOut() {
    storage.remove(SESSION);
    this.show();
    this.say('Signed out. Your data stays on this device.', 'ok');
    bus.emit('auth:change', { user: null });
  }

  show() {
    this.overlay.hidden = false;
    document.body.classList.add('auth-locked');
    setTimeout(() => this.user?.focus(), 350);
  }

  hide() {
    this.overlay.hidden = true;
    document.body.classList.remove('auth-locked');
  }

  current() {
    return storage.get(SESSION)?.user || storage.get(ACCOUNT)?.user || null;
  }
}

export const auth = new Auth();

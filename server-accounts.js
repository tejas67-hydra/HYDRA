/**
 * Account features that need a server: email verification, password reset,
 * OAuth sign-in and cross-device sync.
 *
 * Email delivery uses Resend when RESEND_API_KEY is set. Without it the links
 * are logged and, when ALLOW_DEV_LINKS is not "false", returned to the caller so
 * the flow stays testable on a deployment with no mail provider.
 */
const crypto = require('crypto');

const TOKEN_TTL_MS = { verify: 24 * 60 * 60 * 1000, reset: 60 * 60 * 1000 };

module.exports = function registerAccountRoutes({ app, db, bcrypt, requireAuth, APP_URL }) {
  const appUrl = (APP_URL || 'https://tejas67-hydra.github.io/HYDRA').replace(/\/+$/, '');
  const devLinks = String(process.env.ALLOW_DEV_LINKS ?? 'true') !== 'false';
  const mailFrom = process.env.MAIL_FROM || 'HYDRA <onboarding@resend.dev>';

  const run = (sql, params = []) =>
    new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
  const get = (sql, params = []) =>
    new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
  const all = (sql, params = []) =>
    new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires INTEGER NOT NULL,
      used INTEGER DEFAULT 0,
      created INTEGER NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS oauth_accounts (
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created INTEGER NOT NULL,
      PRIMARY KEY (provider, provider_id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS api_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created INTEGER NOT NULL,
      expires INTEGER NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS sync_docs (
      user_id TEXT PRIMARY KEY,
      rev INTEGER DEFAULT 0,
      updated INTEGER NOT NULL,
      data TEXT NOT NULL
    )`);
    db.run('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0', () => {});
    db.run('ALTER TABLE users ADD COLUMN avatar TEXT', () => {});
  });

  const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

  async function issueToken(userId, kind) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + TOKEN_TTL_MS[kind];
    await run('INSERT INTO auth_tokens (user_id, kind, token_hash, expires, created) VALUES (?,?,?,?,?)',
      [userId, kind, hashToken(token), expires, Date.now()]);
    return token;
  }

  async function consumeToken(token, kind) {
    if (!token) return null;
    const row = await get('SELECT * FROM auth_tokens WHERE token_hash = ? AND kind = ? AND used = 0',
      [hashToken(String(token)), kind]);
    if (!row || row.expires < Date.now()) return null;
    await run('UPDATE auth_tokens SET used = 1 WHERE id = ?', [row.id]);
    return row;
  }

  async function sendMail(to, subject, text) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.log(`[mail:dev] to=${to} subject="${subject}"\n${text}`);
      return { delivered: false, reason: 'RESEND_API_KEY not set' };
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: mailFrom, to, subject, text }),
      });
      if (!res.ok) return { delivered: false, reason: `Resend ${res.status}` };
      return { delivered: true };
    } catch (err) {
      return { delivered: false, reason: err.message };
    }
  }

  const API_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;

  async function issueApiToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    await run('INSERT INTO api_tokens (token_hash, user_id, created, expires) VALUES (?,?,?,?)',
      [hashToken(token), userId, Date.now(), Date.now() + API_TOKEN_TTL]);
    return token;
  }

  async function resolveToken(token) {
    const row = await get('SELECT * FROM api_tokens WHERE token_hash = ?', [hashToken(String(token))]);
    if (!row || row.expires < Date.now()) return null;
    return row.user_id;
  }

  app.locals.issueApiToken = issueApiToken;
  app.locals.resolveToken = resolveToken;

  app.post('/api/auth/token', async (req, res) => {
    try {
      const row = await consumeToken(req.body && req.body.code, 'oauth');
      if (!row) return res.status(400).json({ error: 'That sign-in link is invalid or has expired.' });
      const user = await get('SELECT * FROM users WHERE user_id = ?', [row.user_id]);
      if (!user) return res.status(404).json({ error: 'Account not found' });
      const token = await issueApiToken(user.user_id);
      res.json({ token, user: publicUser(user) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
  const publicUser = (user) => ({
    userId: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar || '',
    emailVerified: user.email_verified === 1,
  });

  function startSession(req, user) {
    req.session.userId = user.user_id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;
    req.session.isAdmin = user.role === 'Administrator';
    req.session.adminVerified = user.admin_verified === 1;
  }

  const providers = {
    github: {
      label: 'GitHub',
      clientId: () => process.env.GITHUB_CLIENT_ID,
      clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
      authorize: (state, redirect) =>
        `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&scope=read:user%20user:email&state=${state}`,
      async exchange(code, redirect) {
        const res = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: redirect,
          }),
        });
        const body = await res.json();
        return body.access_token || null;
      },
      async profile(token) {
        const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
        const user = await (await fetch('https://api.github.com/user', { headers })).json();
        let email = user.email;
        if (!email) {
          const list = await (await fetch('https://api.github.com/user/emails', { headers })).json();
          email = Array.isArray(list) ? (list.find((e) => e.primary && e.verified) || list[0] || {}).email : null;
        }
        if (!email) throw new Error('GitHub did not return a verified email');
        return { id: String(user.id), email, name: user.name || user.login, avatar: user.avatar_url || '' };
      },
    },
    google: {
      label: 'Google',
      clientId: () => process.env.GOOGLE_CLIENT_ID,
      clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
      authorize: (state, redirect) =>
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=openid%20email%20profile&state=${state}&access_type=online`,
      async exchange(code, redirect) {
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirect,
          }),
        });
        const body = await res.json();
        return body.access_token || null;
      },
      async profile(token) {
        const user = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${token}` },
        })).json();
        if (!user.email) throw new Error('Google did not return an email');
        return { id: String(user.sub), email: user.email, name: user.name || user.email.split('@')[0], avatar: user.picture || '' };
      },
    },
  };

  app.get('/api/auth/providers', (req, res) => {
    res.json({
      providers: Object.fromEntries(Object.entries(providers).map(([key, p]) => [key, {
        label: p.label,
        configured: Boolean(p.clientId() && p.clientSecret()),
      }])),
      email: { devLinks },
    });
  });

  app.post('/api/auth/verify-email/request', requireAuth, async (req, res) => {
    try {
      const user = await get('SELECT * FROM users WHERE user_id = ?', [req.session.userId]);
      if (!user) return res.status(404).json({ error: 'Account not found' });
      if (user.email_verified === 1) return res.json({ sent: true, verified: true });
      const token = await issueToken(user.user_id, 'verify');
      const link = `${baseUrl(req)}/api/auth/verify-email?token=${token}&next=${encodeURIComponent(appUrl + '/account.html')}`;
      const mail = await sendMail(user.email, 'Verify your HYDRA email',
        `Confirm this address for your HYDRA account:\n\n${link}\n\nThe link expires in 24 hours.`);
      res.json({ sent: true, verified: false, ...mail, devLink: devLinks ? link : undefined });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/auth/verify-email', async (req, res) => {
    const next = String(req.query.next || `${appUrl}/account.html`);
    try {
      const row = await consumeToken(req.query.token, 'verify');
      if (!row) return res.redirect(`${next}?verified=0`);
      await run('UPDATE users SET email_verified = 1 WHERE user_id = ?', [row.user_id]);
      res.redirect(`${next}?verified=1`);
    } catch (err) {
      res.redirect(`${next}?verified=0`);
    }
  });

  app.post('/api/auth/password/reset', async (req, res) => {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });
    try {
      const user = await get('SELECT * FROM users WHERE lower(email) = ?', [email]);
      if (!user) return res.json({ sent: true });
      const token = await issueToken(user.user_id, 'reset');
      const link = `${appUrl}/account.html?reset=${token}`;
      const mail = await sendMail(user.email, 'Reset your HYDRA password',
        `Set a new password for your HYDRA account:\n\n${link}\n\nThe link expires in 1 hour.`);
      res.json({ sent: true, ...mail, devLink: devLinks ? link : undefined });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/password/confirm', async (req, res) => {
    const { token, password } = req.body || {};
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    try {
      const row = await consumeToken(token, 'reset');
      if (!row) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
      const hash = await bcrypt.hash(String(password), 12);
      await run('UPDATE users SET password = ? WHERE user_id = ?', [hash, row.user_id]);
      await run('UPDATE auth_tokens SET used = 1 WHERE user_id = ? AND kind = ?', [row.user_id, 'reset']);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/auth/:provider/start', (req, res) => {
    const provider = providers[req.params.provider];
    if (!provider) return res.status(404).json({ error: 'Unknown provider' });
    if (!provider.clientId() || !provider.clientSecret()) {
      return res.status(503).json({ error: `${req.params.provider} sign-in needs ${req.params.provider.toUpperCase()}_CLIENT_ID and _CLIENT_SECRET on the server` });
    }
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    req.session.oauthNext = String(req.query.next || '').slice(0, 300);
    const redirect = `${baseUrl(req)}/api/auth/${req.params.provider}/callback`;
    res.redirect(provider.authorize(state, redirect));
  });

  app.get('/api/auth/:provider/callback', async (req, res) => {
    const provider = providers[req.params.provider];
    const next = req.session.oauthNext || `${appUrl}/account.html`;
    const fail = (reason) => res.redirect(`${next}?linked=0&reason=${encodeURIComponent(reason)}`);
    if (!provider) return fail('unknown provider');
    if (!req.query.code || req.query.state !== req.session.oauthState) return fail('state mismatch');
    delete req.session.oauthState;
    try {
      const redirect = `${baseUrl(req)}/api/auth/${req.params.provider}/callback`;
      const token = await provider.exchange(String(req.query.code), redirect);
      if (!token) return fail('token exchange failed');
      const profile = await provider.profile(token);
      const email = String(profile.email).toLowerCase();
      let link = await get('SELECT * FROM oauth_accounts WHERE provider = ? AND provider_id = ?',
        [req.params.provider, profile.id]);
      let user = link ? await get('SELECT * FROM users WHERE user_id = ?', [link.user_id]) : null;
      if (!user) {
        user = await get('SELECT * FROM users WHERE lower(email) = ?', [email]);
        if (!user) {
          const userId = `HYDRA-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
          const password = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
          const created = new Date().toISOString();
          await run(
            `INSERT INTO users (user_id, name, email, password, role, account_created, first_login, last_login, login_count, email_verified)
             VALUES (?,?,?,?,'User',?,?,?,1,1)`,
            [userId, profile.name || email.split('@')[0], email, password, created, created, created]
          );
          user = await get('SELECT * FROM users WHERE user_id = ?', [userId]);
        } else if (user.email_verified !== 1) {
          await run('UPDATE users SET email_verified = 1 WHERE user_id = ?', [user.user_id]);
        }
        await run('INSERT OR REPLACE INTO oauth_accounts (provider, provider_id, user_id, created) VALUES (?,?,?,?)',
          [req.params.provider, profile.id, user.user_id, Date.now()]);
      }
      startSession(req, user);
      const code = await issueToken(user.user_id, 'oauth');
      const separator = next.includes('?') ? '&' : '?';
      res.redirect(`${next}${separator}linked=${req.params.provider}&authCode=${code}`);
    } catch (err) {
      fail(err.message);
    }
  });

  app.get('/api/account', requireAuth, async (req, res) => {
    try {
      const user = await get('SELECT * FROM users WHERE user_id = ?', [req.session.userId]);
      if (!user) return res.status(404).json({ error: 'Account not found' });
      const links = await all('SELECT provider FROM oauth_accounts WHERE user_id = ?', [user.user_id]);
      const doc = await get('SELECT rev, updated FROM sync_docs WHERE user_id = ?', [user.user_id]);
      res.json({
        user: publicUser(user),
        linked: links.map((l) => l.provider),
        available: Object.fromEntries(Object.entries(providers).map(([key, p]) => [key, Boolean(p.clientId() && p.clientSecret())])),
        sync: doc ? { rev: doc.rev, updated: doc.updated } : { rev: 0, updated: null },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/account', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const user = await get('SELECT * FROM users WHERE user_id = ?', [req.session.userId]);
      if (!user) return res.status(404).json({ error: 'Account not found' });

      if (body.name !== undefined) {
        const name = String(body.name).trim().replace(/\s+/g, ' ');
        if (name.length < 2 || name.length > 60) {
          return res.status(400).json({ error: 'Name must be between 2 and 60 characters.' });
        }
        await run('UPDATE users SET name = ? WHERE user_id = ?', [name, user.user_id]);
        req.session.userName = name;
      }

      if (body.avatar !== undefined) {
        const avatar = String(body.avatar || '');
        if (avatar && !/^data:image\/(png|jpeg|webp);base64,/.test(avatar)) {
          return res.status(400).json({ error: 'Avatar must be a PNG, JPEG or WebP data URL.' });
        }
        if (avatar.length > 400_000) {
          return res.status(413).json({ error: 'That picture is too large. Try a smaller one.' });
        }
        await run('UPDATE users SET avatar = ? WHERE user_id = ?', [avatar, user.user_id]);
      }

      const fresh = await get('SELECT * FROM users WHERE user_id = ?', [user.user_id]);
      res.json({ user: publicUser(fresh) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const imageBudget = new Map();

  app.post('/api/image', requireAuth, async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim().slice(0, 800);
    if (prompt.length < 3) return res.status(400).json({ error: 'Describe the picture first.' });

    const hour = Math.floor(Date.now() / 3_600_000);
    const slot = `${req.session.userId}:${hour}`;
    const used = imageBudget.get(slot) || 0;
    if (used >= 20) return res.status(429).json({ error: 'Image limit reached for this hour. Try again later.' });
    imageBudget.set(slot, used + 1);

    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
    if (!openaiKey && !geminiKey) {
      return res.status(503).json({ error: 'This HYDRA server has no shared image key configured.' });
    }

    try {
      if (openaiKey) {
        for (const model of ['gpt-image-1-mini', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-2']) {
          const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
            body: JSON.stringify({ model, prompt, size: '1024x1024', quality: 'low', n: 1 }),
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok) {
            const b64 = data.data?.[0]?.b64_json;
            if (b64) return res.json({ image: `data:image/png;base64,${b64}`, engine: `openai:${model}` });
            const url = data.data?.[0]?.url;
            if (url) return res.json({ image: url, engine: `openai:${model}` });
            return res.status(502).json({ error: 'OpenAI returned no picture.' });
          }
          const message = data.error?.message || `OpenAI answered ${response.status}.`;
          if (!/model/i.test(message) && response.status !== 404) {
            return res.status(response.status === 429 ? 429 : 502).json({ error: message });
          }
        }
        return res.status(502).json({ error: 'OpenAI rejected every image model on this account.' });
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (response.status === 429) {
        return res.status(429).json({ error: 'Gemini has no image quota left right now.' });
      }
      if (!response.ok) {
        return res.status(502).json({ error: data.error?.message || `Gemini answered ${response.status}.` });
      }
      const parts = data.candidates?.[0]?.content?.parts || [];
      const inline = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
      const raw = inline?.inlineData?.data || inline?.inline_data?.data;
      if (!raw) return res.status(502).json({ error: 'Gemini returned no picture.' });
      return res.json({ image: `data:image/png;base64,${raw}`, engine: 'gemini' });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.get('/api/sync', requireAuth, async (req, res) => {
    try {
      const doc = await get('SELECT * FROM sync_docs WHERE user_id = ?', [req.session.userId]);
      if (!doc) return res.json({ rev: 0, updated: null, data: null });
      res.json({ rev: doc.rev, updated: doc.updated, data: JSON.parse(doc.data) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sync', requireAuth, async (req, res) => {
    const { baseRev, data } = req.body || {};
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data object is required' });
    const encoded = JSON.stringify(data);
    if (encoded.length > 2_000_000) return res.status(413).json({ error: 'State is too large to sync' });
    try {
      const doc = await get('SELECT * FROM sync_docs WHERE user_id = ?', [req.session.userId]);
      const currentRev = doc ? doc.rev : 0;
      if (doc && Number(baseRev) < currentRev) {
        return res.status(409).json({ rev: currentRev, updated: doc.updated, data: JSON.parse(doc.data) });
      }
      const rev = currentRev + 1;
      const updated = Date.now();
      await run(
        `INSERT INTO sync_docs (user_id, rev, updated, data) VALUES (?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET rev = excluded.rev, updated = excluded.updated, data = excluded.data`,
        [req.session.userId, rev, updated, encoded]
      );
      res.json({ rev, updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};

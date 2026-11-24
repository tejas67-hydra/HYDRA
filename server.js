const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://tejas67-hydra.github.io,http://localhost:12000,http://localhost:3000')
  .split(',').map((value) => value.trim()).filter(Boolean);
app.set('trust proxy', 1);
const ADMIN_CODE = '0909';
const SALT_ROUNDS = 12;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600
});
app.use('/api/', limiter);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'hydra-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files
app.use(express.static(__dirname));

// SQLite Database setup
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const dbPath = path.join(DATA_DIR, 'hydra.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'User',
      account_status TEXT DEFAULT 'Active',
      admin_verified INTEGER DEFAULT 0,
      account_created TEXT NOT NULL,
      first_login TEXT,
      last_login TEXT,
      login_count INTEGER DEFAULT 0,
      total_hours_used REAL DEFAULT 0,
      total_minutes_used REAL DEFAULT 0,
      total_seconds_used REAL DEFAULT 0,
      total_lifetime_usage REAL DEFAULT 0,
      current_session_time REAL DEFAULT 0,
      hydra_version TEXT DEFAULT '1.0.0',
      browser TEXT,
      operating_system TEXT,
      device_name TEXT,
      ip_address TEXT,
      country TEXT,
      theme TEXT DEFAULT 'dark',
      last_activity TEXT,
      export_count INTEGER DEFAULT 0,
      notes TEXT,
      preferred_display_name TEXT,
      language TEXT DEFAULT 'en',
      favorite_feature TEXT,
      last_page_visited TEXT,
      last_command_used TEXT,
      login_streak INTEGER DEFAULT 0,
      streak_start_date TEXT,
      last_streak_date TEXT,
      voice_enabled INTEGER DEFAULT 0,
      notification_settings TEXT,
      ui_preferences TEXT,
      quick_actions TEXT
    )`);

    // User activity log (for recommendations)
    db.run(`CREATE TABLE IF NOT EXISTS user_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      feature TEXT,
      timestamp TEXT NOT NULL,
      ip_address TEXT
    )`);

    // Admin verification logs
    db.run(`CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      success INTEGER DEFAULT 1,
      ip_address TEXT
    )`);

    // Usage logs
    db.run(`CREATE TABLE IF NOT EXISTS usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      session_start TEXT NOT NULL,
      session_end TEXT,
      duration_seconds REAL DEFAULT 0,
      ip_address TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      memory_key TEXT NOT NULL,
      memory_value TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, memory_key)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS known_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      label TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      confirmed INTEGER DEFAULT 0,
      UNIQUE(user_id, fingerprint)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      UNIQUE(user_id, code)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      done INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )`);

    const userColumns = [
      ['memory_enabled', 'INTEGER DEFAULT 0'],
      ['nickname', 'TEXT'],
      ['preferred_greeting', 'TEXT'],
      ['saved_notes', 'TEXT'],
      ['tasks_completed', 'INTEGER DEFAULT 0'],
      ['last_conversation', 'TEXT']
    ];
    userColumns.forEach(([column, definition]) => {
      db.run(`ALTER TABLE users ADD COLUMN ${column} ${definition}`, (err) => {
        if (err && !/duplicate column/i.test(err.message)) {
          console.error('Schema update error:', err.message);
        }
      });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

const MEMORY_KEYS = ['nickname', 'favorite_tools', 'preferred_greeting', 'custom_preferences', 'saved_notes', 'last_conversation'];

const ACHIEVEMENT_DEFS = [
  { code: 'first_login', title: 'First Login' },
  { code: 'ten_hours', title: '10 Hours of Usage' },
  { code: 'power_user', title: 'Power User' },
  { code: 'ai_explorer', title: 'AI Explorer' },
  { code: 'administrator', title: 'Administrator' },
  { code: 'hydra_veteran', title: 'HYDRA Veteran' }
];

function safeUser(user) {
  if (!user) return null;
  const copy = { ...user };
  delete copy.password;
  return copy;
}

async function memoryConsent(userId) {
  const user = await dbGet('SELECT memory_enabled FROM users WHERE user_id = ?', [userId]);
  const consent = await dbGet(
    'SELECT memory_value FROM memories WHERE user_id = ? AND memory_key = ?',
    [userId, 'consent']
  );
  const granted = consent && consent.memory_value === 'granted' && user && user.memory_enabled === 1;
  return { granted, asked: Boolean(consent) };
}

async function upsertMemory(userId, key, value) {
  await dbRun(
    `INSERT INTO memories (user_id, memory_key, memory_value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, memory_key) DO UPDATE SET memory_value = excluded.memory_value, updated_at = excluded.updated_at`,
    [userId, key, value, getCurrentTimestamp()]
  );
}

async function noteDevice(userId, device) {
  const fingerprint = device && device.fingerprint ? String(device.fingerprint).slice(0, 120) : '';
  if (!fingerprint) return { newDevice: false, confirmed: true };
  const label = device.label ? String(device.label).slice(0, 160) : 'Unknown device';
  const existing = await dbGet(
    'SELECT * FROM known_devices WHERE user_id = ? AND fingerprint = ?',
    [userId, fingerprint]
  );
  const now = getCurrentTimestamp();
  if (!existing) {
    const prior = await dbGet('SELECT COUNT(*) AS count FROM known_devices WHERE user_id = ?', [userId]);
    const firstDevice = !prior || prior.count === 0;
    await dbRun(
      `INSERT INTO known_devices (user_id, fingerprint, label, first_seen, last_seen, confirmed)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, fingerprint, label, now, now, firstDevice ? 1 : 0]
    );
    return { newDevice: !firstDevice, confirmed: firstDevice, label };
  }
  await dbRun('UPDATE known_devices SET last_seen = ?, label = ? WHERE id = ?', [now, label, existing.id]);
  return { newDevice: existing.confirmed !== 1, confirmed: existing.confirmed === 1, label: existing.label };
}

function pageLabel(page) {
  const labels = {
    home: 'the HYDRA Control Panel',
    dashboard: 'the Dashboard',
    'hydra-ai': 'the AI Assistant',
    profile: 'your profile',
    memory: 'Privacy & Memory',
    navigation: 'Navigation',
    companionship: 'Companionship',
    os: 'HYDRA OS',
    manual: 'the manual',
    curse: 'Curse Head',
    health: 'Health Head',
    third: 'the Gatekeeper'
  };
  return labels[page] || page || 'your workspace';
}

async function syncAchievements(user, featureCounts) {
  const accountAge = Math.floor((Date.now() - new Date(user.account_created)) / 86400000);
  const aiUses = (featureCounts['hydra-ai'] || 0) + (featureCounts['AI Chat'] || 0) + (featureCounts.ai || 0);
  const earned = {
    first_login: (user.login_count || 0) >= 1,
    ten_hours: (user.total_lifetime_usage || 0) >= 36000,
    power_user: (user.login_streak || 0) >= 7 || (user.login_count || 0) >= 25,
    ai_explorer: aiUses >= 5,
    administrator: user.role === 'Administrator' && user.admin_verified === 1,
    hydra_veteran: accountAge >= 30 || (user.login_count || 0) >= 50
  };
  const unlocked = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (!earned[def.code]) continue;
    const row = await dbGet(
      'SELECT unlocked_at FROM achievements WHERE user_id = ? AND code = ?',
      [user.user_id, def.code]
    );
    if (!row) {
      const unlockedAt = getCurrentTimestamp();
      await dbRun(
        'INSERT INTO achievements (user_id, code, title, unlocked_at) VALUES (?, ?, ?, ?)',
        [user.user_id, def.code, def.title, unlockedAt]
      );
      unlocked.push({ code: def.code, title: def.title, unlockedAt, fresh: true });
    } else {
      unlocked.push({ code: def.code, title: def.title, unlockedAt: row.unlocked_at, fresh: false });
    }
  }
  return ACHIEVEMENT_DEFS.map((def) => {
    const hit = unlocked.find((item) => item.code === def.code);
    return hit || { code: def.code, title: def.title, unlockedAt: null, fresh: false };
  });
}

async function buildCompanion(userId, device) {
  const user = await dbGet('SELECT * FROM users WHERE user_id = ?', [userId]);
  if (!user) return null;
  const consent = await memoryConsent(userId);
  const security = await noteDevice(userId, device || {});
  const name = user.nickname || user.preferred_display_name || user.name;
  const hour = new Date().getHours();
  let dayPart = 'Hello';
  if (hour >= 5 && hour < 12) dayPart = 'Good morning';
  else if (hour >= 12 && hour < 17) dayPart = 'Good afternoon';
  else if (hour >= 17 && hour < 22) dayPart = 'Good evening';
  else dayPart = 'Good night';

  const greeting = user.preferred_greeting
    ? user.preferred_greeting.replace(/\{name\}/g, name)
    : `${dayPart}, ${name}.`;

  const lines = [`${greeting}`, 'Everything looks ready.'];
  const suggestions = [];
  let habits = [];
  let recentPages = [];
  let favoriteFeature = user.favorite_feature || null;
  let mostActiveDay = null;
  let weekly = [];
  let lastConversation = null;

  if (consent.granted) {
    const activities = await dbAll(
      `SELECT feature, action, timestamp FROM user_activity WHERE user_id = ? ORDER BY timestamp DESC LIMIT 400`,
      [userId]
    );
    const counts = {};
    const dayCounts = {};
    const weekMap = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
    const weekAgo = Date.now() - 7 * 86400000;
    activities.forEach((row) => {
      if (!row.feature) return;
      counts[row.feature] = (counts[row.feature] || 0) + 1;
      const when = new Date(row.timestamp);
      const dayName = when.toLocaleDateString('en-US', { weekday: 'short' });
      dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
      if (when.getTime() >= weekAgo) weekMap[dayName] = (weekMap[dayName] || 0) + 1;
    });
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!favoriteFeature && ranked[0]) favoriteFeature = ranked[0][0];
    const dayRank = Object.entries(dayCounts).sort((a, b) => b[1] - a[1]);
    mostActiveDay = dayRank[0] ? dayRank[0][0] : null;
    weekly = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => ({ day, count: weekMap[day] || 0 }));
    recentPages = [];
    activities.forEach((row) => {
      if (row.action === 'tab_switch' && row.feature && !recentPages.includes(row.feature)) recentPages.push(row.feature);
    });
    recentPages = recentPages.slice(0, 5);

    const top = ranked[0] ? ranked[0][0] : null;
    if (top === 'dashboard') habits.push('You usually open the Dashboard first.');
    else if (top === 'hydra-ai' || top === 'AI Chat' || top === 'ai') habits.push('You spend most of your time using the AI Assistant.');
    else if (top) habits.push(`You spend most of your time using ${pageLabel(top)}.`);
    if (favoriteFeature) habits.push('Would you like me to pin your favorite tools?');

    if (user.last_page_visited) {
      lines.push(`Last time you were working on ${pageLabel(user.last_page_visited)}. Would you like to continue?`);
      suggestions.push({
        type: 'continue',
        message: 'Would you like to continue your previous session?',
        action: user.last_page_visited
      });
    }
    if ((user.export_count || 0) > 0) {
      suggestions.push({
        type: 'pattern',
        message: 'I noticed you usually export reports after editing users.',
        action: 'export'
      });
    }
    if (user.role === 'Administrator') {
      const exportedToday = await dbGet(
        `SELECT COUNT(*) AS count FROM user_activity
         WHERE user_id = ? AND feature = 'export' AND timestamp > datetime('now', '-1 day')`,
        [userId]
      );
      if (!exportedToday || exportedToday.count === 0) {
        suggestions.push({
          type: 'backup',
          message: "You haven't backed up your data today.",
          action: 'export'
        });
      }
    }
    lastConversation = user.last_conversation || null;
    if (lastConversation) {
      suggestions.push({
        type: 'conversation',
        message: 'I kept your last conversation. Want to pick it up?',
        action: 'hydra-ai'
      });
    }

    const achievements = await syncAchievements(user, counts);
    const goals = await dbAll('SELECT id, text, done, created_at FROM goals WHERE user_id = ? ORDER BY id DESC', [userId]);
    const memories = await dbAll(
      `SELECT memory_key, memory_value, updated_at FROM memories
       WHERE user_id = ? AND memory_key != 'consent' ORDER BY updated_at DESC`,
      [userId]
    );
    return finishCompanion({
      user, name, greeting, lines, suggestions, habits, recentPages, favoriteFeature,
      mostActiveDay, weekly, lastConversation, achievements, goals, memories, consent, security
    });
  }

  return finishCompanion({
    user, name, greeting, lines: [`${greeting}`, "I've prepared your workspace."],
    suggestions, habits, recentPages, favoriteFeature, mostActiveDay, weekly,
    lastConversation, achievements: ACHIEVEMENT_DEFS.map((def) => ({ ...def, unlockedAt: null, fresh: false })),
    goals: [], memories: [], consent, security
  });
}

function finishCompanion(ctx) {
  const now = new Date();
  const lastLogin = ctx.user.last_login ? new Date(ctx.user.last_login) : now;
  const daysAway = Math.floor((now - lastLogin) / 86400000);
  const emotional = [];
  if (daysAway >= 7) emotional.push("You haven't used HYDRA in a week. Welcome back!");
  if ((ctx.user.current_session_time || 0) >= 3 * 3600) {
    emotional.push("You've been working for 3 hours. Consider taking a short break.");
  }
  const welcome = `Welcome back, ${ctx.name}. HYDRA systems are online.`;
  return {
    needsConsent: !ctx.consent.asked,
    memoryEnabled: ctx.consent.granted,
    welcome,
    greeting: ctx.greeting,
    lines: ctx.lines,
    emotional,
    habits: ctx.habits,
    suggestions: ctx.suggestions,
    security: ctx.security.newDevice
      ? { newDevice: true, message: "This appears to be a new device. Please confirm it's you." }
      : { newDevice: false, message: null },
    profile: {
      name: ctx.name,
      email: ctx.user.email,
      role: ctx.user.role,
      theme: ctx.user.theme || 'dark',
      language: ctx.user.language || 'en',
      favoriteFeature: ctx.favoriteFeature,
      lastPage: ctx.consent.granted ? ctx.user.last_page_visited : null,
      voiceEnabled: ctx.user.voice_enabled === 1,
      nickname: ctx.user.nickname || '',
      preferredGreeting: ctx.user.preferred_greeting || '',
      savedNotes: ctx.consent.granted ? (ctx.user.saved_notes || '') : ''
    },
    stats: {
      usageSeconds: ctx.user.total_lifetime_usage || 0,
      sessionSeconds: ctx.user.current_session_time || 0,
      loginStreak: ctx.user.login_streak || 0,
      tasksCompleted: ctx.user.tasks_completed || 0,
      favoriteFeature: ctx.favoriteFeature,
      mostActiveDay: ctx.mostActiveDay,
      weekly: ctx.weekly,
      loginCount: ctx.user.login_count || 0
    },
    achievements: ctx.achievements,
    goals: ctx.goals,
    memories: ctx.memories,
    recentPages: ctx.recentPages,
    lastConversation: ctx.lastConversation
  };
}

// Helper functions
function generateUserId() {
  return 'HYDRA-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

function updateUserExcel() {
  try {
    db.all('SELECT * FROM users', [], (err, rows) => {
      if (err) {
        console.error('Error fetching users for Excel:', err);
        return;
      }

      if (!rows || rows.length === 0) return;

      const worksheet = xlsx.utils.json_to_sheet(rows.map(row => ({
        'User ID': row.user_id,
        'Name': row.name,
        'Email': row.email,
        'Role': row.role,
        'Account Status': row.account_status,
        'Administrator Verified': row.admin_verified ? 'Yes' : 'No',
        'Account Created': row.account_created,
        'First Login': row.first_login,
        'Last Login': row.last_login,
        'Login Count': row.login_count,
        'Total Hours Used': row.total_hours_used,
        'Total Minutes Used': row.total_minutes_used,
        'Total Seconds Used': row.total_seconds_used,
        'Total Lifetime Usage': row.total_lifetime_usage,
        'Current Session Time': row.current_session_time,
        'HYDRA Version': row.hydra_version,
        'Browser': row.browser,
        'Operating System': row.operating_system,
        'Device Name': row.device_name,
        'IP Address': row.ip_address,
        'Country': row.country,
        'Theme': row.theme,
        'Last Activity': row.last_activity,
        'Export Count': row.export_count,
        'Notes': row.notes
      })));

      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Users');

      const excelPath = path.join(__dirname, 'users.xlsx');
      xlsx.writeFile(workbook, excelPath);

      console.log('Excel file updated successfully');
    });
  } catch (error) {
    console.error('Error updating Excel file:', error);
  }
}

// Middleware to check if user is authenticated
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
  next();
}

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
  if (!req.session.isAdmin || !req.session.adminVerified) {
    return res.status(403).json({ error: 'Forbidden. Administrator access required.' });
  }
  next();
}

// API Routes

// Register
app.post('/api/tts', async (req, res) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(503).json({ error: 'ELEVENLABS_API_KEY is not configured on the server' });
  const text = String((req.body && req.body.text) || '').slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'text is required' });
  const voice = (req.body && req.body.voiceId) || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5' }),
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: (await upstream.text()).slice(0, 300) });
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.status(502).json({ error: 'Voice relay failed: ' + err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'hydra-api', uptime: process.uptime(), version: process.env.npm_package_version || '1.0.0' });
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    // Check if user already exists
    db.get('SELECT email FROM users WHERE email = ?', [email], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error.' });
      }
      if (row) {
        return res.status(400).json({ error: 'Email already registered.' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const userId = generateUserId();
      const accountCreated = getCurrentTimestamp();

      // Insert user
      db.run(`INSERT INTO users (user_id, name, email, password, account_created, role, account_status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, name, email, hashedPassword, accountCreated, 'User', 'Active'],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to create user.' });
          }

          updateUserExcel();
          res.status(201).json({
            message: 'Registration successful.',
            userId: userId
          });
        }
      );
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error.' });
      }
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (user.account_status !== 'Active') {
        return res.status(403).json({ error: 'Account is suspended.' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // Update login info
      const lastLogin = getCurrentTimestamp();
      const loginCount = user.login_count + 1;
      const firstLogin = user.first_login || lastLogin;
      const daysAway = user.last_login
        ? Math.floor((Date.now() - new Date(user.last_login).getTime()) / 86400000)
        : 0;

      // Calculate login streak
      let newStreak = user.login_streak || 0;
      const lastLoginDate = user.last_login ? new Date(user.last_login) : null;
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (lastLoginDate) {
        const lastLoginDay = lastLoginDate.toDateString();
        const todayDay = today.toDateString();
        const yesterdayDay = yesterday.toDateString();

        if (lastLoginDay === todayDay) {
          // Already logged in today, don't increment streak
        } else if (lastLoginDay === yesterdayDay) {
          // Logged in yesterday, increment streak
          newStreak++;
        } else {
          // Streak broken, start fresh
          newStreak = 1;
        }
      } else {
        newStreak = 1;
      }

      // Update user
      db.run(`UPDATE users SET last_login = ?, login_count = ?, first_login = ?, last_activity = ?, login_streak = ?, streak_start_date = ?
              WHERE id = ?`,
        [lastLogin, loginCount, firstLogin, lastLogin, newStreak, newStreak === 1 ? lastLogin : user.streak_start_date, user.id],
        (err) => {
          if (err) {
            console.error('Error updating login info:', err);
          }
        }
      );

      // Set session
      req.session.userId = user.user_id;
      req.session.userEmail = user.email;
      req.session.userName = user.name;
      req.session.isAdmin = user.role === 'Administrator';
      req.session.adminVerified = user.admin_verified === 1;
      req.session.daysAway = daysAway;

      const device = req.body.device || {};
      if (device.browser || device.os) {
        db.run(
          `UPDATE users SET browser = ?, operating_system = ?, device_name = ? WHERE user_id = ?`,
          [
            device.browser ? String(device.browser).slice(0, 180) : user.browser,
            device.os ? String(device.os).slice(0, 80) : user.operating_system,
            device.label ? String(device.label).slice(0, 80) : user.device_name,
            user.user_id
          ]
        );
      }

      // Log usage session
      const sessionStart = getCurrentTimestamp();
      db.run(`INSERT INTO usage_logs (user_id, session_start, ip_address)
              VALUES (?, ?, ?)`,
        [user.user_id, sessionStart, req.ip],
        function(err) {
          if (!err) {
            req.session.sessionId = this.lastID;
          }
        }
      );

      updateUserExcel();

      res.json({
        message: 'Login successful.',
        daysAway,
        user: {
          userId: user.user_id,
          name: user.name,
          email: user.email,
          role: user.role,
          isAdmin: user.role === 'Administrator',
          adminVerified: user.admin_verified === 1
        }
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Logout
app.post('/api/logout', requireAuth, (req, res) => {
  try {
    const userId = req.session.userId;
    const sessionId = req.session.sessionId;

    // Update usage time
    if (sessionId) {
      db.run(`UPDATE usage_logs SET session_end = ? WHERE id = ?`,
        [getCurrentTimestamp(), sessionId],
        (err) => {
          if (err) console.error('Error updating usage log:', err);
        }
      );
    }

    // Update total usage
    db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, user) => {
      if (!err && user) {
        const sessionTime = user.current_session_time || 0;
        const totalLifetime = (user.total_lifetime_usage || 0) + sessionTime;
        const totalHours = totalLifetime / 3600;
        const totalMinutes = (totalLifetime % 3600) / 60;
        const totalSeconds = totalLifetime % 60;

        db.run(`UPDATE users SET
                total_hours_used = ?,
                total_minutes_used = ?,
                total_seconds_used = ?,
                total_lifetime_usage = ?,
                current_session_time = 0,
                last_activity = ?
                WHERE user_id = ?`,
          [totalHours, totalMinutes, totalSeconds, totalLifetime, getCurrentTimestamp(), userId],
          (err) => {
            if (err) console.error('Error updating usage:', err);
            updateUserExcel();
          }
        );
      }
    });

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed.' });
      }
      res.json({ message: 'Logout successful.' });
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Verify Admin
app.post('/api/verify-admin', requireAuth, (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Security code is required.' });
    }

    if (code !== ADMIN_CODE) {
      // Log failed attempt
      db.run(`INSERT INTO admin_logs (user_id, action, timestamp, success, ip_address)
              VALUES (?, ?, ?, ?, ?)`,
        [req.session.userId, 'Admin verification failed', getCurrentTimestamp(), 0, req.ip]);

      return res.status(401).json({ error: 'Invalid Administrator Security Code.' });
    }

    // Update user admin verification
    db.run(`UPDATE users SET admin_verified = 1, last_activity = ? WHERE user_id = ?`,
      [getCurrentTimestamp(), req.session.userId],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to verify admin.' });
        }

        // Log successful verification
        db.run(`INSERT INTO admin_logs (user_id, action, timestamp, success, ip_address)
                VALUES (?, ?, ?, ?, ?)`,
          [req.session.userId, 'Admin verification successful', getCurrentTimestamp(), 1, req.ip]);

        req.session.adminVerified = true;
        updateUserExcel();

        res.json({ message: 'Administrator verification successful.' });
      }
    );
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get Profile
app.get('/api/profile', requireAuth, (req, res) => {
  db.get('SELECT user_id, name, email, role, account_status, admin_verified, account_created, first_login, last_login, login_count, total_lifetime_usage, theme FROM users WHERE user_id = ?',
    [req.session.userId],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error.' });
      }
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }
      res.json(user);
    }
  );
});

// Get All Users (Admin only)
app.get('/api/users', requireAdmin, (req, res) => {
  db.all('SELECT user_id, name, email, role, account_status, admin_verified, account_created, last_login, login_count, total_lifetime_usage FROM users', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error.' });
    }
    res.json(rows);
  });
});

// Get Analytics (Admin only)
app.get('/api/analytics', requireAdmin, (req, res) => {
  db.get('SELECT COUNT(*) as total_users, SUM(login_count) as total_logins, SUM(total_lifetime_usage) as total_usage FROM users', [], (err, stats) => {
    if (err) {
      return res.status(500).json({ error: 'Database error.' });
    }

    db.get('SELECT COUNT(*) as active_sessions FROM usage_logs WHERE session_end IS NULL', [], (err, active) => {
      if (err) {
        return res.status(500).json({ error: 'Database error.' });
      }

      res.json({
        totalUsers: stats.total_users,
        totalLogins: stats.total_logins,
        totalUsage: stats.total_usage,
        activeSessions: active.active_sessions
      });
    });
  });
});

// Download Excel (Admin only)
app.get('/api/download-xls', requireAdmin, (req, res) => {
  const excelPath = path.join(__dirname, 'users.xlsx');

  if (!fs.existsSync(excelPath)) {
    updateUserExcel();
  }

  res.download(excelPath, 'users.xlsx', (err) => {
    if (err) {
      console.error('Download error:', err);
    }

    // Update export count
    db.run(`UPDATE users SET export_count = export_count + 1 WHERE user_id = ?`,
      [req.session.userId],
      (err) => {
        if (err) console.error('Error updating export count:', err);
      }
    );
  });
});

// Update User (Admin only)
app.put('/api/update-user', requireAdmin, (req, res) => {
  const { userId, name, email, role, account_status } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  db.run(`UPDATE users SET name = ?, email = ?, role = ?, account_status = ?, last_activity = ?
          WHERE user_id = ?`,
    [name, email, role, account_status, getCurrentTimestamp(), userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update user.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }
      updateUserExcel();
      res.json({ message: 'User updated successfully.' });
    }
  );
});

// Delete User (Admin only)
app.delete('/api/delete-user', requireAdmin, (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  if (userId === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account.' });
  }

  db.run('DELETE FROM users WHERE user_id = ?', [userId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete user.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    updateUserExcel();
    res.json({ message: 'User deleted successfully.' });
  });
});

// Session heartbeat (track usage time)
app.post('/api/heartbeat', requireAuth, (req, res) => {
  const { sessionTime } = req.body;

  db.run(`UPDATE users SET current_session_time = ?, last_activity = ? WHERE user_id = ?`,
    [sessionTime || 0, getCurrentTimestamp(), req.session.userId],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to update session time.' });
      }
      res.json({ message: 'Session updated.' });
    }
  );
});

// Log user activity (for recommendations)
app.post('/api/log-activity', requireAuth, async (req, res) => {
  try {
    const consent = await memoryConsent(req.session.userId);
    if (!consent.granted) return res.json({ message: 'Memory is off. Activity was not stored.' });
    const { action, feature } = req.body;
    await dbRun(
      `INSERT INTO user_activity (user_id, action, feature, timestamp, ip_address) VALUES (?, ?, ?, ?, ?)`,
      [req.session.userId, action || 'visited', String(feature || 'unknown').slice(0, 80), getCurrentTimestamp(), req.ip]
    );
    res.json({ message: 'Activity logged.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log activity.' });
  }
});

// Update user preferences
app.put('/api/preferences', requireAuth, (req, res) => {
  const columnMap = {
    preferred_display_name: 'preferred_display_name',
    language: 'language',
    favorite_feature: 'favorite_feature',
    theme: 'theme',
    voice_enabled: 'voice_enabled',
    notification_settings: 'notification_settings',
    ui_preferences: 'ui_preferences',
    quick_actions: 'quick_actions',
    memory_enabled: 'memory_enabled',
    nickname: 'nickname',
    preferred_greeting: 'preferred_greeting',
    saved_notes: 'saved_notes'
  };
  const fields = [];
  const values = [];
  Object.entries(columnMap).forEach(([key, column]) => {
    if (req.body[key] === undefined) return;
    let value = req.body[key];
    if (key === 'voice_enabled' || key === 'memory_enabled') value = value ? 1 : 0;
    if (['notification_settings', 'ui_preferences', 'quick_actions'].includes(key) && value && typeof value !== 'string') {
      value = JSON.stringify(value);
    }
    fields.push(`${column} = ?`);
    values.push(value);
  });
  if (!fields.length) return res.status(400).json({ error: 'No preferences to update.' });
  fields.push('last_activity = ?');
  values.push(getCurrentTimestamp(), req.session.userId);
  db.run(`UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`, values, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to update preferences.' });
    updateUserExcel();
    res.json({ message: 'Preferences updated successfully.' });
  });
});

// Get personalized recommendations
app.get('/api/recommendations', requireAuth, (req, res) => {
  const userId = req.session.userId;

  // Get user's favorite feature and recent activity
  db.get('SELECT favorite_feature, language FROM users WHERE user_id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error.' });
    }

    // Get recent activity
    db.all(`SELECT feature, COUNT(*) as count FROM user_activity
            WHERE user_id = ? AND timestamp > datetime('now', '-7 days')
            GROUP BY feature ORDER BY count DESC LIMIT 5`,
      [userId],
      (err, activities) => {
        if (err) {
          return res.status(500).json({ error: 'Database error.' });
        }

        const recommendations = [];

        // Add recommendations based on activity
        if (activities && activities.length > 0) {
          const topFeature = activities[0].feature;
          recommendations.push({
            type: 'continue',
            message: `You often use ${topFeature}. Open it again?`,
            action: topFeature
          });

          // Check for unused features
          const usedFeatures = activities.map(a => a.feature);
          const allFeatures = ['AI Chat', 'Dashboard', 'Analytics', 'Reports', 'Settings', 'Navigation'];
          const unusedFeatures = allFeatures.filter(f => !usedFeatures.includes(f));

          if (unusedFeatures.length > 0) {
            recommendations.push({
              type: 'discover',
              message: `You haven't tried ${unusedFeatures[0]} yet.`,
              action: unusedFeatures[0]
            });
          }
        }

        // Add time-based recommendation
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 12) {
          recommendations.push({
            type: 'greeting',
            message: 'Good morning! Ready for a productive session?',
            action: null
          });
        } else if (hour >= 12 && hour < 18) {
          recommendations.push({
            type: 'greeting',
            message: 'Good afternoon! How can HYDRA help you today?',
            action: null
          });
        } else {
          recommendations.push({
            type: 'greeting',
            message: 'Good evening! Continuing your work?',
            action: null
          });
        }

        res.json({
          recommendations,
          favoriteFeature: user?.favorite_feature,
          language: user?.language || 'en'
        });
      }
    );
  });
});

// Get user profile with full details
app.get('/api/profile/full', requireAuth, (req, res) => {
  db.get(`SELECT * FROM users WHERE user_id = ?`, [req.session.userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error.' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Calculate account age
    const accountCreated = new Date(user.account_created);
    const accountAge = Math.floor((Date.now() - accountCreated) / (1000 * 60 * 60 * 24));

    // Get recent activity
    db.all(`SELECT action, feature, timestamp FROM user_activity
            WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10`,
      [user.user_id],
      (err, activities) => {
        if (err) {
          return res.status(500).json({ error: 'Database error.' });
        }

        const safe = safeUser(user);
        res.json({
          ...safe,
          accountAge,
          notification_settings: user.notification_settings ? JSON.parse(user.notification_settings) : {},
          ui_preferences: user.ui_preferences ? JSON.parse(user.ui_preferences) : {},
          quick_actions: user.quick_actions ? JSON.parse(user.quick_actions) : [],
          recentActivity: activities || []
        });
      }
    );
  });
});

// Update last page visited
app.post('/api/last-page', requireAuth, async (req, res) => {
  try {
    const consent = await memoryConsent(req.session.userId);
    if (!consent.granted) return res.json({ message: 'Memory is off.' });
    const page = String(req.body.page || '').slice(0, 40);
    await dbRun(
      'UPDATE users SET last_page_visited = ?, last_activity = ? WHERE user_id = ?',
      [page, getCurrentTimestamp(), req.session.userId]
    );
    res.json({ message: 'Last page updated.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update last page.' });
  }
});

// Get smart notifications
app.get('/api/notifications', requireAuth, (req, res) => {
  const userId = req.session.userId;

  db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error.' });
    }

    const notifications = [];
    const now = new Date();
    const lastLogin = user.last_login ? new Date(user.last_login) : now;
    const accountCreated = new Date(user.account_created);

    // Check for break notification
    const daysSinceLastLogin = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));
    if (daysSinceLastLogin >= 5) {
      notifications.push({
        type: 'welcome_back',
        message: `Welcome back after ${daysSinceLastLogin} days!`,
        icon: '👋'
      });
    }

    // Account anniversary
    const accountAge = Math.floor((now - accountCreated) / (1000 * 60 * 60 * 24));
    if (accountAge > 0 && accountAge % 30 === 0) {
      notifications.push({
        type: 'anniversary',
        message: `Your account is ${accountAge} days old!`,
        icon: '🎉'
      });
    }

    // Active session notification
    if (user.current_session_time > 7200) { // 2 hours
      notifications.push({
        type: 'usage',
        message: `You've been active for ${Math.floor(user.current_session_time / 3600)} hours today.`,
        icon: '⏱️'
      });
    }

    // High usage user
    if (user.total_lifetime_usage > 36000) { // 10 hours
      notifications.push({
        type: 'achievement',
        message: "You're one of our most active users!",
        icon: '🏆'
      });
    }

    // Login streak
    if (user.login_streak >= 7) {
      notifications.push({
        type: 'streak',
        message: `${user.login_streak} day login streak! Keep it up!`,
        icon: '🔥'
      });
    }

    res.json(notifications);
  });
});

app.get('/api/companion', requireAuth, async (req, res) => {
  try {
    const companion = await buildCompanion(req.session.userId, {
      fingerprint: req.query.fingerprint,
      label: req.query.label
    });
    if (!companion) return res.status(404).json({ error: 'User not found.' });
    if (typeof req.session.daysAway === 'number' && req.session.daysAway >= 7) {
      const line = "You haven't used HYDRA in a week. Welcome back!";
      if (!companion.emotional.includes(line)) companion.emotional.unshift(line);
    }
    res.json(companion);
  } catch (error) {
    console.error('Companion error:', error);
    res.status(500).json({ error: 'Could not load HYDRA companion.' });
  }
});

app.post('/api/memory/consent', requireAuth, async (req, res) => {
  try {
    const granted = Boolean(req.body.granted);
    await upsertMemory(req.session.userId, 'consent', granted ? 'granted' : 'denied');
    await dbRun('UPDATE users SET memory_enabled = ? WHERE user_id = ?', [granted ? 1 : 0, req.session.userId]);
    res.json({ memoryEnabled: granted });
  } catch (error) {
    res.status(500).json({ error: 'Could not update memory consent.' });
  }
});

app.get('/api/memory', requireAuth, async (req, res) => {
  try {
    const consent = await memoryConsent(req.session.userId);
    const rows = await dbAll(
      `SELECT id, memory_key, memory_value, updated_at FROM memories WHERE user_id = ? ORDER BY memory_key`,
      [req.session.userId]
    );
    res.json({ memoryEnabled: consent.granted, memories: rows });
  } catch (error) {
    res.status(500).json({ error: 'Could not read memories.' });
  }
});

app.put('/api/memory', requireAuth, async (req, res) => {
  try {
    const consent = await memoryConsent(req.session.userId);
    if (!consent.granted) return res.status(403).json({ error: 'Turn memory on before saving.' });
    const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
    for (const item of items) {
      if (!MEMORY_KEYS.includes(item.key)) continue;
      const value = String(item.value ?? '').slice(0, 2000);
      await upsertMemory(req.session.userId, item.key, value);
      if (item.key === 'nickname') await dbRun('UPDATE users SET nickname = ? WHERE user_id = ?', [value, req.session.userId]);
      if (item.key === 'preferred_greeting') await dbRun('UPDATE users SET preferred_greeting = ? WHERE user_id = ?', [value, req.session.userId]);
      if (item.key === 'saved_notes') await dbRun('UPDATE users SET saved_notes = ? WHERE user_id = ?', [value, req.session.userId]);
      if (item.key === 'favorite_tools') await dbRun('UPDATE users SET favorite_feature = ? WHERE user_id = ?', [value.split(',')[0].trim(), req.session.userId]);
      if (item.key === 'last_conversation') await dbRun('UPDATE users SET last_conversation = ? WHERE user_id = ?', [value, req.session.userId]);
    }
    res.json({ message: 'Memory saved.' });
  } catch (error) {
    res.status(500).json({ error: 'Could not save memory.' });
  }
});

app.delete('/api/memory/:key', requireAuth, async (req, res) => {
  try {
    if (req.params.key === 'all') {
      await dbRun('DELETE FROM memories WHERE user_id = ? AND memory_key != ?', [req.session.userId, 'consent']);
      await dbRun('DELETE FROM goals WHERE user_id = ?', [req.session.userId]);
      await dbRun('DELETE FROM user_activity WHERE user_id = ?', [req.session.userId]);
      await dbRun(
        `UPDATE users SET nickname = NULL, preferred_greeting = NULL, saved_notes = NULL,
         last_conversation = NULL, last_page_visited = NULL, favorite_feature = NULL WHERE user_id = ?`,
        [req.session.userId]
      );
      return res.json({ message: 'Saved memories deleted.' });
    }
    if (!MEMORY_KEYS.includes(req.params.key)) return res.status(400).json({ error: 'Unknown memory.' });
    await dbRun('DELETE FROM memories WHERE user_id = ? AND memory_key = ?', [req.session.userId, req.params.key]);
    res.json({ message: 'Memory deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Could not delete memory.' });
  }
});

app.post('/api/memory/conversation', requireAuth, async (req, res) => {
  try {
    const consent = await memoryConsent(req.session.userId);
    if (!consent.granted) return res.json({ message: 'Memory is off.' });
    const text = String(req.body.text || '').trim().slice(0, 280);
    if (!text) return res.status(400).json({ error: 'Nothing to remember.' });
    await upsertMemory(req.session.userId, 'last_conversation', text);
    await dbRun('UPDATE users SET last_conversation = ? WHERE user_id = ?', [text, req.session.userId]);
    res.json({ message: 'Conversation remembered.' });
  } catch (error) {
    res.status(500).json({ error: 'Could not store conversation.' });
  }
});

app.post('/api/goals', requireAuth, async (req, res) => {
  try {
    const consent = await memoryConsent(req.session.userId);
    if (!consent.granted) return res.status(403).json({ error: 'Turn memory on to save goals.' });
    const text = String(req.body.text || '').trim().slice(0, 180);
    if (!text) return res.status(400).json({ error: 'Goal text is required.' });
    const result = await dbRun(
      'INSERT INTO goals (user_id, text, done, created_at) VALUES (?, ?, 0, ?)',
      [req.session.userId, text, getCurrentTimestamp()]
    );
    res.status(201).json({ id: result.lastID, text, done: 0 });
  } catch (error) {
    res.status(500).json({ error: 'Could not save goal.' });
  }
});

app.post('/api/goals/:id/complete', requireAuth, async (req, res) => {
  try {
    await dbRun('UPDATE goals SET done = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    await dbRun('UPDATE users SET tasks_completed = tasks_completed + 1 WHERE user_id = ?', [req.session.userId]);
    res.json({ message: "Congratulations! You've completed your task." });
  } catch (error) {
    res.status(500).json({ error: 'Could not complete goal.' });
  }
});

app.delete('/api/goals/:id', requireAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM goals WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    res.json({ message: 'Goal removed.' });
  } catch (error) {
    res.status(500).json({ error: 'Could not remove goal.' });
  }
});

app.post('/api/device/confirm', requireAuth, async (req, res) => {
  try {
    const fingerprint = String(req.body.fingerprint || '').slice(0, 120);
    if (!fingerprint) return res.status(400).json({ error: 'Missing device.' });
    await dbRun(
      'UPDATE known_devices SET confirmed = 1, last_seen = ? WHERE user_id = ? AND fingerprint = ?',
      [getCurrentTimestamp(), req.session.userId, fingerprint]
    );
    res.json({ message: "Confirmed. Welcome back — this device is trusted." });
  } catch (error) {
    res.status(500).json({ error: 'Could not confirm device.' });
  }
});

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'fullhydra.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`HYDRA Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

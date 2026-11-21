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
const ADMIN_CODE = '0909';
const SALT_ROUNDS = 12;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
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
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files
app.use(express.static(__dirname));

// SQLite Database setup
const dbPath = path.join(__dirname, 'hydra.db');
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
      notes TEXT
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
  });
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

      // Update user
      db.run(`UPDATE users SET last_login = ?, login_count = ?, first_login = ?, last_activity = ?
              WHERE id = ?`,
        [lastLogin, loginCount, firstLogin, lastLogin, user.id],
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

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'fullhydra.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`HYDRA Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

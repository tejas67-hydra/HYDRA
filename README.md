# HYDRA - Ultimate Authentication & Admin System

## Overview

HYDRA is now a full-stack application with a Node.js backend, SQLite database, and comprehensive authentication system.

## Features

### Authentication System
- ✅ Secure email/password login with bcrypt hashing
- ✅ User registration with validation
- ✅ Session management with secure cookies
- ✅ Two user roles: User and Administrator
- ✅ Administrator verification with security code (0909)
- ✅ Automatic session expiration after inactivity

### Database & Excel
- ✅ SQLite database with automatic table creation
- ✅ Single master Excel file (users.xlsx) synchronized with database
- ✅ Automatic Excel updates on user data changes
- ✅ Backup system - recreates Excel if deleted
- ✅ All user data stored in one row per user

### Admin Dashboard APIs
- ✅ View all users
- ✅ Download users.xlsx
- ✅ Update user information
- ✅ Delete users
- ✅ View analytics (total users, logins, usage time)
- ✅ Active session tracking

### Security
- ✅ bcrypt password hashing (12 salt rounds)
- ✅ Helmet for HTTP headers
- ✅ CORS configuration
- ✅ Rate limiting (100 requests per 15 minutes)
- ✅ SQL Injection protection (parameterized queries)
- ✅ XSS protection (Helmet)
- ✅ CSRF protection (session-based)
- ✅ Secure session cookies
- ✅ Input sanitization

### Frontend Features
- ✅ Cloudflare-style login UI
- ✅ Registration form
- ✅ Admin verification modal
- ✅ Password toggle visibility
- ✅ Visitor tracking (ID, visits, device info)
- ✅ Navigation tab with download and auth controls
- ✅ Session heartbeat for usage tracking
- ✅ Automatic logout on session expiration

## Installation

### Prerequisites
- Node.js 18.0.0 or higher
- npm or yarn

### Setup

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Edit `.env` and set your values:
```
SESSION_SECRET=your-secret-key-here
NODE_ENV=production
PORT=3000
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - Login user
- `POST /api/logout` - Logout user
- `POST /api/verify-admin` - Verify admin with code 0909

### User Data
- `GET /api/profile` - Get current user profile
- `GET /api/users` - Get all users (admin only)
- `PUT /api/update-user` - Update user (admin only)
- `DELETE /api/delete-user` - Delete user (admin only)

### Analytics & Data
- `GET /api/analytics` - Get system analytics (admin only)
- `GET /api/download-xls` - Download users.xlsx (admin only)
- `POST /api/heartbeat` - Update session time

## Database Schema

### Users Table
- id (INTEGER, PRIMARY KEY)
- user_id (TEXT, UNIQUE)
- name (TEXT)
- email (TEXT, UNIQUE)
- password (TEXT, hashed)
- role (TEXT, default: 'User')
- account_status (TEXT, default: 'Active')
- admin_verified (INTEGER, default: 0)
- account_created (TEXT, ISO timestamp)
- first_login (TEXT, ISO timestamp)
- last_login (TEXT, ISO timestamp)
- login_count (INTEGER, default: 0)
- total_hours_used (REAL, default: 0)
- total_minutes_used (REAL, default: 0)
- total_seconds_used (REAL, default: 0)
- total_lifetime_usage (REAL, default: 0)
- current_session_time (REAL, default: 0)
- hydra_version (TEXT, default: '1.0.0')
- browser (TEXT)
- operating_system (TEXT)
- device_name (TEXT)
- ip_address (TEXT)
- country (TEXT)
- theme (TEXT, default: 'dark')
- last_activity (TEXT, ISO timestamp)
- export_count (INTEGER, default: 0)
- notes (TEXT)

### Admin Logs Table
- id (INTEGER, PRIMARY KEY)
- user_id (TEXT)
- action (TEXT)
- timestamp (TEXT, ISO timestamp)
- success (INTEGER, default: 1)
- ip_address (TEXT)

### Usage Logs Table
- id (INTEGER, PRIMARY KEY)
- user_id (TEXT)
- session_start (TEXT, ISO timestamp)
- session_end (TEXT, ISO timestamp)
- duration_seconds (REAL, default: 0)
- ip_address (TEXT)

## Deployment

### Option 1: Vercel/Render/Railway
1. Push code to GitHub
2. Connect repository to platform
3. Set environment variables
4. Deploy

### Option 2: VPS (DigitalOcean, AWS, etc.)
1. Install Node.js on server
2. Clone repository
3. Run `npm install`
4. Set up PM2 for process management:
```bash
npm install -g pm2
pm2 start server.js --name hydra
pm2 save
pm2 startup
```
5. Set up Nginx reverse proxy (optional)

### Option 3: Docker
```bash
docker build -t hydra-app .
docker run -p 3000:3000 hydra-app
```

## Administrator Verification

When logging in as an Administrator:
1. The system detects admin role
2. Shows "Administrator Verification" modal
3. Enter security code: **0909**
4. If correct: Admin features unlocked
5. If incorrect: Shake animation + error message
6. Verification required again after logout/session expiration

## Excel File (users.xlsx)

- Location: Project root directory
- Automatically created on first user registration
- Synchronized with SQLite database
- Updated on every user data change
- Only accessible to verified administrators
- Contains all user information in one sheet

## Security Notes

⚠️ **IMPORTANT:**
- Change `SESSION_SECRET` in production
- Use HTTPS in production
- Keep admin code (0909) secure
- Regularly backup SQLite database
- Monitor admin logs for suspicious activity
- Update dependencies regularly

## Troubleshooting

### Database locked error
- Ensure only one server instance is running
- Check file permissions on hydra.db

### Session not persisting
- Check SESSION_SECRET is set
- Verify cookies are enabled in browser
- Check session cookie settings

### Excel file not updating
- Check file permissions on users.xlsx
- Verify database is accessible
- Check console for errors

## License

Proprietary - All rights reserved

# HYDRA universal account — backend contract

The client (`js/universal.js`) works offline and on-device today. Point
`window.HYDRA_API` at a service implementing this contract to make accounts,
memory and sessions follow the user across devices.

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, name }` | `{ user, access, refresh }` |
| POST | `/auth/login` | `{ email, password, totp? }` | `{ user, access, refresh }` |
| POST | `/auth/refresh` | `{ refresh }` | `{ access, refresh }` |
| POST | `/auth/logout` | `{ refresh }` | `204` |
| POST | `/auth/logout-all` | — | `204` (revokes every refresh token) |
| GET | `/auth/me` | — | `{ user, profile, devices, sessions }` |
| POST | `/auth/verify-email` | `{ token }` | `204` |
| POST | `/auth/password/reset` | `{ email }` | `202` |
| POST | `/auth/password/confirm` | `{ token, password }` | `204` |
| GET | `/auth/{provider}` | — | 302 to provider (`google`, `github`, `microsoft`, `apple`) |
| GET | `/auth/{provider}/callback` | — | 302 back to `?redirect` with a one-time code |
| POST | `/auth/totp/enable` | — | `{ secret, uri }` |
| POST | `/auth/totp/confirm` | `{ code }` | `204` |

Tokens: short-lived JWT access token (15 min) in memory, rotating refresh token
(30 days) in an `HttpOnly; Secure; SameSite=Lax` cookie. Never put either in
`localStorage`.

## Sync

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/sync` | `{ account, ops: [{ coll, id, op, at, device, payload }] }` | `{ applied, rev }` |
| GET | `/sync?since={rev}` | — | `{ rev, ops: [...] }` |

`coll` is one of `profile`, `memory`, `notifications`, `tasks`, `notes`, `files`,
`achievements`, `bookmarks`, `projects`. Conflict rule: highest `at` wins, ties
broken by `device`. Deletes are tombstones (`op: "delete"`) so they replicate.

## Files

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/files` | multipart `file`, `coll` | `{ id, url, size, sha256 }` |
| GET | `/files/{id}` | — | signed URL, 10 min TTL |

## Security requirements for the server

- Argon2id password hashing (the client's PBKDF2 hash is only for offline use).
- Per-device refresh token records so "sign out everywhere" can revoke all.
- TOTP secret encrypted at rest with a KMS key; never returned after setup.
- Rate limits on `/auth/login` and `/auth/totp/confirm` (5/min/IP).
- Audit log for sign-in, sign-out, device add/remove, password and 2FA changes.

## Client wiring

```js
window.HYDRA_API = 'https://api.hydra.example';
// js/universal.js then:
//  - redirects provider sign-in to /auth/{provider}
//  - queues writes while offline and flushes them on `online`
//  - keeps the local AES-GCM cache as the offline source of truth
```

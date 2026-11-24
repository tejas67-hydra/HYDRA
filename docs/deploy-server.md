# Deploying the HYDRA API (`server.js`)

The API gives the apps real accounts, sessions, the admin panel, analytics,
notifications, memory sync and server-side voice. The static site keeps working
without it: the client falls back to the on-device account when the API is
unreachable.

## What the server needs

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | yes | Signs session cookies. Generate a long random string. |
| `ALLOWED_ORIGINS` | yes | Comma-separated origins allowed to call the API with cookies. Use `https://tejas67-hydra.github.io`. |
| `DATA_DIR` | no | Where `hydra.db` lives. Point it at a mounted disk so accounts survive redeploys. |
| `NODE_ENV` | yes | `production` turns on secure, `SameSite=None` cookies for cross-site use. |
| `ELEVENLABS_API_KEY` | no | Enables `/api/tts`. Without it the voice route answers 503. |
| `RESEND_API_KEY` | no | Sends verification and password-reset email. Without it the link is returned to the caller and logged. |
| `MAIL_FROM` | no | Sender for those emails, e.g. `HYDRA <no-reply@yourdomain.com>`. |
| `ALLOW_DEV_LINKS` | no | `false` stops the server returning verification/reset links in the response. Default `true`. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | no | Enables GitHub sign-in. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables Google sign-in. |
| `APP_URL` | no | Where users land after verifying or linking: `https://tejas67-hydra.github.io/HYDRA`. |
| `ELEVENLABS_VOICE_ID` | no | Default voice. |

`PORT` is provided by the host.

## Render (one click)

1. Open <https://render.com/deploy?repo=https://github.com/tejas67-hydra/HYDRA>
2. Sign in with GitHub and approve the blueprint. `render.yaml` already sets
   `NODE_ENV`, generates `SESSION_SECRET` and sets `ALLOWED_ORIGINS`.
3. Wait for the build, then copy the service URL, e.g.
   `https://hydra-api-xxxx.onrender.com`.
4. Check `https://hydra-api-xxxx.onrender.com/api/health` returns
   `{"ok":true,...}`.

The free plan has no persistent disk: `hydra.db` resets on redeploy. Add a disk
mounted at `/data` and set `DATA_DIR=/data` to keep accounts.

## Fly.io

```bash
fly launch --no-deploy          # keeps fly.toml
fly volumes create hydra_data --size 1
fly secrets set SESSION_SECRET=... ALLOWED_ORIGINS=https://tejas67-hydra.github.io
fly deploy
```

## Railway

Create a project from the GitHub repo; `railway.json` sets the start command
and health check. Add the variables above, then generate a domain.

## Any container host

```bash
docker build -t hydra-api .
docker run -p 8080:8080 -e SESSION_SECRET=... -e NODE_ENV=production \
  -e ALLOWED_ORIGINS=https://tejas67-hydra.github.io -v hydra_data:/data hydra-api
```

## Point the apps at it

Edit `js/config.js`:

```js
window.HYDRA_API = 'https://hydra-api-xxxx.onrender.com';
```

That is the only change needed. `js/legacy-bridge.js` then proxies the classic
app's `/api/*` calls to the real server with cookies, and routes its voice
calls to `/api/tts`.

## Account endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/auth/providers` | Which sign-in providers have credentials on this server |
| `POST /api/auth/verify-email/request` | Send (or return) a verification link for the signed-in user |
| `GET /api/auth/verify-email?token=` | Consume the link and mark the email verified |
| `POST /api/auth/password/reset` | Start a reset for an email |
| `POST /api/auth/password/confirm` | Set a new password with the reset token |
| `GET /api/auth/{github,google}/start` | Begin OAuth sign-in |
| `GET /api/auth/{github,google}/callback` | OAuth return, creates or links the account |
| `GET /api/account` | Profile, verified state, linked providers, sync revision |
| `GET /api/sync`, `POST /api/sync` | Pull and push the synced state (revision checked) |

OAuth redirect URIs to register with each provider:

```
https://YOUR-API/api/auth/github/callback
https://YOUR-API/api/auth/google/callback
```

## Verify

```bash
curl https://YOUR-API/api/health
curl -c cj -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"t@example.com","password":"pass12345"}' \
  https://YOUR-API/api/register
curl -b cj https://YOUR-API/api/profile/full
```

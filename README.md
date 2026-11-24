# HYDRA — AI Operating System

A browser-based AI desktop: a cinematic night scene, a companion robot that reacts to you,
voice, vision, music, memory, a plugin marketplace, games and a floating window manager.
No build tools, no server, no account required.

## Open it

**Double-click `HYDRA.html`.** That single file contains every stylesheet and script, so it
runs straight from your desktop even when Chrome blocks local module imports.

Alternatives:

- `index.html` — the same app from source. It loads `hydra.bundle.js` when opened over
  `file://`, and the ES modules when served over HTTP.
- Local server (best for camera and microphone permissions):

  ```bash
  cd "phonk hydra"
  python3 -m http.server 8080
  # open http://localhost:8080
  ```

Camera, microphone and speech recognition need `localhost` or HTTPS. Everything else works
from `file://`.

## Views

| View | What it does |
| --- | --- |
| **Home** | Illustrated night scene, companion robot, live clock, weather, system telemetry, upcoming tasks, music player, dock |
| **Chat** | AI assistant with streaming replies, attachments, voice input, emotion-aware companion |
| **Play** | 2048 (keyboard, WASD, swipe) and a memory match game |
| **Memories** | Saved facts, chat history, export |
| **Tools** | Dashboard of draggable widgets, tasks, notes, timers |
| **Vision** | Camera, QR scan, OCR, faces, pose, hands, person mask, and one-click identification (AI provider or on-device CLIP + MobileNet) |
| **Studio** | Generative music scenes, sequencer, ambience |
| **Workspace** | Documents with an assistant that summarises, rewrites, extracts tasks and explains the open doc |
| **Files** | Local workspace: folders, text files, import, edit, download |
| **Games** | Two mini games with a persistent best score |
| **Stats** | FPS graph, storage, message and memory counts, AI topic profile, personality sliders, developer log |
| **Market** | Install and remove extensions |
| **Automations** | Routines that ask the assistant, switch theme, toggle music, open a view or post a reminder |
| **Device** | Real PC actions (screenshot, lock, volume, open folders) through the local bridge |
| **Windows** | Floating notes, calculator, timer and live-stats windows |
| **Plugins** | Installed extensions and manifest installer |
| **Settings** | Theme, accent hue, AI provider and key, ElevenLabs voice, notifications and quiet hours, updates, data export |
| **Device** | Desktop bridge status, PC actions, screenshot preview, action log |

## Themes

Neon Purple, Cyber Blue, Crimson, Matrix Green, Arctic, Galaxy, RGB animated, Dawn, plus
dark, light and AMOLED modes. Accent hue is adjustable from Settings or the theme panel.

## AI providers

Settings → AI provider:

- **HYDRA Core** — offline rule-based brain, no key, no network.
- **OpenAI** — paste an API key.
- **Gemini** — paste an API key.
- **Custom / local** — any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM).

Keys are stored in `localStorage` on this machine only. Never commit them: the app reads
them at runtime from Settings, so a public build stays safe to share.

## Voice

System speech works everywhere. Add an ElevenLabs API key in Settings → Voice to use
studio voices; the app falls back to the system voice automatically if the request fails.

## Desktop bridge (real PC control)

A browser cannot control the OS on its own, so `bridge/hydra_bridge.py` provides the missing
piece. Run it on the machine you want to control:

```bash
python3 bridge/hydra_bridge.py
```

It prints a token, listens on `127.0.0.1:8765` only, and accepts a fixed action list:
screenshot, lock, volume, open URL, open folder, native notification, list/read files and
write notes into `~/HYDRA`. Paste the token into **Device → Connect**. Nothing runs unless
the bridge is started, and the token is required for every call.

## Learning

Chat replies have `good` / `bad` buttons. Ratings are stored locally, adjust the personality
dials, and add a short preference hint to the model prompt. Stats shows the counts and
preferred answer length; `Reset learning` clears it.

## Offline

`sw.js` caches the shell, styles and scripts after the first visit, and `manifest.webmanifest`
makes the app installable. Settings → About shows whether the cache is active and can check
`version.json` for a newer build. Vision's OCR and object detection download their models
once and then run on the device.

## Verified surface (1.6.1)

All 17 views load, search and the command palette work, themes switch, tasks persist,
account creation signs in and survives reload, and the add-widget catalog now has two
free slots (Mood, Uptime). The notification drawer opens and closes with one click.
Mobile keeps a horizontal card strip above the dock.

## Presence — turning towards you

Vision → **Follow me** starts a small camera loop on the device. HYDRA uses the
browser FaceDetector API where available and falls back to a motion centroid. It
turns its head and body towards whoever is in frame. Frames are never uploaded.
Camera access needs the https preview (or localhost); `file://` pages cannot open
a camera in Chrome.

## Objects and open vocabulary

Vision → **1000 objects** runs MobileNet v2 (1000 ImageNet classes). Vision → type
any labels ("cat, dog, laptop, coffee") and press **Ask** to run CLIP zero-shot,
which scores arbitrary descriptions rather than a fixed list. Models load on demand
from a CDN and are cached by the browser; the CLIP model is about 90 MB the first time.

No model knows "3 trillion objects" — that is not a real number any vision system
has. 1000 fixed classes plus open-vocabulary scoring is the honest maximum for a
browser app today.

## Animated companion

The robot is fully articulated: head, brows, eyes, mouth, two-segment arms with hands,
legs and wheel-feet. It blinks, sways, tracks your cursor with its pupils, flaps its mouth
while typing a reply, waves, dances, jumps and walks across the room. Say "walk",
"come here", "dance" or "wave" and it does it.

## Emotion engine

`js/emotion.js` scores every message against a lexicon and maps it to one of 40 named
states (happy, sad, angry, scared, love, jealous, proud, sleepy, ...) with an intensity
from punctuation, capitals and emoji. Each state drives eyes, brows, mouth, blush and
visor glow. Stats → Emotion lab lets you preview every state by hand.

## Sign in

Sign in with an email and a password against the HYDRA API, so the same account works in the
Companion, the Workspace and on every device. A username without an `@` becomes
`username@hydra.local`. The session is kept as a bearer token in this browser, which is what
lets a page served from GitHub Pages talk to the API on Render even when third-party cookies
are blocked.

If the API is unreachable, the app falls back to the account stored on this device, so it still
opens offline.

`account.html` covers the rest: verify the email, reset the password, connect GitHub or Google,
see the devices on the account, and push or pull the synced state by hand. Without
`RESEND_API_KEY` the verification and reset links are returned to the page and written to the
server log instead of being emailed.

Voice replies are off by default. Turn them on in Settings → Voice, and press Escape to stop
one mid-sentence.

## Add HYDRA to your devices

Device → **+ Add HYDRA**:

- **Install** — uses the browser install prompt when available, otherwise shows the exact steps.
- **Create desktop shortcut** — writes a real `.lnk` / `.webloc` / `.desktop` file to your
  Desktop through the bridge.
- **Copy link** and **QR code** — open HYDRA on a phone, then “Add to Home Screen”.

Pinning to the taskbar or dock is a browser/OS action: after installing, right-click the
running app icon and pin it.

## Search bar

Type in the top search field to find any feature: views, settings sections, vision tools,
device actions, workspace actions. Results appear live; `Enter` opens the first one, `↓`
moves into the full palette. Unknown text falls back to "Ask HYDRA".

## Keyboard

- `Ctrl/⌘ K` — command palette
- `Ctrl/⌘ ⇧ P` — command palette (VS Code style)
- `Ctrl/⌘ /` — shortcut help
- `Ctrl/⌘ M` — mute music
- `Ctrl/⌘ ⇧ L` — cycle theme
- `Esc` — close palette, panels, floating chat
- `← ↑ → ↓` / `WASD` — 2048

## Project layout

```
HYDRA.html          single-file build (open this)
index.html          source shell
hydra.bundle.js     classic bundle used by file://
style.css           base design system
css/                themes, dashboard, widgets, ai, world, extras, mobile
js/                 app, ai, companion, emotion, memory, voice, vision, music,
                    weather, widgets, dashboard, plugins, settings, notifications,
                    shortcuts, particles, animation, storage, internet, updater,
                    utils, extras, workspace
assets/             icons, sounds, wallpapers, animations
models/             optional local model assets
build.py            rebuilds HYDRA.html and hydra.bundle.js
sw.js               offline cache
manifest.webmanifest  installable app metadata
version.json        update manifest read by Settings → About
```

Rebuild after editing source:

```bash
python3 build.py
```

## Notes

- All data stays in the browser. Settings → Data can export a JSON backup.
- Plugins never run automatically; installing one only registers its manifest.
- Reduced-motion preference disables the boot sequence, particles and idle animation.
- If a feature needs a permission (camera, microphone, notifications), the browser asks the
  first time you use it.

## Motion & the companion

HYDRA controls motion itself, under **Settings → Motion**: `Full` keeps the robot and
the interface alive even when the OS asks for reduced motion, `Subtle` keeps the
robot but drops the entrance animations, and `Off` stills everything.

What is animated today:

- **Entrance** — a portal ring expands and the robot materialises, then waves.
- **Idle acting** — a scheduler picks between waving, looking around, stretching,
  dancing, walking, bouncing, scanning, playing with a cube, yawning, spinning and
  charging, with arm sway, ear twitches, chest pulse, blinking and a breathing shadow.
- **Aiming** — pupils follow the pointer, the body yaws towards the cursor, and with
  the camera on it turns towards your face instead.
- **App launches** — a hologram ring fires from the sidebar item and a glass frame
  unfolds over the panel.
- **AI** — digital rain while the model is thinking, a scan beam when the camera
  identifies something, a waveform while speaking.
- **Interface** — entrance staggers, ripples, dock bounce, magnetic hover lift,
  title sheen, icon breathing, card sheen and the theme flash.

## Engines

| Engine | Where | What it does |
| --- | --- | --- |
| **Three.js** | `js/three-bot.js` | The companion is a real WebGL model: clearcoat shell, black visor lens, emissive eyes, antenna, ears, arms, pulsing core, rotating floor rings and a starfield. It breathes, blinks, tracks the pointer, turns to your face with the camera on, dances, waves, jumps and tints to the current emotion. Auto-enables on capable desktops; fall back to the SVG robot anywhere else. |
| **GSAP** | `js/gsap-fx.js` | Entrance spring, panel stagger and the hologram launch ring. Loaded on demand; if the CDN is unreachable the CSS versions run instead. |
| **Lottie** | `js/lottie-fx.js` + `js/lottie-data.js` | A HUD ring drawn from inline Lottie data plays over the camera while Identify runs. Inline data means it also works offline and inside `HYDRA.html`. |
| **Rive** | `js/rive-bot.js` | Runtime installed and wired. Point **Settings → Rive asset** at a robot `.riv` and the `lookX`, `lookY`, `talking` and `emotion` inputs are driven automatically. Without an asset the Three.js robot stays in charge. |

Settings → **Companion renderer** switches between Auto, 3D (WebGL) and 2D (SVG).
Settings → **Repair & refresh** unregisters the service worker, clears caches and reloads
if a release ever looks stale; the topbar shows the running build.

## CV reliability

Identify tries the AI provider first, then CLIP and MobileNet on-device, and if a
model cannot be downloaded it falls back to an instant local scene report (light
level, palette, detail density) instead of an error. Model loading is capped at
30 seconds, so the camera view never hangs on "looking at this frame".

## Hosting

The preview URL belongs to the build sandbox and stops when the sandbox sleeps.
For a permanent address, publish the static build to any host:

```bash
./deploy.sh github  <owner>/<repo>      # GITHUB_TOKEN with repo scope -> https://<owner>.github.io/<repo>/
./deploy.sh netlify <site-name>         # NETLIFY_AUTH_TOKEN
./deploy.sh cloudflare <project-name>   # CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
```

The app uses only relative paths, so it runs from a subpath (`/repo/`) as well as
a domain root. `HYDRA.html` is a single self-contained file that also opens
straight from disk with no server at all.

## One HYDRA account

`js/universal.js` gives every HYDRA app on this site the same identity, memory
and notifications. Sign in once in Companion and `emo.html` (Workspace) opens
already signed in.

- Account, profile, memory and notifications live in one AES-GCM-encrypted
  document; the key is a non-extractable CryptoKey in IndexedDB.
- Open apps mirror each other over a BroadcastChannel, so a memory written in
  Workspace lands in Companion within a second.
- Two-factor (TOTP) and biometric (WebAuthn) are implemented client-side and
  verifiable offline. OAuth providers, email verification, password reset and
  cross-device sync need a server: the contract is in `docs/universal-api.md`.

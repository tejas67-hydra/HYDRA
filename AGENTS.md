# AGENTS.md — HYDRA

## What this is

A dependency-free, desktop-style AI OS that runs in the browser. Native ES modules, hand-written CSS tokens, no bundler, no framework, no backend. `index.html` + `script.js` + `js/*.js` + `css/*.css`.

## Run and verify

```bash
python3 -m http.server 12000      # serve the repo root
node --check js/*.js script.js    # syntax gate (run per file)
```

Headless visual check (the browser tool's screenshot can composite blank for this page; use Chromium directly):

```bash
chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --window-size=1440,900 --virtual-time-budget=9000 \
  --screenshot=/tmp/shot.png http://localhost:12000/index.html
```

Note: under `--virtual-time-budget`, CSS transitions freeze at their start value. If a colour looks wrong in a headless capture, inject `*{transition:none!important}` before judging it.

## Architecture

- `script.js` → `boot()` in `js/app.js`. Boot order matters: settings → theme → particles → weather → AI → dashboard → shortcuts → views.
- Views are `<section class="view" id="view-*">`; `setView()` toggles `.is-active` and updates `body.dataset.view` (used for context-specific CSS such as the orb position).
- Cross-module communication is the event bus in `js/utils.js`: `ai:ask`, `ai:token`, `ai:stream:end`, `ai:message`, `ui:view`, `ui:sidebar`, `ui:floating`, `theme:cycle`, `music:*`, `notify`, `settings:change`, `vision:state`, `plugin:command`, `plugin:widget`.
- Singletons exported by their modules: `settings`, `notifications`, `weather`, `music`, `voice`, `vision`, `ai`, `emotion`, `memory`, `dashboard`, `plugins`, `updater`, `companion`, `particles`, `internet`.
- `js/app.js` is the only place that touches DOM ids directly for wiring; feature modules own their own DOM.

## Conventions and gotchas

- `el(tag, props, children)` in `utils.js` supports `class`, `dataset`, `html`, `on*` handlers, and `style` objects. Custom properties (`--w`, `--h`) must go through `style` and are handled with `setProperty` — do not use `Object.assign` on `style` for them.
- Widget sizing is `--w` (of 12 columns) and `--h` (rows of 84px). Defaults live in `js/dashboard.js`; CSS fallbacks are `span var(--w, 4)` / `span var(--h, 2)`.
- All colours come from tokens in `style.css :root` and per-theme overrides in `css/themes.css`. Never hardcode a surface colour in a component; use `--bg-*`, `--text*`, `--accent*`, `--line*`, `--glass*`.
- The particle canvas is injected as `<canvas class="fx-canvas">` and must stay `position: fixed; z-index: -1` — without the CSS rule it sits in flow and pushes the entire app below the fold.
- Theme switching relies on CSS custom properties; `applySettings()` sets `data-theme` on `<html>`. The `rgb` theme animates `--hue` via `@property` and degrades to a static palette.
- The companion scene is pure CSS/SVG; `companion.setScene()` reads time and weather to switch sky, rain, and snow. Keep new poses to transforms only so `prefers-reduced-motion` can disable them.
- `music` is a generative Web Audio engine; `music.play(trackId)` accepts a scene id and must be called from a user gesture the first time.
- `vision.running` (not `active`) is the live flag.
- AI providers are key-gated in settings; every call path must fall back to `LocalBrain` so the UI never dead-ends.

## Style

- Two-space indent, single quotes, semicolons, ESM only.
- Small pure helpers go in `utils.js`; anything stateful becomes a class or singleton module.
- Comments explain invariants, not restatements. Section banners use `/* ---- name ---- */`.
- New UI must be keyboard reachable and carry `aria-label`s on icon-only controls.

## Testing

There is no test runner. Use `node --check` for syntax, the import/export audit (parse `import { … }` against `export` names), and headless Chromium screenshots for layout. The app's own smoke path: boot → send a chat message → open palette → cycle theme → play music → switch views, with zero console errors.

## Packaging and views (current)

- `build.py` produces two artifacts: `hydra.bundle.js` (classic concatenated bundle, used by
  `index.html` when opened over `file://`) and `HYDRA.html` (everything inlined, single file).
  Rebuild with `python3 build.py`; `node --check hydra.bundle.js` is the syntax gate.
- Views now: home, dashboard, assistant, play, vision, music, memories, files, games, stats,
  market, automations, windows, plugins, settings. New sections live in `index.html` with ids
  `view-files` … `view-windows`; their behaviour is in `js/extras.js` (`initExtras()`), styling
  in `css/extras.css`.
- `js/extras.js` owns: local file workspace (`hydra.v1.files.nodes`), 2048 + memory games
  (`hydra.v1.games.best2048`), stats/personality/dev log, marketplace catalog (installs via
  `plugins.install`), automations (`hydra.v1.automations.items`), and the floating window
  manager. Its `bus.emit('ai:ask', …)` is how "Run now" starts a conversation.
- `storage` prefixes keys with `hydra.v1.`; read with `storage.get('files.nodes')`, not raw
  `localStorage`.
- Mobile: `css/mobile.css` no longer contains Home rules — `css/world.css` owns all scene
  breakpoints. The topbar is re-enabled on Home below 980px so the sidebar menu is reachable.
- The nav has 15 items; `@media (max-height: 860px)` compacts them to 36px. Keep new items in
  both `VIEWS` and `VIEW_META` in `js/app.js`.


## v1.1.0 — feature completion pass

- **Vision** (`js/vision.js`): added OCR (tesseract.js, lazy CDN), object detection
  (tfjs + coco-ssd, lazy), swipe gestures from the motion grid, and live subtitles via
  SpeechRecognition. Controls are `[data-vision-act]` buttons bound in `bindControls()`.
- **Workspace** (`js/workspace.js`): documents + assistant panel. Falls back to a local
  extractive answer when the provider is `local`, so the view works offline.
- **ElevenLabs** (`js/voice.js`): `speak()` routes to `speakEleven()` when `settings.elevenKey`
  is set, and falls back to `speakSystem()` on any failure.
- **Smart notifications** (`js/notifications.js`): DND, quiet hours, 10s grouping, priority
  stripes, `#btn-dnd` toggle in the drawer.
- **Automations** (`js/extras.js`): `kind` field — prompt, theme, music, view, notify.
- **Calendar** (`js/widgets.js`): click a day to add an event, right-click to remove.
- **PWA**: `sw.js`, `manifest.webmanifest`, `version.json`, registration in `app.js`.
- **Personality** (`js/ai.js`): persona dials are injected into the system prompt.
- Bump `VERSION` in `js/updater.js` and the cache name in `sw.js` together when shipping.


## v1.2.0 — robot, PC bridge, learning

- Robot recoloured purple in `index.html` (`shellG`, `visorG`, `earG`, `eyeG` gradients).
- `bridge/hydra_bridge.py`: stdlib-only localhost server on 127.0.0.1:8765 with a token file
  (`bridge/.token`), CORS, and a fixed action allowlist. No shell execution.
- `js/bridge.js` + `js/device.js` + `view-device`: Device view, connect flow, actions, log.
  Automations gained `kind: 'desktop'`.
- `js/learning.js`: reply ratings (`good`/`bad` in chat) persist to `learning.feedback`,
  adapt `personaVerbosity`, and inject `learning.promptHint()` into the system prompt.
  Stats shows counts, preferred length and a reset button.
- Bump `VERSION`, `sw.js` cache name and `version.json` together when shipping.

## v1.3.0 — feature search
- Topbar `#omni-input` drives the palette live: focus/input calls `setPaletteQuery`, Enter
  calls `runFirst`. `openPalette(prefill, { focus })` no longer forces focus.
- `score()` in `shortcuts.js` uses prefix bonus + keyword subsequence; fuzzy matches are
  limited to title/keywords so unrelated commands stay out.
- All 17 views registered as Navigate commands with synonyms; feature commands added for
  vision tools, workspace, files, automations, device, settings sections (scroll + flash),
  DND and learning reset.
- `workspace:new`, `workspace:act`, `device:action` bus events connect commands to views.

## v1.4.0 — login, add/install, robot rebuild
- Robot SVG rebuilt in `index.html` to the supplied reference: oversized visor head, large
  purple fins, headphone pods, chest emblem, wheel feet. Emotion classes preserved.
- `css/auth.css` + `js/auth.js` + `#auth`: local sign-in (SHA-256 hash via SubtleCrypto,
  session in storage). `body.auth-locked` prevents scroll; Settings → Account locks/signs out.
- `js/install.js`: `beforeinstallprompt` capture, platform detection, QR URL, step text.
- Device `+ Add HYDRA` modal: install, desktop shortcut via bridge, copy link, QR.
- Bridge gained `create_shortcut` (Windows `.url`, macOS `.webloc`, Linux `.desktop`).

## v1.5.0 — articulated robot and emotion engine
- SVG: legs with struts around each wheel, two-segment arms (`.robot__forearm`, `.robot__hand`),
  brows, heart eyes, laugh and grit mouths.
- `css/world.css`: blink, talk flap, head sway, walk cycle (bob, legs, wheels, arms),
  wave with forearm, per-emotion face rules, walk offset via `--walk-x` on `.companion`.
- `js/emotion.js`: 40 emotions, lexicon scoring, intensity, `preview()`, history.
- `js/companion.js`: `walk(distance)`, talk pose synced to typing, movement commands from
  chat text, idle walks.
- Stats → Emotion lab chips; `window.__hydra` exposes companion/emotion/setView for testing.

## v1.6.0 — presence, open-vocabulary vision, deck rebuild
- `js/presence.js`: getUserMedia + FaceDetector with motion-centroid fallback, emits
  `presence:face` every 320ms; companion turns via `data-facing` and `--look-x`.
- `js/objects.js`: MobileNet v2 (1000 classes) and CLIP zero-shot via transformers.js,
  both lazy-loaded from jsDelivr.
- Vision panel: `data-vision-act="thousand" | "presence" | "ask"`, `#vision-query` input.
- Home deck rebuilt: top pill nav, clock/weather, feature grid, recent activity, music,
  CPU/RAM/Net sparklines, calendar, tasks, entertainment, themes, mini games, quote.
- `js/deck.js` owns the deck; `initDeck()` runs after `initCompanion()`.

## v1.6.1 — audit fixes
- Removed the duplicate `#btn-notifications` listener in app.js (drawer opened then closed).
- Added `mood` and `uptime` widgets so the add-widget catalog has free slots.
- Mobile (<=900px): horizontal deck strip above the dock, smaller companion, icon-only omni.

## Motion layer (v1.6.2)
- `css/motion.css` holds every shell animation: entrances (transform-only, so
  content is never invisible if the timeline stalls), hover lifts, ripples,
  dock bounce, nav indicator, theme flash, cursor glow, game tile pops.
- `js/motion.js` adds `body.motion-on` only after auth unlocks, staggers view
  children via `--i`, delegates pointer ripples, and sets `motion-settled`
  after 2 s to hard-stop entrance animations.
- Reduced motion: `prefers-reduced-motion` disables the whole layer and
  `initMotion()` returns early.
- `build.py` inlines `css/motion.css` into `HYDRA.html`; keep it before
  `mobile.css` so responsive overrides win.

## Computer vision (v1.7.0)
- `js/cv.js` adds four on-device models to the Vision view: BlazeFace
  (`face-detection`), MoveNet Lightning (`pose-detection`), MediaPipe Hand
  Landmarker (`tasks-vision`, dynamic ESM import) and BodyPix person mask.
- Models load lazily from jsDelivr on first use and are cached in a `detectors`
  Map; failures show a status chip plus a toast instead of throwing.
- Overlay is `#vision-cv`, drawn after each inference (never cleared mid-run) and
  guarded by a generation counter so a stale result cannot repaint after stop
  or a mode switch.
- The camera stream is shared with `vision.js`; frames never leave the device.

## Facing the user & identification (v1.8.0)
- `presence.js` now runs BlazeFace (`models.js`) on the Vision camera stream,
  falls back to the native FaceDetector then a motion centroid, smooths the
  face position and emits `presence:face` at ~6.7 Hz.
- `companion.js` converts the mirrored camera x into screen space and drives
  `--turn` (body yaw), `--look-x/--look-y` (pupils). A miss is held for 1.2 s
  before the pose recentres. `css/world.css` applies the yaw to `.robot`.
- Vision camera start auto-enables presence when `presenceAuto` is on
  (Settings → "Look at me"); the stream is shared, never opened twice.
- `objects.identify()` merges CLIP zero-shot over a ~250-label vocabulary with
  MobileNet's 1000 classes. `ai.describeImage()` sends the frame to OpenAI,
  Gemini or Ollama when a provider key exists, and Identify falls back to the
  local models otherwise.
- Fixed two latent ReferenceErrors: `vision.js` used `presence` and `objects`
  without importing them, which broke Follow me, 1000 objects and Ask.

## Motion 2.0 notes (v2.0.0)
- Two global `@media (prefers-reduced-motion: reduce)` blocks (`style.css`,
  `css/motion.css`) stilled the entire app on any machine with Reduce Motion on.
  Both are now gated on `html[data-motion="off"]`; `applySettings` writes that
  attribute from `motionLevel` (full | subtle | off).
- The service worker was cache-first, so a release could never reach returning
  visitors. It is network-first now, and `build.py` syncs `CACHE` with VERSION.
  `app.js` reloads once on `controllerchange` when a previous worker existed.
- `js/pack.js` + `css/pack.css` hold the animation pack: hologram launches,
  scan beams, digital rain, XP bursts, portal entrance and the extra poses
  (look, stretch, bounce, spin, yawn, scan, play, charge).
- `poseOnce('look' | 'stretch' | 'bounce' | 'spin')` used to have no CSS at all.

## Engines (v2.1.0)
- `js/three-bot.js` renders the companion with Three.js (dynamic import of
  `three@0.160.0/build/three.module.js`). Auto mode requires >= 981px, >= 4 cores
  and WebGL. It reads `#companion[data-pose|data-emotion]` and `presence:face`.
- `js/gsap-fx.js` loads `gsap@3.12.5/+esm` lazily; `pack.hologram` and
  `companion.entrance` use it and fall back to the CSS versions on failure.
- `js/lottie-fx.js` + `js/lottie-data.js` play an inline Lottie HUD (no asset
  fetch) over the camera during Identify.
- `js/rive-bot.js` wires `@rive-app/canvas`; set `settings.riveSrc` to a .riv.
  Input names matched: lookX, lookY, talking, emotion.
- Settings gained Companion renderer, Rive asset and Repair & refresh; the
  topbar shows the running version.

## Accounts and sync (v2.7.2)
- The API is `https://hydra-api-txyr.onrender.com` (Render service
  `srv-dc2nvbuk1f9s738j9ib0`, repo `tejas67-hydra/HYDRA` branch `master`,
  autoDeploy). `js/config.js` sets `window.HYDRA_API`; every page must load it
  before any module that talks to the API.
- Cookies do not survive between `github.io` and `onrender.com`, so the server
  also returns a bearer token from `/api/login` and `/api/register`. Clients keep
  it in `localStorage['hydra.token']` and send `Authorization: Bearer`. Cookies
  remain for same-site use; `requireAuth` accepts either.
- `server-accounts.js` owns verification, reset, OAuth, `/api/account` and
  `/api/sync`. It must be registered **before** the `app.get('*')` SPA fallback,
  otherwise its GET routes are shadowed.
- Sync is last-write-wins per item with a revision check: `POST /api/sync`
  returns 409 and the current doc, the client merges and retries.
- `js/auth.js` (Companion login) and `js/universal.js` both sign in against the
  API; the on-device account is the fallback when the API is unreachable.
- Voice output defaults to off (`settings.voiceOutput`); Escape stops speech.

## Shared navigation bar (v2.8.0)
- `js/nav.js` is a plain script (not a module) injected on `index.html`,
  `emo.html`, `fullhydra.html` and `account.html`. It builds one 46px fixed bar
  with: brand, ecosystem switch slot (`#hydra-nav-switch`), search, Add to
  device, fullscreen and the profile button. It sets `body.has-hydra-nav`
  (padding-top 46px) so page content is never hidden under the bar.
- The ecosystem switcher is no longer floating. `initAppSwitcher({ mount })`
  renders into the nav slot: `js/app.js` for Companion, the module block in
  `emo.html`/`account.html`, and `js/legacy-bridge.js` for Classic. Never call it
  without `mount` — that restores the old floating button.
- Search reads apps, nav actions, `hydra.tasks`, `hydra.notes`, `hydra.memory`
  and quick commands. `Ctrl/Cmd+K` or `/` focuses it. Add new entries to the
  `list` array in `nav.js` so they stay reachable by search.
- `app-switch` overlay uses `z-index: 10080` (veil 10070) — Classic's login
  screen is 10004, so a lower value hides the panel behind it.
- Install: `manifest.companion.json`, `manifest.workspace.json`,
  `manifest.classic.json` and `manifest.suite.json` (start_url differs, `id`
  differs, so Chrome offers three separate installs). `install.html` handles the
  suite, `install-app.html?manifest=...` handles a single app.
- Profile picture: `hydra.pp` in localStorage holds a 192px JPEG data URL; the
  nav avatar, the Workspace header and `universal.updateProfile({avatar})` all
  read it. The hidden `#hydra-nav-pp-file` input is the only upload path.
- `build.py` now inlines `js/config.js`, `js/nav.js` and `js/app-switcher.js`
  (module syntax stripped) into `HYDRA.html`, and strips `export default` /
  default imports from the bundle. Without that, `hydra.bundle.js` is a syntax
  error as a classic script and the file:// build never boots.
- The production API only sends CORS headers for `https://tejas67-hydra.github.io`.
  While developing, point `window.HYDRA_API` in `js/config.js` at
  `http://localhost:3100` and run `node server.js`; otherwise sign-in falls back to
  the on-device account and no bearer token appears.

## Profile studio (v2.9.0)
- `profile.html` + `js/profile-studio.js` (plain script, works on file://) edit
  the display name and picture, and generate a profile-photo prompt from a
  style, mood and palette. Reached from the nav avatar menu on every page and
  from the Workspace "Your profile" card.
- Name and picture go through `universal.updateProfile({ displayName, avatar })`,
  which persists locally, PATCHes `/api/account`, then pushes the sync doc.
  The server stores `users.name` and `users.avatar` (a data URL under 400 kB)
  and returns both from `publicUser`, so a new device restores them on
  `restoreFromToken`.
- `hydra.pp` mirrors the avatar for pages that load before the module runs, and
  `hydra.displayName` mirrors the name. Both are updated on save.
- The generated avatar is drawn on a 192 px canvas (gradient, glow, monogram,
  style flourish) and stored as JPEG; it is deterministic from
  name + style + palette + salt, so "New wording" and "Use this look" produce a
  fresh variant without a network call.
- Events from `broadcast()` are dispatched on `window`, so page code must listen
  with `window.addEventListener('hydra:session', …)`. A `document` listener never
  sees them, which is why the studio kept a stale name until this was fixed.

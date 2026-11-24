/**
 * Profile studio — display name, photo, and a prompt generator for profile pictures.
 * Plain script on purpose: it must work on file:// where ES modules are blocked.
 */
(() => {
  /* Owner's own keys, written into the page on request. They are public: rotate
     them by editing this array, and delete the entry once it is revoked. A dead
     key is skipped for ten minutes so it never slows down a generation. */
  const BUILTIN_KEYS = [
    { engine: 'gemini', key: 'AQ.Ab8RN6Ip9a8FJcb9HbN5WToKwzkeW32g2vCubThi8V7T0oDVUA' },
    { engine: 'openai', key: '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' },
  ];
  const OFF_KEY = 'hydra.imgkey.off';

  const PP_KEY = 'hydra.pp';
  const NAME_KEY = 'hydra.displayName';

  const STYLES = {
    neon: {
      subject: 'a futuristic head-and-shoulders portrait with a soft cybernetic glow',
      light: 'violet and cyan neon rim light',
      detail: 'faint reflections on the skin',
    },
    robot: {
      subject: 'a friendly white companion robot with a glossy black visor and small cat ears',
      light: 'soft studio light with a violet accent',
      detail: 'rounded, approachable silhouette',
    },
    hologram: {
      subject: 'a translucent holographic bust built from drifting light particles',
      light: 'internal glow and scanline shimmer',
      detail: 'deep navy background',
    },
    orb: {
      subject: 'a glass orb holding a miniature nebula and a glowing core',
      light: 'soft caustic light through glass',
      detail: 'reflective highlights and a clean rim',
    },
    anime: {
      subject: 'a clean anime character portrait with expressive eyes',
      light: 'cel-shaded light with soft highlights',
      detail: 'crisp linework',
    },
    studio: {
      subject: 'a professional studio headshot',
      light: 'soft key light with gentle fill',
      detail: 'neutral seamless backdrop',
    },
    ink: {
      subject: 'a loose watercolour portrait with ink outlines',
      light: 'flat natural light',
      detail: 'visible paper texture',
    },
    pixel: {
      subject: 'a 16-bit pixel-art avatar',
      light: 'limited palette shading',
      detail: 'crisp edges, no anti-aliasing',
    },
  };

  const VIBES = {
    calm: 'serene mood, soft contrast',
    bold: 'confident mood, high contrast',
    playful: 'playful mood, bright colour',
    mysterious: 'mysterious mood, low key shadows',
    elegant: 'elegant mood, refined and muted',
    focused: 'focused mood, clean and minimal',
  };

  const PALETTES = {
    violet: { name: 'violet dusk', colors: ['#a855f7', '#38bdf8', '#1b1035'] },
    aurora: { name: 'aurora', colors: ['#a78bfa', '#22d3ee', '#0b1026'] },
    ember: { name: 'ember', colors: ['#fb7185', '#f59e0b', '#2a0f14'] },
    mint: { name: 'mint circuit', colors: ['#34d399', '#22d3ee', '#062a26'] },
    mono: { name: 'graphite', colors: ['#e5e7eb', '#94a3b8', '#111827'] },
  };

  const FRAMING = [
    'head and shoulders, centered square composition',
    'close portrait, centred, square crop',
    'shoulders up, symmetrical framing, square format',
  ];
  const FINISH = [
    '85mm portrait lens, shallow depth of field, crisp detail, high resolution',
    '50mm lens, soft falloff, fine grain, high detail',
    'portrait lens, clean edges, gentle bokeh, sharp focus',
  ];
  const ENGINES = {
    free: {
      label: 'Free engine',
      key: null,
      help: 'No key needed — pictures come from Pollinations, a free public image service. It can be slow at busy times.',
    },
    gemini: {
      label: 'Google Gemini',
      key: 'hydra.imgkey.gemini',
      help: 'Needs a Google AI Studio key: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. The free tier allows only a few images per day; billing raises the limit.',
    },
    openai: {
      label: 'OpenAI',
      key: 'hydra.imgkey.openai',
      help: 'Needs an OpenAI key with credits: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a>. Image models bill per picture.',
    },
  };

  const state = { name: '', avatar: '', salt: 0, ready: false, busy: false, set: 0 };

  const $ = (id) => document.getElementById(id);
  const universal = () => window.hydraUniversal;

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'H';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function paint() {
    const box = $('preview');
    if (!box) return;
    box.innerHTML = state.avatar
      ? `<img src="${state.avatar}" alt="Your profile picture" />`
      : initials(state.name || 'H');
    const field = $('name');
    if (field && !field.value) field.value = state.name;
  }

  function status(text, kind = '') {
    const node = $('status');
    if (!node) return;
    node.textContent = text;
    node.className = `status ${kind}`;
  }

  async function load() {
    const field = $('name');
    const typed = Boolean(field?.value && field.dataset.dirty === '1');
    let name = localStorage.getItem(NAME_KEY) || '';
    let avatar = localStorage.getItem(PP_KEY) || '';
    const u = universal();
    if (u) {
      try {
        await u.init();
        if (u.signedIn) {
          name = u.profile?.displayName || name;
          avatar = u.profile?.avatar || avatar;
        }
      } catch { /* the studio still works offline */ }
    }
    state.avatar = avatar;
    if (!typed) {
      state.name = name;
      if (field) field.value = name;
    }
    state.ready = true;
    paint();
    buildPrompt();
    paintEngine();
    buildGallery();
  }

  /* ---------------------------- prompt builder ---------------------------- */

  function buildPrompt(force = false) {
    const box = $('prompt');
    if (!force && box.dataset.dirty === '1') return;
    const style = STYLES[$('style').value] || STYLES.neon;
    const vibe = VIBES[$('vibe').value] || VIBES.calm;
    const palette = PALETTES[$('palette').value] || PALETTES.violet;
    const extra = $('extra').value.trim();
    const pick = (list) => list[state.salt % list.length];

    const prompt = [
      style.subject,
      vibe,
      `${palette.name} palette`,
      pick(FRAMING),
      style.light,
      style.detail,
      extra,
      pick(FINISH),
      'profile picture',
    ].filter(Boolean).join(', ');

    $('prompt').value = prompt;
    return prompt;
  }

  /* ---------------------------- avatar drawing ---------------------------- */

  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawAvatar(variant = 0) {
    const size = 192;
    const style = $('style').value;
    const palette = PALETTES[$('palette').value] || PALETTES.violet;
    const seed = hash(`${state.name}|${style}|${$('palette').value}|${state.salt}|${state.set}|${variant}`);
    const rand = rng(seed);
    const [c1, c2, base] = palette.colors;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const angle = rand() * Math.PI * 2;
    const grad = ctx.createLinearGradient(
      size / 2 + Math.cos(angle) * size / 2, size / 2 + Math.sin(angle) * size / 2,
      size / 2 - Math.cos(angle) * size / 2, size / 2 - Math.sin(angle) * size / 2,
    );
    grad.addColorStop(0, c1);
    grad.addColorStop(0.55, c2);
    grad.addColorStop(1, base);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const glow = ctx.createRadialGradient(
      size * (0.3 + rand() * 0.4), size * (0.25 + rand() * 0.3), 2,
      size / 2, size / 2, size * 0.8,
    );
    glow.addColorStop(0, 'rgba(255,255,255,.55)');
    glow.addColorStop(0.35, 'rgba(255,255,255,.08)');
    glow.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(size / 2, size / 2);

    if (style === 'pixel') {
      const cells = 8;
      const cell = size / cells;
      for (let y = 0; y < cells; y += 1) {
        for (let x = 0; x < cells; x += 1) {
          if (rand() > 0.62) {
            ctx.fillStyle = [c1, c2, '#ffffff'][Math.floor(rand() * 3)];
            ctx.globalAlpha = 0.12 + rand() * 0.2;
            ctx.fillRect(x * cell - size / 2, y * cell - size / 2, cell, cell);
          }
        }
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = size * 0.012;
      ctx.stroke();

      if (style === 'orb') {
        ctx.beginPath();
        ctx.arc(-size * 0.12, -size * 0.14, size * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.22)';
        ctx.fill();
      }
      if (style === 'neon') {
        for (let i = 0; i < 3; i += 1) {
          const y = -size * 0.3 + i * size * 0.28 + rand() * 8;
          ctx.fillStyle = 'rgba(255,255,255,.10)';
          ctx.fillRect(-size / 2, y, size, 2);
        }
      }
      if (style === 'ink') {
        ctx.beginPath();
        ctx.arc(size * 0.1, size * 0.08, size * 0.3, 0.4, Math.PI * 1.7);
        ctx.strokeStyle = 'rgba(0,0,0,.25)';
        ctx.lineWidth = size * 0.02;
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(size * (style === 'pixel' ? 0.34 : 0.4))}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillText(initials(state.name), size / 2 + 2, size / 2 + 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(initials(state.name), size / 2, size / 2);

    return canvas.toDataURL('image/jpeg', 0.88);
  }

  /* ---------------------------- photo providers --------------------------- */

  function engineKey(engine) {
    const conf = ENGINES[engine];
    return conf?.key ? localStorage.getItem(conf.key) || '' : '';
  }

  function pickEngine() {
    const chosen = $('engine').value;
    if (chosen !== 'auto') return chosen;
    if (engineKey('openai')) return 'openai';
    if (engineKey('gemini')) return 'gemini';
    return 'free';
  }

  function paintEngine() {
    const engine = $('engine').value;
    const conf = ENGINES[engine];
    const help = $('keyhelp');
    if (engine === 'auto') {
      const saved = ['openai', 'gemini'].filter((name) => engineKey(name));
      help.innerHTML = saved.length
        ? `Will use ${ENGINES[saved[0]].label} because a key is saved on this device.`
        : 'No key saved, so the free engine will be used. ' + ENGINES.free.help;
      $('imgkey').placeholder = 'Pick an engine to save its key';
    } else {
      help.innerHTML = conf.help;
      $('imgkey').placeholder = conf.key ? 'Paste the key here' : 'No key needed';
      $('imgkey').value = conf.key ? engineKey(engine) : '';
      $('imgkey').disabled = !conf.key;
    }
    $('savekey').disabled = !conf?.key;
  }

  async function freeImage(prompt) {
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
      + `?width=512&height=512&seed=${seed}&nologo=true`;
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = () => reject(new Error(
        'The free engine did not return a picture. Try again, or save a Gemini or OpenAI key for a reliable engine.',
      ));
      image.src = url;
    });
    return url;
  }

  async function geminiImage(prompt, key) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
      throw new Error(
        'Gemini has no image quota left on this key right now. The free tier is capped per day — '
        + 'wait for the reset, enable billing on the Google project, or switch to another engine.',
      );
    }
    if (!res.ok) throw new Error(data.error?.message || `Gemini answered ${res.status}. Check the key.`);
    const parts = data.candidates?.[0]?.content?.parts || [];
    const image = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const raw = image?.inlineData?.data || image?.inline_data?.data;
    if (!raw) throw new Error('Gemini returned no picture. Try wording the prompt as a portrait.');
    return toSquare(`data:image/png;base64,${raw}`);
  }

  const OPENAI_MODELS = ['gpt-image-1-mini', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-2'];

  async function openaiImage(prompt, key) {
    let lastError = '';
    for (const model of OPENAI_MODELS) {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, prompt, size: '1024x1024', quality: 'low', n: 1 }),
      });
      const data = await res.json().catch(() => ({}));
      const message = data.error?.message || `OpenAI answered ${res.status}.`;
      if (res.ok) {
        const item = data.data?.[0] || {};
        if (item.b64_json) return toSquare(`data:image/png;base64,${item.b64_json}`);
        if (item.url) return toSquare(item.url);
        throw new Error('OpenAI returned no picture.');
      }
      if (/credit|billing|quota/i.test(message)) {
        throw new Error(`OpenAI: ${message}`);
      }
      if (res.status === 404 || /model/i.test(message)) {
        lastError = message;
        continue;
      }
      throw new Error(message);
    }
    throw new Error(lastError || 'OpenAI could not make that picture with this key.');
  }

  function keyIsOff(engine) {
    try {
      const map = JSON.parse(localStorage.getItem(OFF_KEY) || '{}');
      return (map[engine] || 0) > Date.now();
    } catch {
      return false;
    }
  }

  function markKeyOff(engine) {
    try {
      const map = JSON.parse(localStorage.getItem(OFF_KEY) || '{}');
      map[engine] = Date.now() + 10 * 60 * 1000;
      localStorage.setItem(OFF_KEY, JSON.stringify(map));
    } catch {
      /* storage full or blocked: nothing to remember */
    }
  }

  async function builtinImage(prompt) {
    for (const item of BUILTIN_KEYS) {
      if (!item.key || keyIsOff(item.engine)) continue;
      try {
        const image = item.engine === 'openai'
          ? await openaiImage(prompt, item.key)
          : await geminiImage(prompt, item.key);
        return { image, engine: item.engine };
      } catch {
        markKeyOff(item.engine);
      }
    }
    return null;
  }

  async function serverImage(prompt, engine) {
    const base = window.HYDRA_API || '';
    const token = localStorage.getItem('hydra.token');
    if (!base || !token) return null;
    let res;
    try {
      res = await fetch(`${base}/api/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt, engine }),
      });
    } catch {
      return null;
    }
    if (res.status === 404 || res.status === 503) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The HYDRA image service answered ${res.status}.`);
    return data.image ? { image: await toSquare(data.image), engine: data.engine || 'shared key' } : null;
  }

  async function generatePhoto() {
    if (state.busy) return;
    const prompt = $('prompt').value.trim();
    if (!prompt) {
      $('photo-status').textContent = 'Type what you want the photo to show first.';
      $('photo-status').className = 'status bad';
      return;
    }
    const engine = pickEngine();
    const key = engineKey(engine);

    state.busy = true;
    $('photo').disabled = true;
    const line = $('photo-status');
    line.className = 'status';
    line.textContent = `Generating with ${ENGINES[engine].label}… this can take up to 30 seconds.`;

    try {
      let data = null;
      let source = ENGINES[engine].label;
      if (key) {
        data = engine === 'openai' ? await openaiImage(prompt, key) : await geminiImage(prompt, key);
      } else {
        let shared = null;
        try {
          shared = await serverImage(prompt, engine);
        } catch (err) {
          if (engine !== 'free') throw err;
        }
        const built = shared ? null : await builtinImage(prompt);
        if (shared) {
          data = shared.image;
          source = `HYDRA's shared ${shared.engine} key`;
        } else if (built) {
          data = built.image;
          source = `HYDRA's built-in ${built.engine} key`;
        } else if (engine === 'free') {
          data = await freeImage(prompt);
        } else {
          throw new Error(
            `${ENGINES[engine].label} has no working key right now — the built-in one is out of `
            + 'quota or credit. Save your own key below, or switch the engine to the free one.',
          );
        }
      }
      if (!data) throw new Error('That picture could not be read. Try again.');
      applyAvatar(data);
      const ok = await save({ avatar: data });
      line.textContent = ok
        ? `Photo generated with ${source} and saved to your profile.`
        : `Photo generated with ${source} on this device only.`;
      line.className = 'status good';
    } catch (err) {
      line.textContent = err.message || 'Could not generate that picture.';
      line.className = 'status bad';
    } finally {
      state.busy = false;
      $('photo').disabled = false;
    }
  }

  function drawGalleryAvatar(index) {
    const size = 192;
    const names = Object.keys(PALETTES);
    const palette = PALETTES[names[index % names.length]];
    const [c1, c2, base] = palette.colors;
    const rand = rng(hash(`gallery|${index}|${state.set}`));

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const angle = (index / 12) * Math.PI * 2 + rand() * 0.6;
    const grad = ctx.createLinearGradient(
      size / 2 + Math.cos(angle) * size / 2, size / 2 + Math.sin(angle) * size / 2,
      size / 2 - Math.cos(angle) * size / 2, size / 2 - Math.sin(angle) * size / 2,
    );
    grad.addColorStop(0, c1);
    grad.addColorStop(0.55, c2);
    grad.addColorStop(1, base);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.strokeStyle = 'rgba(255,255,255,.30)';
    ctx.fillStyle = 'rgba(255,255,255,.20)';
    const motif = index % 6;

    if (motif === 0) {
      for (let ring = 1; ring <= 4; ring += 1) {
        ctx.beginPath();
        ctx.arc(0, 0, (size * 0.1) * ring, 0, Math.PI * 2);
        ctx.lineWidth = size * 0.012;
        ctx.stroke();
      }
    } else if (motif === 1) {
      for (let row = -3; row <= 3; row += 1) {
        for (let col = -3; col <= 3; col += 1) {
          if (rand() > 0.45) {
            ctx.beginPath();
            ctx.arc(col * size * 0.14, row * size * 0.14, size * 0.022, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    } else if (motif === 2) {
      for (let line = -size / 2; line < size / 2; line += size * 0.11) {
        ctx.beginPath();
        ctx.moveTo(-size / 2, line);
        ctx.lineTo(size / 2, line + size * 0.12);
        ctx.lineWidth = size * 0.014;
        ctx.stroke();
      }
    } else if (motif === 3) {
      for (let arc = 1; arc <= 3; arc += 1) {
        ctx.beginPath();
        ctx.arc(0, size * 0.35, size * 0.18 * arc, Math.PI, Math.PI * 2);
        ctx.lineWidth = size * 0.016;
        ctx.stroke();
      }
    } else if (motif === 4) {
      ctx.beginPath();
      const points = 3 + (index % 3);
      for (let point = 0; point <= points; point += 1) {
        const theta = (point / points) * Math.PI * 2 - Math.PI / 2;
        const radius = size * 0.34;
        const x = Math.cos(theta) * radius;
        const y = Math.sin(theta) * radius;
        if (point === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.lineWidth = size * 0.018;
      ctx.stroke();
    } else {
      for (let bar = 0; bar < 6; bar += 1) {
        const height = size * (0.08 + rand() * 0.4);
        ctx.fillRect(-size * 0.34 + bar * size * 0.12, size * 0.4 - height, size * 0.06, height);
      }
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(size * 0.38)}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillText(initials(state.name), size / 2 + 2, size / 2 + 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(initials(state.name), size / 2, size / 2);

    return canvas.toDataURL('image/jpeg', 0.88);
  }

  /* ------------------------------- gallery ------------------------------- */

  function buildGallery() {
    const box = $('gallery');
    if (!box) return;
    box.replaceChildren();
    for (let variant = 0; variant < 12; variant += 1) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.title = `Use avatar ${variant + 1}`;
      const image = document.createElement('img');
      image.alt = `Avatar ${variant + 1}`;
      image.src = drawGalleryAvatar(variant);
      tile.append(image);
      tile.addEventListener('click', async () => {
        applyAvatar(image.src);
        const ok = await save({ avatar: image.src });
        status(ok ? 'Avatar picked and saved.' : 'Avatar picked on this device only.', ok ? 'good' : '');
      });
      box.append(tile);
    }
  }

  /* ------------------------------- actions ------------------------------- */

  function toSquare(source) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const size = 192;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const side = Math.min(image.width, image.height);
        ctx.drawImage(
          image,
          (image.width - side) / 2, (image.height - side) / 2, side, side,
          0, 0, size, size,
        );
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      image.onerror = () => resolve('');
      image.src = String(source || '');
    });
  }

  function shrink(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => resolve(await toSquare(String(reader.result || '')));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  function applyAvatar(data) {
    state.avatar = data;
    if (data) localStorage.setItem(PP_KEY, data);
    else localStorage.removeItem(PP_KEY);
    paint();
    document.dispatchEvent(new CustomEvent('hydra:pp', { detail: { avatar: data } }));
  }

  async function save(patch = {}) {
    const u = universal();
    if (u && u.signedIn) {
      try {
        await u.updateProfile(patch);
        return true;
      } catch (err) {
        status(err.message || 'Could not save to your account.', 'bad');
        return false;
      }
    }
    return true;
  }

  async function onSave() {
    const name = $('name').value.trim().replace(/\s+/g, ' ');
    if (name.length < 2) return status('Use at least two characters for your name.', 'bad');
    state.name = name;
    localStorage.setItem(NAME_KEY, name);
    delete $('name').dataset.dirty;
    paint();
    status('Saving…');
    const ok = await save({ displayName: name, avatar: state.avatar });
    status(ok ? 'Saved. All three apps now show this profile.' : 'Saved on this device only.', ok ? 'good' : '');
    if (ok) document.dispatchEvent(new CustomEvent('hydra:profile', { detail: { name } }));
  }

  function copy(text, label) {
    const done = () => status(`${label} copied.`, 'good');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallback());
    } else fallback();

    function fallback() {
      const box = $('prompt');
      box.removeAttribute('readonly');
      box.select();
      document.execCommand('copy');
      box.setAttribute('readonly', 'readonly');
      done();
    }
  }

  function bind() {
    $('style').addEventListener('change', () => buildPrompt(true));
    $('vibe').addEventListener('change', () => buildPrompt(true));
    $('palette').addEventListener('change', () => buildPrompt(true));
    $('extra').addEventListener('input', () => buildPrompt(true));
    $('reroll').addEventListener('click', () => {
      state.salt += 1;
      buildPrompt(true);
    });
    $('prompt').addEventListener('input', (event) => {
      event.target.dataset.dirty = '1';
    });
    $('copy').addEventListener('click', () => copy($('prompt').value, 'Prompt'));
    $('photo').addEventListener('click', generatePhoto);
    $('engine').addEventListener('change', paintEngine);
    $('savekey').addEventListener('click', () => {
      const engine = $('engine').value;
      const conf = ENGINES[engine];
      if (!conf?.key) return;
      const value = $('imgkey').value.trim();
      if (value) localStorage.setItem(conf.key, value);
      else localStorage.removeItem(conf.key);
      paintEngine();
      $('photo-status').textContent = value
        ? `${conf.label} key saved on this device.`
        : `${conf.label} key removed.`;
      $('photo-status').className = 'status good';
    });
    $('reshuffle').addEventListener('click', () => {
      state.set += 1;
      buildGallery();
    });

    $('upload').addEventListener('click', () => $('file').click());
    $('file').addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const data = await shrink(file);
      if (!data) return status('That file could not be read. Try a PNG or JPEG.', 'bad');
      applyAvatar(data);
      const ok = await save({ avatar: data });
      status(ok ? 'Photo saved.' : 'Photo saved on this device only.', ok ? 'good' : '');
    });

    $('generate').addEventListener('click', async () => {
      const data = drawAvatar();
      applyAvatar(data);
      const ok = await save({ avatar: data });
      status(ok ? 'Avatar generated and saved.' : 'Avatar generated on this device only.', ok ? 'good' : '');
    });

    $('remove').addEventListener('click', async () => {
      applyAvatar('');
      const ok = await save({ avatar: '' });
      status(ok ? 'Photo removed.' : 'Photo removed on this device only.', ok ? 'good' : '');
    });

    $('save').addEventListener('click', onSave);

    $('use').addEventListener('click', async () => {
      state.salt += 1;
      buildPrompt(true);
      const data = drawAvatar();
      applyAvatar(data);
      const ok = await save({ avatar: data });
      status(ok ? 'Look applied to your avatar.' : 'Look applied on this device only.', ok ? 'good' : '');
    });

    $('name').addEventListener('input', (event) => {
      event.target.dataset.dirty = '1';
      state.name = event.target.value;
      buildGallery();
    });
    $('name').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') onSave();
    });
  }

  window.addEventListener('hydra:universal-ready', load);
  window.addEventListener('hydra:session', load);
  window.addEventListener('hydra:pp', (event) => {
    if (event.detail?.avatar !== undefined && event.detail.avatar !== state.avatar) {
      state.avatar = event.detail.avatar;
      paint();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bind(); load(); });
  } else {
    bind();
    load();
  }
})();

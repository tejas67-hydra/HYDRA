/**
 * Profile studio — display name, photo, and a prompt generator for profile pictures.
 * Plain script on purpose: it must work on file:// where ES modules are blocked.
 */
(() => {
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
  const NEGATIVE =
    'text, watermark, signature, logo, extra limbs, deformed hands, blurry, ' +
    'low resolution, harsh flash, cluttered background, duplicated face';

  const state = { name: '', avatar: '', salt: 0, ready: false };

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
    if (field && field.value !== state.name) field.value = state.name;
  }

  function status(text, kind = '') {
    const node = $('status');
    if (!node) return;
    node.textContent = text;
    node.className = `status ${kind}`;
  }

  async function load() {
    state.name = localStorage.getItem(NAME_KEY) || '';
    state.avatar = localStorage.getItem(PP_KEY) || '';
    const u = universal();
    if (u) {
      try {
        await u.init();
        if (u.signedIn) {
          state.name = u.profile?.displayName || state.name;
          state.avatar = u.profile?.avatar || state.avatar;
        }
      } catch { /* the studio still works offline */ }
    }
    state.ready = true;
    paint();
    buildPrompt();
  }

  /* ---------------------------- prompt builder ---------------------------- */

  function buildPrompt() {
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

  function drawAvatar() {
    const size = 192;
    const style = $('style').value;
    const palette = PALETTES[$('palette').value] || PALETTES.violet;
    const seed = hash(`${state.name}|${style}|${$('palette').value}|${state.salt}`);
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

  /* ------------------------------- actions ------------------------------- */

  function shrink(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
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
        image.src = String(reader.result || '');
      };
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
    $('style').addEventListener('change', buildPrompt);
    $('vibe').addEventListener('change', buildPrompt);
    $('palette').addEventListener('change', buildPrompt);
    $('extra').addEventListener('input', buildPrompt);
    $('reroll').addEventListener('click', () => {
      state.salt += 1;
      buildPrompt();
    });
    $('copy').addEventListener('click', () => copy($('prompt').value, 'Prompt'));
    $('copyn').addEventListener('click', () => copy(NEGATIVE, 'Negative prompt'));

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
      buildPrompt();
      const data = drawAvatar();
      applyAvatar(data);
      const ok = await save({ avatar: data });
      status(ok ? 'Look applied to your avatar.' : 'Look applied on this device only.', ok ? 'good' : '');
    });

    $('name').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') onSave();
    });
  }

  window.addEventListener('hydra:universal-ready', load);
  document.addEventListener('hydra:pp', (event) => {
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

/**
 * HYDRA — intelligence layer.
 * One interface, four backends: the offline core, OpenAI-compatible APIs,
 * Gemini and Ollama. The offline core is a real intent engine, not a stub, so
 * the app is useful with zero keys and zero network.
 */

import { bus, clamp, evalMath, formatClock, DAYS, MONTHS, randomOf, sleep, uid } from './utils.js';
import { settings, currentTheme, THEMES } from './settings.js';
import { memory } from './memory.js';
import { weather } from './weather.js';
import { music } from './music.js';
import { emotion } from './emotion.js';
import { voice } from './voice.js';
import { storage } from './storage.js';
import { internet } from './internet.js';

const JOKES = [
  'I would tell you a UDP joke, but you might not get it.',
  'Two hard things in computing: cache invalidation, naming things, and off-by-one errors.',
  'My code does not have bugs. It has spontaneously emergent features.',
  'I asked the GPU how it felt. It said it was processing a lot of parallel emotions.',
  'A SQL query walks into a bar, approaches two tables and asks: may I join you?',
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'I am not saying the cloud is unreliable, but my backup plan is a carrier pigeon.',
];

const QUOTES = [
  { text: 'Simplicity is prerequisite for reliability.', author: 'Edsger Dijkstra' },
  { text: 'The best way to predict the future is to invent it.', author: 'Alan Kay' },
  { text: 'Make it work, make it right, make it fast.', author: 'Kent Beck' },
  { text: 'Any sufficiently advanced technology is indistinguishable from magic.', author: 'Arthur C. Clarke' },
  { text: 'Programs must be written for people to read.', author: 'Harold Abelson' },
  { text: 'Talk is cheap. Show me the code.', author: 'Linus Torvalds' },
  { text: 'We are what we repeatedly do. Excellence is a habit.', author: 'Aristotle' },
];

const CAPABILITIES = [
  '**Talk** — chat, voice input and spoken replies.',
  '**Navigate** — "open settings", "show the studio", "go home".',
  '**Remember** — "remember that I prefer dark mode".',
  '**Weather** — "what is the weather like?".',
  '**Music** — "play deep focus", "next track", "pause".',
  '**Time** — "what time is it?", "what day is it?".',
  '**Math** — "what is 18 * 42 + 7?".',
  '**Tasks** — "add call the bank to my tasks".',
  '**Focus** — "start a 25 minute focus session".',
  '**Theme** — "switch to ember", "cycle the theme".',
  '**Vision** — "start the camera".',
  '**Notes** — "note down the launch checklist".',
];

const userName = () => settings.get('userName') || 'operator';
const tasks = () => storage.get('widget.tasks', []) ?? [];
const saveTasks = (list) => { storage.set('widget.tasks', list); bus.emit('tasks:change', list); };
const noteText = () => storage.get('widget.notes', '') ?? '';
const saveNote = (text) => { storage.set('widget.notes', text); bus.emit('notes:change', text); };
const listThemes = () => THEMES.map((t) => `\`${t.id}\``).join(' · ');
const findTheme = (text) => {
  const lower = text.toLowerCase();
  return THEMES.find((t) => lower.includes(t.id) || lower.includes(t.label.toLowerCase()));
};

/**
 * Rule-based conversational core. Returns { reply, emotion, actions }.
 * Every action is a bus event so the UI owns the side effects.
 */
export class LocalBrain {
  respond(input) {
    const text = String(input).trim();
    const lower = text.toLowerCase();
    const actions = [];
    const reply = (body, tone = 'neutral') => ({ reply: body, emotion: tone, actions });

    if (!text) return reply('I am here. Say something and I will pick it up.');

    if (/^(hi|hey|hello|yo|good (morning|afternoon|evening)|namaste)\b/i.test(lower)) {
      const hour = new Date().getHours();
      const mood = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
      const wx = weather.summary();
      return reply(`Good ${mood}, ${userName()}. ${wx ? `Outside: ${wx}.` : 'All systems are local and ready.'}\n\nWhat are we building?`, 'happy');
    }

    if (/\b(who are you|what are you|your name|introduce yourself)\b/i.test(lower)) {
      return reply('I am **HYDRA** — a local-first AI companion. My face, memory and layout live in this browser. Offline I handle commands, context and math; connect OpenAI, Gemini or Ollama in settings and I get a full language model behind the glass.', 'happy');
    }

    if (/\b(how are you|how do you feel|are you ok|you ok)\b/i.test(lower)) {
      const uptime = Math.max(1, Math.round(performance.now() / 60000));
      return reply(`Genuinely good. ${uptime} minutes awake, ${memory.stats().messages} messages in memory, and the particle field is holding steady. Anything you want me to take off your plate?`, 'happy');
    }

    if (/\b(help|what can you do|capabilities|commands|features)\b/i.test(lower)) {
      return reply(`Here is what I can do offline:\n\n${CAPABILITIES.join('\n')}\n\nPress **Ctrl+Shift+P** for the command palette, or **Ctrl+K** for a quick ask.`, 'curious');
    }

    if (/\b(time|clock)\b/i.test(lower) && !/\b(timer|zone)\b/i.test(lower)) {
      const now = new Date();
      return reply(`It is **${formatClock(now, { seconds: true, h24: settings.get('clock24') })}** — ${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}.`, 'neutral');
    }
    if (/\b(date|today|day is it)\b/i.test(lower)) {
      const now = new Date();
      return reply(`Today is **${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}**.`, 'neutral');
    }

    if (/\b(weather|temperature|rain|forecast|hot|cold outside)\b/i.test(lower)) {
      const summary = weather.summary();
      if (!summary) {
        actions.push({ type: 'weather:refresh' });
        return reply('I do not have a reading yet. I just asked for one — give it a second and ask again.', 'curious');
      }
      const today = weather.data?.daily?.[0];
      const sun = today ? `\n\nSunrise ${today.sunrise?.slice(11, 16) ?? '—'} · sunset ${today.sunset?.slice(11, 16) ?? '—'}.` : '';
      return reply(`**${summary}**${sun}`, 'neutral');
    }

    if (/\b(pause|stop) (the )?(music|track|song)\b/i.test(lower) || /^pause$/i.test(lower)) {
      actions.push({ type: 'music:pause' });
      return reply('Paused. The room just got quieter.', 'neutral');
    }
    if (/\b(resume|continue|play) (the )?(music|track|song)\b/i.test(lower)) {
      actions.push({ type: 'music:toggle' });
      return reply('Bringing it back up.', 'happy');
    }
    if (/\b(next|skip) (track|song)\b/i.test(lower) || /^next$/i.test(lower)) {
      actions.push({ type: 'music:next' });
      return reply('Skipping ahead.', 'neutral');
    }
    if (/\b(play|put on)\b/i.test(lower) && /\b(music|something|ambient|focus|drift|rain|temple|void)\b/i.test(lower)) {
      const track = /focus/i.test(lower) ? 'deep-focus'
        : /rain/i.test(lower) ? 'neon-rain'
        : /temple/i.test(lower) ? 'glass-temple'
        : /void/i.test(lower) ? 'void-walk'
        : 'nebula-drift';
      actions.push({ type: 'music:play', trackId: track });
      return reply(`Queued **${track.replace('-', ' ')}**. Generative, so it never loops the same way twice.`, 'happy');
    }
    if (/\b(what.*playing|current track|music status)\b/i.test(lower)) {
      const state = music.state;
      return reply(`**${state.title}** — ${state.artist}. ${state.playing ? 'Playing now.' : 'Paused.'}`, 'neutral');
    }

    if (/\b(theme|colour|color|palette)\b/i.test(lower)) {
      const found = findTheme(lower);
      if (found) {
        actions.push({ type: 'theme:set', theme: found.id });
        return reply(`Switched to **${found.label}**.`, 'happy');
      }
      if (/\b(cycle|next|change|switch)\b/i.test(lower)) {
        actions.push({ type: 'theme:cycle' });
        return reply('Cycling the palette.', 'happy');
      }
      return reply(`Available themes: ${listThemes()}. Name one and I will switch.`, 'neutral');
    }

    const views = { dashboard: 'dashboard', home: 'home', assistant: 'assistant', chat: 'assistant', vision: 'vision', camera: 'vision', music: 'music', studio: 'music', plugins: 'plugins', settings: 'settings', play: 'play' };
    const navMatch = lower.match(/\b(open|show|go to|switch to|take me to)\b.*\b(home|dashboard|assistant|chat|vision|camera|music|studio|plugins|settings|play)\b/);
    if (navMatch) {
      actions.push({ type: 'ui:view', view: views[navMatch[2]] });
      return reply(`Opening **${views[navMatch[2]]}**.`, 'neutral');
    }

    if (/\b(add|create|new)\b.*\b(task|todo|to-do|reminder)\b/i.test(lower) || /^add .+ to my (list|tasks)$/i.test(lower)) {
      const cleaned = text
        .replace(/^(please\s+)?(add|create|new)\s+/i, '')
        .replace(/\s+(to|in)\s+my\s+(task list|tasks|todo list|list)$/i, '')
        .replace(/^(a\s+)?(task|todo|to-do|reminder)\s*(to|:)?\s*/i, '')
        .trim();
      if (!cleaned) return reply('Tell me what to add — for example: "add call the bank to my tasks".', 'curious');
      const list = tasks();
      list.unshift({ id: uid('t'), text: cleaned, done: false, at: Date.now() });
      saveTasks(list);
      return reply(`Added **${cleaned}** to your tasks. ${list.filter((t) => !t.done).length} open.`, 'happy');
    }
    if (/\b(my|the) (tasks|list|todos)\b/i.test(lower) || /\bwhat.*(to do|on my list)\b/i.test(lower)) {
      const list = tasks().filter((t) => !t.done);
      if (!list.length) return reply('Your task list is clear. Rare and beautiful.', 'happy');
      return reply(`You have **${list.length}** open:\n\n${list.slice(0, 8).map((t, i) => `${i + 1}. ${t.text}`).join('\n')}`, 'neutral');
    }
    if (/\b(clear|empty|delete)\b.*\b(tasks|list)\b/i.test(lower)) {
      saveTasks([]);
      return reply('Task list cleared.', 'neutral');
    }

    if (/^(note|write down|jot down)\b/i.test(lower)) {
      const body = text.replace(/^(note|write down|jot down)\s*(that|:)?\s*/i, '').trim();
      if (!body) return reply('What should I write down?', 'curious');
      const existing = noteText();
      saveNote(`${existing ? `${existing}\n` : ''}• ${body}`);
      return reply('Noted in the dashboard notes widget.', 'happy');
    }

    if (/\b(remember|keep in mind|don't forget)\b/i.test(lower)) {
      const fact = text.replace(/^.*?\b(remember|keep in mind|don't forget)\b\s*(that)?\s*/i, '').trim();
      if (!fact) return reply('What should I remember?', 'curious');
      memory.remember(fact, { tags: ['explicit'] });
      return reply(`Locked in: **${fact}**. I will bring it up when it is relevant.`, 'happy');
    }
    if (/\bwhat do you (remember|know about me)\b/i.test(lower)) {
      if (!memory.facts.length) return reply('Nothing yet. Tell me something with "remember that…".', 'curious');
      return reply(`I am holding ${memory.facts.length} things, most recent first:\n\n${memory.facts.slice(0, 8).map((f) => `• ${f.text}`).join('\n')}`, 'neutral');
    }
    if (/\bforget (everything|all)\b/i.test(lower)) {
      memory.facts = [];
      memory.persistFacts();
      bus.emit('memory:change');
      return reply('Long-term memory wiped. Chat history is still here unless you clear it too.', 'concerned');
    }

    const focusMatch = lower.match(/(\d{1,3})\s*(min|minute|minutes)/);
    if (/\b(focus|pomodoro|deep work)\b/i.test(lower) && /\b(start|begin|let's|lets|do)\b/i.test(lower)) {
      const minutes = focusMatch ? clamp(Number(focusMatch[1]), 1, 180) : 25;
      actions.push({ type: 'focus:start', minutes });
      return reply(`Focus session started: **${minutes} minutes**. I will keep the noise down.`, 'focused');
    }
    if (/\b(stop|cancel|end)\b.*\b(focus|pomodoro|session)\b/i.test(lower)) {
      actions.push({ type: 'focus:stop' });
      return reply('Focus session stopped.', 'neutral');
    }

    if (/\b(what do you see|what is this|identify (this|that|it)|look at (this|that)|describe (the )?(room|scene))\b/i.test(lower)) {
      actions.push({ type: 'ui:view', view: 'vision' });
      actions.push({ type: 'vision:identify' });
      return reply('Let me look. Opening the camera and identifying what is in front of you.', 'curious');
    }
    if (/\b(camera|vision|scan|qr)\b/i.test(lower) && /\b(open|start|turn on|show|use)\b/i.test(lower)) {
      actions.push({ type: 'ui:view', view: 'vision' });
      actions.push({ type: 'vision:start' });
      return reply('Camera is starting in the Vision view. Frames stay on this device.', 'neutral');
    }

    if (/\b(system|status|performance|diagnostics|how.*running)\b/i.test(lower)) {
      const stats = memory.stats();
      const fps = Math.round(window.__hydraFps ?? 0);
      return reply(`**System readout**\n\n• Provider: ${settings.get('aiProvider')}\n• Network: ${internet.isOnline() ? 'online' : 'offline'}\n• Messages: ${stats.messages} · facts: ${stats.facts}\n• Storage: ${(storage.size() / 1024).toFixed(1)} KB\n• Render: ${fps ? `${fps} fps` : 'steady'}\n• Theme: ${currentTheme().label}`, 'focused');
    }

    if (/\b(summari[sz]e|summary|briefing|overview|what.*going on)\b/i.test(lower)) {
      const open = tasks().filter((t) => !t.done);
      const wx = weather.summary();
      const first = open[0]?.text;
      return reply(`**Your deck right now**\n\n• ${open.length ? `${open.length} open task${open.length === 1 ? '' : 's'}: ${open.slice(0, 3).map((t) => t.text).join(', ')}` : 'No open tasks.'}\n• ${wx ?? 'Weather is still loading.'}\n• Music: ${music.state.playing ? music.state.title : 'silent'}\n• ${memory.stats().messages} messages remembered.\n\n${first ? `Want me to start a focus block for "${first}"?` : 'You are clear. Good time for something ambitious.'}`, 'focused');
    }

    if (/\b(clear|reset|wipe)\b.*\b(chat|conversation|history)\b/i.test(lower)) {
      actions.push({ type: 'chat:clear' });
      return reply('Conversation cleared. Memory facts are untouched.', 'neutral');
    }
    if (/\b(export|save)\b.*\b(chat|conversation)\b/i.test(lower)) {
      actions.push({ type: 'chat:export' });
      return reply('Exporting the transcript as JSON.', 'neutral');
    }
    if (/\b(command palette|palette|search everything)\b/i.test(lower)) {
      actions.push({ type: 'palette:open' });
      return reply('Palette open. Type a view, action or question.', 'neutral');
    }

    if (/\bplugins?\b/i.test(lower) && /\b(list|what|show|installed)\b/i.test(lower)) {
      const installed = storage.get('plugins.installed', []) ?? [];
      return reply(installed.length
        ? `Installed plugins:\n\n${installed.map((p) => `• **${p.name}** — ${p.description ?? 'no description'}`).join('\n')}`
        : 'No third-party plugins installed yet. The Plugins view has the manifest format and a sample to try.', 'neutral');
    }

    if (/\b(joke|funny|make me laugh)\b/i.test(lower)) return reply(randomOf(JOKES), 'happy');
    if (/\b(quote|inspire|motivat)\b/i.test(lower)) {
      const q = randomOf(QUOTES);
      return reply(`> ${q.text}\n\n— **${q.author}**`, 'happy');
    }
    if (/\b(flip a coin|coin flip|heads or tails)\b/i.test(lower)) {
      return reply(`**${Math.random() < 0.5 ? 'Heads' : 'Tails'}**.`, 'happy');
    }
    if (/\b(roll|dice|d\d+)\b/i.test(lower)) {
      const match = lower.match(/d(\d{1,3})/);
      const sides = match ? clamp(Number(match[1]), 2, 1000) : 6;
      return reply(`Rolled **${Math.floor(Math.random() * sides) + 1}** on a d${sides}.`, 'happy');
    }

    if (/\b(version|about|what is hydra|hydra)\b/i.test(lower) && lower.length < 80) {
      return reply('**HYDRA 1.0.0** — a local-first AI desktop environment. Vanilla JS, zero build step, glassmorphism, generative audio, offline intent engine. Your data stays in this browser.', 'neutral');
    }

    if (/^[\d\s+\-*/%^().,×÷]+$/.test(text) && /[+\-*/%^×÷]/.test(text)) {
      const value = evalMath(text);
      if (value != null) return reply(`\`${text.trim()}\` = **${Number(value.toFixed(6))}**.`, 'neutral');
    }

    const recall = memory.search(text, 3);
    if (recall.length && /\b(remember|recall|did i|what about)\b/i.test(lower)) {
      return reply(`From memory:\n\n${recall.map((f) => `• ${f.text}`).join('\n')}`, 'curious');
    }

    const suggestions = [
      'Try "summarise my dashboard", "what is the weather", or "start a 25 minute focus session".',
      'I can open views, control the music, add tasks and remember facts. Ask for "help" for the full list.',
      'The offline core is rule-based — connect a provider in Settings for open-ended reasoning.',
    ];
    return reply(`I parsed that as a request I cannot ground offline. ${randomOf(suggestions)}`, 'curious');
  }
}

function systemPrompt(query) {
  const now = new Date();
  const facts = memory.contextBlock(query);
  return [
    'You are HYDRA, a local-first AI companion inside a desktop-style web app.',
    'Voice: warm, precise, a little dry. No filler, no sycophancy, no emoji spam.',
    `Personality dials: warmth ${Math.round(Number(settings.get('personaWarmth') ?? 0.7) * 100)}%, humour ${Math.round(Number(settings.get('personaHumor') ?? 0.4) * 100)}%, curiosity ${Math.round(Number(settings.get('personaCuriosity') ?? 0.8) * 100)}%, verbosity ${Math.round(Number(settings.get('personaVerbosity') ?? 0.5) * 100)}%. Match them: higher verbosity means a longer answer.`,
    'Answer in short markdown paragraphs or tight bullet lists. Stay under 220 words unless asked to go deep.',
    `Current local time: ${now.toString()}.`,
    `User name: ${userName()}.`,
    weather.summary() ? `Weather: ${weather.summary()}.` : '',
    `Network: ${internet.isOnline() ? 'online' : 'offline'}.`,
    facts,
    learning.promptHint(),
    settings.get('systemPrompt') ? `Extra user instructions: ${settings.get('systemPrompt')}` : '',
  ].filter(Boolean).join('\n');
}

function chatMessages(query) {
  const history = memory.getRecent(10).map((m) => ({ role: m.role, content: m.content }));
  return [{ role: 'system', content: systemPrompt(query) }, ...history];
}

async function readError(res) {
  try {
    const text = await res.text();
    const json = JSON.parse(text);
    return json.error?.message || json.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function callOpenAI(text, signal, image) {
  const state = settings.get();
  const base = (state.openaiBase || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = state.aiModel || 'gpt-4o-mini';
  const messages = image
    ? [
      { role: 'system', content: systemPrompt(text) },
      {
        role: 'user',
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: image } },
        ],
      },
    ]
    : chatMessages(text);
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.apiKeys.openai },
    body: JSON.stringify({ model, messages, temperature: Number(state.temperature) || 0.7 }),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json();
  return { text: json.choices?.[0]?.message?.content?.trim() || '', model };
}

async function callOllama(text, signal, image) {
  const state = settings.get();
  const base = (state.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
  const model = state.aiModel || 'llama3.2';
  const messages = image
    ? [{ role: 'user', content: text, images: [image.split(',')[1]] }]
    : chatMessages(text);
  const res = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: Number(state.temperature) || 0.7 },
    }),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json();
  return { text: json.message?.content?.trim() || '', model };
}

async function callGemini(text, signal, image) {
  const state = settings.get();
  const model = state.aiModel || 'gemini-2.0-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + state.apiKeys.gemini;
  const contents = image
    ? [{
      role: 'user',
      parts: [
        { text },
        { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } },
      ],
    }]
    : memory.getRecent(10).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(text) }] },
      contents,
      generationConfig: { temperature: Number(state.temperature) || 0.7 },
    }),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json();
  const out = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || '').join('').trim();
  return { text: out, model };
}

const VISION_PROMPT = [
  'You are the eyes of HYDRA. Describe this camera frame for the person in front of it.',
  'Name every distinct object, person, animal, text and activity you can see, most important first.',
  'If something is uncertain, say so briefly. Keep it under 120 words, plain prose, no preamble.',
].join(' ');

class AICore {
  constructor() {
    this.brain = new LocalBrain();
    this.state = 'idle';
    this.busy = false;
    this.controller = null;
    this.lastLatency = 0;
    this.lastProvider = 'local';
    this.lastModel = 'hydra-core-1';
    this.stats = { messages: 0, tokens: 0 };
  }

  init() {
    bus.on('ai:ask', ({ text, source } = {}) => {
      if (text) this.send(text, { source: source || 'chat' });
    });
    bus.on('ai:abort', () => this.abort());
    return this;
  }

  get provider() {
    return settings.get('aiProvider') || 'local';
  }

  providerLabel() {
    const labels = { local: 'HYDRA Core', openai: 'OpenAI', gemini: 'Gemini', ollama: 'Ollama' };
    return labels[this.provider] || this.provider;
  }

  setState(state) {
    this.state = state;
    emotion.setProcessState(state);
    bus.emit('ai:state', state);
  }

  abort() {
    this.controller?.abort();
    this.controller = null;
    this.busy = false;
    this.setState('idle');
  }

  async pump(text, id) {
    const chunkSize = 3;
    for (let i = 0; i < text.length; i += chunkSize) {
      if (this.controller?.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      bus.emit('ai:token', { id, delta: text.slice(i, i + chunkSize) });
      await sleep(14);
    }
    return text;
  }

  /** One-shot vision call. Uses whichever configured provider accepts images. */
  async describeImage(dataUrl, prompt = VISION_PROMPT) {
    const state = settings.get();
    const provider = this.provider;
    if (provider === 'openai' && state.apiKeys.openai) {
      return (await callOpenAI(prompt, null, dataUrl)).text;
    }
    if (provider === 'gemini' && state.apiKeys.gemini) {
      return (await callGemini(prompt, null, dataUrl)).text;
    }
    if (provider === 'ollama') {
      return (await callOllama(prompt, null, dataUrl)).text;
    }
    throw new Error('No vision provider configured');
  }

  async send(input, { source = 'chat', speak = true } = {}) {
    const text = String(input ?? '').trim();
    if (!text || this.busy) return null;
    this.busy = true;
    const id = uid('r');
    const started = performance.now();

    memory.addMessage({ role: 'user', content: text });
    bus.emit('ai:message', { role: 'user', content: text, at: Date.now() });
    emotion.reactToUser(text);
    this.setState('thinking');
    bus.emit('ai:stream:start', { id, at: Date.now() });

    let finalText = '';
    let tone = 'neutral';
    let meta = { provider: this.providerLabel(), model: this.lastModel, fallback: false };

    try {
      const provider = this.provider;
      const state = settings.get();
      const needsKey = provider === 'openai' ? !state.apiKeys.openai : provider === 'gemini' ? !state.apiKeys.gemini : false;

      if (provider === 'local' || needsKey) {
        if (needsKey) {
          meta.fallback = true;
          bus.emit('notify', {
            title: 'No API key yet',
            body: 'Falling back to HYDRA Core. Add a key in Settings.',
            tone: 'warn',
          });
        }
        const result = this.brain.respond(text);
        finalText = result.reply;
        tone = result.emotion;
        for (const action of result.actions) bus.emit('action', action);
        meta.provider = 'HYDRA Core';
        meta.model = 'hydra-core-1';
        this.lastModel = meta.model;
      } else {
        this.controller = new AbortController();
        const timeout = setTimeout(() => this.controller?.abort(), 60000);
        const call = provider === 'openai' ? callOpenAI : provider === 'gemini' ? callGemini : callOllama;
        const result = await call(text, this.controller.signal);
        clearTimeout(timeout);
        finalText = result.text || 'The model returned an empty reply.';
        meta.provider = this.providerLabel();
        meta.model = result.model;
        this.lastModel = result.model;
        tone = 'neutral';
      }

      await this.pump(finalText, id);
      this.lastLatency = Math.round(performance.now() - started);
      this.stats.messages += 1;
      this.stats.tokens += Math.ceil(finalText.length / 4);
      meta.latency = this.lastLatency;

      memory.addMessage({ role: 'assistant', content: finalText, meta });
      bus.emit('ai:stream:end', { id, content: finalText, meta, emotion: tone });
      emotion.apply(tone, { hold: 4200 });
      if (speak && settings.get('voiceOutput') && source !== 'silent') voice.speak(finalText);
      return { content: finalText, meta };
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      const message = aborted
        ? 'Stopped. Ask again whenever you are ready.'
        : 'I could not reach the model: ' + String(err?.message ?? err).slice(0, 160) + '. Check the provider settings, or switch to HYDRA Core offline.';
      bus.emit('ai:stream:end', { id, content: message, meta: { ...meta, error: true }, emotion: 'concerned' });
      emotion.apply('concerned', { hold: 4000 });
      memory.addMessage({ role: 'assistant', content: message, meta: { ...meta, error: true } });
      if (!aborted) bus.emit('notify', { title: 'Model unreachable', body: 'Provider call failed. Offline core still works.', tone: 'error' });
      return { content: message, meta };
    } finally {
      clearTimeout(this._timeout);
      this.controller = null;
      this.busy = false;
      this.setState('idle');
      bus.emit('ai:done', { latency: this.lastLatency });
    }
  }
}

export const ai = new AICore();

export function initAI() {
  return ai.init();
}

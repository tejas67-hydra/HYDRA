/**
 * HYDRA — emotion engine.
 * Text in, feeling out. A lexicon scores every message, the strongest signal
 * wins, and the face interpolates through CSS. Emotions decay back to neutral
 * so the companion never gets stuck on a stale sentence.
 */

import { $, bus, clamp } from './utils.js';

export const EMOTIONS = [
  'neutral', 'happy', 'excited', 'curious', 'focused', 'thinking', 'listening',
  'concerned', 'sad', 'angry', 'surprised', 'scared', 'disgusted', 'sleepy',
  'love', 'affection', 'proud', 'embarrassed', 'shy', 'grateful', 'hopeful',
  'confused', 'bored', 'lonely', 'playful', 'calm', 'determined', 'guilty',
  'jealous', 'awe', 'relieved', 'nostalgic', 'amused', 'annoyed', 'frustrated',
  'impressed', 'sympathetic', 'content', 'dreamy', 'silly',
];

const LEXICON = [
  { emotion: 'love', words: ['love you', 'i love', 'adore', 'my love', 'crush', 'kiss', 'marry', 'soulmate'] },
  { emotion: 'affection', words: ['hug', 'cuddle', 'snuggle', 'sweet', 'darling', 'honey', 'cutie', 'you are the best'] },
  { emotion: 'grateful', words: ['thank you', 'thanks', 'grateful', 'appreciate', 'appreciated', 'means a lot'] },
  { emotion: 'lonely', words: ['lonely', 'alone', 'no one', 'nobody', 'isolated', 'left out', 'abandoned'] },
  { emotion: 'guilty', words: ['my fault', 'i am sorry', 'im sorry', 'apologise', 'apologize', 'guilty', 'regret', 'should not have'] },
  { emotion: 'jealous', words: ['jealous', 'envy', 'why them', 'not fair', 'they always'] },
  { emotion: 'sympathetic', words: ['that sucks', 'sorry to hear', 'feel for you', 'rough day', 'that is tough', 'hugs'] },
  { emotion: 'angry', words: ['angry', 'furious', 'rage', 'hate', 'mad at', 'stupid', 'idiot', 'shut up'] },
  { emotion: 'frustrated', words: ['frustrated', 'stuck', 'keeps failing', 'wont work', 'ugh', 'again and again', 'give up'] },
  { emotion: 'annoyed', words: ['annoying', 'irritating', 'bothered', 'petty'] },
  { emotion: 'disgusted', words: ['gross', 'disgusting', 'yuck', 'eww', 'ew', 'nasty', 'revolting'] },
  { emotion: 'sad', words: ['sad', 'unhappy', 'crying', 'cry', 'depressed', 'heartbroken', 'miserable', 'hurt'] },
  { emotion: 'scared', words: ['scared', 'afraid', 'terrified', 'fear', 'nervous', 'anxious', 'panic', 'creepy'] },
  { emotion: 'concerned', words: ['worried', 'worry', 'problem', 'issue', 'bug', 'error', 'broken', 'crash', 'urgent', 'help me', 'danger'] },
  { emotion: 'surprised', words: ['surprised', 'unexpected', 'whoa', 'no way', 'did not expect', 'really'] },
  { emotion: 'excited', words: ['excited', 'cant wait', 'amazing', 'epic', 'lets go', 'pumped', 'hyped'] },
  { emotion: 'happy', words: ['happy', 'glad', 'joy', 'yay', 'great', 'awesome', 'wonderful', 'good news', 'perfect', 'nice'] },
  { emotion: 'amused', words: ['haha', 'lol', 'lmao', 'hilarious', 'funny', 'joke', 'made me laugh'] },
  { emotion: 'playful', words: ['play', 'game', 'tease', 'prank', 'lets play', 'tag', 'hide and seek'] },
  { emotion: 'silly', words: ['silly', 'goofy', 'nonsense', 'doodle', 'banana', 'potato'] },
  { emotion: 'proud', words: ['proud', 'achieved', 'i did it', 'shipped', 'we won', 'success', 'nailed it', 'passed'] },
  { emotion: 'impressed', words: ['impressive', 'brilliant', 'genius', 'well done', 'incredible work', 'how did you'] },
  { emotion: 'awe', words: ['awe', 'beautiful', 'stunning', 'magnificent', 'breathtaking', 'universe', 'cosmos'] },
  { emotion: 'hopeful', words: ['hope', 'hopefully', 'wish', 'someday', 'dream', 'one day', 'future'] },
  { emotion: 'relieved', words: ['relieved', 'phew', 'at last', 'thank goodness', 'glad that is over'] },
  { emotion: 'nostalgic', words: ['remember', 'memory', 'memories', 'used to', 'back then', 'childhood', 'old days'] },
  { emotion: 'determined', words: ['determined', 'i will', 'must', 'never give up', 'goal', 'push through', 'keep going'] },
  { emotion: 'confused', words: ['confused', 'unclear', 'dont understand', 'what do you mean', 'huh', 'makes no sense'] },
  { emotion: 'bored', words: ['bored', 'boring', 'nothing to do', 'dull', 'meh'] },
  { emotion: 'sleepy', words: ['tired', 'sleepy', 'exhausted', 'bedtime', 'yawn', 'good night', 'goodnight'] },
  { emotion: 'calm', words: ['calm', 'relax', 'peaceful', 'chill', 'breathe', 'quiet', 'meditate'] },
  { emotion: 'dreamy', words: ['dream', 'stargazing', 'float', 'clouds', 'moon', 'wistful'] },
  { emotion: 'embarrassed', words: ['embarrassed', 'awkward', 'oops', 'my bad', 'cringe'] },
  { emotion: 'shy', words: ['shy', 'timid', 'blush', 'bashful'] },
  { emotion: 'curious', words: ['what', 'why', 'how', 'who', 'when', 'where', 'wonder', 'curious', 'tell me', 'explain', 'interesting'] },
  { emotion: 'focused', words: ['focus', 'work', 'build', 'code', 'debug', 'plan', 'analyse', 'analyze', 'study', 'task', 'deadline'] },
  { emotion: 'thinking', words: ['hmm', 'maybe', 'think', 'consider', 'not sure', 'let me think'] },
  { emotion: 'content', words: ['content', 'satisfied', 'cozy', 'comfortable', 'all good'] },
];

const STRONG = /[!?]{2,}|[A-Z]{4,}/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

class EmotionEngine {
  constructor() {
    this.current = 'neutral';
    this.intensity = 0.4;
    this.faceEl = null;
    this.chips = [];
    this.timer = null;
    this.history = [];
    this.lexicon = LEXICON.map((entry) => ({
      ...entry,
      regex: new RegExp(entry.words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i'),
    }));
  }

  init() {
    this.faceEl = $('#ai-face');
    this.chips = Array.from(document.querySelectorAll('[data-emotion-chip]'));
    this.apply('neutral', { silent: true });
  }

  score(text) {
    const message = String(text || '');
    const scores = new Map();
    for (const entry of this.lexicon) {
      const hits = message.match(new RegExp(entry.regex.source, 'gi'));
      if (hits) scores.set(entry.emotion, (scores.get(entry.emotion) || 0) + hits.length);
    }
    if (!scores.size) return { emotion: 'neutral', intensity: 0.3, scores };
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    let intensity = 0.5 + Math.min(ranked[0][1], 3) * 0.12;
    if (STRONG.test(message)) intensity += 0.12;
    if (EMOJI.test(message)) intensity += 0.06;
    return { emotion: ranked[0][0], intensity: clamp(intensity, 0.35, 1), scores };
  }

  infer(text) {
    return this.score(text);
  }

  reactToUser(text) {
    const { emotion: feeling, intensity } = this.score(text);
    this.history.push({ text: String(text).slice(0, 120), emotion: feeling, at: Date.now() });
    if (this.history.length > 40) this.history.shift();
    if (feeling !== 'neutral') this.apply(feeling, { hold: 4200, intensity });
    return feeling;
  }

  setProcessState(state) {
    if (state === 'thinking') this.apply('thinking', { hold: 0 });
    else if (state === 'listening') this.apply('listening', { hold: 0 });
    else if (state === 'speaking') this.apply('happy', { hold: 0, intensity: 0.7 });
    else if (state === 'idle' && ['thinking', 'listening', 'happy'].includes(this.current)) {
      this.apply('neutral', { hold: 0 });
    }
  }

  apply(feeling, { hold = 3200, intensity = 0.6, silent = false } = {}) {
    const emotion = EMOTIONS.includes(feeling) ? feeling : 'neutral';
    this.current = emotion;
    this.intensity = intensity;

    if (this.faceEl) {
      this.faceEl.dataset.emotion = emotion;
      this.faceEl.style.setProperty('--intensity', String(intensity));
    }
    for (const chip of this.chips) {
      chip.classList.toggle('is-on', chip.dataset.emotionChip === emotion);
    }

    clearTimeout(this.timer);
    if (hold > 0 && emotion !== 'neutral') {
      this.timer = setTimeout(() => this.apply('neutral', { hold: 0 }), hold);
    }

    if (!silent) bus.emit('emotion:change', { emotion, intensity });
    return emotion;
  }

  preview(emotion) {
    return this.apply(emotion, { hold: 6000, intensity: 0.85 });
  }

  label() {
    const labels = {
      neutral: 'Idle · listening for you', curious: 'Curious · tell me more',
      happy: 'Warm · that landed well', focused: 'Focused · working the problem',
      concerned: 'Concerned · checking that', listening: 'Listening · go ahead',
      thinking: 'Thinking · composing a reply', excited: 'Excited · let us go',
      sad: 'Sad · sitting with you', angry: 'Angry · that was not fair',
      surprised: 'Surprised · did not see that coming', scared: 'Uneasy · staying close',
      sleepy: 'Sleepy · lights low', love: 'Affection · glowing',
      proud: 'Proud · look at you', grateful: 'Grateful · thank you',
      confused: 'Confused · say that again', bored: 'Bored · need a spark',
      playful: 'Playful · come on then', calm: 'Calm · breathing slow',
    };
    return labels[this.current] ?? this.current;
  }
}

export const emotion = new EmotionEngine();

/**
 * HYDRA — learning loop. Reply ratings are stored locally and turn into
 * a short preference hint that is injected into the model system prompt.
 */

import { storage } from './storage.js';
import { settings } from './settings.js';
import { bus } from './utils.js';

const STOP = new Set(['about', 'there', 'their', 'would', 'could', 'should', 'which', 'while', 'where', 'these', 'those', 'because', 'after', 'before', 'other', 'every', 'being', 'under', 'again', 'still', 'maybe', 'thing', 'things', 'really', 'using', 'write', 'please']);

function keywords(text) {
  const counts = {};
  for (const word of String(text || '').toLowerCase().match(/[a-z]{4,}/g) || []) {
    if (STOP.has(word)) continue;
    counts[word] = (counts[word] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

class Learning {
  constructor() {
    this.items = storage.get('learning.feedback', []) || [];
  }

  rate({ text, rating, meta = {} }) {
    const words = keywords(text);
    const item = {
      id: 'f' + Date.now() + Math.random().toString(36).slice(2, 6),
      rating: rating > 0 ? 1 : -1,
      length: String(text || '').length,
      at: Date.now(),
      provider: meta.provider || 'HYDRA Core',
      topic: words[0] || 'general',
    };
    this.items.push(item);
    if (this.items.length > 300) this.items = this.items.slice(-300);
    storage.set('learning.feedback', this.items);
    this.adapt();
    bus.emit('learning:update', this.profile());
    return item;
  }

  adapt() {
    const recent = this.items.slice(-20);
    if (!recent.length) return;
    const up = recent.filter((i) => i.rating > 0);
    const down = recent.filter((i) => i.rating < 0);
    const avg = (list) => (list.length ? list.reduce((a, b) => a + b.length, 0) / list.length : 0);
    const avgUp = avg(up);
    const avgDown = avg(down);
    if (down.length >= 2 && avgDown >= avgUp) settings.set({ personaVerbosity: 0.35 });
    else if (up.length >= 2 && avgUp > 380) settings.set({ personaVerbosity: 0.7 });
  }

  profile() {
    const up = this.items.filter((i) => i.rating > 0);
    const down = this.items.filter((i) => i.rating < 0);
    const topics = {};
    for (const item of this.items.slice(-40)) topics[item.topic] = (topics[item.topic] || 0) + 1;
    return {
      total: this.items.length,
      ups: up.length,
      downs: down.length,
      preferredLength: up.length ? Math.round(up.reduce((a, b) => a + b.length, 0) / up.length) : 0,
      topics: Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w, n]) => ({ word: w, count: n })),
    };
  }

  promptHint() {
    if (!this.items.length) return '';
    const p = this.profile();
    const parts = [`Reply feedback so far: ${p.ups} rated good, ${p.downs} rated bad.`];
    if (p.preferredLength) parts.push(`Good answers run about ${p.preferredLength} characters; stay near that length.`);
    if (p.topics.length) parts.push(`Recurring interests: ${p.topics.map((t) => t.word).join(', ')}.`);
    return parts.join(' ');
  }

  reset() {
    this.items = [];
    storage.set('learning.feedback', []);
    bus.emit('learning:update', this.profile());
  }
}

export const learning = new Learning();

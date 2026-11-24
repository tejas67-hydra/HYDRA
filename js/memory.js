/**
 * HYDRA — memory engine: conversation history plus durable facts.
 * Search is a deliberately small TF-style overlap score; good enough for
 * a few hundred local entries and instant on every keystroke.
 */

import { bus, uid } from './utils.js';
import { storage } from './storage.js';
import universal from './universal.js';

const HISTORY_LIMIT = 240;
const FACT_LIMIT = 120;
const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'is',
  'are', 'was', 'were', 'it', 'this', 'that', 'for', 'with', 'as', 'at', 'by', 'from', 'my', 'i',
  'you', 'me', 'we', 'be', 'do', 'does', 'so', 'if', 'then', 'than']);

function tokens(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

class MemoryEngine {
  constructor() {
    this.history = storage.get('chat.history', []) ?? [];
    this.facts = storage.get('memory.facts', []) ?? [];
  }

  /* --------------------------- conversation -------------------------- */
  addMessage(message) {
    const entry = {
      id: uid('m'),
      role: message.role,
      content: String(message.content ?? ''),
      at: message.at ?? Date.now(),
      meta: message.meta ?? {},
    };
    this.history.push(entry);
    if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
    this.persistHistory();
    bus.emit('memory:message', entry);
    return entry;
  }

  updateMessage(id, patch) {
    const entry = this.history.find((m) => m.id === id);
    if (!entry) return null;
    Object.assign(entry, patch);
    this.persistHistory();
    return entry;
  }

  getHistory(limit = HISTORY_LIMIT) {
    return limit ? this.history.slice(-limit) : [...this.history];
  }

  getRecent(limit = 8) {
    return this.history.slice(-limit);
  }

  clearHistory() {
    this.history = [];
    storage.remove('chat.history');
    bus.emit('memory:cleared');
  }

  persistHistory() {
    storage.set('chat.history', this.history);
  }

  /* ------------------------------ facts ------------------------------ */
  remember(text, { tags = [], source = 'chat' } = {}) {
    const clean = String(text).trim();
    if (!clean) return null;
    const duplicate = this.facts.find((f) => f.text.toLowerCase() === clean.toLowerCase());
    if (duplicate) {
      duplicate.at = Date.now();
      this.persistFacts();
      return duplicate;
    }
    const fact = {
      id: uid('f'),
      text: clean.slice(0, 400),
      tags,
      source,
      at: Date.now(),
    };
    this.facts.unshift(fact);
    if (this.facts.length > FACT_LIMIT) this.facts.length = FACT_LIMIT;
    this.persistFacts();
    universal.remember(fact.text, { tags, source }).catch(() => {});
    bus.emit('memory:fact', fact);
    return fact;
  }

  forget(id) {
    const fact = this.facts.find((f) => f.id === id);
    this.facts = this.facts.filter((f) => f.id !== id);
    this.persistFacts();
    if (fact) universal.forgetText(fact.text).catch(() => {});
  }

  /** Pulls facts written by another HYDRA app into this one. */
  adoptShared(memories = []) {
    let added = 0;
    for (const entry of memories) {
      const text = String(entry.text || '').trim();
      if (!text) continue;
      if (this.facts.some((f) => f.text.toLowerCase() === text.toLowerCase())) continue;
      this.facts.unshift({ id: uid('f'), text: text.slice(0, 400), tags: entry.tags || [], source: entry.source || 'shared', at: entry.at || Date.now() });
      added += 1;
    }
    if (added) {
      this.facts.sort((a, b) => b.at - a.at);
      this.facts.length = Math.min(this.facts.length, FACT_LIMIT);
      this.persistFacts();
      bus.emit('memory:fact', this.facts[0]);
    }
    return added;
  }

  persistFacts() {
    storage.set('memory.facts', this.facts);
  }

  search(query, limit = 6) {
    const q = tokens(query);
    if (!q.length) return [];
    return this.facts
      .map((fact) => {
        const haystack = tokens(`${fact.text} ${fact.tags.join(' ')}`);
        const score = q.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0)
          + (haystack.some((t) => t.startsWith(q[0])) ? 0.5 : 0);
        return { fact, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.fact);
  }

  /** Compact block injected into the system prompt for online models. */
  contextBlock(query, maxChars = 1200) {
    const relevant = this.search(query, 5).map((f) => `- ${f.text}`);
    if (!relevant.length) return '';
    return `Relevant things the user asked you to remember:\n${relevant.join('\n').slice(0, maxChars)}`;
  }

  stats() {
    return {
      messages: this.history.length,
      facts: this.facts.length,
      words: this.history.reduce((n, m) => n + m.content.split(/\s+/).length, 0),
    };
  }
}

export const memory = new MemoryEngine();

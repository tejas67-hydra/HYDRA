/**
 * HYDRA — AI workspace: documents on the left, editor in the middle,
 * an assistant panel that works on the open document on the right.
 */

import { $, el, icon, bus, uid, debounce } from './utils.js';
import { storage } from './storage.js';
import { ai } from './ai.js';
import { settings } from './settings.js';

const KEY = 'workspace.docs';
const ACTIVE_KEY = 'workspace.active';

const SEED = [
  {
    id: 'w1',
    title: 'Launch plan',
    body: '# HYDRA launch plan\n\n- Polish the home scene\n- Record a 60 second demo\n- Publish the single-file build\n\n## Open questions\n- Which theme should be the default?\n',
    updated: Date.now(),
  },
  {
    id: 'w2',
    title: 'Voice ideas',
    body: 'Wake word options:\n\n1. "hydra"\n2. "hey hydra"\n3. "hydra, wake up"\n',
    updated: Date.now(),
  },
];

class Workspace {
  constructor() {
    this.docs = storage.get(KEY, null) || SEED;
    this.activeId = storage.get(ACTIVE_KEY, null) || this.docs[0]?.id || null;
    this.busy = false;
  }

  get active() {
    return this.docs.find((d) => d.id === this.activeId) || this.docs[0] || null;
  }

  persist() {
    storage.set(KEY, this.docs);
    storage.set(ACTIVE_KEY, this.activeId);
  }

  init() {
    const root = $('#workspace-app');
    if (!root) return;
    root.innerHTML = `
      <div class="ws">
        <aside class="ws__docs">
          <div class="ws__docs-head">
            <strong>Documents</strong>
            <button class="icon-btn" type="button" id="ws-new" aria-label="New document">${icon('plus').outerHTML}</button>
          </div>
          <div class="ws__list" id="ws-list"></div>
        </aside>
        <section class="ws__editor">
          <input class="input ws__title" id="ws-title" maxlength="80" placeholder="Untitled document">
          <textarea class="ws__body" id="ws-body" spellcheck="true" placeholder="Start writing…"></textarea>
          <div class="ws__status">
            <span id="ws-count">0 words</span>
            <span id="ws-saved">saved</span>
            <button class="link-btn" type="button" id="ws-delete">Delete document</button>
          </div>
        </section>
        <aside class="ws__ai">
          <div class="ws__ai-head">
            <strong>Assistant</strong>
            <span class="chip">works on this doc</span>
          </div>
          <div class="ws__ai-actions">
            <button class="btn btn--ghost btn--sm" type="button" data-ws-act="summarize">Summarise</button>
            <button class="btn btn--ghost btn--sm" type="button" data-ws-act="improve">Improve</button>
            <button class="btn btn--ghost btn--sm" type="button" data-ws-act="tasks">Action items</button>
            <button class="btn btn--ghost btn--sm" type="button" data-ws-act="explain">Explain</button>
          </div>
          <div class="ws__ai-out" id="ws-ai-out">Pick an action. The assistant reads the open document and answers here.</div>
          <div class="ws__ai-foot">
            <button class="btn btn--primary btn--sm" type="button" id="ws-insert" disabled>Insert into doc</button>
            <button class="link-btn" type="button" id="ws-chat">Open in chat</button>
          </div>
        </aside>
      </div>`;

    this.listEl = $('#ws-list');
    this.titleEl = $('#ws-title');
    this.bodyEl = $('#ws-body');
    this.outEl = $('#ws-ai-out');

    const save = debounce(() => {
      const doc = this.active;
      if (!doc) return;
      doc.title = this.titleEl.value.trim() || 'Untitled document';
      doc.body = this.bodyEl.value;
      doc.updated = Date.now();
      this.persist();
      this.renderList();
      const saved = $('#ws-saved');
      if (saved) saved.textContent = 'saved ' + new Date().toLocaleTimeString();
    }, 400);

    this.titleEl.addEventListener('input', save);
    this.bodyEl.addEventListener('input', () => { this.updateCount(); save(); });

    $('#ws-new')?.addEventListener('click', () => {
      const doc = { id: uid('w'), title: 'Untitled document', body: '', updated: Date.now() };
      this.docs.unshift(doc);
      this.activeId = doc.id;
      this.persist();
      this.render();
      this.titleEl.focus();
      this.titleEl.select();
    });

    $('#ws-delete')?.addEventListener('click', () => {
      const doc = this.active;
      if (!doc) return;
      if (!window.confirm('Delete "' + doc.title + '"?')) return;
      this.docs = this.docs.filter((d) => d.id !== doc.id);
      this.activeId = this.docs[0]?.id || null;
      this.persist();
      this.render();
    });

    root.querySelectorAll('[data-ws-act]').forEach((button) => {
      button.addEventListener('click', () => this.run(button.dataset.wsAct));
    });

    $('#ws-insert')?.addEventListener('click', () => {
      if (!this.lastAnswer) return;
      const doc = this.active;
      if (!doc) return;
      const addition = '\n\n' + this.lastAnswer.trim() + '\n';
      this.bodyEl.value += addition;
      doc.body = this.bodyEl.value;
      doc.updated = Date.now();
      this.persist();
      this.updateCount();
      bus.emit('notify', { title: 'Inserted', body: 'Assistant answer added to the document.', tone: 'success', timeout: 1800 });
    });

    $('#ws-chat')?.addEventListener('click', () => {
      bus.emit('ui:view', { view: 'assistant' });
      if (this.lastAnswer) bus.emit('ai:ask', { text: 'Continue from my workspace: ' + this.lastAnswer.slice(0, 400), source: 'workspace' });
    });

    bus.on('workspace:new', () => $('#ws-new')?.click());
    bus.on('workspace:act', (payload) => this.run(payload?.kind || 'summarize'));
    this.render();
    return this;
  }

  renderList() {
    if (!this.listEl) return;
    this.listEl.replaceChildren();
    for (const doc of this.docs) {
      this.listEl.append(el('button', {
        class: 'ws-doc' + (doc.id === this.activeId ? ' is-active' : ''),
        type: 'button',
        onclick: () => { this.activeId = doc.id; this.persist(); this.render(); },
      }, [
        el('strong', {}, doc.title || 'Untitled'),
        el('span', {}, new Date(doc.updated).toLocaleDateString() + ' · ' + (doc.body || '').split(/\s+/).filter(Boolean).length + ' words'),
      ]));
    }
  }

  render() {
    this.renderList();
    const doc = this.active;
    if (!doc) {
      this.titleEl.value = '';
      this.bodyEl.value = '';
      this.updateCount();
      return;
    }
    this.titleEl.value = doc.title;
    this.bodyEl.value = doc.body || '';
    this.updateCount();
  }

  updateCount() {
    const words = this.bodyEl.value.split(/\s+/).filter(Boolean).length;
    const node = $('#ws-count');
    if (node) node.textContent = words + ' word' + (words === 1 ? '' : 's');
  }

  async run(kind) {
    const doc = this.active;
    if (!doc) return;
    if (this.busy) return;
    const body = this.bodyEl.value.trim();
    if (!body) {
      this.outEl.textContent = 'Write something first.';
      return;
    }
    const instructions = {
      summarize: 'Summarise this document in 5 short bullets. Keep names and numbers.',
      improve: 'Rewrite this document to be clearer and tighter. Return the full improved text in markdown.',
      tasks: 'Extract every action item from this document as a checklist with owners when known.',
      explain: 'Explain this document to someone new in plain language, then list the key terms.',
    };
    const prompt = instructions[kind] + '\n\n---\n' + body.slice(0, 6000);
    this.busy = true;
    this.outEl.textContent = 'thinking…';
    if (settings.get('aiProvider') === 'local') {
      this.lastAnswer = localAnswer(kind, body);
      this.outEl.textContent = this.lastAnswer + '\n\n(offline extract — add a provider in Settings for a model rewrite)';
      const insert = $('#ws-insert');
      if (insert) insert.disabled = false;
      this.busy = false;
      return;
    }
    const insertBtn = $('#ws-insert');
    if (insertBtn) insertBtn.disabled = true;
    try {
      const result = await ai.send(prompt, { source: 'workspace', speak: false });
      const text = result?.content || 'No answer. Check the AI provider in Settings.';
      this.lastAnswer = text;
      this.outEl.textContent = text;
      if (insertBtn) insertBtn.disabled = false;
    } catch (err) {
      this.outEl.textContent = 'Assistant unavailable: ' + String(err?.message ?? err);
    } finally {
      this.busy = false;
    }
  }
}

function localAnswer(kind, body) {
  const sentences = body.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 3);
  if (kind === 'summarize') {
    return sentences.slice(0, 5).map((s) => '• ' + s.trim()).join('\n') || '• ' + body.slice(0, 200);
  }
  if (kind === 'tasks') {
    const verbs = /\b(build|ship|review|call|write|fix|record|publish|pick|send|test|design|plan|launch|update|finish)\b/i;
    const lines = body.split('\n').map((l) => l.replace(/^[#>*\-\d.\s]+/, '').trim())
      .filter((l) => l && (verbs.test(l) || /^\[.?\]/.test(l)));
    return lines.length ? lines.map((l) => '- [ ] ' + l).join('\n') : '- [ ] Nothing actionable found.';
  }
  if (kind === 'explain') {
    const words = {};
    for (const word of body.toLowerCase().match(/[a-z]{5,}/g) || []) words[word] = (words[word] || 0) + 1;
    const top = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
    return 'This document covers: ' + top.join(', ') + '.\n\n' + (sentences[0] || '');
  }
  return body.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l, i, arr) => l || arr[i - 1]).join('\n').trim();
}

export const workspace = new Workspace();

export function initWorkspace() {
  workspace.init();
}

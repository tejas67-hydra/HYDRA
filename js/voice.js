/**
 * HYDRA — voice interface: recognition (with wake word) and synthesis.
 * Everything degrades gracefully when the browser has no Web Speech support.
 */

import { bus, clamp } from './utils.js';
import { settings } from './settings.js';

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

class VoiceEngine {
  constructor() {
    this.recognitionSupported = Boolean(Recognition);
    this.synthesisSupported = 'speechSynthesis' in window;
    this.recognition = null;
    this.listening = false;
    this.continuous = false;
    this.wakeMode = false;
    this.wantsListening = false;
    this.voices = [];
    this.speaking = false;
    this.currentUtterance = null;
    this.restartTimer = null;
    this.lastRestart = 0;
  }

  init() {
    if (this.synthesisSupported) {
      const load = () => {
        this.voices = window.speechSynthesis.getVoices();
        bus.emit('voice:voices', this.voices);
      };
      load();
      window.speechSynthesis.addEventListener?.('voiceschanged', load);
    }
    bus.on('voice:start', (opts) => this.start(opts));
    bus.on('voice:stop', () => this.stop());
    bus.on('voice:speak', (text) => this.speak(text));
    bus.on('voice:stop', () => this.cancelSpeech());
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.speaking) this.cancelSpeech();
    });
    bus.on('voice:cancel', () => this.cancelSpeech());
    return this;
  }

  get supported() {
    return this.recognitionSupported;
  }

  buildRecognition() {
    if (!Recognition) return null;
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    recognition.onstart = () => {
      this.listening = true;
      bus.emit('voice:listening', true);
    };

    recognition.onend = () => {
      this.listening = false;
      bus.emit('voice:listening', false);
      if (this.wantsListening && this.continuous) {
        const now = Date.now();
        if (now - this.lastRestart > 700) {
          this.lastRestart = now;
          clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            if (this.wantsListening) {
              try { recognition.start(); } catch { /* already starting */ }
            }
          }, 320);
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.wantsListening = false;
        this.listening = false;
        bus.emit('voice:listening', false);
        bus.emit('notify', {
          title: 'Microphone blocked',
          body: 'Allow microphone access in the browser to use voice.',
          tone: 'warn',
        });
      } else if (event.error === 'network') {
        bus.emit('notify', { title: 'Speech service offline', body: 'Recognition needs a network connection in most browsers.', tone: 'warn' });
      }
      bus.emit('voice:error', event.error);
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }

      if (interim) bus.emit('voice:partial', interim.trim());

      if (finalText) {
        const text = finalText.trim();
        if (!text) return;
        if (this.wakeMode) {
          const wake = (settings.get('wakeWord') || 'hydra').toLowerCase();
          const lower = text.toLowerCase();
          const at = lower.indexOf(wake);
          if (at >= 0) {
            const command = text.slice(at + wake.length).replace(/^[,.\s]+/, '').trim();
            bus.emit('voice:wake', command);
            if (command) bus.emit('voice:transcript', { text: command, wake: true });
          }
        } else {
          bus.emit('voice:transcript', { text, wake: false });
        }
      }
    };

    return recognition;
  }

  start({ continuous = false, wake = false } = {}) {
    if (!this.recognitionSupported) {
      bus.emit('notify', {
        title: 'Voice input unavailable',
        body: 'This browser has no Speech Recognition API. Chrome or Edge work best.',
        tone: 'warn',
      });
      return false;
    }
    if (!this.recognition) this.recognition = this.buildRecognition();
    this.continuous = continuous;
    this.wakeMode = wake;
    this.wantsListening = true;
    this.recognition.continuous = true;
    try {
      this.recognition.start();
      return true;
    } catch {
      // Already started — treat as success.
      return true;
    }
  }

  stop() {
    this.wantsListening = false;
    clearTimeout(this.restartTimer);
    try { this.recognition?.stop(); } catch { /* ignore */ }
    this.listening = false;
    bus.emit('voice:listening', false);
  }

  toggle(options = {}) {
    if (this.listening) {
      this.stop();
      return false;
    }
    return this.start(options);
  }

  pickVoice() {
    if (!this.voices.length) return null;
    const lang = (navigator.language || 'en-US').toLowerCase();
    const base = lang.split('-')[0];
    return this.voices.find((v) => v.lang?.toLowerCase() === lang)
      ?? this.voices.find((v) => v.lang?.toLowerCase().startsWith(base) && /female|samantha|zira|google/i.test(v.name))
      ?? this.voices.find((v) => v.lang?.toLowerCase().startsWith(base))
      ?? this.voices[0];
  }

  speak(text, { interrupt = true } = {}) {
    const clean = String(text)
      .replace(/```[\s\S]*?```/g, ' code block ')
      .replace(/[*_`#>]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return false;

    const key = String(settings.get('elevenKey') || '').trim();
    if (key) {
      this.speakEleven(clean, key, { interrupt });
      return true;
    }
    return this.speakSystem(clean, { interrupt });
  }

  async speakEleven(text, key, { interrupt = true } = {}) {
    if (interrupt) this.cancelSpeech();
    this.speaking = true;
    bus.emit('voice:speaking', true);
    try {
      const voiceId = String(settings.get('elevenVoice') || '21m00Tcm4TlvDq8ikWAM').trim();
      const model = String(settings.get('elevenModel') || 'eleven_multilingual_v2');
      const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId), {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.slice(0, 2000),
          model_id: model,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (!res.ok) throw new Error('ElevenLabs ' + res.status);
      const url = URL.createObjectURL(await res.blob());
      this.audio = new Audio(url);
      const done = () => {
        this.speaking = false;
        bus.emit('voice:speaking', false);
        URL.revokeObjectURL(url);
      };
      this.audio.onended = done;
      this.audio.onerror = done;
      await this.audio.play();
    } catch (err) {
      this.speaking = false;
      bus.emit('voice:speaking', false);
      bus.emit('notify', { title: 'ElevenLabs unavailable', body: 'Using the system voice instead.', tone: 'warn' });
      this.speakSystem(text, { interrupt: false });
    }
  }

  speakSystem(clean, { interrupt = true } = {}) {
    if (!this.synthesisSupported) return false;
    if (interrupt) this.cancelSpeech();
    const utterance = new SpeechSynthesisUtterance(clean.slice(0, 900));
    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = clamp(Number(settings.get('voiceRate')) || 1, 0.6, 1.6);
    utterance.pitch = clamp(Number(settings.get('voicePitch')) || 1, 0.5, 1.8);
    utterance.volume = 1;
    utterance.onstart = () => {
      this.speaking = true;
      bus.emit('voice:speaking', true);
    };
    const done = () => {
      this.speaking = false;
      bus.emit('voice:speaking', false);
    };
    utterance.onend = done;
    utterance.onerror = done;
    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  cancelSpeech() {
    if (this.audio) {
      try { this.audio.pause(); } catch { /* ignore */ }
      this.audio = null;
    }
    if (!this.synthesisSupported) return;
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    this.speaking = false;
    bus.emit('voice:speaking', false);
  }

  status() {
    return {
      recognition: this.recognitionSupported,
      synthesis: this.synthesisSupported,
      listening: this.listening,
      speaking: this.speaking,
      voices: this.voices.length,
    };
  }
}

export const voice = new VoiceEngine();

export function initVoice() {
  return voice.init();
}

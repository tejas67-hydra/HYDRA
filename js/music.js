/**
 * HYDRA — studio engine.
 * Generative ambient scenes synthesised live with WebAudio, plus an optional
 * local file player. Nothing is fetched; the "tracks" are algorithms.
 */

import { bus, clamp } from './utils.js';
import { settings } from './settings.js';

const SCENES = [
  {
    id: 'nebula-drift',
    title: 'Nebula Drift',
    artist: 'HYDRA generative',
    root: 45,
    scale: [0, 3, 5, 7, 10],
    progression: [[0, 7, 12, 15], [-4, 3, 8, 12], [-2, 5, 10, 14], [3, 10, 15, 19]],
    bar: 9,
    cutoff: 900,
    arp: 0.62,
    pad: 'sine',
    warmth: 0.5,
  },
  {
    id: 'deep-focus',
    title: 'Deep Focus',
    artist: 'HYDRA generative',
    root: 41,
    scale: [0, 2, 3, 7, 9],
    progression: [[0, 7, 12, 14], [-5, 2, 7, 12], [-3, 4, 9, 11], [0, 7, 12, 16]],
    bar: 12,
    cutoff: 620,
    arp: 1.4,
    pad: 'triangle',
    warmth: 0.35,
  },
  {
    id: 'neon-rain',
    title: 'Neon Rain',
    artist: 'HYDRA generative',
    root: 48,
    scale: [0, 3, 7, 10, 12],
    progression: [[0, 7, 10, 15], [-3, 4, 7, 12], [2, 9, 14, 17], [-5, 2, 7, 11]],
    bar: 8,
    cutoff: 1250,
    arp: 0.46,
    pad: 'sawtooth',
    warmth: 0.65,
  },
  {
    id: 'glass-temple',
    title: 'Glass Temple',
    artist: 'HYDRA generative',
    root: 43,
    scale: [0, 2, 5, 7, 9],
    progression: [[0, 5, 9, 12], [-2, 3, 7, 12], [-5, 0, 5, 10], [-4, 3, 8, 11]],
    bar: 10,
    cutoff: 1500,
    arp: 0.8,
    pad: 'sine',
    warmth: 0.55,
  },
  {
    id: 'void-walk',
    title: 'Void Walk',
    artist: 'HYDRA generative',
    root: 38,
    scale: [0, 1, 5, 7, 8],
    progression: [[0, 6, 11, 13], [-1, 5, 8, 13], [-4, 1, 6, 12], [2, 7, 11, 14]],
    bar: 14,
    cutoff: 480,
    arp: 1.9,
    pad: 'triangle',
    warmth: 0.28,
  },
];

const midiToFreq = (midi) => 440 * 2 ** ((midi - 69) / 12);

class MusicEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.reverb = null;
    this.reverbSend = null;
    this.voices = [];
    this.noise = null;
    this.arpTimer = null;
    this.arpStep = 0;
    this.chordIndex = 0;
    this.nextChordAt = 0;
    this.startedAt = 0;
    this.accumulated = 0;
    this.sceneIndex = 0;
    this.playing = false;
    this.muted = false;
    this.volume = clamp(Number(settings.get('musicVolume') ?? 0.7), 0, 1);
    this.mode = 'generative';
    this.audioEl = null;
    this.fileSource = null;
    this.fileName = null;
    this.fileDuration = 0;
  }

  get scene() {
    return SCENES[this.sceneIndex];
  }

  get state() {
    const fileMode = this.mode === 'file';
    return {
      playing: this.playing,
      mode: this.mode,
      trackId: fileMode ? 'local-file' : this.scene.id,
      title: fileMode ? (this.fileName || 'Local audio') : this.scene.title,
      artist: fileMode ? 'Local file' : this.scene.artist,
      index: this.sceneIndex,
      total: SCENES.length,
      elapsed: fileMode ? (this.audioEl?.currentTime ?? 0) * 1000 : this.elapsedMs(),
      duration: fileMode ? this.fileDuration * 1000 : 0,
      volume: this.volume,
      muted: this.muted,
      analyser: this.analyser,
    };
  }

  elapsedMs() {
    if (!this.playing) return this.accumulated;
    return this.accumulated + (performance.now() - this.startedAt);
  }

  emit() {
    bus.emit('music:state', this.state);
  }

  ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('WebAudio is not available in this browser');
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.3;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;

    this.master.connect(compressor);
    compressor.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.buildImpulse(2.8, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.42;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);

    this.buildPadVoices();
    return ctx;
  }

  buildImpulse(seconds, decay) {
    const { ctx } = this;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
      }
    }
    return buffer;
  }

  buildPadVoices() {
    const { ctx } = this;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.scene.cutoff;
    filter.Q.value = 0.7;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.045;
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    filter.connect(this.master);
    filter.connect(this.reverbSend);
    this.padFilter = filter;

    const chord = this.scene.progression[0];
    this.voices = chord.map((semitones, i) => {
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const pan = ctx.createStereoPanner?.() ?? null;
      if (pan) pan.pan.value = [-0.4, 0.35, -0.1, 0.5][i] ?? 0;

      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      oscA.type = this.scene.pad;
      oscB.type = this.scene.pad;
      oscA.detune.value = -6;
      oscB.detune.value = 7;

      const freq = midiToFreq(this.scene.root + semitones);
      oscA.frequency.value = freq;
      oscB.frequency.value = freq * 1.003;

      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.5;
      oscA.connect(oscGain);
      oscB.connect(oscGain);
      if (pan) {
        oscGain.connect(pan);
        pan.connect(gain);
      } else {
        oscGain.connect(gain);
      }
      gain.connect(filter);

      oscA.start();
      oscB.start();
      gain.gain.setTargetAtTime(0.055, ctx.currentTime, 1.8);

      return { gain, oscA, oscB, index: i };
    });

    // airy noise bed
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 900;
    bandpass.Q.value = 0.6;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.012 * (0.5 + this.scene.warmth);
    noiseSource.connect(bandpass).connect(noiseGain).connect(this.master);
    noiseSource.start();
    this.noise = { source: noiseSource, gain: noiseGain, filter: bandpass };
  }

  async play(trackId = null) {
    this.ensureContext();

    if (trackId) {
      const idx = SCENES.findIndex((s) => s.id === trackId);
      if (idx >= 0) this.sceneIndex = idx;
    }

    if (this.mode === 'file') {
      await this.audioEl?.play().catch(() => {});
      this.playing = true;
      this.emit();
      return;
    }

    this.playing = true;
    this.startedAt = performance.now();
    this.chordIndex = 0;
    this.arpStep = 0;
    this.nextChordAt = this.ctx.currentTime + 1.2;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.6);
    this.padFilter.frequency.setTargetAtTime(this.scene.cutoff, this.ctx.currentTime, 1.4);
    for (const voice of this.voices) voice.gain.gain.setTargetAtTime(0.055, this.ctx.currentTime, 1.6);

    this.startScheduler();
    this.emit();
  }

  pause() {
    if (this.mode === 'file') {
      this.audioEl?.pause();
      this.playing = false;
      this.emit();
      return;
    }
    if (!this.ctx || !this.playing) return;
    this.accumulated = this.elapsedMs();
    this.playing = false;
    this.stopScheduler();
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    for (const voice of this.voices) voice.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.8);
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  async next() {
    if (this.mode === 'file') return this.playNextScene();
    this.sceneIndex = (this.sceneIndex + 1) % SCENES.length;
    await this.swapScene();
  }

  async prev() {
    if (this.mode === 'file') return this.playNextScene(true);
    this.sceneIndex = (this.sceneIndex - 1 + SCENES.length) % SCENES.length;
    await this.swapScene();
  }

  async swapScene() {
    if (!this.ctx) return this.play();
    const wasPlaying = this.playing;
    this.pause();
    this.accumulated = 0;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.35);
    await new Promise((r) => setTimeout(r, 420));
    this.teardownGenerative();
    this.buildPadVoices();
    if (wasPlaying) await this.play();
    else this.emit();
  }

  playNextScene(reverse = false) {
    this.sceneIndex = (this.sceneIndex + (reverse ? -1 : 1) + SCENES.length) % SCENES.length;
    this.mode = 'generative';
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl = null;
    }
    this.fileName = null;
    return this.swapScene();
  }

  teardownGenerative() {
    this.stopScheduler();
    for (const voice of this.voices) {
      try {
        voice.oscA.stop();
        voice.oscB.stop();
      } catch { /* already stopped */ }
      voice.gain.disconnect();
    }
    this.voices = [];
    try {
      this.noise?.source.stop();
      this.noise?.gain.disconnect();
    } catch { /* ignore */ }
    this.noise = null;
    try { this.padFilter?.disconnect(); } catch { /* ignore */ }
  }

  startScheduler() {
    this.stopScheduler();
    this.arpTimer = setInterval(() => this.schedule(), 40);
    this.schedule();
  }

  stopScheduler() {
    clearInterval(this.arpTimer);
    this.arpTimer = null;
  }

  schedule() {
    if (!this.playing || this.mode !== 'generative') return;
    const { ctx } = this;
    const now = ctx.currentTime;
    const scene = this.scene;

    while (this.nextChordAt < now + 0.4) {
      const chord = scene.progression[this.chordIndex % scene.progression.length];
      const glide = Math.min(2.4, scene.bar * 0.35);
      for (let i = 0; i < this.voices.length; i += 1) {
        const voice = this.voices[i];
        const target = midiToFreq(scene.root + chord[i % chord.length]);
        voice.oscA.frequency.setTargetAtTime(target, now, glide);
        voice.oscB.frequency.setTargetAtTime(target * 1.003, now, glide);
      }
      this.chordIndex += 1;
      this.nextChordAt += scene.bar;
    }

    // sparse arpeggio plucks
    const interval = scene.arp;
    const step = Math.floor(now / interval);
    if (step !== this.lastArpStep) {
      this.lastArpStep = step;
      if (Math.random() < 0.78) this.pluck();
    }
  }

  pluck() {
    const { ctx } = this;
    const scene = this.scene;
    const chord = scene.progression[this.chordIndex % scene.progression.length];
    const note = scene.root + 12 + chord[Math.floor(Math.random() * chord.length)]
      + (Math.random() < 0.4 ? scene.scale[Math.floor(Math.random() * scene.scale.length)] : 0);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;

    osc.type = 'sine';
    osc.frequency.value = midiToFreq(note);
    const now = ctx.currentTime;
    const peak = 0.05 + Math.random() * 0.035;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6 + Math.random());

    osc.connect(filter).connect(gain);
    gain.connect(this.master);
    gain.connect(this.reverbSend);
    osc.start(now);
    osc.stop(now + 2.8);
  }

  setVolume(value) {
    this.volume = clamp(Number(value), 0, 1);
    settings.set({ musicVolume: this.volume });
    if (this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
    }
    if (this.audioEl) this.audioEl.volume = this.muted ? 0 : this.volume;
    this.emit();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.12);
    if (this.audioEl) this.audioEl.volume = this.muted ? 0 : this.volume;
    this.emit();
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  seek(seconds) {
    if (this.mode !== 'file' || !this.audioEl) return;
    this.audioEl.currentTime = clamp(seconds, 0, this.fileDuration || 0);
    this.emit();
  }

  async loadFile(file) {
    if (!file) return;
    this.ensureContext();
    this.pause();
    this.teardownGenerative();

    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = '';
    }

    const audio = new Audio(URL.createObjectURL(file));
    audio.crossOrigin = 'anonymous';
    audio.loop = false;
    audio.volume = this.muted ? 0 : this.volume;
    this.audioEl = audio;
    this.fileName = file.name.replace(/\.[^.]+$/, '');
    this.mode = 'file';
    this.fileDuration = 0;

    audio.addEventListener('loadedmetadata', () => {
      this.fileDuration = audio.duration || 0;
      this.emit();
    });
    audio.addEventListener('ended', () => {
      this.playing = false;
      this.emit();
    });
    audio.addEventListener('timeupdate', () => this.emit());

    if (!this.fileSource) {
      try {
        this.fileSource = this.ctx.createMediaElementSource(audio);
        this.fileSource.connect(this.master);
      } catch {
        /* media element already routed */
      }
    } else {
      try { this.fileSource.disconnect(); } catch { /* ignore */ }
      this.fileSource = this.ctx.createMediaElementSource(audio);
      this.fileSource.connect(this.master);
    }

    this.accumulated = 0;
    await audio.play().catch(() => {});
    this.playing = true;
    this.emit();
    bus.emit('notify', { title: 'Audio loaded', body: this.fileName, tone: 'success' });
  }

  /** Back to generative mode without stopping the world. */
  async backToGenerative() {
    if (this.mode !== 'file') return;
    this.audioEl?.pause();
    this.mode = 'generative';
    this.accumulated = 0;
    this.teardownGenerative();
    this.buildPadVoices();
    await this.play();
  }
}

export const music = new MusicEngine();
export const SCENE_LIST = SCENES;

export function initMusic() {
  const vol = Number(settings.get('musicVolume'));
  if (Number.isFinite(vol)) music.volume = clamp(vol, 0, 1);
  bus.on('settings:change', ({ state, prev }) => {
    if (state.musicVolume !== prev.musicVolume && Number.isFinite(state.musicVolume)) {
      music.volume = clamp(state.musicVolume, 0, 1);
    }
  });
  return music;
}

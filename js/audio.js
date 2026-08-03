/* ============================================================
   audio.js — placeholder sound engine + text-to-speech.

   Every sound in the game is a NAMED ASSET (see ASSETS.md).
   If the real file exists under assets/audio/... it is used.
   If not, a soft WebAudio synth stand-in plays instead, so the
   game is fully playable with zero asset files.

   VA.Audio.sfx('camera')     -> assets/audio/sfx/camera.wav
   VA.Audio.music('theme_australia') -> assets/audio/music/theme_australia.mp3
   VA.Audio.ambient(['waves','seagulls']) -> assets/audio/ambient/waves.wav ...
   VA.Voice.speak('Hello!', profile)  -> browser speech synthesis
   ============================================================ */
'use strict';

VA.Audio = {
  ctx: null, busSfx: null, busMusic: null, busAmb: null,
  _files: {},           // path -> {state:'pending'|'ok'|'fail', el}
  _musicTheme: null,    // current theme id
  _musicEl: null,       // playing file (if real music file exists)
  _musicTimer: null,    // synth scheduler
  _ambNodes: [],        // active ambient synth nodes
  _ambTimers: [],
  _ambEls: [],
  _noiseBuf: null,

  get on()      { return VA.State.data ? VA.State.data.settings.sfx   : true; },
  get musicOn() { return VA.State.data ? VA.State.data.settings.music : true; },

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const mk = g => { const n = this.ctx.createGain(); n.gain.value = g; n.connect(this.ctx.destination); return n; };
    this.busSfx = mk(0.5);
    this.busMusic = mk(0.13);
    this.busAmb = mk(0.14);
    // shared white-noise buffer for waves / wind / shutter
    const len = this.ctx.sampleRate * 2;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  /* ---------- real-file probing (drop-in asset upgrade) ---------- */
  _file(path, onReady) {
    let f = this._files[path];
    if (!f) {
      f = this._files[path] = { state: 'pending', el: null, cbs: [] };
      const a = new Audio();
      a.addEventListener('canplaythrough', () => {
        f.state = 'ok'; f.el = a;
        f.cbs.forEach(cb => cb(a)); f.cbs = [];
      }, { once: true });
      a.addEventListener('error', () => { f.state = 'fail'; f.cbs = []; }, { once: true });
      a.src = path;
    }
    if (onReady) {
      if (f.state === 'ok') onReady(f.el);
      else if (f.state === 'pending') f.cbs.push(onReady);
    }
    return f;
  },

  /* ---------- SFX ---------- */
  sfx(name) {
    if (!this.on || !this.ctx) return;
    const f = this._file('assets/audio/sfx/' + name + '.wav');
    if (f.state === 'ok') {
      const el = f.el.cloneNode();
      el.volume = 0.6;
      el.play().catch(() => {});
      return;
    }
    const fn = this._synth[name];
    if (fn) { try { fn.call(this); } catch (e) {} }
  },

  /* small synth building blocks */
  _tone(opts) {
    const { f0, f1 = null, dur = 0.2, type = 'sine', gain = 0.5, at = 0, bus = this.busSfx } = opts;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  },
  _noise(opts) {
    const { dur = 0.15, freq = 2000, q = 1, gain = 0.4, at = 0, type = 'lowpass' } = opts;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const fl = this.ctx.createBiquadFilter();
    fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(this.busSfx);
    src.start(t); src.stop(t + dur + 0.05);
  },

  _synth: {
    click()  { this._tone({ f0: 700, f1: 520, dur: 0.07, gain: 0.25 }); },
    tap()    { this._tone({ f0: 500, f1: 380, dur: 0.06, gain: 0.22 }); },
    coin()   { this._tone({ f0: 880, dur: 0.09, type: 'triangle', gain: 0.35 });
               this._tone({ f0: 1320, dur: 0.16, type: 'triangle', gain: 0.3, at: 0.07 }); },
    coins()  { for (let i = 0; i < 4; i++) this._tone({ f0: 880 + i * 160, dur: 0.09, type: 'triangle', gain: 0.22, at: i * 0.06 }); },
    camera() { this._noise({ dur: 0.05, freq: 4000, gain: 0.5 });
               this._tone({ f0: 1800, f1: 900, dur: 0.05, gain: 0.3, at: 0.045 }); },
    chime()  { [523, 659, 784].forEach((f, i) => this._tone({ f0: f, dur: 0.5, type: 'triangle', gain: 0.22, at: i * 0.09 })); },
    obtain() { [523, 659, 784, 1046].forEach((f, i) => this._tone({ f0: f, dur: 0.42, type: 'triangle', gain: 0.2, at: i * 0.08 })); },
    fanfare(){ [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this._tone({ f0: f, dur: 0.42, type: 'triangle', gain: 0.22, at: i * 0.13 })); },
    pop()    { this._tone({ f0: 300, f1: 620, dur: 0.09, gain: 0.3 }); },
    whoosh() { this._noise({ dur: 0.7, freq: 900, gain: 0.3, type: 'bandpass', q: 0.8 }); },
    bounce() { this._tone({ f0: 340, f1: 150, dur: 0.13, gain: 0.35 }); },
    kick()   { this._tone({ f0: 260, f1: 110, dur: 0.1, gain: 0.4 }); this._noise({ dur: 0.06, freq: 1500, gain: 0.2 }); },
    bite()   { this._noise({ dur: 0.08, freq: 2400, gain: 0.4 }); this._noise({ dur: 0.07, freq: 1600, gain: 0.3, at: 0.1 }); },
    sizzle() { this._noise({ dur: 0.9, freq: 5200, gain: 0.18, type: 'highpass' }); },
    stamp()  { this._tone({ f0: 150, f1: 60, dur: 0.18, gain: 0.6 }); this._noise({ dur: 0.09, freq: 700, gain: 0.3 }); },
    page()   { this._noise({ dur: 0.25, freq: 2600, gain: 0.2, type: 'bandpass', q: 0.6 }); },
    boing()  { this._tone({ f0: 160, f1: 560, dur: 0.24, type: 'triangle', gain: 0.35 }); },
    hmm()    { this._tone({ f0: 420, f1: 360, dur: 0.18, type: 'sine', gain: 0.22 });
               this._tone({ f0: 360, f1: 300, dur: 0.22, gain: 0.2, at: 0.2 }); },
    heart()  { this._tone({ f0: 660, dur: 0.2, type: 'triangle', gain: 0.22 });
               this._tone({ f0: 880, dur: 0.3, type: 'triangle', gain: 0.2, at: 0.12 }); },
    cheer()  { [660, 880, 1100].forEach((f, i) => this._tone({ f0: f, f1: f * 1.12, dur: 0.2, type: 'triangle', gain: 0.2, at: i * 0.07 })); },
    splash() { this._noise({ dur: 0.4, freq: 1200, gain: 0.3 }); },
    plane()  { this._tone({ f0: 90, f1: 130, dur: 1.6, type: 'sawtooth', gain: 0.12 });
               this._noise({ dur: 1.4, freq: 600, gain: 0.15 }); },
    camel()  { this._tone({ f0: 220, f1: 140, dur: 0.5, type: 'sawtooth', gain: 0.18 }); },
    gull()   { this._tone({ f0: 1250, f1: 750, dur: 0.16, type: 'triangle', gain: 0.12 });
               this._tone({ f0: 1150, f1: 700, dur: 0.2, type: 'triangle', gain: 0.1, at: 0.2 }); },
  },

  /* ---------- MUSIC (generative placeholder or real file) ---------- */
  MUSIC: {
    theme_title:     { bpm: 100, beats: 4, root: 67, scale: [0,2,4,5,7,9,11], mel: [[0,null,2,4, 7,null,4,2],[0,null,2,4, 5,null,4,null]], bass: [0, -3] },
    theme_home:      { bpm: 76,  beats: 4, root: 65, scale: [0,2,4,5,7,9,11], mel: [[0,null,4,null, 2,null,5,4],[2,null,4,null, 0,null,null,null]], bass: [0, -4] },
    theme_map:       { bpm: 108, beats: 4, root: 60, scale: [0,2,4,5,7,9,11], mel: [[0,2,4,7, 4,2,4,null],[5,4,2,4, 0,null,2,null]], bass: [0, 3] },
    theme_travel:    { bpm: 124, beats: 4, root: 62, scale: [0,2,4,5,7,9,11], mel: [[0,4,7,4, 9,7,4,2],[0,4,7,9, 11,9,7,4]], bass: [0, 4] },
    theme_australia: { bpm: 96,  beats: 4, root: 60, scale: [0,2,4,5,7,9,11], mel: [[4,null,2,4, 7,null,9,7],[4,null,2,0, 2,null,null,null]], bass: [0, 3] },
    theme_paris:     { bpm: 90,  beats: 3, root: 57, scale: [0,2,3,5,7,8,10], mel: [[0,4,7, 5,4,2],[3,4,5, 4,null,null]], bass: [0, -2] },
    theme_egypt:     { bpm: 82,  beats: 4, root: 62, scale: [0,1,4,5,7,8,10], mel: [[0,1,null,0, 4,null,5,4],[7,5,4,1, 0,null,null,null]], bass: [0, 0] },
    theme_scrapbook: { bpm: 70,  beats: 4, root: 72, scale: [0,2,4,5,7,9,11], mel: [[0,null,4,null, 7,null,4,null],[9,null,7,null, 4,null,2,null]], bass: [0, -3] },
  },

  music(themeId) {
    if (this._musicTheme === themeId) return;
    this._musicTheme = themeId;
    this._stopMusic();
    if (!themeId || !this.musicOn || !this.ctx) return;

    // if a real music file exists, prefer it (swaps in as soon as it loads)
    this._file('assets/audio/music/' + themeId + '.mp3', el => {
      if (this._musicTheme !== themeId || !this.musicOn) return;
      clearInterval(this._musicTimer); this._musicTimer = null;
      this._musicEl = el;
      el.loop = true; el.volume = 0.35; el.currentTime = 0;
      el.play().catch(() => {});
    });

    const spec = this.MUSIC[themeId];
    if (!spec) return;
    const eighth = 60 / spec.bpm / 2;
    const perBar = spec.beats * 2;
    let next = this.ctx.currentTime + 0.1;
    let bar = 0, step = 0;
    this._musicTimer = setInterval(() => {
      if (!this.musicOn) return;
      while (next < this.ctx.currentTime + 0.55) {
        const melBar = spec.mel[bar % spec.mel.length];
        const deg = melBar[step % perBar % melBar.length];
        if (deg != null) this._pluck(this._degFreq(spec, deg), next, 0.16);
        if (step === 0) this._pluck(this._degFreq(spec, spec.bass[bar % spec.bass.length]) / 2, next, 0.2, 1.4);
        step++;
        if (step >= perBar) { step = 0; bar++;
          if (bar % 4 === 3) this._pluck(this._degFreq(spec, 7) * 2, next + eighth, 0.06); // sparkle
        }
        next += eighth;
      }
    }, 180);
  },

  _degFreq(spec, deg) {
    const oct = Math.floor(deg / 7);
    let idx = deg % 7; if (idx < 0) { idx += 7; }
    const semis = spec.scale[idx] + oct * 12 + (deg < 0 && deg % 7 !== 0 ? -12 : 0);
    return 440 * Math.pow(2, (spec.root + semis - 69) / 12);
  },

  _pluck(freq, t, vel = 0.15, len = 0.7) {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine'; o2.type = 'triangle';
    o.frequency.value = freq; o2.frequency.value = freq; o2.detune.value = 4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); o2.connect(g); g.connect(this.busMusic);
    o.start(t); o2.start(t); o.stop(t + len + 0.1); o2.stop(t + len + 0.1);
  },

  _stopMusic() {
    // stops playback only; _musicTheme is managed by music()
    clearInterval(this._musicTimer); this._musicTimer = null;
    if (this._musicEl) { this._musicEl.pause(); this._musicEl = null; }
  },

  /* ---------- AMBIENT BEDS ---------- */
  AMBIENT: {
    waves:        { file: 'waves',        freq: 480, lfo: 0.09, depth: 0.5, gain: 0.9 },
    seagulls:     { file: 'seagulls',     chirp: 'gull', every: [5, 13] },
    wind:         { file: 'wind',         freq: 750, lfo: 0.05, depth: 0.35, gain: 0.4 },
    city_evening: { file: 'city_evening', freq: 280, lfo: 0.03, depth: 0.2, gain: 0.5 },
    pigeons:      { file: 'pigeons',      chirp: 'pigeon', every: [7, 16] },
    crickets:     { file: 'crickets',     chirp: 'cricket', every: [2.4, 5] },
    desert_wind:  { file: 'desert_wind',  freq: 420, lfo: 0.04, depth: 0.45, gain: 0.55 },
    market:       { file: 'market',       freq: 520, lfo: 0.06, depth: 0.25, gain: 0.45 },
    hawk:         { file: 'hawk',         chirp: 'hawk', every: [9, 20] },
    room:         { file: 'room',         freq: 200, lfo: 0.02, depth: 0.1, gain: 0.18 },
  },

  _chirps: {
    gull()   { this._synth.gull.call(this); },
    pigeon() { this._tone({ f0: 340, f1: 300, dur: 0.22, type: 'sine', gain: 0.08 });
               this._tone({ f0: 380, f1: 320, dur: 0.3, gain: 0.07, at: 0.26 }); },
    cricket(){ for (let i = 0; i < 3; i++) this._tone({ f0: 4200, dur: 0.03, type: 'sine', gain: 0.03, at: i * 0.09 }); },
    hawk()   { this._tone({ f0: 1050, f1: 520, dur: 0.7, type: 'triangle', gain: 0.06 }); },
  },

  ambient(names) {
    // stop previous beds
    this._ambNodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} });
    this._ambNodes = [];
    this._ambTimers.forEach(t => clearInterval(t));
    this._ambTimers = [];
    this._ambEls.forEach(el => el.pause());
    this._ambEls = [];
    if (!names || !this.ctx || !this.on) return;

    this._ambBedActive = names;
    for (const name of names) {
      const spec = this.AMBIENT[name];
      if (!spec) continue;

      const bedNodes = [];

      if (spec.chirp) {
        const timer = setInterval(() => {
          if (this.on && Math.random() < 0.8) this._chirps[spec.chirp].call(this);
        }, VA.rand(spec.every[0], spec.every[1]) * 1000);
        this._ambTimers.push(timer);
      } else {
        // noise bed: noise -> lowpass -> gain modulated by a slow LFO
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuf; src.loop = true;
        const fl = this.ctx.createBiquadFilter();
        fl.type = 'lowpass'; fl.frequency.value = spec.freq;
        const g = this.ctx.createGain();
        g.gain.value = spec.gain * 0.5;
        const lfo = this.ctx.createOscillator();
        const lfoG = this.ctx.createGain();
        lfo.frequency.value = spec.lfo;
        lfoG.gain.value = spec.gain * 0.5 * spec.depth;
        lfo.connect(lfoG); lfoG.connect(g.gain);
        src.connect(fl); fl.connect(g); g.connect(this.busAmb);
        src.start(); lfo.start();
        bedNodes.push(src, lfo, g);
        this._ambNodes.push(src, lfo, g);
      }

      // if a real recording exists, it replaces this bed's synth as soon as it loads
      this._file('assets/audio/ambient/' + spec.file + '.wav', el => {
        if (this._ambBedActive !== names) return;
        bedNodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} });
        el.loop = true; el.volume = 0.25;
        el.play().catch(() => {});
        this._ambEls.push(el);
      });
    }
  },

  applySettings() {
    if (!this.musicOn) { const t = this._musicTheme; this._stopMusic(); this._musicTheme = null; this._pausedTheme = t; }
    else if (!this._musicTheme && this._pausedTheme) { this.music(this._pausedTheme); this._pausedTheme = null; }
    if (!this.on) this.ambient(null);
  },
};

/* ============================================================
   VA.Voice — text-to-speech placeholder for character voice acting.
   Real voice files (assets/audio/voice/*.wav) can replace this later.
   ============================================================ */
VA.Voice = {
  _voice: null,

  get on() { return VA.State.data ? VA.State.data.settings.voice : true; },

  init() {
    if (!window.speechSynthesis) return;
    const pickVoice = () => {
      const vs = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
      if (!vs.length) return;
      this._voice =
        vs.find(v => /aria|jenny|zira|samantha|natural/i.test(v.name)) ||
        vs.find(v => v.lang === 'en-US') || vs[0];
    };
    pickVoice();
    speechSynthesis.addEventListener('voiceschanged', pickVoice);
  },

  speak(text, prof = {}) {
    if (!this.on || !window.speechSynthesis || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[✈🪙📷]/g, ''));
      if (this._voice) u.voice = this._voice;
      u.lang = 'en-US';
      u.rate = prof.rate || 0.9;
      u.pitch = prof.pitch || 1.1;
      u.volume = 0.95;
      speechSynthesis.speak(u);
    } catch (e) {}
  },

  stop() {
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {}
  },
};

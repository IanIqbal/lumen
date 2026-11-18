// ───────── generative audio: everything is synthesized live, nothing is a recording ─────────
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENT = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88]; // D major pentatonic, D4 → E6
const CHORDS = [
  { root: 38, pad: [50, 57, 62, 66, 69, 73], arp: [62, 66, 69, 73, 74, 78, 81] }, // Dmaj9
  { root: 35, pad: [50, 54, 59, 62, 66, 69], arp: [59, 62, 66, 69, 71, 74, 78] }, // Bm11
  { root: 31, pad: [50, 55, 59, 62, 66, 69], arp: [59, 62, 66, 67, 71, 74, 79] }, // Gmaj9
  { root: 33, pad: [52, 57, 61, 64, 66, 71], arp: [57, 61, 64, 66, 69, 73, 76] }, // A6/9
];
const BPM = 84;
const STEP = 60 / BPM / 4;

class AudioEngine {
  constructor() {
    this.ctx = null; this.phase = 0; this.muted = false; this.beats = [];
    this.step = 0; this.nextT = 0; this.lastPluck = 0; this.padCut = 380;
  }

  init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      const ctx = (this.ctx = new AC());
      this.out = ctx.createGain(); this.out.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 18; comp.ratio.value = 3.2; comp.attack.value = 0.01; comp.release.value = 0.3;
      this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 16000; this.tone.Q.value = 0.4;
      this.master = ctx.createGain(); this.master.gain.value = 0.8;
      this.master.connect(this.tone); this.tone.connect(comp); comp.connect(this.out); this.out.connect(ctx.destination);

      this.verb = ctx.createConvolver(); this.verb.buffer = this._impulse(5.5, 2.3);
      this.verbIn = ctx.createGain();
      const verbOut = ctx.createGain(); verbOut.gain.value = 0.9;
      this.verbIn.connect(this.verb); this.verb.connect(verbOut); verbOut.connect(this.master);

      this.dly = ctx.createDelay(2); this.dly.delayTime.value = STEP * 3;
      const fb = ctx.createGain(); fb.gain.value = 0.42;
      const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3000;
      this.dlyIn = ctx.createGain();
      this.dlyIn.connect(this.dly); this.dly.connect(dlp); dlp.connect(fb); fb.connect(this.dly);
      const dOut = ctx.createGain(); dOut.gain.value = 0.55; dlp.connect(dOut); dOut.connect(this.master);
      const dRev = ctx.createGain(); dRev.gain.value = 0.35; dlp.connect(dRev); dRev.connect(this.verbIn);

      this.padBus = this._bus(0.5, 0.9, 0); this.padBus.gain.value = 0.35;
      this.bassBus = this._bus(0.9, 0.25, 0); this.bassBus.gain.value = 0;
      this.plkBus = this._bus(0.62, 0.55, 0.35);
      this.arpBus = this._bus(0.35, 0.6, 0.5);
      this.bellBus = this._bus(0.5, 0.85, 0.3);
      this.fxBus = this._bus(0.8, 0.4, 0);
      this.drumBus = this._bus(0.9, 0.15, 0);
      this.whaleBus = this._bus(0.22, 1.0, 0.2);

      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const nd = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

      const N = 20, real = new Float32Array(N), imag = new Float32Array(N);
      for (let i = 1; i < N; i++) imag[i] = 1 / Math.pow(i, 1.55);
      this.wave = ctx.createPeriodicWave(real, imag);
      return true;
    } catch (e) {
      console.warn('audio disabled', e);
      this.ctx = null;
      return false;
    }
  }

  _bus(dry, rev, dly) {
    const ctx = this.ctx, g = ctx.createGain();
    if (dry) { const d = ctx.createGain(); d.gain.value = dry; g.connect(d); d.connect(this.master); }
    if (rev) { const r = ctx.createGain(); r.gain.value = rev; g.connect(r); r.connect(this.verbIn); }
    if (dly) { const e = ctx.createGain(); e.gain.value = dly; g.connect(e); e.connect(this.dlyIn); }
    return g;
  }

  _impulse(sec, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const a = 0.65 - 0.57 * t; // tail darkens over time
        y += a * ((Math.random() * 2 - 1) - y);
        d[i] = y * Math.pow(1 - t, decay) * Math.min(1, i / (rate * 0.012));
      }
    }
    return buf;
  }

  _osc(type, f, t) {
    const o = this.ctx.createOscillator();
    if (type === 'warm') o.setPeriodicWave(this.wave); else o.type = type;
    o.frequency.setValueAtTime(f, t);
    return o;
  }
  _pan(p, dest) {
    const ctx = this.ctx;
    if (ctx.createStereoPanner) { const s = ctx.createStereoPanner(); s.pan.value = clamp(p, -1, 1); s.connect(dest); return s; }
    return dest;
  }
  _noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.start(t, Math.random() * 1.5); if (dur) s.stop(t + dur);
    return s;
  }

  start() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    ctx.resume();
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(this.muted ? 0 : 1, t + 2.5);
    this.nextT = t + 0.15; this.step = 0;
    this._startBeds();
    this.timer = setInterval(() => this._tick(), 25);
  }

  _startBeds() {
    const ctx = this.ctx, t = ctx.currentTime;
    // drone: low D + A, slowly breathing
    const dg = ctx.createGain(); dg.gain.value = 0.0;
    dg.gain.linearRampToValueAtTime(0.05, t + 6);
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 420;
    dl.connect(dg); dg.connect(this.master);
    const dr = ctx.createGain(); dr.gain.value = 0.5; dg.connect(dr); dr.connect(this.verbIn);
    for (const [m, det] of [[38, 0], [45, 4], [50, -5]]) {
      const o = this._osc('warm', midiHz(m), t); o.detune.value = det; o.connect(dl); o.start(t);
    }
    const lfo = this._osc('sine', 0.07, t), lg = ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(dg.gain); lfo.start(t);
    this.drone = dg;

    // wind, skim rumble, surge air
    const mk = (type, f, q) => {
      const s = this._noiseSrc(t), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(this.master);
      return { fl, g };
    };
    this.wind = mk('bandpass', 500, 0.6);
    this.rumble = mk('lowpass', 150, 0.8);
    this.air = mk('highpass', 3500, 0.5);
  }

  _tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextT < ctx.currentTime - 0.5) this.nextT = ctx.currentTime + 0.05; // recovered from a stall
    while (this.nextT < ctx.currentTime + 0.15) { this._step(this.step, this.nextT); this.nextT += STEP; this.step++; }
  }

  _step(s, t) {
    const inBar = s % 16;
    const ch = CHORDS[Math.floor(s / 32) % 4];
    const P = this.phase;
    if (s % 32 === 0) { this._padChord(ch, t, 32 * STEP); this._bass(ch, t, 32 * STEP); }
    if (P === 0 && s % 8 === 4 && Math.random() < 0.2) this._arpNote(pick(PENT.slice(3, 10)), t, 0.04, rand(-0.6, 0.6));
    if (P === 1 && s % 4 === 2 && Math.random() < 0.18) this._arpNote(pick(ch.arp) + 12, t, 0.03, rand(-0.7, 0.7));
    if (P >= 2) {
      const six = P >= 4;
      if (six || s % 2 === 0) {
        const pat = [0, 2, 4, 1, 3, 5, 2, 6];
        const i = pat[(six ? s : s >> 1) % 8];
        const up = P >= 4 && inBar >= 8 ? 12 : 0;
        this._arpNote(ch.arp[i % ch.arp.length] + up, t, (inBar % 4 === 0 ? 0.04 : 0.024) * (P >= 5 ? 1.2 : 1), Math.sin(s * 0.7) * 0.5);
      }
    }
    if (P >= 3) {
      if (inBar === 0 || inBar === 8) this._kick(t, 0.5);
      if (inBar === 2 || inBar === 10) this._kick(t, 0.26);
    }
    if (P >= 4 && s % 2 === 1) this._shaker(t, inBar % 4 === 2 ? 0.05 : 0.022);
    if (s % 4 === 0) { this.beats.push({ t, v: inBar === 0 ? 1 : 0.5 }); if (this.beats.length > 32) this.beats.shift(); }
  }

  _padChord(ch, t, dur) {
    const ctx = this.ctx, lvl = 0.04, cut = this.padCut;
    for (const n of ch.pad) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 2.4);
      g.gain.setValueAtTime(lvl, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 3.6);
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 0.7;
      fl.frequency.setValueAtTime(cut * 0.6, t);
      fl.frequency.linearRampToValueAtTime(cut * 1.25, t + dur * 0.6);
      fl.frequency.linearRampToValueAtTime(cut * 0.8, t + dur + 3.6);
      fl.connect(g); g.connect(this._pan(rand(-0.6, 0.6), this.padBus));
      for (const det of [-7, 7]) {
        const o = this._osc('warm', midiHz(n), t); o.detune.value = det + rand(-3, 3);
        o.connect(fl); o.start(t); o.stop(t + dur + 3.8);
      }
    }
  }

  _bass(ch, t, dur) {
    const ctx = this.ctx, f = midiHz(ch.root + 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.8);
    g.gain.setValueAtTime(0.16, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur + 1.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    lp.connect(g); g.connect(this.bassBus);
    const o1 = this._osc('sine', f, t), o2 = this._osc('triangle', f * 0.5, t);
    o1.connect(lp); o2.connect(lp);
    o1.start(t); o2.start(t); o1.stop(t + dur + 1.6); o2.stop(t + dur + 1.6);
  }

  _arpNote(n, t, vel, pan = 0) {
    const ctx = this.ctx, f = midiHz(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    const o = this._osc('sine', f, t), o2 = this._osc('triangle', f * 2, t), h = ctx.createGain(); h.gain.value = 0.18;
    o.connect(g); o2.connect(h); h.connect(g); g.connect(this._pan(pan, this.arpBus));
    o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 1);
  }

  _kick(t, vel) {
    const ctx = this.ctx, o = this._osc('sine', 115, t), g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(this.drumBus); o.start(t); o.stop(t + 0.55);
  }

  _shaker(t, vel) {
    const ctx = this.ctx, s = this._noiseSrc(t, 0.12), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    s.connect(hp); hp.connect(g); g.connect(this._pan(rand(-0.4, 0.4), this.drumBus));
  }

  _tone(n, t, vel, decay, pan, bus, type = 'triangle', harm = 0.25) {
    const ctx = this.ctx, f = midiHz(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(f * 7, 16000);
    const o1 = this._osc(type, f, t), o2 = this._osc('sine', f * 2, t), h = ctx.createGain(); h.gain.value = harm;
    o1.connect(lp); o2.connect(h); h.connect(lp); lp.connect(g); g.connect(this._pan(pan, bus));
    o1.start(t); o2.start(t); o1.stop(t + decay + 0.05); o2.stop(t + decay + 0.05);
  }

  _bell(n, t, vel, decay = 2.6, pan = 0) {
    const ctx = this.ctx, f = midiHz(n);
    const car = this._osc('sine', f, t), mod = this._osc('sine', f * 3.5, t), mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.0, t); mg.gain.exponentialRampToValueAtTime(f * 0.04, t + decay);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    car.connect(g); g.connect(this._pan(pan, this.bellBus));
    car.start(t); mod.start(t); car.stop(t + decay + 0.05); mod.stop(t + decay + 0.05);
  }

  _whoosh(t, dur, f0, f1, vel, pan = 0) {
    const ctx = this.ctx, s = this._noiseSrc(t, dur + 0.1), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(this._pan(pan, this.fxBus));
  }

  _boom(t, vel, f0 = 75, f1 = 32, dur = 1.8) {
    const ctx = this.ctx, o = this._osc('sine', f0, t), g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + dur + 0.05);
  }

  // ── public: gameplay sounds ──
  pluck(idx, pan = 0) {
    if (!this.ctx) return;
    const t = Math.max(this.ctx.currentTime, this.lastPluck + 0.045);
    this.lastPluck = t;
    const n = PENT[idx % PENT.length];
    this._tone(n, t, 0.15, 1.5, pan, this.plkBus);
    if (idx % 4 === 3) this._bell(n + 12, t, 0.025, 1.8, -pan);
  }
  gold(pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [74, 78, 81, 86].forEach((n, i) => this._tone(n, t + i * 0.07, 0.12, 1.8, pan, this.plkBus));
    this._bell(93, t + 0.28, 0.06, 3.2, pan);
  }
  gate() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._whoosh(t, 0.9, 400, 4000, 0.25);
    this._boom(t, 0.35, 90, 45, 1.2);
    [69, 74, 78, 81].forEach((n, i) => this._bell(n, t + 0.03 + i * 0.05, 0.07, 3.0, (i - 1.5) * 0.4));
  }
  nearMiss(pan) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._whoosh(t, 0.4, 3800, 500, 0.32, pan);
    this._bell(pick([81, 83, 86]), t + 0.05, 0.035, 1.2, pan);
  }
  hit() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this._boom(t, 0.7, 110, 38, 0.9);
    const s = this._noiseSrc(t, 0.6), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.5);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    s.connect(lp); lp.connect(g); g.connect(this.fxBus);
    for (const m of [51, 52]) {
      const o = this._osc('sawtooth', midiHz(m), t), og = ctx.createGain(), ol = ctx.createBiquadFilter();
      ol.type = 'lowpass'; ol.frequency.value = 900;
      o.frequency.exponentialRampToValueAtTime(midiHz(m - 7), t + 0.6);
      og.gain.setValueAtTime(0.05, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(ol); ol.connect(og); og.connect(this.fxBus); o.start(t); o.stop(t + 0.75);
    }
  }
  scrape() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, s = this._noiseSrc(t, 0.25), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = rand(900, 1800); bp.Q.value = 3;
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    s.connect(bp); bp.connect(g); g.connect(this.fxBus);
  }
  surge() {
    if (!this.ctx) return;
    this._whoosh(this.ctx.currentTime, 0.7, 300, 2500, 0.18);
  }
  ignite() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    this._boom(t, 0.45, 60, 30, 3);
    this._whoosh(t, 2.2, 200, 3000, 0.15);
    [62, 69, 74, 78, 81, 86].forEach((n, i) => this._bell(n, t + 0.4 + i * 0.16, 0.05, 3.5, (i % 2 ? 0.4 : -0.4)));
  }
  riser(dur) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = this._noiseSrc(t, dur + 0.2), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = 1.8;
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    s.connect(bp); bp.connect(g); g.connect(this.fxBus);
    const o = this._osc('warm', 110, t), og = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(440, t + dur);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.04, t + dur); og.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    o.connect(og); og.connect(this.padBus); o.start(t); o.stop(t + dur + 0.15);
  }
  impact() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this._boom(t, 0.8, 70, 28, 3.5);
    const s = this._noiseSrc(t, 4), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 2500;
    g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    s.connect(hp); hp.connect(g); g.connect(this.fxBus);
    const g2 = ctx.createGain(); g2.gain.value = 0.6; g.connect(g2); g2.connect(this.verbIn);
    [88, 86, 83, 81, 78, 76, 74, 71, 69, 66, 62].forEach((n, i) => this._bell(n, t + 0.1 + i * 0.09, 0.05 * (1 - i * 0.05), 3.2, Math.sin(i) * 0.7));
    const ch = CHORDS[Math.floor(this.step / 32) % 4];
    for (const n of ch.pad) this._tone(n + 12, t, 0.03, 5, rand(-0.7, 0.7), this.padBus, 'warm', 0.1);
  }
  whale(pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const call = (t0, base, shape, vel) => {
      const o = this._osc('sine', base, t0), o2 = this._osc('triangle', base * 2.01, t0), h = ctx.createGain(); h.gain.value = 0.2;
      shape.forEach(([dt, k]) => { o.frequency.exponentialRampToValueAtTime(base * k, t0 + dt); o2.frequency.exponentialRampToValueAtTime(base * k * 2.01, t0 + dt); });
      const vib = this._osc('sine', 5.2, t0), vg = ctx.createGain(); vg.gain.value = base * 0.02;
      vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 2;
      const g = ctx.createGain(), end = shape[shape.length - 1][0];
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vel, t0 + 0.9);
      g.gain.setValueAtTime(vel, t0 + end - 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t0 + end + 0.3);
      o.connect(lp); o2.connect(h); h.connect(lp); lp.connect(g); g.connect(this._pan(pan, this.whaleBus));
      [o, o2, vib].forEach((x) => { x.start(t0); x.stop(t0 + end + 0.4); });
    };
    const b = rand(150, 210);
    call(t, b, [[1.6, rand(1.6, 1.95)], [3.0, 1.35], [5.0, 0.72]], 0.16);
    call(t + rand(2.8, 3.6), b * 0.52, [[1.2, 0.85], [3.2, 0.6]], 0.14);
  }
  finale() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.impact();
    [50, 57, 62, 66, 69, 73, 74, 78, 81, 85].forEach((n, i) => this._tone(n, t + i * 0.25, 0.04, 12, Math.sin(i * 1.7) * 0.6, this.padBus, 'warm', 0.15));
    [74, 78, 81, 86, 88, 93, 90, 86].forEach((n, i) => this._bell(n, t + 2 + i * 0.6, 0.05, 4, Math.sin(i) * 0.6));
  }

  setPhase(p) {
    this.phase = p;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.padCut = [380, 900, 1500, 1800, 2400, 3200][Math.min(p, 5)];
    this.padBus.gain.setTargetAtTime([0.35, 0.8, 1, 1, 1.05, 1.15][Math.min(p, 5)], t, 2);
    this.bassBus.gain.setTargetAtTime(p >= 1 ? 1 : 0, t, 3);
  }

  update(speedN, skim, boost, light) {
    if (!this.ctx || !this.wind) return;
    const t = this.ctx.currentTime;
    this.wind.g.gain.setTargetAtTime(0.025 + speedN * 0.08, t, 0.3);
    this.wind.fl.frequency.setTargetAtTime(280 + speedN * 1000, t, 0.3);
    this.rumble.g.gain.setTargetAtTime(skim * 0.3, t, 0.12);
    this.air.g.gain.setTargetAtTime(boost * 0.06, t, 0.2);
    const cut = 650 + Math.pow(clamp(light / 100, 0, 1), 1.4) * 17000;
    this.tone.frequency.setTargetAtTime(cut, t, 0.5);
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    this.out.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.15);
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
}

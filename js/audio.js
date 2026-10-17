'use strict';

/* =============================================================
   ЗВУК — генерируется на WebAudio, аудиофайлов нет.

   Короткие синтезированные эффекты + процедурный саундтрек,
   который меняет настроение по ситуации (меню / бой / босс).
   ============================================================= */

const Sfx = (function () {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let enabled = true;
  let musicOn = true;
  let musicTimer = 0;
  let musicStep = 0;
  let mood = 'menu';

  function ensure() {
    if (!enabled) return null;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);

        musicGain = ctx.createGain();
        musicGain.gain.value = 0.32;
        musicGain.connect(master);

        sfxGain = ctx.createGain();
        sfxGain.gain.value = 0.85;
        sfxGain.connect(master);
      }
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    } catch (e) { ctx = null; return null; }
  }

  function tone(freq, dur, type, vol, to, delay) {
    const c = ensure();
    if (!c) return;
    try {
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (to) o.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
      g.gain.setValueAtTime(Math.max(0.001, vol == null ? 0.05 : vol), t0);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
      o.connect(g);
      g.connect(sfxGain || c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    } catch (e) {}
  }

  function noise(dur, vol, lowpass, delay) {
    const c = ensure();
    if (!c) return;
    try {
      const t0 = c.currentTime + (delay || 0);
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.setValueAtTime(Math.max(0.001, vol || 0.05), t0);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
      if (lowpass) {
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = lowpass;
        src.connect(f); f.connect(g);
      } else src.connect(g);
      g.connect(sfxGain || c.destination);
      src.start(t0);
    } catch (e) {}
  }

  function seq(notes, step, type, vol) {
    notes.forEach(function (f, i) { tone(f, step * 1.5, type, vol, null, i * step); });
  }

  /* ---------------- Саундтрек ---------------- */

  const SCALES = {
    menu: { root: 196.00, mode: 'minor', bpm: 84, wave: 'triangle' },
    battle: { root: 174.61, mode: 'minor', bpm: 138, wave: 'square' },
    boss: { root: 146.83, mode: 'phrygian', bpm: 152, wave: 'sawtooth' }
  };

  function scaleNote(root, mode, deg) {
    const semis = mode === 'minor' ? [0, 2, 3, 5, 7, 8, 10]
      : mode === 'phrygian' ? [0, 1, 3, 5, 7, 8, 10]
        : [0, 2, 4, 5, 7, 9, 11];
    const oct = Math.floor(deg / 7);
    const idx = ((deg % 7) + 7) % 7;
    return root * Math.pow(2, semis[idx] / 12 + oct);
  }

  function musicTick(dt) {
    if (!enabled || !musicOn) return;
    const c = ensure();
    if (!c) return;
    const cfg = SCALES[mood] || SCALES.battle;
    const stepDur = 60 / cfg.bpm / 2;
    musicTimer -= dt;
    if (musicTimer > 0) return;
    musicTimer += stepDur;

    const s = musicStep++;
    const bar = Math.floor(s / 8) % 4;

    /* бас */
    if (s % 4 === 0) {
      const bassDeg = [0, 0, 3, 2][bar] + (s % 8 === 4 ? 2 : 0);
      const f = scaleNote(cfg.root / 2, cfg.mode, bassDeg);
      tone(f, stepDur * 1.7, 'triangle', 0.075, null, 0);
    }
    /* арпеджио */
    const arp = [0, 4, 2, 6, 3, 5, 1, 4];
    if (s % 2 === 0) {
      const f = scaleNote(cfg.root, cfg.mode, arp[(s / 2) % arp.length] + (bar === 3 ? 2 : 0));
      tone(f, stepDur * 0.9, cfg.wave, mood === 'boss' ? 0.032 : 0.026, null, 0);
    }
    /* перкуссия */
    if (mood !== 'menu') {
      if (s % 8 === 0) noise(0.12, 0.09, 420);
      if (s % 8 === 4) noise(0.09, 0.06, 2600);
      if (mood === 'boss' && s % 2 === 1) noise(0.03, 0.03, 7000);
    }
  }

  function setMood(m) {
    if (mood === m) return;
    mood = m;
    musicStep = 0;
    musicTimer = 0;
  }

  return {
    unlock: function () { ensure(); },
    isEnabled: function () { return enabled; },
    isMusic: function () { return musicOn; },
    setEnabled: function (v) {
      enabled = !!v;
      if (ctx) { try { if (enabled) ctx.resume(); else ctx.suspend(); } catch (e) {} }
      return enabled;
    },
    toggle: function () { return this.setEnabled(!enabled); },
    toggleMusic: function () {
      musicOn = !musicOn;
      if (musicGain) musicGain.gain.value = musicOn ? 0.32 : 0;
      return musicOn;
    },
    setMood: setMood,
    tick: musicTick,

    /* --- бой --- */
    shoot: function (kind) {
      if (kind === 'arrow') { tone(760, 0.09, 'square', 0.035, 320); noise(0.05, 0.02, 5000); }
      else if (kind === 'bolt') { tone(220, 0.13, 'sawtooth', 0.05, 80); noise(0.08, 0.035, 1800); }
      else if (kind === 'dagger') { tone(1400, 0.06, 'square', 0.024, 700); }
      else if (kind === 'bomb') { tone(180, 0.2, 'sine', 0.05, 70); noise(0.1, 0.03, 900); }
      else if (kind === 'scythe') { tone(880, 0.14, 'sine', 0.04, 1600); }
      else tone(600, 0.1, 'sine', 0.04, 220);
    },
    swing: function (heavy) {
      noise(heavy ? 0.18 : 0.1, heavy ? 0.07 : 0.045, heavy ? 1400 : 3200);
      if (heavy) tone(90, 0.16, 'triangle', 0.05, 50);
    },
    hit: function () { tone(240, 0.055, 'square', 0.035, 130); noise(0.04, 0.02, 6000); },
    crit: function () {
      tone(1700, 0.1, 'square', 0.05, 420);
      tone(2400, 0.14, 'sine', 0.035, 600, 0.02);
      noise(0.07, 0.035, 8000);
    },
    block: function () { tone(1500, 0.07, 'square', 0.05, 900); tone(300, 0.09, 'square', 0.035, 220); },
    kill: function () { tone(330, 0.12, 'triangle', 0.05, 90); noise(0.1, 0.04, 1600); },
    bigKill: function () {
      noise(0.4, 0.1, 700);
      tone(120, 0.4, 'sawtooth', 0.06, 40);
      tone(240, 0.3, 'square', 0.04, 60, 0.05);
    },
    hurt: function () { tone(170, 0.22, 'sawtooth', 0.07, 60); noise(0.1, 0.04, 900); },
    pickup: function () { seq([880, 1320], 0.055, 'square', 0.04); },
    coin: function () { tone(1320, 0.07, 'square', 0.03, 1760); tone(1760, 0.09, 'square', 0.022, 2200, 0.05); },
    levelUp: function () { seq([523, 659, 784, 1047, 1319], 0.075, 'triangle', 0.055); },
    upgrade: function () { seq([392, 523, 659, 784], 0.06, 'triangle', 0.05); },
    dash: function () { noise(0.13, 0.05, 2200); tone(420, 0.12, 'sine', 0.03, 900); },
    ultimate: function () {
      seq([196, 262, 330, 392, 523, 659], 0.06, 'sawtooth', 0.05);
      noise(0.5, 0.07, 900, 0.05);
    },
    waveStart: function () { seq([330, 440, 554], 0.08, 'square', 0.045); },
    waveClear: function () { seq([523, 659, 784, 1047], 0.07, 'triangle', 0.05); },
    boss: function () {
      tone(98, 0.6, 'sawtooth', 0.08, 44);
      noise(0.5, 0.05, 400);
      seq([110, 116, 110], 0.16, 'square', 0.05, 0);
    },
    enemyShoot: function () { tone(420, 0.13, 'sawtooth', 0.035, 190); },
    explode: function () { noise(0.35, 0.09, 900); tone(70, 0.3, 'sine', 0.06, 30); },
    summon: function () { tone(160, 0.3, 'sine', 0.05, 420); noise(0.25, 0.04, 1200); },
    elite: function () { tone(180, 0.4, 'square', 0.05, 420); noise(0.3, 0.05, 1800); },
    combo: function (n) { tone(600 + n * 40, 0.08, 'triangle', 0.035, 900 + n * 60); },
    shop: function () { tone(700, 0.06, 'square', 0.035, 1000); tone(1000, 0.08, 'square', 0.025, 1400, 0.05); },
    buy: function () { seq([660, 880, 1320], 0.05, 'square', 0.045); },
    win: function () { seq([523, 659, 784, 1047, 1319, 1568], 0.13, 'square', 0.055); },
    lose: function () { seq([440, 349, 262, 175, 131], 0.17, 'sawtooth', 0.055); },
    ui: function () { tone(700, 0.045, 'square', 0.03, 900); }
  };
})();
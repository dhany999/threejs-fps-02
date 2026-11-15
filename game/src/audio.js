// audio.js — every sound is synthesized with WebAudio. No audio files, no
// network. One AudioContext, one master gain, short-lived nodes per sound.
export function createAudio(state) {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (state.shotMode) return false; // photo mode stays silent
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
      return false;
    }
    return true;
  }

  function noise(dur, filterType, freq, gain, when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, type, gain, slideTo = 0, when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Distance-attenuated gain: 1 at point blank, ~0.15 at 40 m.
  function atten(dist) {
    return Math.max(0.08, 1 / (1 + dist * 0.09));
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    // Rifle crack: fast noise burst + a low thump.
    shot(dist = 0) {
      const a = atten(dist);
      noise(0.09, 'highpass', 900, 0.5 * a);
      tone(160, 0.1, 'sine', 0.55 * a, 55);
    },
    pistolShot(dist = 0) {
      const a = atten(dist);
      noise(0.07, 'bandpass', 1400, 0.35 * a);
      tone(200, 0.07, 'sine', 0.35 * a, 80);
    },
    dry() { tone(1800, 0.03, 'square', 0.08); },
    reload() {
      tone(900, 0.04, 'square', 0.1);
      tone(600, 0.04, 'square', 0.1, 0, 0.18);
      tone(1100, 0.05, 'square', 0.12, 0, 0.55);
    },
    hit(kill) {
      tone(kill ? 1400 : 1000, 0.06, 'square', 0.12);
      if (kill) tone(1800, 0.09, 'square', 0.1, 0, 0.07);
    },
    hurt() {
      tone(120, 0.18, 'sawtooth', 0.22, 60);
      noise(0.12, 'lowpass', 400, 0.2);
    },
    explosion(dist = 0) {
      const a = atten(dist);
      noise(0.9, 'lowpass', 320, 0.9 * a);
      tone(70, 0.8, 'sine', 0.8 * a, 28);
    },
    grenadePin() { tone(2400, 0.03, 'square', 0.08); },
    beep(final = false) { tone(final ? 1500 : 1100, 0.07, 'square', 0.12); },
    plantDone() { tone(880, 0.12, 'square', 0.14); tone(1320, 0.16, 'square', 0.14, 0, 0.12); },
    roundWin() {
      tone(523, 0.14, 'triangle', 0.2);
      tone(659, 0.14, 'triangle', 0.2, 0, 0.14);
      tone(784, 0.26, 'triangle', 0.22, 0, 0.28);
    },
    roundLose() {
      tone(392, 0.16, 'triangle', 0.18);
      tone(330, 0.16, 'triangle', 0.18, 0, 0.16);
      tone(262, 0.3, 'triangle', 0.2, 0, 0.32);
    },
    buy() { tone(1320, 0.06, 'square', 0.1); tone(1760, 0.1, 'square', 0.1, 0, 0.06); },
    step() { noise(0.05, 'lowpass', 300, 0.05); },
  };
}

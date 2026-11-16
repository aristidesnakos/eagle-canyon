// ============================================================================
// audio: wind and wingbeats made live (no sound files), structure after Abyssal Garden's audio.js
// ============================================================================
// Built on the first click or key. Layers: wind (louder and brighter with speed), a low canyon rumble near the
// river, a soft whoosh on each wingbeat, a thud when you brush the rock.
let AC, OUT, muted = false, WG, WF, RG, FG, lastFlap = 0;
function mkSound(ac) {
  const sr = ac.sampleRate;
  const N = (C, o, ...to) => { const n = new C(ac, o); for (const d of to) n.connect(d); if (n.start) n.start(); return n; };
  const G = (gain, ...to) => N(GainNode, { gain }, ...to);
  const BQ = (type, frequency, Q, ...to) => N(BiquadFilterNode, { type, frequency, Q }, ...to);
  const len = sr * 6 | 0, nb = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: sr });
  for (let c = 0; c < 2; c++) { const d = nb.getChannelData(c); for (let i = 0, b = 0; i < len; i++) { b = (b + 0.02 * (rnd() * 2 - 1)) / 1.02; d[i] = b * 3.5 + (rnd() * 2 - 1) * 0.05; } }
  const lim = N(DynamicsCompressorNode, { threshold: -8, knee: 6, ratio: 12, attack: 0.003, release: 0.3 }, ac.destination);
  const out = OUT = G(0, lim);
  const src = (playbackRate, ...to) => N(AudioBufferSourceNode, { buffer: nb, loop: true, playbackRate }, ...to);
  WG = G(0, out); WF = BQ('bandpass', 400, 0.6, WG); src(1, WF);
  RG = G(0, out); src(0.5, BQ('lowpass', 220, 0.7, RG));
  FG = G(0, out); src(1.7, BQ('bandpass', 260, 1.2, FG));
  out.gain.setTargetAtTime(muted ? 0 : 0.8, ac.currentTime, 0.5);
}
function sound() { if (AC) { if (AC.state !== 'running') AC.resume(); return; } try { AC = new AudioContext(); mkSound(AC); } catch {} }
function mute() { muted = !muted; if (OUT) OUT.gain.setTargetAtTime(muted ? 0 : 0.8, AC.currentTime, 0.1); showToast(muted ? 'Sound off' : 'Sound on'); }
// called every frame while flying: speed m/s, height above the river, flapping, wings folded
function wind(sp, hr, flap, fold) {
  if (!AC) return;
  const t = AC.currentTime, k = clamp((sp - 6) / 60, 0, 1);
  WG.gain.setTargetAtTime(0.10 + 0.55 * k * k + 0.1 * fold, t, 0.15);
  WF.frequency.setTargetAtTime(300 + 1400 * k, t, 0.2);
  RG.gain.setTargetAtTime(0.35 * sstep(140, 10, hr), t, 0.4);
  if (flap && t - lastFlap > 0.38) { lastFlap = t; FG.gain.cancelScheduledValues(t); FG.gain.setValueAtTime(0, t); FG.gain.linearRampToValueAtTime(0.5, t + 0.08); FG.gain.setTargetAtTime(0, t + 0.1, 0.07); }
}
function bumpSound(v) {
  if (!AC) return;
  const t = AC.currentTime, o = new OscillatorNode(AC, { type: 'sine', frequency: 90 }), g = new GainNode(AC, { gain: 0 });
  o.connect(g); g.connect(OUT); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  g.gain.linearRampToValueAtTime(clamp(v / 15, 0.1, 0.8), t + 0.01); g.gain.setTargetAtTime(0, t + 0.02, 0.08);
  o.start(t); o.stop(t + 0.5);
}

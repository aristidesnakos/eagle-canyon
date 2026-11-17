// ============================================================================
// development tools: only in dev.html (npm run build:dev), never in index.html
// ============================================================================
//   F    fly the scripted canyon path (60 s)          B   the same flight as a benchmark at full resolution
//   window.EC drives the same from a script (tools/bench.mjs): view(i) still at viewpoint i, fog(m), bench(m) -> report
{
  const LOGN = 1 << 16, logFrame = new Float32Array(LOGN), logGpu = new Float32Array(LOGN);
  let bench = false, last = 0, nFrame = 0, nGpu = 0, done = null, t0 = 0;
  const st = (a, n) => { const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y); let sum = 0; for (const v of s) sum += v; return { n, avg: +(sum / n).toFixed(2), p99: +s[min(n - 1, floor(n * 0.99))].toFixed(2), max: +s[n - 1].toFixed(2), over25: s.filter((v) => v > 25).length }; };
  const report = () => {
    const r = { res: `${W}x${Hh}`, fog: FOG, frame: st(logFrame, nFrame), gpu: nGpu ? st(logGpu, nGpu) : null, fps: +(nFrame / ((F[LAST] - t0) / 1000)).toFixed(1) };
    info.textContent = `Fly-through ${r.res}, haze ${FOG} m, ${r.frame.n} frames, ${r.fps} fps\nframe  avg ${r.frame.avg}  p99 ${r.frame.p99}  max ${r.frame.max} ms\nGPU    ${r.gpu ? `avg ${r.gpu.avg}  p99 ${r.gpu.p99}  max ${r.gpu.max} ms` : 'timestamp-query unavailable'}`;
    return r;
  };
  const full = () => { dynHold = true; pix = DW * DH; resize(); };
  const draw = render;
  render = () => {
    if (bench) {
      const dtr = F[LAST] - last; last = F[LAST];
      if (nFrame < LOGN && F[FLT] > 0.05) logFrame[nFrame++] = dtr; if (F[GPU] > 0 && nGpu < LOGN && F[FLT] > 0.05) logGpu[nGpu++] = F[GPU];
      if (F[FLT] >= FLYT) { bench = false; mode = started ? 0 : 1; const r = report(); if (done) { done(r); done = null; } }
    }
    draw();
  };
  const startBench = () => { bench = true; mode = 1; F[FLT] = 0; F[GPU] = 0; last = F[LAST]; t0 = F[LAST]; nFrame = nGpu = 0; hud = false; info.textContent = ''; full(); };
  addEventListener('keydown', (e) => {
    if (menu || e.repeat) return;
    if (e.code === 'KeyF') { mode = mode === 1 ? 0 : 1; F[FLT] = 0; }
    if (e.code === 'KeyB') startBench();
  });
  // a rendered sound buffer as a 16-bit stereo WAV, base64
  const wavOf = (buf) => {
    const sr = buf.sampleRate, n = buf.length, L0 = buf.getChannelData(0), R0 = buf.getChannelData(1), dv = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, clamp(L0[i], -1, 1) * 32767, true); dv.setInt16(46 + i * 4, clamp(R0[i], -1, 1) * 32767, true); }
    const u = new Uint8Array(dv.buffer); let bin = ''; for (let i = 0; i < u.length; i += 32768) bin += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(bin);
  };
  const EC = window.EC = {
    ready: true,
    hideMenu() { menu = false; body.className = 'g p'; },
    fog(m) { FOG = m; },
    dbg(n) { DBG = n; },
    full,
    view(i) { this.hideMenu(); mode = 2; viewAt(i); },
    nviews: () => VIEWS.length,
    // river-A z values where the east rim edge has the most pines within 200 m inland (for choosing view 7)
    pineSpot() { const res = []; for (let z = 0; z < L; z += 100) { const w = wallDist(z, YTOP + rimRise(riverX(z) + 600, z), 1), p = riverPt(z, w + 150, 0); let n = 0;
      for (let i = 0; i < TP.n; i++) { let dx = TP.data[i * 8] - p[0], dz = TP.data[i * 8 + 2] - p[2]; dx -= L * round(dx / L); dz -= L * round(dz / L); if (dx * dx + dz * dz < 200 * 200) n++; } res.push([z, n, w]); }
      return res.sort((a, b) => b[1] - a[1]).slice(0, 6); },
    tex(i, j, w = 6) { const o = []; for (let y = j - w; y <= j + w; y++) { const r = []; for (let x = i - w; x <= i + w; x++) r.push(H[((x % NT) + NT) % NT + (((y % NT) + NT) % NT) * NT].toFixed(1)); o.push(y + ': ' + r.join(' ')); } return o.join('\n'); }, // H.slice

    // how much of each river runs dry (bed above the water within 30 m of the centre line), sampled every 16 m
    dry() { const out = []; for (const r of [0, 1]) { let dry = 0, n = 0; for (let z = 0; z < L; z += 16) { n++; let m = 1e9; const x0 = rX(r, z); for (let o = -30; o <= 30; o += 2) m = min(m, hAt(x0 + o, z)); if (m > YR - 0.5) dry++; } out.push(`river ${r}: ${dry} of ${n} dry`); } return out.join('; '); },
    pose: (i) => viewPose(VIEWS[i]).map(round),
    // the benchmark time at which the path crosses z (the bridge: EC.tAt(BRIDGE_Z))
    tAt(z) { for (let t = 0; t < FLYT; t += 0.05) { flyRaw(flyS(t)); if (P3[2] >= z) return +t.toFixed(2); } return -1; },
    setView(i, v) { VIEWS[i] = v; this.view(i); },
    prof(z, r = 0, w = 600, st = 40) { const o = []; for (let d = -w; d <= w; d += st) o.push(round(hAt(rX(r, z) + d, z))); return o.join(' '); },
    fly(t) { this.hideMenu(); mode = 1; F[FLT] = t; },
    bench(m) { this.hideMenu(); FOG = m; return new Promise((r) => { done = r; startBench(); }); },
    // one clip frame at time t (30 fps steps); resolves after it is on screen
    // one clip frame at time t (steps of dt seconds); resolves after it is on screen
    // (tm: the clock for water and wings, when the flight itself is played slower than the benchmark's 39 m/s)
    clip(t, dt = 1 / 30, tm = t) { this.hideMenu(); clipDt = dt; if (mode !== 3 || abs(t - F[FLT]) > 0.1) { mode = 3; F[FLT] = t - 1; for (let k = 0; k < 60; k++) { flyAt(F[FLT] += 1 / 60); chase(1 / 60); } } F[FLT] = t; F[TIME] = tm; return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))); },
    // ---- flights for video: a path through chosen points, flown the way a player would fly it
    // distance from river A to the wall (or rim edge) on one side at height h above the river
    wd: (z, h, side) => wallDist(z, YR + h, side),
    // a path through points [z along river A, metres to the side of it, height above the river]
    pts(p, clr = 10) { FLY = p.map(([z, o, h]) => riverPt(z, o, YR + h)); finishPath(clr); return [FLYN, round(FLYLEN)]; },
    // style(true): on a recorded flight the eagle folds its wings in a dive, flaps to climb, banks into turns as a
    // coordinated turn would, and gains speed going down; the chase camera follows a little tighter (k)
    style(on, k = 2.2) {
      const v = { sp: 36, fold: 0, amp: 0.04, bank: 0, ph: 0, yaw: null, flap: false }; EC.v = v; clipK = on ? k : 1;
      clipFx = !on ? null : (dt) => {
        const g = F[GAM], e = (r) => 1 - exp(-dt * r);
        v.sp += (clamp(36 - 42 * sin(g), 20, 62) - v.sp) * e(1.6);
        v.fold += (sstep(-0.28, -0.55, g) - v.fold) * e(5);
        v.flap = g > 0.07 && v.fold < 0.2;
        v.amp += ((v.flap ? 0.62 : 0.035) * (1 - v.fold) - v.amp) * e(6);
        v.ph += dt * TAU * (v.flap ? 2.6 : 0.35);
        let w = v.yaw === null ? 0 : ((F[YAW] - v.yaw + 3 * PI) % TAU - PI) / dt; v.yaw = F[YAW];
        v.bank += (clamp(-Math.atan(v.sp * w / 9.81) * 1.15, -1.15, 1.15) - v.bank) * e(4);
        F[SPD] = v.sp; F[FOLD] = v.fold; F[AMP] = v.amp; F[PH] = v.ph; F[BANK] = v.bank;
      };
    },
    // one recorded frame: move along the path at the eagle's own speed for dt seconds; tm is the clock for the water
    step(dt, tm) { const sp = EC.v ? EC.v.sp : 39; clipDt = dt; F[FLT] += dt * sp / (FLYLEN / FLYT); F[TIME] = tm;
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r([+F[FLT].toFixed(4), +sp.toFixed(1), +(F[EY] - YR).toFixed(1), EC.v && EC.v.flap ? 1 : 0, +(EC.v ? EC.v.fold : 0).toFixed(2)])))); },
    // the game's wind for a recorded flight: samples [speed, height above the river, flapping, fold] every `st` seconds
    async wavTrack(list, st) {
      const sr = 48000, dur = list.length * st, ac = new OfflineAudioContext(2, sr * dur, sr); mkSound(ac);
      OUT.gain.cancelScheduledValues(0); OUT.gain.setValueAtTime(0.8, 0);
      let lastF = -1;
      list.forEach(([sp, hr, flap, fold], i) => { const t = i * st, k = clamp((sp - 6) / 60, 0, 1);
        if (!i) { WG.gain.setValueAtTime(0.10 + 0.55 * k * k, 0); WF.frequency.setValueAtTime(300 + 1400 * k, 0); RG.gain.setValueAtTime(0.35 * sstep(140, 10, hr), 0); }
        WG.gain.setTargetAtTime(0.10 + 0.55 * k * k + 0.1 * fold, t, 0.15); WF.frequency.setTargetAtTime(300 + 1400 * k, t, 0.2); RG.gain.setTargetAtTime(0.35 * sstep(140, 10, hr), t, 0.4);
        if (flap && t - lastF > 0.38) { lastF = t; FG.gain.setValueAtTime(0, t); FG.gain.linearRampToValueAtTime(0.5, t + 0.08); FG.gain.setTargetAtTime(0, t + 0.1, 0.07); } });
      return wavOf(await ac.startRendering());
    },
    // another scripted flight: from z0 along river A, one height above the river per 180 m (14 heights = 60 s)
    path(z0, hs) { setPath(z0, hs); return FLYN; },
    // heights above the river along the flight from t0 for dur seconds, every 0.25 s (for the offline sound)
    heights(t0, dur, slow = 1) { const o = []; for (let t = 0; t <= dur; t += 0.25) { flyRaw(flyS(t0 + t * slow)); o.push(+(P3[1] - YR).toFixed(1)); } return o; },
    // the game's own wind for a flight, rendered offline on the same clock (speed: the scripted flight's 39 m/s times slow):
    // returns a 16-bit stereo WAV as base64
    async wav(t0, dur, slow = 1) {
      const sr = 48000, ac = new OfflineAudioContext(2, sr * dur, sr); mkSound(ac);
      OUT.gain.cancelScheduledValues(0); OUT.gain.setValueAtTime(0.8, 0);
      const k = (39 * slow - 6) / 60; WG.gain.setValueAtTime(0.10 + 0.55 * k * k, 0); WF.frequency.setValueAtTime(300 + 1400 * k, 0);
      const hs = this.heights(t0, dur, slow); RG.gain.setValueAtTime(0.35 * sstep(140, 10, hs[0]), 0);
      hs.forEach((h, i) => RG.gain.setTargetAtTime(0.35 * sstep(140, 10, h), i * 0.25, 0.4));
      return wavOf(await ac.startRendering());
    },
    toThermal(i) { this.hideMenu(); started = true; mode = 0; placeEagle(THERM[i * 8] - 30, THERM[i * 8 + 1] + 30, THERM[i * 8 + 2], PI / 2, 15); return NTH; },
    hud(on) { hud = on; info.textContent = ''; },
    // shaded relief of the heightmap (S x S), river centre line in blue, viewpoints in red, the benchmark path in yellow
    map(S = 768) {
      const c = document.createElement('canvas'); c.width = c.height = S; const x2 = c.getContext('2d'), im = x2.createImageData(S, S), k = NT / S;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const h = H[floor(i * k) + floor(j * k) * NT], hx = H[floor(i * k + 1) % NT + floor(j * k) * NT] - h, t = (h - YR) / (DEPTH + rimRise(floor(i * k) * TX, floor(j * k) * TX));
        let li = 0; for (let a = 0, acc = 0; li < NL - 1; li++) { acc += LAYERS[li][2]; if (t < acc) break; }
        const col = LAYERS[li][4], sh = clamp(0.75 - hx * 0.25, 0.2, 1.3), o = (i + j * S) * 4;
        im.data[o] = col[0] * 255 * sh; im.data[o + 1] = col[1] * 255 * sh; im.data[o + 2] = col[2] * 255 * sh; im.data[o + 3] = 255;
      }
      x2.putImageData(im, 0, 0); const s = S / L;
      x2.fillStyle = '#39f'; for (let z = 0; z < L; z += 8) { x2.fillRect(riverX(z) * s, z * s, 2, 2); x2.fillRect(((riverX2(z) % L) + L) % L * s, z * s, 2, 2); }
      x2.fillStyle = '#fd0'; for (let t = 0; t < FLYT; t += 0.25) { flyRaw(flyS(t)); x2.fillRect(((P3[0] % L) + L) % L * s, ((P3[2] % L) + L) % L * s, 3, 3); }
      x2.fillStyle = '#f00'; x2.font = '16px sans-serif'; VIEWS.forEach((v, i) => { const p = viewPose(v); x2.fillRect(p[0] * s - 4, p[2] * s - 4, 8, 8); x2.fillText(i + 1, p[0] * s + 6, p[2] * s); x2.fillRect(p[3] * s - 2, p[5] * s - 2, 4, 4); });
      return c.toDataURL('image/png');
    },
    // average GPU time over n frames at the current view
    gpu(n = 90) { return new Promise((r) => { let k = 0, s = 0, c = 0; const f = () => { if (k++ > 20 && F[GPU] > 0) { s += F[GPU]; c++; } if (c >= n) r(+(s / c).toFixed(2)); else requestAnimationFrame(f); }; f(); }); },
    // the resolution the automatic scaler settles at for a w x h screen, over `secs` of the scripted flight (twice round
    // if secs > 60); returns the share of the screen's pixels drawn, averaged over the last half
    settle(w, h, secs = 60) { this.hideMenu(); FW = w; FH = h; dynHold = false; pix = PIXMAX; dynT = -300; resize(); mode = 1; F[FLT] = 0; const t0 = performance.now(), sm = []; let nf = 0, late = 0, lt = 0;
      return new Promise((r) => { const f = () => { const t = (performance.now() - t0) / 1000; if (t > secs / 2) { sm.push(W * Hh / (DW * DH)); nf++; if (F[LAST] - lt > 25) late++; } lt = F[LAST]; if (t > secs) { sm.sort((a, b) => a - b); let s = 0; for (const v of sm) s += v; r({ screen: `${DW}x${DH}`, share: +(s / sm.length).toFixed(3), min: +sm[0].toFixed(3), last: `${W}x${Hh}`, gpu: +F[GPU].toFixed(2), fps: +(nf / (secs / 2)).toFixed(1), late }); FW = FH = 0; dynHold = true; pix = 1e9; resize(); } else requestAnimationFrame(f); }; f(); }); },
    force(w, h) { FW = w; FH = h; dynHold = true; pix = 1e9; resize(); return `${W}x${Hh}`; },
    look(v) { this.hideMenu(); mode = 2; const o = VIEWS[0]; VIEWS[0] = v; viewAt(0); VIEWS[0] = o; },
    draws(o) { Object.assign(SKIP, o); },
    stats() { return { W, H: Hh, DW, DH, gpu: F[GPU], trees: TR.n, pines: TP.n, fog: FOG, eagle: [F[EX], F[EY], F[EZ]] }; },
  };
}

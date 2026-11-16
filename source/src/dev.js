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
  window.EC = {
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
    clip(t) { this.hideMenu(); if (mode !== 3 || abs(t - F[FLT]) > 0.1) { mode = 3; F[FLT] = t - 1; for (let k = 0; k < 60; k++) { flyAt(F[FLT] += 1 / 60); chase(1 / 60); } } F[FLT] = t; F[TIME] = t; return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))); },
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

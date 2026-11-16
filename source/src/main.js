// ============================================================================
// renderer, flight, camera and input (structure after Abyssal Garden's main.js)
// ============================================================================
const $ = (id) => document.getElementById(id);
const canvas = $('c'), info = $('i'), body = document.body, toast = $('t');
let loaded = 0, dead;
const say = (m, to, ms) => {
  if (!dead) $('s').textContent = m;
  const a = $('b').animate({ transform: [`scaleX(${loaded})`, `scaleX(${to})`] }, { duration: ms, fill: 'forwards', easing: 'cubic-bezier(.3,.5,.5,1)' });
  loaded = to;
  return new Promise((r) => { a.ready.then(() => setTimeout(r)); setTimeout(r, document.hidden ? 0 : 1e3); });
};
const fail = (m) => { throw new Error(m, { cause: 1 }); };
if (!navigator.gpu) fail('This needs WebGPU. Try a current Chrome or Edge.');
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
if (!adapter) fail('No WebGPU adapter found.');
const hasTS = adapter.features.has('timestamp-query');
const device = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query'] : [] });
device.addEventListener('uncapturederror', (e) => console.error('GPU: ' + e.error.message));
device.lost.then((l) => {
  if (l.reason === 'destroyed') return;
  if (LV < 2) { keep('eagle', LV + 1); location.reload(); }
  dead = body.className = 'l e'; $('s').textContent = 'The graphics device was lost. Reload the page to try again.';
});
const ctx = canvas.getContext('webgpu'), FMT = navigator.gpu.getPreferredCanvasFormat();
const Q = device.queue, HDR = "rgba16float", ZFMT = "depth32float";
const TU = GPUTextureUsage, BU = GPUBufferUsage, SS = GPUShaderStage;
const mod = (code) => device.createShaderModule({ code });
const buf = (data, usage) => { const b = device.createBuffer({ size: (data.byteLength + 3) & ~3, usage: usage | BU.COPY_DST }); Q.writeBuffer(b, 0, data.buffer || data, data.byteOffset || 0, data.byteLength); return b; };
const tex = (w, h, format, usage, o = {}) => device.createTexture({ size: [w, h], format, usage, mipLevelCount: o.mips || 1, sampleCount: o.samples || 1 });
const colorAtt = (view, clear) => ({ view, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: [0, 0, 0, 0] });
const NMIP = 5;

// ---------------------------------------------------------------- world textures
// heights (full resolution, mips), the bake (sun, sky, rim, travertine: half resolution), ground normals, tree shadows
const tH = tex(NT, NT, 'r32float', TU.TEXTURE_BINDING | TU.STORAGE_BINDING | TU.COPY_DST, { mips: NMIP });
const tB = tex(NT / 2, NT / 2, 'rgba16float', TU.TEXTURE_BINDING | TU.STORAGE_BINDING);
const tM = tex(NT / 2, NT / 2, 'r32float', TU.TEXTURE_BINDING | TU.STORAGE_BINDING, { mips: NMIP - 1 }); // max chain from mip 1, load time only
const tN = tex(NT, NT, 'rg8unorm', TU.TEXTURE_BINDING | TU.RENDER_ATTACHMENT);
const tT = tex(NT, NT, 'r8unorm', TU.TEXTURE_BINDING | TU.RENDER_ATTACHMENT);
const sRep = device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'linear', minFilter: 'linear' });
const sClamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
const UB = new Float32Array(88), ubo = device.createBuffer({ size: UB.byteLength, usage: BU.UNIFORM | BU.COPY_DST });
const sunU = buf(new Float32Array([...SUN, 0]), BU.UNIFORM);

await say('Carving the canyon…', 0.2, 900);
keep('eagleLoad', 1);
addEventListener('pagehide', () => keep('eagleLoad', ''));
let H;
{
  const size = NT * NT * 4;
  const p = device.createComputePipeline({ layout: 'auto', compute: { module: mod(W_GEN), entryPoint: 'main' } });
  const bh = device.createBuffer({ size, usage: BU.STORAGE | BU.COPY_SRC }), br = device.createBuffer({ size, usage: BU.MAP_READ | BU.COPY_DST });
  // the heights in four strips, one submit each, so no single GPU job runs long
  const CH = 4;
  for (let k = 0; k < CH; k++) {
    const e = device.createCommandEncoder(), c = e.beginComputePass(), ro = buf(new Uint32Array([k * NT / CH, 0, 0, 0]), BU.UNIFORM);
    c.setPipeline(p); c.setBindGroup(0, device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bh } }, { binding: 1, resource: { buffer: ro } }] }));
    c.dispatchWorkgroups(NT / 8, NT / 8 / CH); c.end(); Q.submit([e.finish()]);
    await Q.onSubmittedWorkDone(); ro.destroy();
  }
  const e = device.createCommandEncoder();
  e.copyBufferToBuffer(bh, 0, br, 0, size);
  e.copyBufferToTexture({ buffer: bh, bytesPerRow: NT * 4 }, { texture: tH }, [NT, NT]);
  // height mips; the max chain (for the shadow march) starts at mip 1, read straight from the heights
  const mm = mod(W_MIP);
  const mip = (mx, src, dst, n) => {
    const pm = device.createComputePipeline({ layout: 'auto', compute: { module: mm, entryPoint: 'main', constants: { MX: mx } } });
    const cm = e.beginComputePass(); cm.setPipeline(pm);
    cm.setBindGroup(0, device.createBindGroup({ layout: pm.getBindGroupLayout(0), entries: [{ binding: 0, resource: src }, { binding: 1, resource: dst }] }));
    cm.dispatchWorkgroups(max(1, n / 8), max(1, n / 8)); cm.end();
  };
  const lv = (t, m) => t.createView({ baseMipLevel: m, mipLevelCount: 1 });
  for (let m = 1; m < NMIP; m++) mip(0, lv(tH, m - 1), lv(tH, m), NT >> m);
  for (let m = 1; m < NMIP; m++) mip(1, m === 1 ? lv(tH, 0) : lv(tM, m - 2), lv(tM, m - 1), NT >> m);
  Q.submit([e.finish()]);
  // then the bake (sun, sky) and the normals from them
  const e2 = device.createCommandEncoder();
  const pb = device.createComputePipeline({ layout: 'auto', compute: { module: mod(W_BAKE), entryPoint: 'main' } });
  const cb = e2.beginComputePass(); cb.setPipeline(pb);
  cb.setBindGroup(0, device.createBindGroup({ layout: pb.getBindGroupLayout(0), entries: [{ binding: 0, resource: tH.createView() }, { binding: 1, resource: tB.createView() }, { binding: 2, resource: { buffer: sunU } }, { binding: 3, resource: tM.createView() }] }));
  cb.dispatchWorkgroups(NT / 16, NT / 16); cb.end();
  const mn = mod(W_NORM), pn = device.createRenderPipeline({ layout: 'auto', vertex: { module: mn, entryPoint: 'vs' }, fragment: { module: mn, entryPoint: 'fs', targets: [{ format: 'rg8unorm' }] } });
  const rn = e2.beginRenderPass({ colorAttachments: [{ view: tN.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0.5, 0.5, 0, 0] }] });
  rn.setPipeline(pn); rn.setBindGroup(0, device.createBindGroup({ layout: pn.getBindGroupLayout(0), entries: [{ binding: 0, resource: tH.createView({ baseMipLevel: 0, mipLevelCount: 1 }) }] })); rn.draw(3); rn.end();
  Q.submit([e2.finish()]);
  await br.mapAsync(GPUMapMode.READ);
  H = new Float32Array(br.getMappedRange().slice(0));
  br.unmap(); br.destroy(); bh.destroy();
  await Q.onSubmittedWorkDone(); tM.destroy();
}
// height at any x, z (bilinear, wraps), and the ground normal
const hAt = (x, z) => {
  const u = x / TX, v = z / TX, i = floor(u), j = floor(v), fx = u - i, fz = v - j;
  const i0 = ((i % NT) + NT) % NT, j0 = ((j % NT) + NT) % NT, i1 = (i0 + 1) % NT, j1 = (j0 + 1) % NT;
  return mix(mix(H[i0 + j0 * NT], H[i1 + j0 * NT], fx), mix(H[i0 + j1 * NT], H[i1 + j1 * NT], fx), fz);
};

await say('Planting pinyon and juniper…', 0.6, 900);
const [TR, TP] = plantTrees(H), THERM = makeThermals(hAt), NTH = THERM.length / 8;
const BR = buildBridge(hAt);
// three birds per thermal: the instance buffer repeats each thermal with the bird index in the last slot
const thermBirds = new Float32Array(NTH * 24); for (let i = 0; i < NTH * 3; i++) { thermBirds.set(THERM.subarray((i / 3 | 0) * 8, (i / 3 | 0) * 8 + 8), i * 8); thermBirds[i * 8 + 7] = i % 3; }
const meshes = [meshEagle(), meshTree(false), meshTree(true), meshPine(false), meshPine(true), BR.mesh, buildFall()];
let nV = 0, nI = 0;
for (const m of meshes) { m.v0 = nV; m.i0 = nI; nV += m.nv; nI += m.ib.length; }
const allV = new Uint8Array(nV * 20), allI = new Uint32Array(nI);
for (const m of meshes) { allV.set(new Uint8Array(m.vb), m.v0 * 20); allI.set(m.ib, m.i0); }
const vbMesh = buf(allV, BU.VERTEX), ibMesh = buf(allI, BU.INDEX), ibBirds = buf(thermBirds, BU.VERTEX);
TR.ib = buf(TR.data, BU.VERTEX | BU.STORAGE); TP.ib = buf(TP.data, BU.VERTEX | BU.STORAGE);
const [EAGLE, TREE, TREELO, PINE, PINELO, BRIDGE, FALL] = meshes;
TR.hi = TREE; TR.lo = TREELO; TR.far = 170; TP.hi = PINE; TP.lo = PINELO; TP.far = 260;
{ // tree shadows baked into tT
  const m = mod(W_TSH);
  const p = device.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, primitive: { topology: 'triangle-strip' },
    fragment: { module: m, entryPoint: 'fs', targets: [{ format: 'r8unorm', blend: { color: { operation: 'min', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'min', srcFactor: 'one', dstFactor: 'one' } } }] } });
  const e = device.createCommandEncoder();
  const r = e.beginRenderPass({ colorAttachments: [{ view: tT.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }] });
  r.setPipeline(p);
  for (const T of [TR, TP]) if (T.n) { r.setBindGroup(0, device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: T.ib } }, { binding: 1, resource: { buffer: sunU } }] })); r.draw(4, T.n * 9); }
  r.end(); Q.submit([e.finish()]);
}

// ---------------------------------------------------------------- pipelines
await say('Warming the air…', 0.85, 600);
const VF = SS.VERTEX | SS.FRAGMENT;
const bgl0 = device.createBindGroupLayout({ entries: [
  { binding: 0, visibility: VF, buffer: {} }, { binding: 1, visibility: VF, sampler: {} },
  { binding: 2, visibility: VF, texture: { sampleType: 'unfilterable-float' } },
  { binding: 3, visibility: VF, texture: {} }, { binding: 4, visibility: VF, texture: {} }, { binding: 5, visibility: VF, texture: {} }] });
const bg0 = device.createBindGroup({ layout: bgl0, entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sRep },
  { binding: 2, resource: tH.createView() }, { binding: 3, resource: tB.createView() }, { binding: 4, resource: tT.createView() }, { binding: 5, resource: tN.createView() }] });
const pl0 = device.createPipelineLayout({ bindGroupLayouts: [bgl0] });
const A = (shaderLocation, offset, format) => ({ shaderLocation, offset, format });
const vbM = { arrayStride: 20, attributes: [A(0, 0, 'float32x3'), A(1, 12, 'snorm8x4'), A(2, 16, 'unorm8x4')] };
const ibT = { arrayStride: 32, stepMode: 'instance', attributes: [A(3, 0, 'float32x4'), A(4, 16, 'float32x4')] };
const scenePipe = (m, buffers, o = {}) => device.createRenderPipeline({ layout: pl0,
  vertex: { module: m, entryPoint: o.vs || 'vs', buffers, constants: o.constants },
  fragment: { module: m, entryPoint: 'fs', targets: [{ format: HDR }] },
  primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: o.cull || 'none' },
  depthStencil: { format: ZFMT, depthWriteEnabled: !o.sky, depthCompare: o.sky ? 'equal' : 'greater' }, multisample: { count: AA, alphaToCoverageEnabled: !!o.a2c && AA > 1 } });
const TN = 160; // cells per side of each terrain level
const pTerrain = scenePipe(mod(W_TERRAIN), [], { constants: { N: TN } });
const pRiver = scenePipe(mod(W_RIVER), [], { strip: true });
const pTree = scenePipe(mod(W_TREE), [vbM, ibT]);
const mEagle = mod(W_EAGLE), pEagle = scenePipe(mEagle, [vbM]), pBirds = scenePipe(mEagle, [vbM, ibT], { vs: 'vsB' });
const pSky = scenePipe(mod(W_SKY), [], { sky: true });
const pRock = scenePipe(mod(W_ROCKM), [vbM]), pFall = scenePipe(mod(W_FALL), [vbM], { a2c: true });
const bglBlit = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: SS.FRAGMENT, texture: {} }, { binding: 1, visibility: SS.FRAGMENT, sampler: {} }] });
const plBlit = device.createPipelineLayout({ bindGroupLayouts: [bglBlit] });
const mBlit = mod(W_BLIT);
const blitPipe = (entry, add) => device.createRenderPipeline({ layout: plBlit, vertex: { module: mBlit, entryPoint: 'vs' },
  fragment: { module: mBlit, entryPoint: entry, targets: [{ format: HDR, blend: add ? { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } : undefined }] } });
const pDown0 = blitPipe('fsDown0'), pDown = blitPipe('fsDown'), pUp = blitPipe('fsUp', true);
const blitBG = (view) => device.createBindGroup({ layout: bglBlit, entries: [{ binding: 0, resource: view }, { binding: 1, resource: sClamp }] });
const mPost = mod(W_POST);
const pPost = device.createRenderPipeline({ layout: 'auto', vertex: { module: mPost, entryPoint: 'vs' }, fragment: { module: mPost, entryPoint: 'fs', targets: [{ format: FMT }] } });

// ---------------------------------------------------------------- render targets (rebuilt on resize)
// The scene is drawn at `pix` pixels and scaled to the window; frame() tunes `pix` for 60 fps (Abyssal Garden's
// scheme, without its draw-distance step: here the draw distance is the fog, a design value, not a quality knob).
const PIXMAX = 2560 * 1440, PIXMIN = mob ? 25e4 : 5e5;
let W = 0, Hh = 0, DW = 0, DH = 0, pix = +SV[1] || (LV > 1 ? 41e4 : mob ? 1280 * 720 : PIXMAX), dynN = 0, dynT = 0, dynG = 0, dynGN = 0, dynBad = 0, dynOk = 0, dynWait = 3;
let passScene, passPost, bgPost, bloomPass = [], bloomBG = [], targets = [];
const NB = 5;
function resize() {
  DW = max(2, round(canvas.clientWidth * devicePixelRatio)); DH = max(2, round(canvas.clientHeight * devicePixelRatio));
  const s = min(1, sqrt(pix / (DW * DH)));
  const w = max(2, round(DW * s) & ~1), h = max(2, round(DH * s) & ~1);
  if (w === W && h === Hh) return;
  dynN = dynG = dynGN = 0; dynT = dynT === -Infinity ? dynT : -300;
  W = w; Hh = h; canvas.width = W; canvas.height = Hh;
  ctx.configure({ device, format: FMT, alphaMode: 'opaque' });
  for (const t of targets) t.destroy();
  const tMS = tex(AA > 1 ? W : 1, AA > 1 ? Hh : 1, HDR, TU.RENDER_ATTACHMENT, { samples: AA }), tDp = tex(W, Hh, ZFMT, TU.RENDER_ATTACHMENT, { samples: AA });
  const tRes = tex(W, Hh, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
  targets = [tMS, tDp, tRes];
  const bl = [];
  for (let i = 0; i < NB; i++) { const t = tex(max(1, W >> (i + 1)), max(1, Hh >> (i + 1)), HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING); bl.push(t); targets.push(t); }
  const vRes = tRes.createView(), vBl = bl.map((t) => t.createView());
  passScene = { colorAttachments: [{ view: AA > 1 ? tMS.createView() : vRes, resolveTarget: AA > 1 ? vRes : undefined, loadOp: 'clear', storeOp: AA > 1 ? 'discard' : 'store', clearValue: [0, 0, 0, 1] }],
    depthStencilAttachment: { view: tDp.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' } };
  passPost = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] };
  bgPost = device.createBindGroup({ layout: pPost.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sClamp }, { binding: 2, resource: vRes }, { binding: 3, resource: vBl[0] }] });
  bloomPass = []; bloomBG = [];
  for (let i = 0; i < NB; i++) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i], true)] }); bloomBG.push(blitBG(i ? vBl[i - 1] : vRes)); }
  for (let i = NB - 1; i > 0; i--) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i - 1], false)] }); bloomBG.push(blitBG(vBl[i])); }
  UB[28] = W; UB[29] = Hh; UB[30] = 1 / W; UB[31] = 1 / Hh;
}
resize();
addEventListener('resize', resize);

// ---------------------------------------------------------------- GPU timing (timestamp queries)
let qs, qResolve, qRead = [], tsBegin, tsEnd;
const F = new Float64Array(64);
const CX = 0, CY = 1, CZ = 2, TIME = 3, LAST = 4, GPU = 5, HUDT = 6, FLT = 7, SPL = 8,
  EX = 10, EY = 11, EZ = 12, YAW = 13, GAM = 14, BANK = 15, SPD = 16, PH = 17, AMP = 18, FOLD = 19, SHAKE = 20, STX = 21, STY = 22, ROLL = 23,
  LX = 24, LY = 25, LZ = 26, FOV = 27, BUMP = 28, FLAPT = 29;
if (hasTS) {
  qs = device.createQuerySet({ type: 'timestamp', count: 2 });
  qResolve = device.createBuffer({ size: 16, usage: BU.QUERY_RESOLVE | BU.COPY_SRC });
  for (let i = 0; i < 6; i++) {
    const b = device.createBuffer({ size: 16, usage: BU.MAP_READ | BU.COPY_DST });
    const o = { b, busy: false, done: null };
    o.done = () => {
      const a = new BigInt64Array(b.getMappedRange());
      const ms = Number(a[1] - a[0]) / 1e6; F[GPU] = ms; b.unmap(); o.busy = false;
      if (dynT > 0 && ms > 0 && ms < 1e3) { dynG += ms; dynGN++; }
    };
    qRead.push(o);
  }
  tsBegin = { querySet: qs, beginningOfPassWriteIndex: 0 }; tsEnd = { querySet: qs, endOfPassWriteIndex: 1 };
}

// ---------------------------------------------------------------- camera and drawing
const NEAR = 0.15;
let HZ = 0;
const cam = { f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0], tanY: 0.6 };
let eagleOn = true, DBG = 0;
// aims the camera from eye E at target T with roll angle rl
function aimCam(ex, ey, ez, tx, ty, tz, rl) {
  let fx = tx - ex, fy = ty - ey, fz = tz - ez; const fl = hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl2 = hypot(rx, rz) || 1; rx /= rl2; rz /= rl2; // cross(f, up)
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy; // cross(r, f)
  const c = cos(rl), s = sin(rl);
  cam.r[0] = rx * c + ux * s; cam.r[1] = uy * s; cam.r[2] = rz * c + uz * s;
  cam.u[0] = ux * c - rx * s; cam.u[1] = uy * c; cam.u[2] = uz * c - rz * s;
  cam.f[0] = fx; cam.f[1] = fy; cam.f[2] = fz;
  F[CX] = ex; F[CY] = ey; F[CZ] = ez;
}
const submitList = [null];
function drawTrees(r, T) {
  r.setVertexBuffer(1, T.ib);
  const cx = F[CX], cz = F[CZ], R = UB[25], fx = cam.f[0], fz = cam.f[2], fh = hypot(fx, fz), back = cam.f[1] > -0.75 && fh > 0.3;
  for (let j = 0; j < CELLS; j++) {
    let run = -1, runLo = false;
    for (let i = 0; i <= CELLS; i++) {
      let v = false, lo = false;
      if (i < CELLS) {
        const c = i + j * CELLS;
        if (T.start[c + 1] > T.start[c]) {
          let dx = (i + 0.5) * CELLW - cx, dz = (j + 0.5) * CELLW - cz; dx -= L * round(dx / L); dz -= L * round(dz / L);
          const nx = max(abs(dx) - CELLW / 2, 0), nz = max(abs(dz) - CELLW / 2, 0), d2 = nx * nx + nz * nz;
          if (d2 < R * R && (!back || (dx * fx + dz * fz) / fh > -CELLW * 0.75)) { v = true; lo = d2 > T.far * T.far; }
        }
      }
      if (run >= 0 && (!v || lo !== runLo)) {
        const c0 = run + j * CELLS, c1 = i + j * CELLS, a = T.start[c0], n = T.start[c1] - a, m = runLo ? T.lo : T.hi;
        if (n > 0) r.drawIndexed(m.ib.length, n, m.i0, m.v0, a);
        run = -1;
      }
      if (v && run < 0) { run = i; runLo = lo; }
    }
  }
}
function render() {
  const m = UB, asp = W / Hh, ty = cam.tanY, tx = ty * asp, sx = 1 / tx, sy = 1 / ty;
  const [rx, ry, rz] = cam.r, [ux, uy, uz] = cam.u, [fx, fy, fz] = cam.f, cx = F[CX], cy = F[CY], cz = F[CZ];
  m[0] = rx * sx; m[4] = ry * sx; m[8] = rz * sx; m[12] = -(rx * cx + ry * cy + rz * cz) * sx;
  m[1] = ux * sy; m[5] = uy * sy; m[9] = uz * sy; m[13] = -(ux * cx + uy * cy + uz * cz) * sy;
  m[2] = 0; m[6] = 0; m[10] = 0; m[14] = NEAR;
  m[3] = fx; m[7] = fy; m[11] = fz; m[15] = -(fx * cx + fy * cy + fz * cz);
  m[16] = cx; m[17] = cy; m[18] = cz; m[19] = F[TIME];
  m[20] = SUN[0]; m[21] = SUN[1]; m[22] = SUN[2]; m[23] = 2.8 / FOG;
  m[24] = FOG; m[25] = FOG * 1.25; m[26] = YTOP; m[27] = DBG;
  m[32] = rx * tx; m[33] = ry * tx; m[34] = rz * tx; m[36] = ux * ty; m[37] = uy * ty; m[38] = uz * ty;
  m[40] = fx; m[41] = fy; m[42] = fz; m[43] = NEAR;
  // clearer air while the camera is in a region that asks for it (the basin), eased so it never jumps
  const open = regAt(nearB(cx, cz) ? 1 : 0, cz)[11];
  HZ += (open - HZ) * (mode === 2 ? 1 : 0.03);
  m[60] = 1.0; m[61] = HZ; m[62] = sstep(18, 9, F[SPD]);
  // terrain levels: centred on the camera, snapped to twice their cell size
  let nLv = 0;
  for (let k = 0; k < 6; k++) {
    const s = TX * (1 << k), ext = TN * s / 2, sn = 2 * s;
    m[64 + k * 4] = floor((cx - ext) / sn) * sn; m[65 + k * 4] = floor((cz - ext) / sn) * sn; m[66 + k * 4] = s;
    if (k === 0 || TN * s / 4 < m[25] * 1.05) nLv = k + 1;
  }
  nLv = min(nLv, NMIP - 1);
  Q.writeBuffer(ubo, 0, UB);

  const e = device.createCommandEncoder();
  let slot = null;
  if (hasTS) { for (let i = 0; i < qRead.length; i++) if (!qRead[i].busy) { slot = qRead[i]; break; } }
  passScene.timestampWrites = slot ? tsBegin : undefined;
  passPost.timestampWrites = slot ? tsEnd : undefined;
  let r = e.beginRenderPass(passScene);
  r.setBindGroup(0, bg0);
  if (eagleOn) { r.setPipeline(pEagle); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32'); r.drawIndexed(EAGLE.ib.length, 1, EAGLE.i0, EAGLE.v0, 0); }
  r.setPipeline(pBirds); r.setVertexBuffer(0, vbMesh); r.setVertexBuffer(1, ibBirds); r.setIndexBuffer(ibMesh, 'uint32'); r.drawIndexed(EAGLE.ib.length, NTH * 3, EAGLE.i0, EAGLE.v0, 0);
  r.setPipeline(pTerrain);
  for (let k = 0; k < nLv; k++) r.draw(TN * TN * 6, 1, 0, k);
  r.setPipeline(pTree); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32'); drawTrees(r, TR); drawTrees(r, TP);
  r.setPipeline(pRock); r.drawIndexed(BRIDGE.ib.length, 1, BRIDGE.i0, BRIDGE.v0, 0);
  r.setPipeline(pFall); r.drawIndexed(FALL.ib.length, 1, FALL.i0, FALL.v0, 0);
  r.setPipeline(pRiver); r.draw(4);
  r.setPipeline(pSky); r.draw(3);
  r.end();
  for (let i = 0; i < bloomPass.length; i++) {
    r = e.beginRenderPass(bloomPass[i]); r.setPipeline(i === 0 ? pDown0 : i < NB ? pDown : pUp); r.setBindGroup(0, bloomBG[i]); r.draw(3); r.end();
  }
  passPost.colorAttachments[0].view = ctx.getCurrentTexture().createView();
  r = e.beginRenderPass(passPost); r.setPipeline(pPost); r.setBindGroup(0, bgPost); r.draw(3); r.end();
  if (slot) { e.resolveQuerySet(qs, 0, 2, qResolve, 0); e.copyBufferToBuffer(qResolve, 0, slot.b, 0, 16); }
  submitList[0] = e.finish();
  Q.submit(submitList);
  if (slot) { slot.busy = true; slot.b.mapAsync(GPUMapMode.READ).then(slot.done); }
}

// ---------------------------------------------------------------- the eagle: flight model
// Glide by default (about 17 m/s, sinking 1.2 m/s); flap to climb; bank to turn (a coordinated turn: rate = g tan(bank) / v);
// pitch trades height for speed; Shift folds the wings into a dive. Touching rock bumps and slows; you never die.
const G0 = 9.81, GLIDE = -0.07, ER = 1.0;
let kf = 0, kl = 0, kr = 0, ku = 0, kdn = 0, kdive = 0, kflare = 0, mdx = 0, mdy = 0;
function eagleBasis(out) {
  const y = F[YAW], g = F[GAM] * 0.7 + 0.05, b = F[BANK];
  const fx = sin(y) * cos(g), fy = sin(g), fz = cos(y) * cos(g), r0x = -cos(y), r0z = sin(y); // r0 = cross(f, up): screen right
  const u0x = -r0z * fy, u0y = r0z * fx - r0x * fz, u0z = r0x * fy; // cross(r0, f)
  const c = cos(b), s = sin(b);
  out[0] = r0x * c - u0x * s; out[1] = -u0y * s; out[2] = r0z * c - u0z * s;
  out[3] = u0x * c + r0x * s; out[4] = u0y * c; out[5] = u0z * c + r0z * s;
  out[6] = fx; out[7] = fy; out[8] = fz;
}
const EB = new Float64Array(9);
function placeEagle(x, y, z, yaw, spd) { F[EX] = x; F[EY] = y; F[EZ] = z; F[YAW] = yaw; F[GAM] = GLIDE; F[BANK] = 0; F[SPD] = spd; F[ROLL] = 0; F[LX] = 0; snapCam = true; }
let snapCam = true;
function fly(dt) {
  // a mouse movement pushes a stick that slowly recentres
  const dk = exp(-dt * 1.6);
  F[STX] = clamp(F[STX] * dk + mdx * 0.0035, -1, 1); F[STY] = clamp(F[STY] * dk - mdy * 0.0035, -1, 1); mdx = mdy = 0;
  const turn = clamp(kr - kl + F[STX], -1, 1), pitch = clamp(ku - kdn + F[STY] + kflare * 0.8, -1, 1);
  const v = F[SPD], flap = kf && !kdive;
  F[BANK] += (turn * 0.95 - F[BANK]) * (1 - exp(-dt * 3.5));
  F[FOLD] += ((kdive ? 1 : 0) - F[FOLD]) * (1 - exp(-dt * 5));
  let gt = GLIDE + pitch * 0.55 + (flap ? 0.22 : 0) - abs(F[BANK]) * 0.06;
  if (kdive) gt = -0.95 + pitch * 0.3;
  if (v < 10) gt = min(gt, -0.3 * (10 - v) / 4);
  if (F[EY] > YTOP + RIM + 400) gt = min(gt, -0.15);
  F[GAM] += (gt - F[GAM]) * (1 - exp(-dt * 2.2));
  const thin = 1 - sstep(YTOP + RIM + 220, YTOP + RIM + 400, F[EY]);
  const thrust = flap ? 7.5 * clamp(1 - v / 30, 0, 1) * thin : 0;
  const kd = mix(0.0024, 0.0009, F[FOLD]) * (1 + 0.3 * abs(F[BANK])) * (1 + kflare * 2.5);
  F[SPD] = clamp(v + (-G0 * sin(F[GAM]) - kd * v * v + thrust) * dt, 6, 78);
  F[YAW] -= G0 * tan(F[BANK]) / max(F[SPD], 12) * dt; // yaw grows to the left
  // wings: flap cycle while W is held, a slow breathing otherwise
  F[PH] += dt * TAU * (flap ? 2.6 : 0.35);
  F[AMP] += ((flap ? 0.62 : 0.035) * (1 - F[FOLD]) - F[AMP]) * (1 - exp(-dt * 6));
  const c = cos(F[GAM]), sp = F[SPD];
  let vx = sin(F[YAW]) * c * sp, vy = sin(F[GAM]) * sp, vz = cos(F[YAW]) * c * sp;
  F[EX] += vx * dt; F[EY] += vy * dt; F[EZ] += vz * dt;
  // thermals lift you without costing speed: circle inside one to climb
  for (let i = 0; i < NTH; i++) {
    const o = i * 8; let dx = F[EX] - THERM[o], dz = F[EZ] - THERM[o + 2]; dx -= L * round(dx / L); dz -= L * round(dz / L);
    const q = (dx * dx + dz * dz) / (THERM[o + 3] * THERM[o + 3]);
    if (q < 1) F[EY] += THERM[o + 4] * (1 - q) * sstep(THERM[o + 5], THERM[o + 5] - 80, F[EY]) * dt;
  }
  // rock: push out along the ground normal, lose the speed into it, bump the camera
  let hit = 0;
  for (let it = 0; it < 3; it++) {
    const h = hAt(F[EX], F[EZ]), gx = hAt(F[EX] + 1.5, F[EZ]) - hAt(F[EX] - 1.5, F[EZ]), gz = hAt(F[EX], F[EZ] + 1.5) - hAt(F[EX], F[EZ] - 1.5);
    let nx = -gx, ny = 3, nz = -gz; const nl = hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const sd = (F[EY] - h) * ny;
    if (sd >= ER) break;
    const push = ER - sd; F[EX] += nx * push; F[EY] += ny * push; F[EZ] += nz * push;
    const vn = vx * nx + vy * ny + vz * nz;
    if (vn < 0) { vx -= nx * vn * 1.25; vy -= ny * vn * 1.25; vz -= nz * vn * 1.25; hit = max(hit, -vn); }
  }
  // the stone bridge: an elliptical slab at each span sample; push out of it
  { const ox = wrapd(F[EX] - BR.cx), oz = wrapd(F[EZ] - BR.cz), s = ox * BR.nx + oz * BR.nz;
    if (s > BR.a && s < BR.b) {
      const i = round((s - BR.a) / (BR.b - BR.a) * BR.NS) * 5, c = BR.col, ac = ox * BR.tx + oz * BR.tz, dy = F[EY] - c[i + 1];
      const ey = dy / (c[i + 3] + ER), ea = ac / (c[i + 4] + ER), q = ey * ey + ea * ea;
      if (q < 1) {
        const k = 1 / sqrt(max(q, 1e-4)) - 1, py = dy * k, pa = ac * k, pl = hypot(py, pa) || 1;
        F[EY] += py; F[EX] += BR.tx * pa; F[EZ] += BR.tz * pa;
        const ny = py / pl, na = pa / pl, vn = vy * ny + (vx * BR.tx + vz * BR.tz) * na;
        if (vn < 0) { vy -= ny * vn * 1.25; vx -= BR.tx * na * vn * 1.25; vz -= BR.tz * na * vn * 1.25; hit = max(hit, -vn); }
      }
    } }
  if (F[EY] < YR + 0.9) { F[EY] = YR + 0.9; if (vy < 0) { hit = max(hit, -vy); vy = -vy * 0.3; } }
  if (hit > 0) {
    const sl = hit > 3 ? 0.72 : 0.97, nsp = hypot(vx, vy, vz) * sl;
    F[SPD] = clamp(nsp, 6, 78); F[GAM] = asin(clamp(vy / max(hypot(vx, vy, vz), 1e-3), -1, 1)); F[YAW] = atan2(vx, vz);
    if (hit > 3) { F[SHAKE] = min(1, F[SHAKE] + hit * 0.06); F[BUMP] = 1; bumpSound(hit); }
  }
  F[SHAKE] *= exp(-dt * 4); F[BUMP] *= exp(-dt * 3);
  // keep coordinates small: the world repeats every L metres
  if (abs(F[EX]) > 8 * L || abs(F[EZ]) > 8 * L) { const ox = L * round(F[EX] / L), oz = L * round(F[EZ] / L); F[EX] -= ox; F[EZ] -= oz; F[LX] -= ox; F[LZ] -= oz; }
}
// chase camera: behind and a little above, smoothed; pulled in front of any rock between it and the eagle
function chase(dt) {
  eagleBasis(EB);
  const sp = F[SPD], dist = 6.5 + sp * 0.045, y = F[YAW], g = F[GAM] * 0.6;
  const bx = sin(y) * cos(g), by = sin(g), bz = cos(y) * cos(g);
  let ex = F[EX] - bx * dist, ey = F[EY] - by * dist + 1.9, ez = F[EZ] - bz * dist;
  if (snapCam) { F[LX] = ex; F[LY] = ey; F[LZ] = ez; snapCam = false; }
  const k = 1 - exp(-dt * 4.5);
  F[LX] += (ex - F[LX]) * k; F[LY] += (ey - F[LY]) * k; F[LZ] += (ez - F[LZ]) * k;
  ex = F[LX]; ey = F[LY]; ez = F[LZ];
  for (let i = 1; i <= 8; i++) {
    const t = i / 8, px = mix(F[EX], ex, t), py = mix(F[EY], ey, t), pz = mix(F[EZ], ez, t);
    if (py < hAt(px, pz) + 1.6) { const t2 = max(0.15, (i - 1) / 8); ex = mix(F[EX], ex, t2); ey = mix(F[EY], ey, t2) + 1; ez = mix(F[EZ], ez, t2); break; }
  }
  // a camera that has swung into a wall (in the narrows, after a turn) slides back toward the eagle, never up over the rim
  for (let i = 0; i < 8 && hAt(ex, ez) + 1.6 > ey; i++) { ex = mix(ex, F[EX], 0.4); ey = mix(ey, F[EY], 0.4); ez = mix(ez, F[EZ], 0.4); }
  ey = max(ey, hAt(ex, ez) + 1.6, YR + 1.2);
  const sh = F[SHAKE] * 0.35, t = F[TIME];
  ex += sh * sin(t * 53); ey += sh * sin(t * 61 + 1); ez += sh * sin(t * 47 + 2);
  F[ROLL] += (F[BANK] * 0.35 - F[ROLL]) * k;
  F[FOV] = 0.58 + 0.14 * sstep(20, 60, sp);
  cam.tanY = F[FOV];
  aimCam(ex, ey, ez, F[EX] + EB[6] * 6, F[EY] + EB[7] * 6 + 0.7, F[EZ] + EB[8] * 6, -F[ROLL]);
}
function eagleUniforms() {
  const m = UB; eagleBasis(EB);
  m[44] = F[EX]; m[45] = F[EY]; m[46] = F[EZ]; m[47] = F[PH];
  m[48] = EB[0]; m[49] = EB[1]; m[50] = EB[2]; m[51] = F[AMP];
  m[52] = EB[3]; m[53] = EB[4]; m[54] = EB[5]; m[55] = F[FOLD];
  m[56] = EB[6]; m[57] = EB[7]; m[58] = EB[8]; m[59] = 0.05 * (1 - F[FOLD]) + kflare * 0.15;
}

// ---------------------------------------------------------------- scripted flight (menu backdrop, benchmark)
// the river's frame: point at z along the river, offset o to one side, height y
const riverPt = (z, o, y, r = 0) => { const d = rDX(r, z), n = hypot(1, d); return [rX(r, z) + o / n, y, z - o * d / n]; };
// distance from the river to the wall on one side at height y (to the rim edge when y is above the rim)
const wallDist = (z, y, side, r = 0) => { for (let o = 4; o < 2000; o += 4) { const p = riverPt(z, side * o, 0, r); if (hAt(p[0], p[2]) > y || hAt(p[0], p[2]) > YTOP + rimRise(p[0], p[2]) - 4) return o; } return 2000; };
function viewPose(v) {
  const [z, sd, h, fr, la, lf, lh, r = 0] = v;
  const c = riverPt(z, sd * fr * wallDist(z, YR + h, sd, r), YR + h, r), t = riverPt(z + la, sd * lf * wallDist(z + la, YR + lh, lf < 0 ? -sd : sd, r), YR + lh, r);
  return [c[0], max(c[1], hAt(c[0], c[2]) + 6), c[2], t[0], t[1], t[2]];
}
// benchmark path: follows the river, weaving between the walls, raised wherever the spline would touch rock
const FLY = FLYH.map((h, i) => { const z = FLYZ0 + i * 180, sd = sin(i * 0.8) < 0 ? -1 : 1; return riverPt(z, sd * (0.15 + 0.35 * abs(sin(i * 0.8))) * min(wallDist(z, YR + h, sd), 300), YR + h); });
const FLYN = FLY.length, FLYT = 60, LUTN = 1024, flyLUT = new Float32Array(LUTN + 1), P3 = new Float64Array(3);
function flyRaw(s) {
  let i = floor(s) | 0; if (i > FLYN - 2) i = FLYN - 2;
  const u = s - i, a = FLY[max(i - 1, 0)], b = FLY[i], c = FLY[i + 1], d = FLY[min(i + 2, FLYN - 1)];
  for (let o = 0; o < 3; o++) P3[o] = 0.5 * (2 * b[o] + (c[o] - a[o]) * u + (2 * a[o] - 5 * b[o] + 4 * c[o] - d[o]) * u * u + (3 * b[o] - a[o] - 3 * c[o] + d[o]) * u * u * u);
}
for (let it = 0; it < 12; it++) {
  let low = 0;
  for (let k = 0; k <= 2048; k++) { const s = k / 2048 * (FLYN - 1); flyRaw(s); const need = hAt(P3[0], P3[2]) + 14 - P3[1]; if (need > 0) { FLY[round(s)][1] += need + 2; low++; } }
  if (!low) break;
}
{
  const M = 4096, len = new Float32Array(M + 1); let px = 0, py = 0, pz = 0;
  for (let k = 0; k <= M; k++) { flyRaw(k / M * (FLYN - 1)); if (k) len[k] = len[k - 1] + hypot(P3[0] - px, P3[1] - py, P3[2] - pz); px = P3[0]; py = P3[1]; pz = P3[2]; }
  for (let k = 0, j = 0; k <= LUTN; k++) { const d = k / LUTN * len[M]; while (j < M - 1 && len[j + 1] < d) j++; flyLUT[k] = (j + (d - len[j]) / max(len[j + 1] - len[j], 1e-6)) / M * (FLYN - 1); }
}
const flyS = (t) => { let s = clamp(t / FLYT, 0, 1) * LUTN, k = floor(s) | 0; if (k > LUTN - 1) k = LUTN - 1; return flyLUT[k] + (flyLUT[k + 1] - flyLUT[k]) * (s - k); };
// puts the eagle on the path at time t (looping) and the camera behind it
function flyAt(t) {
  t = ((t % FLYT) + FLYT) % FLYT;
  flyRaw(flyS(t)); const x = P3[0], y = P3[1], z = P3[2];
  flyRaw(flyS(min(t + 0.4, FLYT))); const dx = P3[0] - x, dy = P3[1] - y, dz = P3[2] - z, l = hypot(dx, dy, dz) || 1;
  const yaw = atan2(dx, dz), turn = (yaw - F[YAW] + 3 * PI) % TAU - PI;
  F[BANK] += (clamp(-turn * 25, -0.8, 0.8) - F[BANK]) * 0.05;
  F[EX] = x; F[EY] = y; F[EZ] = z; F[YAW] = yaw; F[GAM] = asin(dy / l); F[SPD] = 40;
  F[PH] += 0.016 * TAU * 0.35; F[AMP] = 0.04; F[FOLD] = 0;
}
// a fixed viewpoint: camera at the pose, the eagle gliding 10 m ahead of it
function viewAt(i) {
  const p = viewPose(VIEWS[i]);
  const dx = p[3] - p[0], dy = p[4] - p[1], dz = p[5] - p[2], l = hypot(dx, dy, dz);
  F[EX] = p[0] + dx / l * 11 + 1.5 * dz / l; F[EY] = p[1] + dy / l * 11 - 1.6; F[EZ] = p[2] + dz / l * 11 - 1.5 * dx / l;
  F[YAW] = atan2(dx, dz) + 0.25; F[GAM] = GLIDE; F[BANK] = -0.25; F[AMP] = 0.05; F[FOLD] = 0; F[PH] = 1;
  cam.tanY = 0.58;
  aimCam(p[0], p[1], p[2], p[3], p[4], p[5], 0);
}

// ---------------------------------------------------------------- frame
let hud = false, hN = 0, hMax = 0, hMin = 1e9, hPer = 1e9, hLate = 0, hTot = 0, mode = 0; // mode 0 play, 1 scripted, 2 still
let dynHold = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dtr = now - F[LAST]; F[LAST] = now;
  let dt = dtr / 1000; if (dt > 0.1) dt = 0.1;
  if (!dynHold && dtr < 1e3 && (dynT += dtr) > 0 && (dynN++, dynT > (menu ? 400 : 1000))) {
    const a = dynT / dynN, g = dynGN ? dynG / dynGN : 0; let k = 1;
    if (g) { if (g > 13.6 || g < 9.8) k = 11.7 / g; }
    else if (a > 17.6) { dynOk = 0; if (++dynBad > 1) { k = 15 / a; dynBad = 0; dynWait = min(dynWait * 2, 60); } }
    else { dynBad = 0; if (a < 12.5) k = 15 / a; else if (++dynOk > dynWait) { k = 1.17; dynOk = 0; } }
    k = k < 0.5 ? 0.5 : k > 1.7 ? 1.7 : k; const top = min(PIXMAX, DW * DH), was = pix;
    pix = clamp(pix * k, PIXMIN, top);
    if (was !== pix) keep('eagle', [LV, pix < top ? pix | 0 : '']);
    dynN = dynT = dynG = dynGN = 0; resize();
  }
  F[TIME] += dt;
  if (mode === 0 && !menu) { fly(dt); chase(dt); }
  else if (mode === 0 || mode === 1) { F[FLT] += dt; flyAt(F[FLT]); chase(dt); }
  else if (mode === 3) { flyAt(F[FLT]); chase(1 / 30); } // a clip: time is set from outside, one step per frame
  eagleUniforms();
  render();
  if (!menu && mode === 0) wind(F[SPD], F[EY] - YR, kf && !kdive, F[FOLD]);
  if (hud) {
    hN++; if (dtr > hMax) hMax = dtr; if (dtr < hMin) hMin = dtr; if (dtr > hPer * 1.5) { hLate++; hTot++; }
    F[HUDT] += dtr / 1000;
    if (F[HUDT] > 0.5) { info.textContent = `${(hN / F[HUDT]).toFixed(0)} fps  ·  worst frame ${hMax.toFixed(1)} ms  ·  late ${hLate} (total ${hTot})  ·  GPU ${F[GPU].toFixed(2)} ms  ·  ${W}x${Hh} (${W * 100 / DW | 0}%)  ·  haze ${FOG} m  ·  ${F[SPD].toFixed(0)} m/s  ·  ${(F[EY] - hAt(F[EX], F[EZ])).toFixed(0)} m up`; F[HUDT] = 0; hPer = hMin; hN = 0; hMax = 0; hMin = 1e9; hLate = 0; }
  }
}

// ---------------------------------------------------------------- input
let toastT = 0;
const showToast = (m) => { toast.textContent = m; toast.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => (toast.style.opacity = 0), 1500); };
const setFog = (f) => { FOG = clamp(round(f / 50) * 50, 150, 900); showToast(`Haze ${FOG} m`); };
const key = (e, v) => {
  switch (e.code) {
    case 'KeyW': case 'Space': kf = v; break; case 'KeyA': case 'ArrowLeft': kl = v; break; case 'KeyD': case 'ArrowRight': kr = v; break;
    case 'ArrowUp': ku = v; break; case 'ArrowDown': kdn = v; break; case 'KeyS': kflare = v; break; case 'ShiftLeft': case 'ShiftRight': kdive = v; break;
    default: if (v && !e.repeat) {
      if (e.code === 'KeyH') { hud = !hud; hTot = 0; hPer = 1e9; info.textContent = ''; }
      else if (e.code === 'KeyM') mute();
      else if (e.code === 'Escape') ui(true);
      else if (e.code === 'BracketLeft') setFog(FOG - 50);
      else if (e.code === 'BracketRight') setFog(FOG + 50);
      else if (e.code >= 'Digit1' && e.code <= 'Digit' + VIEWS.length) { const p = viewPose(VIEWS[e.code.charCodeAt(5) - 49]); placeEagle(p[0], p[1], p[2], atan2(p[3] - p[0], p[5] - p[2]), 18); }
    }
  }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
};
addEventListener('keydown', (e) => { if (menu && e.code !== 'KeyH' && e.code !== 'KeyM') return; sound(); key(e, 1); });
addEventListener('keyup', (e) => key(e, 0));
const release = () => { kf = kl = kr = ku = kdn = kdive = kflare = 0; };
const capture = () => { sound(); const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => canvas.requestPointerLock()).catch(() => 0); };
canvas.addEventListener('click', capture);
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } });
addEventListener('blur', release);

// ---------------------------------------------------------------- menu
let menu = true;
const bDive = $('d');
const ui = (m) => {
  if (dead) return;
  menu = m; body.className = m ? 'm' : document.pointerLockElement ? 'g p' : 'g';
  if (m) { release(); setTimeout(() => menu && bDive.focus(), 100); } else document.activeElement.blur();
};
let started = false;
const go = () => {
  sound(); ui(false); bDive.textContent = 'Resume';
  if (!started) { started = true; mode = 0; flyAt(F[FLT]); placeEagle(F[EX], F[EY], F[EZ], F[YAW], 20); }
  if (!mob) capture();
};
bDive.onclick = go;
$('q').querySelectorAll('button').forEach((b, i) => { if (i === 2 - LV) b.className = 'on'; else b.onclick = () => { keep('eagle', 2 - i); location.reload(); }; });
document.addEventListener('pointerlockchange', () => { if (started) ui(!document.pointerLockElement); });

F[FLT] = 0; flyAt(0); chase(1); snapCam = true;
await say('Ready', 1, 300);
render(); await Q.onSubmittedWorkDone();
setTimeout(keep, 15e3, 'eagleLoad', '');
ui(true);
requestAnimationFrame((t) => { F[LAST] = t; requestAnimationFrame(frame); });

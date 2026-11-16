// ============================================================================
// WGSL sources
// ============================================================================
const W_NOISE = /*wgsl*/`
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn h31(p: vec3f) -> f32 { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn h33(p: vec3f) -> vec3f { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yxx) * q.zyx); }
fn vn(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3f(1., 0., 0.)), u.x), mix(h31(i + vec3f(0., 1., 0.)), h31(i + vec3f(1., 1., 0.)), u.x), u.y),
             mix(mix(h31(i + vec3f(0., 0., 1.)), h31(i + vec3f(1., 0., 1.)), u.x), mix(h31(i + vec3f(0., 1., 1.)), h31(i + vec3f(1., 1., 1.)), u.x), u.y), u.z);
}
// 2D value noise that repeats every P cells (P whole), so the world tiles
fn ph(i: vec2f, P: f32) -> f32 { let w = i - P * floor(i / P); return h31(vec3f(w, P)); }
fn pn(p: vec2f, P: f32) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(ph(i, P), ph(i + vec2f(1., 0.), P), u.x), mix(ph(i + vec2f(0., 1.), P), ph(i + vec2f(1., 1.), P), u.x), u.y);
}
fn pf(p: vec2f, P: f32, n: i32) -> f32 { var a = .5; var s = 0.; var q = p; var pp = P; for (var i = 0; i < n; i++) { s += a * pn(q + f32(i) * 7.31, pp); q *= 2.; pp *= 2.; a *= .5; } return s / (1. - 2. * a); }
`;
// world constants shared by every shader
const f4 = (v) => v.toFixed(4);
const vec = (a) => `vec4f(${a.map(f4).join(', ')})`;
const TYP = RNAMES.map((n) => RTYPES[n]);
const W_CONST = /*wgsl*/`
const WL = ${L}.; const NT = ${NT}; const TX = ${TX}.; const YR = ${YR}.; const YT = ${YTOP}.; const DP = ${DEPTH}.; const RIM = ${RIM}.;
const K = ${L / 4096}.; // noise periods are written for a 4096 m world; K scales them to this one
const NL = ${NL};
const LW = ${wgslArr((l) => l[1] / LAYERS.reduce((s, k) => s + k[1], 0))};
const LT = ${wgslArr((l) => l[2])};
const LK = ${wgslArr((l) => l[3])};
const LC = ${wgslCol};
const RA = ${vec(RIV.map((r) => r[0]))}; const RF = ${vec(RIV.map((r) => r[1]))}; const RP = ${vec(RIV.map((r) => r[2]))};
const RA2 = ${vec(RIV2.map((r) => r[0]))}; const RF2 = ${vec(RIV2.map((r) => r[1]))}; const RP2 = ${vec(RIV2.map((r) => r[2]))};
fn riverX(z: f32) -> f32 { return WL * .5 + dot(RA, sin(6.2831853 * z / WL * RF + RP)); }
fn riverDX(z: f32) -> f32 { return dot(RA * 6.2831853 / WL * RF, cos(6.2831853 * z / WL * RF + RP)); }
fn riverX2(z: f32) -> f32 { return dot(RA2, sin(6.2831853 * z / WL * RF2 + RP2)); }
fn riverDX2(z: f32) -> f32 { return dot(RA2 * 6.2831853 / WL * RF2, cos(6.2831853 * z / WL * RF2 + RP2)); }
fn wrapd(x: f32) -> f32 { return x - WL * round(x / WL); }
fn wrap2(v: vec2f) -> vec2f { return v - WL * round(v / WL); }
fn nearB(p: vec2f) -> bool { return abs(wrapd(p.x - riverX2(p.y))) < abs(wrapd(p.x - riverX(p.y))); }
// flow direction of whichever river is nearer
fn flowDX(p: vec2f) -> f32 { return select(riverDX(p.y), riverDX2(p.y), nearB(p)); }
fn rimRise(p: vec2f) -> f32 { return RIM * ss(0., 900., wrapd(p.x - riverX(p.y))) * ss(0., 900., -wrapd(p.x - riverX2(p.y))); }
// regions along the rivers (world.js RTYPES, RSEQ)
const PA = array<vec4f, ${TYP.length}>(${TYP.map((t) => vec(t.slice(0, 4))).join(', ')});
const PB = array<vec4f, ${TYP.length}>(${TYP.map((t) => vec(t.slice(4, 8))).join(', ')});
const PC = array<vec4f, ${TYP.length}>(${TYP.map((t) => vec(t.slice(8, 12))).join(', ')});
const NRA = ${RSEQ[0].length}; const NRB = ${RSEQ[1].length};
const RZ = array<f32, ${RSEQ[0].length + RSEQ[1].length}>(${RSEQ.flat().map((r) => r[0].toFixed(1)).join(', ')});
const RT = array<i32, ${RSEQ[0].length + RSEQ[1].length}>(${RSEQ.flat().map((r) => RNAMES.indexOf(r[1])).join(', ')});
struct Reg { a: vec4f, b: vec4f, c: vec4f };
fn regAt(r: i32, z0: f32) -> Reg {
  let z = z0 - WL * floor(z0 / WL);
  let o = select(0, NRA, r == 1); let n = select(NRA, NRB, r == 1);
  var i = 0; for (var k = 1; k < n; k++) { if (z >= RZ[o + k]) { i = k; } }
  let j = (i + 1) % n; let zn = select(RZ[o + j], WL, j == 0);
  let w = ss(zn - ${RTR}., zn, z); let ti = RT[o + i]; let tj = RT[o + j];
  return Reg(mix(PA[ti], PA[tj], w), mix(PB[ti], PB[tj], w), mix(PC[ti], PC[tj], w));
}
// the waterfall's side canyon: centre line, the lip, the pools
const SIDEN = ${SIDEN};
const SIDEP = array<vec2f, ${SIDEN}>(${SIDE.map((p) => `vec2f(${p[0].toFixed(2)}, ${p[1].toFixed(2)})`).join(', ')});
const FALL_TOP = ${FALL_TOP}.; const FALL_LIP = ${FALL_LIP}.; const POOL = ${POOL}.; const POOLH = ${POOLH}; const NPOOL = ${NPOOL}.; const SIDE_LEN = ${SIDE_LEN}.;
const FALL_BASE = vec2f(${FALL_BASE[0].toFixed(2)}, ${FALL_BASE[1].toFixed(2)});
// arc length along the side canyon and distance from its centre line
fn sideQ(p: vec2f) -> vec2f {
  var best = 1e9; var bs = 0.; var acc = 0.;
  for (var i = 0; i < SIDEN - 1; i++) {
    let a = SIDEP[i]; let ab = SIDEP[i + 1] - a; let l = length(ab); let rel = wrap2(p - a);
    let t = clamp(dot(rel, ab) / (l * l), 0., 1.); let d = length(rel - ab * t);
    if (d < best) { best = d; bs = acc + t * l; }
    acc += l;
  }
  return vec2f(bs, best);
}
`;
const W_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0., 1.); }
`;

// ---------------------------------------------------------------- world generation (compute, once at load)
// Height in metres per texel. Erosion e: 0 on the plateau, 1 at the river. Its sources: distance to the nearer river
// (the main canyon, walls bent by noise into spurs and amphitheatres), side canyons (the 0.5 contour of a noise field,
// fading out away from the river) and buttes (Worley cells pushed back up). Every source is scaled by the region the
// river is passing through. Then e becomes height through the rock layers: a cliff layer climbs steeply over a narrow
// strip, a slope layer gently over a wide one. Last, the waterfall's side canyon is cut in.
const W_GEN = W_NOISE + W_CONST + /*wgsl*/`
@group(0) @binding(0) var<storage, read_write> H: array<f32>;
@group(0) @binding(1) var<uniform> row0: vec4u;
fn smax(a: f32, b: f32, k: f32) -> f32 { let h = sat(.5 + .5 * (a - b) / k); return mix(b, a, h) + k * h * (1. - h); }
fn shape(k: f32, t: f32) -> f32 {
  if (k < .5) { return ss(.12, .88, t) * .97 + t * .03; }   // cliff
  if (k < 1.5) { return pow(t, 1.8); }                       // talus slope
  if (k < 2.5) { let s = t * 3.; let i = floor(s); return (i + ss(.55, 1., s - i) * .8 + (s - i) * .2) / 3.; } // ledges
  return 0.;
}
fn terr(u: f32) -> f32 {
  var acc = 0.; var hacc = 0.;
  for (var i = 0; i < NL; i++) {
    if (u <= acc + LW[i] || i == NL - 1) {
      let t = sat((u - acc) / LW[i]);
      if (i == 0) { return -1.; }
      return hacc + shape(LK[i], t) * LT[i];
    }
    acc += LW[i]; hacc += LT[i];
  }
  return 1.;
}
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let id = vec2u(gid.x, gid.y + row0.x);
  let p = vec2f(id) * TX;
  // distance to the nearer river's centre line: coarse search along z, then refine
  var bd = 1e9; var bz = p.y; var r2 = false;
  for (var k = -60; k <= 60; k++) {
    let z = p.y + f32(k) * 40.; let dz2 = (z - p.y) * (z - p.y);
    let a = wrapd(p.x - riverX(z)); let b = wrapd(p.x - riverX2(z));
    if (a * a + dz2 < bd) { bd = a * a + dz2; bz = z; r2 = false; }
    if (b * b + dz2 < bd) { bd = b * b + dz2; bz = z; r2 = true; }
  }
  let z0 = bz;
  for (var k = -20; k <= 20; k++) {
    let z = z0 + f32(k) * 2.; let dx = select(wrapd(p.x - riverX(z)), wrapd(p.x - riverX2(z)), r2);
    let d = dx * dx + (z - p.y) * (z - p.y); if (d < bd) { bd = d; bz = z; }
  }
  let rg = regAt(select(0, 1, r2), bz);
  let d = max(sqrt(bd) - rg.c.y, 0.);
  let q = p / 4096.; let qo = q + select(vec2f(0.), vec2f(.37, .61), r2);
  let halfW = rg.a.x * (1. + .2 * sin(6.2831853 * bz / 4096. * 3. + 1.1 + select(0., 2.3, r2)) + .19 * (pf(q * 3., 3. * K, 2) - .5));
  // main canyon: spurs and amphitheatres from low-frequency noise along the walls
  var t = d / halfW;
  t *= 1. + rg.a.y * (.55 * (pf(q * 10., 10. * K, 3) - .5) + .30 * (pf(q * 26., 26. * K, 3) - .5));
  t += .06 * rg.a.y * (pf(q * 90., 90. * K, 2) - .5);
  // buttresses and joints: metre-scale ins and outs along every wall, so cliffs are not smooth sheets
  t += 9. * (1. - .7 * rg.c.z) / halfW * (pf(q * vec2f(520., 520.) + vec2f(pn(q * 60., 60. * K) * 2.), 520. * K, 2) - .5);
  var e = sat(1. - t);
  // gullies: narrow side canyons every few hundred metres that bite into the walls
  let gq = q * 22. + vec2f(pf(q * 30., 30. * K, 2), pf(q * 30. + 3.3, 30. * K, 2)) * .6;
  let gn = pf(gq, 22. * K, 2);
  let ge = sat(1. - abs(gn - .5) / .045) * ss(1.25, .55, t) * ss(.0, .25, t) * .55 * rg.a.z;
  e = max(e, ge * (1. - t * .35));
  // side canyons: the 0.5 contour of a noise field, wide and deep near the river, gone 1.5 half-widths beyond the rim
  let n = pf(q * 7. + .37, 7. * K, 3);
  let dn = d / halfW;
  let w = mix(.075, .03, sat((dn - .6) / 1.6));
  let tri = sat(1. - abs(n - .5) / w);
  let te = pow(tri, .75) * ss(2.6, .9, dn) * mix(.82, .32, sat((dn - .5) / 1.8)) * rg.a.w;
  e = smax(e, te, .06);
  // buttes and temples: some Worley cells inside the canyon rise back up, to different layers
  // (cells warped hard and stretched, so the buttes come out as ragged fins and temples rather than discs)
  let CN = 13. * K;
  let c = q * 13. + (vec2f(pf(q * 24., 24. * K, 3), pf(q * 24. + 5.1, 24. * K, 3)) - .5) * 1.1; let ci = floor(c); var bdist = 9.; var bh = 0.;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let o = vec2f(f32(x), f32(y)); let cc = ci + o; let cw = cc - CN * floor(cc / CN);
    let hh = h33(vec3f(cw, 5.)); let dv = o + .2 + hh.xy * .6 - fract(c);
    let an = hh.x * 6.28; let el = vec2f(dot(dv, vec2f(cos(an), sin(an))), dot(dv, vec2f(-sin(an), cos(an))) * 1.8);
    let r = length(el);
    if (hh.z > rg.b.x && r < bdist) { bdist = r; bh = (hh.z - rg.b.x) / (1. - rg.b.x); }
  } }
  // (in the basin they spread wider, so the layers step back into tiered temples instead of standing as spikes)
  let br = mix(.42, .56, rg.c.w);
  let bump = ss(br, mix(br - .08, br * .25, rg.c.w), bdist + .2 * (pf(q * 50., 50. * K, 3) - .5)) * ss(.12, .4, e) * ss(.97, .8, e);
  e = mix(e, e * (1. - mix(rg.b.y, rg.b.z, bh)), bump);
  // the inner gorge squeezed narrower (rg.b.w > 1), the walls above it stretched to fill
  var u = 1. - e;
  let uA = LW[0] + LW[1] + LW[2]; let sq = rg.b.w;
  if (u < uA / sq) { u = u * sq; } else { u = uA + (u - uA / sq) * (1. - uA) / (1. - uA / sq); }
  var h = terr(u);
  let R = rimRise(p);
  var y = YR + h * (DP + R);
  if (h < 0.) {
    // the river and its banks: sandy beaches, then the bed
    let tl = sat(u / LW[0]);
    y = YR + mix(-7., -.4, ss(.32, .5, tl)) + 4.4 * pow(ss(.5, 1., tl), 1.3);
    // boulders in the rapids: rounded rocks breaking the surface, more where the rapids are strong
    if (rg.c.x > .5) {
      // (big, low domes: anything narrower than a few texels would come out as a spike on the 2 m mesh)
      let bc = p / 16.; let bi = floor(bc); var bt = -9.;
      for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) {
        let cc = bi + vec2f(f32(i), f32(j)); let cw = cc - WL / 16. * floor(cc / (WL / 16.));
        let hh = h33(vec3f(cw, 17.));
        if (hh.z > 1. - .45 * rg.c.x) {
          let r = 3.5 + 3. * hh.x; let dd = length(bc - cc - .5 - (hh.xy - .5) * .4) * 16.;
          bt = max(bt, YR - 1.4 + (2.6 + 1.6 * hh.y) * pow(sat(1. - dd * dd / (r * r)), .6) - 9. * step(r, dd));
        }
      } }
      if (tl < .4) { y = max(y, bt); }
    }
  }
  // plateau undulation and rubble
  y += 7. * (pf(qo * 12., 12. * K, 3) - .5) * ss(.93, 1., u);
  y += 2.2 * (pf(q * 300., 300. * K, 2) - .5) * ss(.0, .3, u);
  // the high rim rolls more
  y += 14. * (pf(q * 5., 5. * K, 2) - .5) * ss(.95, 1., u) * R / RIM;
  // the waterfall's side canyon: a cove cut down to the river, then a hanging floor of travertine pools stepping up
  let sqd = sideQ(p);
  if (sqd.y < 200.) {
    let s = sqd.x; let ds = sqd.y;
    let wf = 7. + 2. * (pn(q * 400., 400. * K) - .5);
    let ww = 55. * (1. + .35 * (pf(q * 40., 40. * K, 2) - .5));
    let x = (ds - wf) / ww;
    let prof = sat(.62 * ss(0., .18, x) + .38 * ss(.45, .78, x) + .02 * x);
    var fl = YR - 3.;
    if (s >= FALL_LIP) {
      let i = min(floor((s - FALL_LIP) / POOL), NPOOL - 1.); let si = FALL_LIP + i * POOL; let wl = FALL_TOP + i * POOLH;
      fl = wl - 1.4 + .9 * ss(0., wf, ds) + 1.2 * ss(si + 3., si, s);
      let se = FALL_LIP + NPOOL * POOL; if (s > se) { fl = FALL_TOP + (NPOOL - 1.) * POOLH + .3 + (s - se) * .7; }
    }
    let fade = ss(SIDE_LEN, SIDE_LEN - 120., s);
    var yn = min(y, fl + (y - fl) * prof);
    if (s >= FALL_LIP && ds < wf + 3.) { yn = max(yn, fl + max(ds - wf, 0.) * 3.); } // the hanging floor never dips into the main canyon
    y = mix(y, yn, fade);
  }
  H[id.x + id.y * u32(NT)] = y;
}
`;
// isolated pinnacles: a point more than 20 m above everything 24-40 m around it is cut down (noise alone makes thin
// cones that read as broken geometry; buttes, fins and walls are wider than the ring, so they keep their height)
const W_DESPIKE = W_NOISE + W_CONST + /*wgsl*/`
@group(0) @binding(0) var<storage, read> Hi: array<f32>;
@group(0) @binding(1) var<storage, read_write> Ho: array<f32>;
fn at(x: i32, y: i32) -> f32 { let n = NT; return Hi[u32((x % n + n) % n) + u32((y % n + n) % n) * u32(n)]; }
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y); let h = at(x, y);
  var m = -1e9;
  for (var k = 0; k < 12; k++) {
    let a = f32(k) * .5236; let c = vec2f(cos(a), sin(a));
    m = max(m, at(x + i32(round(c.x * 12.)), y + i32(round(c.y * 12.))));
    m = max(m, at(x + i32(round(c.x * 20.)), y + i32(round(c.y * 20.))));
  }
  Ho[id.x + id.y * u32(NT)] = min(h, m + 20.);
}
`;
// height mips: a 3x3 tent around texel 2i, so mip texel i sits exactly over base texel i * 2^k
// (MX = 1: the highest of the 3x3 instead, a conservative chain for the shadow march, so thin ridges still block)
const W_MIP = /*wgsl*/`
override MX: f32 = 0.;
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<r32float, write>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(textureDimensions(src).x); let c = vec2i(id.xy) * 2; var s = 0.; var m = -1e9;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let w = f32((2 - abs(x)) * (2 - abs(y))); let h = textureLoad(src, (c + vec2i(x, y) + n) % n, 0).r;
    s += w * h; m = max(m, h);
  } }
  textureStore(dst, vec2i(id.xy), vec4f(select(s / 16., m, MX > .5), 0., 0., 0.));
}
`;
// bake (half resolution): r = shadow height (a point at this x, z is in sunlight above it), g = sky visibility,
// b = how much the high rim has risen here (0-1), a = travertine around the waterfall's pools
const W_BAKE = W_NOISE + W_CONST + /*wgsl*/`
@group(0) @binding(0) var tH: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> sun: vec4f;
@group(0) @binding(3) var tM: texture_2d<f32>;
fn hm(m: i32, p: vec2f) -> f32 { // bilinear height from the max chain (tM level m - 1 is height mip m)
  let n = NT >> u32(m); let s = TX * f32(1 << u32(m)); let c = p / s; let i = vec2i(floor(c)); let f = c - floor(c);
  let a = textureLoad(tM, (i + n) % n, m - 1).r; let b = textureLoad(tM, (i + vec2i(1, 0) + n) % n, m - 1).r;
  let cc = textureLoad(tM, (i + vec2i(0, 1) + n) % n, m - 1).r; let d = textureLoad(tM, (i + vec2i(1, 1) + n) % n, m - 1).r;
  return mix(mix(a, b, f.x), mix(cc, d, f.x), f.y);
}
fn hl(m: i32, p: vec2f) -> f32 { // bilinear height at world xz from mip m
  let n = NT >> u32(m); let s = TX * f32(1 << u32(m)); let c = p / s; let i = vec2i(floor(c)); let f = c - floor(c);
  let a = textureLoad(tH, (i + n) % n, m).r; let b = textureLoad(tH, (i + vec2i(1, 0) + n) % n, m).r;
  let cc = textureLoad(tH, (i + vec2i(0, 1) + n) % n, m).r; let d = textureLoad(tH, (i + vec2i(1, 1) + n) % n, m).r;
  return mix(mix(a, b, f.x), mix(cc, d, f.x), f.y);
}
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let p = vec2f(id.xy) * TX * 2.;
  let hc = hl(0, p);
  // sun: march toward the sun, coarser mips further out; the highest line toward the sun is
  // max over t of h(p + sd t) - t rise; stop once nothing further can beat it
  let sd = normalize(sun.xz); let rise = sun.y / length(sun.xz);
  var t = 1.5; var hs = -1e4;
  for (var k = 0; k < 240; k++) {
    let m = i32(clamp(log2(t / 40.), 0., 4.));
    var ht = 0.;
    if (m == 0) { ht = hl(0, p + sd * t); } else { ht = hm(m, p + sd * t); }
    hs = max(hs, ht - t * rise);
    if ((YT + RIM + 20.) - t * rise < hs || t > 2800.) { break; }
    t += min(t * .035 + 1.5, f32(4 << u32(m)));
  }
  // sky: horizon height in 12 directions, out to 500 m
  var occ = 0.;
  for (var j = 0; j < 12; j++) {
    let a = f32(j) * .5236 + .2; let dv = vec2f(cos(a), sin(a)); var mx = 0.; var r = 3.;
    for (var k = 0; k < 14; k++) { let m = i32(clamp(log2(r / 50.), 0., 3.)); mx = max(mx, (hl(m, p + dv * r) - hc) / r); r = r * 1.45 + 2.; }
    occ += mx / sqrt(1. + mx * mx);
  }
  let sky = sat(1. - occ / 12. * 1.1);
  let sq = sideQ(p);
  let trav = ss(22., 8., sq.y) * ss(FALL_LIP - 14., FALL_LIP - 4., sq.x) * ss(FALL_LIP + NPOOL * POOL + 30., FALL_LIP + NPOOL * POOL, sq.x);
  textureStore(dst, vec2i(id.xy), vec4f(hs, sky, rimRise(p) / RIM, trav));
}
`;
// ground normals, one render pass per mip level (rg8unorm: x, z of the normal * 0.5 + 0.5), each level from the
// same level of the heights, so far and steep ground can read a smoother normal with one filtered sample
const W_NORM = W_NOISE + W_CONST + W_FS + /*wgsl*/`
@group(0) @binding(0) var tH: texture_2d<f32>;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let i = vec2i(fc.xy); let n = i32(textureDimensions(tH).x); let sp = TX * f32(NT / n);
  let hx = textureLoad(tH, vec2i((i.x + 1) % n, i.y), 0).r - textureLoad(tH, vec2i((i.x - 1 + n) % n, i.y), 0).r;
  let hz = textureLoad(tH, vec2i(i.x, (i.y + 1) % n), 0).r - textureLoad(tH, vec2i(i.x, (i.y - 1 + n) % n), 0).r;
  let nr = normalize(vec3f(-hx, 2. * sp, -hz));
  return vec4f(nr.x * .5 + .5, nr.z * .5 + .5, 0., 1.);
}
`;
// tree shadows baked into the ground once: a soft ellipse per tree, stretched away from the low sun
const W_TSH = W_NOISE + W_CONST + /*wgsl*/`
@group(0) @binding(0) var<storage, read> T: array<vec4f>;
@group(0) @binding(1) var<uniform> sun: vec4f;
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) k: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let t = ii / 9u; let o = vec2f(f32(ii % 3u) - 1., f32((ii / 3u) % 3u) - 1.) * WL;
  let a = T[t * 2u]; let b = T[t * 2u + 1u];
  let pine = b.w > 3.5;
  let hgt = select(3.0, 19., pine) * a.w * b.y; let wid = select(2.0, 3.6, pine) * a.w + 1.;
  let sd = -normalize(sun.xz); let rise = sun.y / length(sun.xz);
  let len = hgt * .95 / rise; let ctr = a.xz + o + sd * (len * .5 - wid * .4);
  let c = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2. - 1.;
  let w = ctr + sd * c.y * len * .5 + vec2f(-sd.y, sd.x) * c.x * wid;
  var out: VO; out.cp = vec4f(w.x / WL * 2. - 1., 1. - w.y / WL * 2., 0., 1.); out.uv = c;
  out.k = select(select(.6, .35, b.w > 1.5 && b.w < 3.5), .55, pine);
  return out;
}
@fragment fn fs(i: VO) -> @location(0) vec4f { let r = dot(i.uv, i.uv); return vec4f(1. - i.k * (1. - r) * step(r, 1.), 0., 0., 1.); }
`;

// ---------------------------------------------------------------- shared by the scene shaders
const S_G = /*wgsl*/`
struct G { vp: mat4x4f, cam: vec4f, sun: vec4f, fogp: vec4f, res: vec4f, rt: vec4f, upv: vec4f, fw: vec4f,
  ep: vec4f, er: vec4f, eu: vec4f, ef: vec4f, mis: vec4f, lvl: array<vec4f, 6> };
`;
const S_B = W_NOISE + W_CONST + S_G + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sR: sampler;
@group(0) @binding(2) var tH: texture_2d<f32>;
@group(0) @binding(3) var tB: texture_2d<f32>;
@group(0) @binding(4) var tT: texture_2d<f32>;
@group(0) @binding(5) var tN: texture_2d<f32>;
const SUNC = vec3f(1., .66, .40) * 3.4;
const KD = 1.;
fn Fg(y: f32) -> f32 { if (y >= YT) { return 0.; } if (y >= YT - DP) { let q = YT - y; return -q * q / (2. * DP); } return y - (YT - DP) - DP * .5; }
// optical depth from c to p: density a above the rim, rising linearly to a * (1 + KD) at the river
fn odepth(c: vec3f, p: vec3f) -> f32 {
  let l = length(p - c); let dy = p.y - c.y;
  var avg = sat((YT - (c.y + p.y) * .5) / DP);
  if (abs(dy) > .5) { avg = (Fg(p.y) - Fg(c.y)) / dy; }
  // a power of the distance rather than plain exponential fog: near air stays clear, the far air closes in
  // thinner than FOG at rim height, twice as thick at the river
  let de = l * (.72 + KD * (1. - .8 * g.mis.y) * avg) * (1. - .2 * g.mis.y) / g.fogp.x;
  // clear for the first third of the distance, then closing in: 2.8 (6% left) at FOG
  return 2.8 * pow(max(de - .12, 0.) / .88, 1.35);
}
// colour of the desert air seen along v: warm dusty air, tan-rose away from the sun, peach-gold toward it, a touch of
// blue only overhead; warmer and dustier low in the canyon
fn haze(v: vec3f, low: f32) -> vec3f {
  let mu = dot(v, g.sun.xyz);
  var c = mix(vec3f(.50, .42, .34), vec3f(.56, .41, .29), .25 + low * .55);
  c += vec3f(.80, .48, .22) * (pow(sat(mu * .5 + .5), 4.) * .45 + pow(sat(mu), 10.) * .35 + pow(sat(mu), 64.) * .8);
  c *= .92 + .12 * v.y;
  return c;
}
fn atm(col: vec3f, p: vec3f) -> vec3f {
  let v = p - g.cam.xyz; let d = length(v); let vd = v / max(d, 1e-3);
  let tau = odepth(g.cam.xyz, p);
  let T = exp(-tau * vec3f(.97, 1., 1.06));
  let low = sat((YT - min(p.y, g.cam.y)) / DP);
  // air in the canyon's shadow scatters no sunlight: the haze there is dimmer and bluer
  let pm = mix(p, g.cam.xyz, .5);
  let shd = .5 * (sunVis(p, textureSampleLevel(tB, sR, p.xz / WL, 0.)) + sunVis(pm, textureSampleLevel(tB, sR, pm.xz / WL, 0.)));
  let hz = haze(vd, low) * mix(vec3f(.62, .55, .50), vec3f(1.), shd);
  var c = col * T + hz * (1. - T);
  // far sunlit tops would come out lighter than the air around them and read as snow: past half way into the haze,
  // nothing is brighter than the haze itself
  c = mix(c, min(c, hz * 1.02), sat((1. - T.g) * 1.6));
  return mix(c, mix(hz, haze(vd, 0.), .5), ss(g.fogp.y * .82, g.fogp.y * .98, d));
}
fn sky(v: vec3f) -> vec3f {
  let up = sat(v.y); let mu = dot(v, g.sun.xyz);
  var c = haze(v, 0.);
  let zen = vec3f(.15, .25, .45) + vec3f(.9, .45, .2) * pow(sat(mu), 6.) * .3;
  c = mix(c, zen, ss(.08, .8, up) * .8);
  c += vec3f(40., 26., 14.) * ss(.99985, .99993, mu);
  return c;
}
fn hl(m: i32, p: vec2f) -> f32 {
  let n = NT >> u32(m); let s = TX * f32(1 << u32(m)); let c = p / s; let i = vec2i(floor(c)); let f = c - floor(c);
  let a = textureLoad(tH, (i % n + n) % n, m).r; let b = textureLoad(tH, ((i + vec2i(1, 0)) % n + n) % n, m).r;
  let cc = textureLoad(tH, ((i + vec2i(0, 1)) % n + n) % n, m).r; let d = textureLoad(tH, ((i + vec2i(1, 1)) % n + n) % n, m).r;
  return mix(mix(a, b, f.x), mix(cc, d, f.x), f.y);
}
// the eagle's own soft shadow, cast along the sun onto whatever is below
fn eagleSh(p: vec3f) -> f32 {
  let v = g.ep.xyz - p; let along = dot(v, g.sun.xyz);
  let d = length(v - g.sun.xyz * along);
  return 1. - .8 * ss(1.1, .25, d) * step(0., along) * ss(140., 40., along);
}
fn bake(p: vec3f) -> vec4f { return textureSampleLevel(tB, sR, p.xz / WL, 0.); }
// sunlight at a point from the shadow height under it: decided in 3D, so cliffs, the eagle and trees all agree
// (the edge widens with distance: the shadow heights are sampled every 4 m, and a crisp edge far away breaks into teeth)
fn sunVis(p: vec3f, b: vec4f) -> f32 { let w = 2.5 + .03 * length(p - g.cam.xyz); return ss(-w, w, p.y - b.r + 1.5); }
// sky light from above, and warm light bounced off the sunlit rock all around: the more enclosed a place, the less
// sky but the more canyon wall it sees, so a deep gorge stays warm rather than going black
// The bounce comes mostly from the sunlit walls across the canyon, which lie away from the sun: faces turned that
// way catch more of it, so relief still reads in the shade.
fn lightAmb(n: vec3f, ao: f32) -> vec3f {
  let away = sat(dot(n.xz, -normalize(g.sun.xz)) * .5 + .5);
  return vec3f(.30, .38, .55) * .7 * (.55 + .45 * n.y) * (.3 + .7 * ao)
       + vec3f(.70, .36, .18) * .62 * (.7 - .3 * n.y) * (.8 + .35 * (1. - ao)) * (.75 + .8 * away * away);
}
fn fin(c: vec3f) -> vec4f { return vec4f(c, 1.); }
`;

// ---------------------------------------------------------------- rock shading, shared by the terrain and the bridge
const S_ROCK = /*wgsl*/`
// rock colour from height through the layer table (stretched where the high rim has risen), with sub-beds, desert
// varnish, soil on the flats and travertine around the waterfall's pools
fn rock(p: vec3f, n: vec3f, fw: f32, b: vec4f, rgc: vec4f) -> vec3f {
  let sand = rgc.z; let gorge = ss(.5, .95, rgc.x);
  let yy = (p.y - YR) / (DP + b.b * RIM) + (vn(vec3f(p.x * .003, 1.3, p.z * .003)) - .5) * .008;
  var acc = 0.; var i = 0; var f = 0.;
  for (; i < NL - 1; i++) { if (yy < acc + LT[i]) { break; } acc += LT[i]; }
  f = sat((yy - acc) / LT[i]);
  var c = LC[i];
  // the schist: steeply dipping foliation, lighter and darker
  if (i == 1) {
    let fol = (p.x * .55 + p.z * .83) * .045 + p.y * .02 + vn(p * vec3f(.015, .01, .015)) * 1.4;
    c *= .8 + .34 * vn(vec3f(fol * 3., p.y * .004, 1.));
  }
  // soft blend into the next layer near the top of this one
  if (i < NL - 1) { c = mix(c, LC[i + 1], ss(.86, 1., f) * .5); }
  if (i > 0) { c = mix(c, LC[i - 1], ss(.12, 0., f) * .4); }
  // thin beds within each layer: horizontal, so they read on cliffs as strata, not smears
  let bed = vn(vec3f(p.x * .002, p.y * .11, p.z * .002)) * .55 + mix(vn(vec3f(p.x * .01, p.y * .45, p.z * .01)), .5, ss(.4, 1.4, fw * .5)) * .45;
  c *= .74 + .48 * bed;
  // the gorge: grey-violet schist with dipping foliation all the way up to the Redwall
  if (gorge > .01) {
    let fol = (p.x * .55 + p.z * .83) * .045 + p.y * .02 + vn(p * vec3f(.015, .01, .015)) * 1.4;
    let sc = vec3f(.15, .16, .19) * (.6 + .6 * vn(vec3f(fol * 3., p.y * .004, 1.))) + vec3f(.10, .10, .10) * ss(.9, .97, vn(vec3f(fol * 9., p.y * .01, 4.))) * (1. - ss(.5, 1.5, fw));
    c = mix(c, sc, gorge * ss(.47, .40, yy));
  }
  // the narrows: smooth orange sandstone with long, gently curving cross-beds instead of the layer table
  if (sand > .01) {
    let xb = p.y * .09 + vn(p * vec3f(.012, .02, .012)) * 3. + vn(p * .05) * .4;
    let ss1 = vec3f(.62, .25, .10) * (.84 + .26 * vn(vec3f(xb, 1., 2.)) + .1 * sin(xb * 6.2831853));
    c = mix(c, ss1, sand * (1. - b.a));
  }
  // a little desert varnish down steep faces
  let steep = 1. - ss(.35, .8, n.y);
  let st = mix(vn(vec3f(p.x * .05, p.y * .02, p.z * .05)), .5, ss(.3, 1., fw * .08));
  c *= 1. - steep * .2 * ss(.55, .85, st);
  // red wash from the layers above stains the slopes below them
  c = mix(c, c * vec3f(1.08, .9, .82), steep * .3);
  // soil and scrub on flat ground
  let flat = ss(.72, .93, n.y);
  var soil = mix(c * 1.05, vec3f(.11, .085, .05), .4);
  if (i == NL - 1) { soil = mix(vec3f(.15, .105, .062), vec3f(.10, .09, .05), b.b); } // pine litter on the high rim
  if (i == 3) { soil = vec3f(.15, .11, .07); }
  if (i == 0) { soil = vec3f(.25, .19, .11); }
  let scrub = ss(.55, .8, mix(vn(p * vec3f(.05, .04, .05)), .3, ss(.3, .9, fw * .05))) * select(.18, .3, i == 3 || i == NL - 1);
  soil = mix(soil, soil * vec3f(.72, .74, .62), scrub);
  c = mix(c, soil, flat * .85);
  // travertine: cream-white rock where the waterfall's water runs
  return mix(c, vec3f(.50, .45, .34) * (.85 + .3 * bed), b.a * .8);
}
// lit rock at p with smooth normal n: relief by bump-mapping a noise height through screen derivatives
// (bedding ledges every 7 m, lumps and grit, faded with distance before they shimmer)
fn shadeRock(p: vec3f, n0: vec3f, b: vec4f, forceSand: f32) -> vec3f {
  // On steep faces the 2 m normal map varies only across the face, which paints vertical streaks down tall cliffs:
  // there, lean on a normal from 8 m height differences instead.
  // Far away (several metres per pixel) the same smoother normal stands in for the unfiltered 2 m map, which would alias.
  var n = n0;
  let fw = fwidth(p.y) + fwidth(p.x) * .3 + fwidth(p.z) * .3; // metres per pixel, to fade detail before it shimmers
  let stp = max((1. - ss(.45, .75, n0.y)) * .7, ss(.6, 2.5, fw));
  if (stp > .01) {
    let t2 = textureSampleLevel(tN, sR, p.xz / WL, max(2., log2(fw / TX) + 1.)).rg * 2. - 1.;
    n = normalize(mix(n0, vec3f(t2.x, sqrt(max(1. - dot(t2, t2), 0.)), t2.y), stp));
  }
  let ns = n;
  let dist = length(p - g.cam.xyz);
  var rgc = regAt(select(0, 1, nearB(p.xz)), p.z).c; rgc.z = max(rgc.z, forceSand); let sandL = rgc.z;
  let bp = abs(fract(p.y / 7. + vn(p * vec3f(.01, .03, .01)) * .5) - .5) * 2.; // a continuous triangle wave: ledges every 7 m
  let hn = vn(p * vec3f(.45, .9, .45)) * (1. - ss(.25, .7, fw)) * (1. - .6 * sandL) + vn(p * vec3f(1.6, 2.4, 1.6)) * .3 * (1. - ss(.06, .18, fw))
         + ss(.3, .7, bp) * 1.4 * (1. - ss(.75, .95, n.y)) * (1. - ss(.25, .55, fw / 7.)) * (1. - .8 * sandL)
         + vn(p * vec3f(.18, .1, .18)) * .8;
  let dpx = dpdx(p); let dpy = dpdy(p); let dhx = dpdx(hn); let dhy = dpdy(hn);
  let r1 = cross(dpy, n); let r2 = cross(n, dpx); let det = dot(dpx, r1);
  let gr = sign(det) * (dhx * r1 + dhy * r2);
  n = normalize(abs(det) * n - gr * .5 * ss(260., 60., dist) * (1. - .7 * sandL));
  let alb = rock(p, ns, fw, b, rgc); // colour from the smooth normal: soil and rock do not flicker with the bumps
  // (tree shadows are baked flat onto the ground: keep them off steep faces, where they would smear)
  let sh = sunVis(p, b) * mix(1., textureSampleLevel(tT, sR, p.xz / WL, 0.).r, ss(.55, .8, n0.y)) * eagleSh(p);
  let ndl = sat(dot(n, g.sun.xyz));
  var c = alb * (SUNC * ndl * sh + lightAmb(n, b.g));
  // cavities under ledges and between lumps hold less light
  c *= .88 + .16 * sat(hn / 2.4);
  // wet sand at the waterline
  c *= 1. - .35 * ss(YR + .8, YR + .1, p.y);
  return c;
}
`;

// ---------------------------------------------------------------- terrain (geometry clipmap)
// Level k is an N x N grid of cells 2^(k+1) m wide centred on the camera. A cell covered by level k-1 or beyond the
// haze cut collapses to nothing; near its outer edge a level morphs into the next coarser one so the seams close.
// Each cell is split along whichever diagonal follows the rock better, so cliff edges do not come out as saw teeth.
const W_TERRAIN = S_B + S_ROCK + /*wgsl*/`
override N: f32 = 160.;
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) @interpolate(flat) lv: f32 };
fn hv(k: i32, p: vec2f, mo: f32) -> f32 { return mix(hl(k, p), hl(k + 1, p), mo); }
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ki: u32) -> VO {
  var o: VO;
  let k = i32(ki); let L0 = g.lvl[k]; let s = L0.z; let org = L0.xy;
  let cell = vi / 6u; let cr = vi % 6u;
  let ci = vec2f(f32(cell % u32(N)), f32(cell / u32(N)));
  let cmin = org + ci * s; let cmax = cmin + s;
  // the diagonal: the one across which the height changes less
  let n = NT >> u32(k); let ic = vec2i(round(cmin / s));
  let h00 = textureLoad(tH, (ic % n + n) % n, k).r; let h11 = textureLoad(tH, ((ic + 1) % n + n) % n, k).r;
  let h10 = textureLoad(tH, ((ic + vec2i(1, 0)) % n + n) % n, k).r; let h01 = textureLoad(tH, ((ic + vec2i(0, 1)) % n + n) % n, k).r;
  var dxy = vec2f(f32(cr == 1u || cr == 2u || cr == 4u), f32(cr == 2u || cr == 4u || cr == 5u));
  if (abs(h00 - h11) > abs(h10 - h01)) { dxy = vec2f(f32(cr == 1u || cr == 3u || cr == 4u), f32(cr == 2u || cr == 4u || cr == 5u)); }
  var dead = false;
  if (k > 0) { let f = g.lvl[k - 1]; let fmax = f.xy + N * f.z; dead = all(cmin >= f.xy - .01) && all(cmax <= fmax + .01); }
  let near = max(max(cmin - g.cam.xz, g.cam.xz - cmax), vec2f(0.));
  if (dot(near, near) > g.fogp.y * g.fogp.y) { dead = true; }
  var xz = cmin + dxy * s;
  let ctr = org + N * s * .5;
  let dch = max(abs(xz.x - ctr.x), abs(xz.y - ctr.y)) / (N * s * .5);
  let mo = sat((dch - .72) / .24);
  let gi = round(xz / s);
  xz -= (gi - 2. * floor(gi * .5)) * s * mo;
  let y = hv(k, xz, mo);
  o.wp = vec3f(xz.x, y, xz.y); o.lv = f32(k);
  o.cp = select(g.vp * vec4f(o.wp, 1.), vec4f(0., 0., -1., 1.), dead);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let p = i.wp; let b = bake(p);
  let nt = textureSampleLevel(tN, sR, p.xz / WL, 0.).rg * 2. - 1.;
  let n = vec3f(nt.x, sqrt(max(1. - dot(nt, nt), 0.)), nt.y);
  var c = shadeRock(p, n, b, 0.);
  // Far away the mesh cells (8-32 m) are coarser than the river, so the water plane would show as steps: there the
  // ground itself turns to water wherever the full-resolution height is under the surface.
  if (i.lv > .5) {
    let hb = hl(0, p.xz);
    let wet = ss(YR + .4, YR - .4, hb) * ss(.5, 1.5, i.lv);
    if (wet > .001) {
      let V = normalize(g.cam.xyz - p); let R = reflect(-V, vec3f(0., 1., 0.));
      let fr = .02 + .98 * pow(1. - sat(V.y), 5.);
      let body = vec3f(.06, .10, .055) * (SUNC * .25 * sunVis(p, b) + lightAmb(vec3f(0., 1., 0.), b.g) * 1.2);
      c = mix(c, mix(body, sky(vec3f(R.x, abs(R.y), R.z)) * mix(.55, 1., b.g) * vec3f(.75, .9, .8), fr * .7), wet);
    }
  }
  if (g.fogp.w > 2.5) { return vec4f(rock(p, n, 1., b, vec4f(0.)) * 2., 1.); }
  if (g.fogp.w > 1.5) { return vec4f(vec3f(sunVis(p, b), sat(dot(n, g.sun.xyz)), b.g), 1.); }
  if (g.fogp.w > .5) { return vec4f(vec3f(f32(i.lv == 0.), f32(i.lv == 1.), f32(i.lv == 2.)) * (.3 + .7 * sat(dot(n, g.sun.xyz))) + f32(i.lv == 3.) * .5, 1.); }
  return fin(atm(c, p));
}
`;

// ---------------------------------------------------------------- the stone bridge (a mesh, lit as rock)
const W_ROCKM = S_B + S_ROCK + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) col: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f };
@vertex fn vs(i: VI) -> VO {
  var o: VO; let w = vec3f(g.cam.x + wrapd(i.p.x - g.cam.x), i.p.y, g.cam.z + wrapd(i.p.z - g.cam.z));
  o.wp = w; o.n = i.n.xyz; o.cp = g.vp * vec4f(w, 1.); return o;
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(i.n); if (!ff) { n = -n; }
  // shadow height averaged over 12 m (the 4 m samples would cut a jagged edge across the arch), and the underside,
  // which the arch shades itself, kept out of the sun
  var b = bake(i.wp);
  let o = 6. / WL; let uv = i.wp.xz / WL;
  b.r = (b.r + textureSampleLevel(tB, sR, uv + vec2f(o, 0.), 0.).r + textureSampleLevel(tB, sR, uv - vec2f(o, 0.), 0.).r
       + textureSampleLevel(tB, sR, uv + vec2f(0., o), 0.).r + textureSampleLevel(tB, sR, uv - vec2f(0., o), 0.).r) * .2;
  b.r = select(b.r, 1e4, n.y < -.35);
  b.g = .15 + .85 * sat(n.y * .5 + .5); b.a = 0.;
  return fin(atm(shadeRock(i.wp, n, b, 1.), i.wp));
}
`;

// ---------------------------------------------------------------- the waterfall and its pools
const W_FALL = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) col: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec4f, @location(3) u: f32 };
@vertex fn vs(i: VI) -> VO {
  var o: VO; let w = vec3f(g.cam.x + wrapd(i.p.x - g.cam.x), i.p.y, g.cam.z + wrapd(i.p.z - g.cam.z));
  o.wp = w; o.n = i.n.xyz; o.col = i.col; o.u = i.n.w; o.cp = g.vp * vec4f(w, 1.); return o;
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let p = i.wp; let t = g.cam.w; let b = bake(p); let sh = sunVis(p, b) * eagleSh(p);
  let fl = normalize(i.col.rg * 2. - 1.);
  var c: vec3f; var a = 1.;
  if (i.col.b > .5 && i.col.b < .8) {
    // spray rising where the fall hits the river: a broken veil, densest low down
    let h = i.col.a;
    let m1 = vn(vec3f(p.x * .35, p.y * .25 - t * 1.6, p.z * .35)) * .65 + vn(vec3f(p.x * 1.1, p.y * .8 - t * 2.4, p.z * 1.1)) * .35;
    let face = abs(dot(normalize(i.n), normalize(g.cam.xyz - p)));
    a = ss(.5, .8, m1 + .3 - h * .5) * ss(1., .3, h) * face * face * .8;
    c = vec3f(.78, .80, .80) * (SUNC * .45 * sh + lightAmb(vec3f(0., 1., 0.), b.g) * 1.5);
    return vec4f(atm(c, p), a);
  }
  if (i.col.b < .5) {
    // falling water: streaks racing down, thinner and broken at the edges
    let along = dot(p.xz, vec2f(-fl.y, fl.x));
    let s1 = vn(vec3f(along * 1.3, (p.y + t * 9.) * .09, 1.)); let s2 = vn(vec3f(along * 4.1, (p.y + t * 12.) * .3, 2.));
    let s3 = vn(vec3f(along * 9., (p.y + t * 14.) * .9, 3.));
    let dens = s1 * .5 + s2 * .35 + s3 * .15;
    a = ss(.3, .5, dens + .32 - abs(i.u) * .35);
    var n = normalize(i.n); if (!ff) { n = -n; }
    let white = vec3f(.80, .84, .84) * (.75 + .5 * s2);
    c = white * (SUNC * (.35 + .4 * sat(dot(n, g.sun.xyz))) * sh + lightAmb(n, b.g) * 1.4);
    c = mix(c, vec3f(.10, .24, .22) * (SUNC * .3 * sh + lightAmb(n, b.g)), ss(.6, .3, dens) * .5);
  } else {
    // a travertine pool: clear blue-green water over pale rock, drifting toward the fall
    let q = p.xz - fl * t * .9;
    let n0 = vn(vec3f(q * .5, t * .4)) + vn(vec3f(q * 1.7, t * .7)) * .4;
    let nx = vn(vec3f((q + vec2f(.4, 0.)) * .5, t * .4)) + vn(vec3f((q + vec2f(.4, 0.)) * 1.7, t * .7)) * .4;
    let nz = vn(vec3f((q + vec2f(0., .4)) * .5, t * .4)) + vn(vec3f((q + vec2f(0., .4)) * 1.7, t * .7)) * .4;
    let n = normalize(vec3f((n0 - nx) * .7, 1., (n0 - nz) * .7));
    let V = normalize(g.cam.xyz - p); let R = reflect(-V, n);
    let fr = .02 + .98 * pow(1. - sat(dot(n, V)), 5.);
    let body = vec3f(.05, .30, .27) * (SUNC * .35 * sh + lightAmb(vec3f(0., 1., 0.), b.g) * 1.3);
    var refl = sky(vec3f(R.x, abs(R.y), R.z)) * mix(.45, 1., b.g);
    refl += SUNC * 5. * pow(sat(dot(R, g.sun.xyz)), 300.) * sh;
    c = mix(body, refl, fr * .7);
    let foam = ss(.62, .8, vn(vec3f(q * .9, t * .8))) * .35;
    c = mix(c, vec3f(.8, .82, .8) * (SUNC * .35 * sh + lightAmb(vec3f(0., 1., 0.), b.g) * 1.3), foam);
  }
  return vec4f(atm(c, p), a);
}
`;

// ---------------------------------------------------------------- the rivers
const W_RIVER = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var o: VO; let c = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2. - 1.;
  let w = g.cam.xz + c * g.fogp.y; o.wp = vec3f(w.x, YR, w.y); o.cp = g.vp * vec4f(o.wp, 1.); return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let p = i.wp; let t = g.cam.w;
  let hb = hl(0, p.xz);
  if (hb > YR + .05) { discard; } // where the coarse far mesh dips below the water, keep the true shoreline
  let depth = max(YR - hb, 0.);
  let rb = nearB(p.xz);
  let rp = regAt(select(0, 1, rb), p.z).c.x; // how wild the river is here
  let fl = normalize(vec2f(select(riverDX(p.z), riverDX2(p.z), rb), 1.));
  let q = p.xz - fl * t * mix(2.2, 4.5, rp);
  let e = .6;
  let n0 = vn(vec3f(q * .25, t * .3)) + vn(vec3f(q * .9, t * .6)) * .4;
  let nx = vn(vec3f((q + vec2f(e, 0.)) * .25, t * .3)) + vn(vec3f((q + vec2f(e, 0.)) * .9, t * .6)) * .4;
  let nz = vn(vec3f((q + vec2f(0., e)) * .25, t * .3)) + vn(vec3f((q + vec2f(0., e)) * .9, t * .6)) * .4;
  let n = normalize(vec3f((n0 - nx) * (.9 + .4 * rp), 1., (n0 - nz) * (.9 + .4 * rp)));
  let V = normalize(g.cam.xyz - p); let R = reflect(-V, n);
  let fr = .02 + .98 * pow(1. - sat(dot(n, V)), 5.);
  let b = bake(p); let sh = sunVis(p, b) * eagleSh(p);
  var refl = sky(vec3f(R.x, abs(R.y), R.z)) * mix(.55, 1., b.g) * vec3f(.75, .9, .8);
  refl += SUNC * 6. * pow(sat(dot(R, g.sun.xyz)), 300.) * sh;
  let body = vec3f(.06, .10, .055) * (SUNC * .25 * sh + lightAmb(vec3f(0., 1., 0.), b.g) * 1.2);
  let sand = vec3f(.30, .24, .16) * (SUNC * .4 * sh + lightAmb(vec3f(0., 1., 0.), b.g));
  var c = mix(sand, body, ss(.0, 1.8, depth));
  c = mix(c, refl, fr * .7);
  // rapids (standing waves downstream of the boulders), the foam line at the banks and around rocks, and the
  // churned water under the waterfall
  let along = dot(p.xz, fl); let across = dot(p.xz, vec2f(-fl.y, fl.x));
  let streak = vn(vec3f(across * .35, (along - t * 5.) * .06, t * .2)) * .6 + vn(vec3f(across * 1.1, (along - t * 6.) * .2, 1.)) * .4;
  let rap = max(ss(.68 - .2 * rp, .8 - .2 * rp, vn(vec3f(q * vec2f(.06, .03), t * .05))) * (.4 + .6 * rp),
                ss(.75, .55, depth / 3.) * ss(.45, .7, streak) * rp) * ss(.3, 1.5, depth);
  let fd = length(wrap2(p.xz - FALL_BASE));
  let plunge = ss(26., 4., fd) * (.55 + .45 * vn(vec3f(q * .7, t * 2.)));
  let foam = max(max(ss(.6, .1, depth) * .6 * ss(450., 120., length(p - g.cam.xyz)), rap * ss(.5, .75, vn(vec3f(q * 1.3, t * 1.5)))), plunge);
  c = mix(c, vec3f(.85, .85, .8) * (SUNC * .35 * sh + lightAmb(vec3f(0., 1., 0.), b.g) * 1.3), foam * .75);
  return fin(atm(c, p));
}
`;

// ---------------------------------------------------------------- trees and bushes
const W_TREE = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) col: vec4f, @location(3) a: vec4f, @location(4) b: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec3f, @location(3) h: f32, @location(4) base: vec3f };
@vertex fn vs(i: VI) -> VO {
  var o: VO;
  var rel = i.a.xz - g.cam.xz; rel -= WL * round(rel / WL);
  let base = vec3f(g.cam.x + rel.x, i.a.y, g.cam.z + rel.y);
  let cy = cos(i.b.x); let sy = sin(i.b.x);
  var lp = i.p * vec3f(i.a.w, i.a.w * i.b.y, i.a.w);
  let k = i.b.w; let tn = i.b.z; let pine = k > 3.5;
  lp.x += sin(g.cam.w * 1.3 + tn * 30.) * select(.04, .006, pine) * lp.y;
  let w = base + vec3f(cy * lp.x - sy * lp.z, lp.y, sy * lp.x + cy * lp.z);
  o.wp = w; o.base = base;
  o.n = vec3f(cy * i.n.x - sy * i.n.z, i.n.y, sy * i.n.x + cy * i.n.z);
  var leaf = vec3f(.022, .036, .016);
  if (k > .5) { leaf = vec3f(.030, .042, .034); }
  if (k > 1.5) { leaf = vec3f(.085, .080, .055); }
  if (k > 2.5) { leaf = vec3f(.045, .075, .028); }
  if (pine) { leaf = vec3f(.034, .056, .018); }
  leaf *= .8 + .4 * tn;
  o.col = select(pow(i.col.rgb, vec3f(2.2)), leaf, i.col.g > i.col.r);
  o.h = i.p.y / select(3., 21., pine);
  o.cp = g.vp * vec4f(w, 1.);
  return o;
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(i.n); if (!ff) { n = -n; }
  let b = bake(i.wp);
  let sh = sunVis(i.wp, b) * eagleSh(i.wp);
  let lit = sat(dot(n, g.sun.xyz) * .6 + .4);
  let ao = (.45 + .55 * sat(i.h)) * b.g;
  var c = i.col * (SUNC * lit * sh * (.5 + .5 * sat(i.h * 1.4)) + lightAmb(n, ao) * 1.2);
  return fin(atm(c, i.wp));
}
`;

// ---------------------------------------------------------------- the eagle
const W_EAGLE = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) col: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec4f, @location(3) lp: vec3f };
fn rotz(v: vec3f, a: f32, piv: vec3f) -> vec3f { let c = cos(a); let s = sin(a); let q = v - piv; return piv + vec3f(c * q.x - s * q.y, s * q.x + c * q.y, q.z); }
fn rotzn(v: vec3f, a: f32) -> vec3f { let c = cos(a); let s = sin(a); return vec3f(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }
struct Pose { pos: vec3f, r: vec3f, u: vec3f, f: vec3f, ph: f32, amp: f32, fold: f32, dih: f32, sc: f32 };
fn wings(i: VI, e: Pose) -> VO {
  var o: VO;
  let sp = i.n.w; let side = sign(sp); let a = abs(sp);
  var p = i.p; var n = i.n.xyz;
  let ph = e.ph; let amp = e.amp; let fold = e.fold; let dih = e.dih;
  if (a > .001) {
    // fold for a dive: wings pulled in and swept back
    p.x *= 1. - .42 * fold * ss(.1, .9, a);
    p.z -= fold * .45 * a * a;
    p.y += fold * .05 * a;
    // shoulder flap, then the hand lags behind
    let th1 = side * (dih + amp * sin(ph));
    let wrist = vec3f(side * .6 * (1. - .42 * fold), 0., 0.);
    if (a > .54) { let th2 = side * amp * .7 * sin(ph - .9) + side * .08; p = rotz(p, th2, wrist); n = rotzn(n, th2); }
    p = rotz(p, th1, vec3f(side * .07, 0., 0.)); n = rotzn(n, th1);
  }
  // tail fans out a little when slow
  if (a < .001 && p.z < -.27) { p.x *= 1. + .35 * g.mis.z; }
  let w = e.pos + (e.r * p.x + e.u * p.y + e.f * p.z) * e.sc;
  o.wp = w; o.lp = p;
  o.n = e.r * n.x + e.u * n.y + e.f * n.z;
  o.col = i.col;
  o.cp = g.vp * vec4f(w, 1.);
  return o;
}
@vertex fn vs(i: VI) -> VO { return wings(i, Pose(g.ep.xyz, g.er.xyz, g.eu.xyz, g.ef.xyz, g.ep.w, g.er.w, g.eu.w, g.ef.w, 1.6)); }
// the birds circling in thermals: instance a = thermal centre + radius, b = lift, top, phase, bird index
struct VIB { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) col: vec4f, @location(3) a: vec4f, @location(4) b: vec4f };
@vertex fn vsB(i: VIB) -> VO {
  let k = f32(i.b.w); let t = g.cam.w * (.32 + .05 * k) + i.b.z + k * 2.1;
  var c = i.a.xyz; var rel = c.xz - g.cam.xz; rel -= WL * round(rel / WL); c = vec3f(g.cam.x + rel.x, c.y, g.cam.z + rel.y);
  let r = i.a.w * (.55 + .2 * k);
  let pos = c + vec3f(cos(t) * r, 25. + k * 38. + 4. * sin(t * .7), sin(t) * r);
  let f = normalize(vec3f(-sin(t), .02, cos(t)));
  let r0 = normalize(cross(f, vec3f(0., 1., 0.))); let u0 = cross(r0, f); let bk = .38;
  let rr = r0 * cos(bk) - u0 * sin(bk); let uu = u0 * cos(bk) + r0 * sin(bk);
  var o = wings(VI(i.p, i.n, i.col), Pose(pos, rr, uu, f, t * 3., .03, 0., .16, 1.15));
  o.col = vec4f(i.col.rgb * vec3f(.35, .3, .3), i.col.a);
  return o;
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(i.n); if (!ff) { n = -n; }
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz;
  let b = bake(i.wp);
  let sh = sunVis(i.wp, b);
  var alb = pow(i.col.rgb, vec3f(2.2));
  // feather barring: faint stripes across wing and tail
  if (i.col.a > .1 && i.col.a < 1.5) { alb *= .85 + .3 * vn(vec3f(i.lp.x * 30., i.lp.z * 9., 1.)); }
  let ndl = sat(dot(n, L));
  var c = alb * (SUNC * (ndl * .85 + .15) * sh + lightAmb(n, 1.) * 1.3);
  c += SUNC * sh * pow(sat(dot(n, normalize(V + L))), select(14., 60., i.col.a > 1.5)) * select(.06, .5, i.col.a > 1.5);
  // the low sun shining through the wing feathers from behind
  c += alb * SUNC * .4 * pow(sat(dot(-V, L)), 4.) * sh * step(.001, abs(i.lp.x) - .1);
  return fin(atm(c, i.wp));
}
`;

// ---------------------------------------------------------------- sky (drawn last, only where nothing else is)
const W_SKY = S_B + /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0., 1.); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy * g.res.zw * 2. - 1.;
  let v = normalize(g.fw.xyz + g.rt.xyz * uv.x - g.upv.xyz * uv.y);
  return vec4f(sky(v), 1.);
}
`;

// ---------------------------------------------------------------- blit / bloom chain (from Abyssal Garden)
const W_BLIT = W_FS + /*wgsl*/`
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
fn uvOf(fc: vec4f, k: f32) -> vec2f { return fc.xy * k / vec2f(textureDimensions(t)); }
fn kar(c: vec3f) -> vec4f { let w = 1. / (1. + max(c.r, max(c.g, c.b))); return vec4f(c * w, w); }
@fragment fn fsDown0(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  let a = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.).rgb, vec3f(24.)));
  let b = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.).rgb, vec3f(24.)));
  let c = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.).rgb, vec3f(24.)));
  let d = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.).rgb, vec3f(24.)));
  let m = a + b + c + d;
  return vec4f(max(m.rgb / m.a - vec3f(.9), vec3f(0.)), 1.);
}
@fragment fn fsDown(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
@fragment fn fsUp(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, .5); let e = .75 / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
`;
// ---------------------------------------------------------------- final image: bloom, tone map, grade, vignette
const W_POST = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sC: sampler;
@group(0) @binding(2) var tS: texture_2d<f32>;
@group(0) @binding(3) var tBl: texture_2d<f32>;
fn sat3(x: vec3f) -> vec3f { return clamp(x, vec3f(0.), vec3f(1.)); }
fn tmap(x: vec3f) -> vec3f { return sat3((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14)); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(.06711056, .00583715)))); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy * g.res.zw;
  var c = textureLoad(tS, vec2i(fc.xy), 0).rgb;
  let bl = textureSampleLevel(tBl, sC, uv, 0.).rgb;
  c += bl * .35;
  c *= g.mis.x;
  let q = uv - .5;
  c *= 1. - dot(q, q) * .45;
  c = tmap(c);
  let l = dot(c, vec3f(.2126, .7152, .0722));
  c = mix(vec3f(l), c, 1.06);
  c = pow(max(c, vec3f(0.)), vec3f(1. / 2.2));
  // triangular dither of one and a half 8-bit steps, so the sky's long gradients do not band
  let n = ign(fc.xy) + ign(fc.yx * 1.37 + 91.) - 1.;
  return vec4f(c + n * 1.5 / 255., 1.);
}
`;

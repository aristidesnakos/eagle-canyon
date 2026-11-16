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
// (the y offset breaks h31's near-symmetry in x and y, which mirrored every noise field about the line x = z and left a
// crease along the world's diagonal)
fn ph(i: vec2f, P: f32) -> f32 { let w = i - P * floor(i / P); return h31(vec3f(w.x, w.y + 113.5, P)); }
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
  // distance to each river's centre line: coarse search along z, then refine
  var dA = 1e9; var zA = p.y; var dB = 1e9; var zB = p.y;
  for (var k = -60; k <= 60; k++) {
    let z = p.y + f32(k) * 40.; let dz2 = (z - p.y) * (z - p.y);
    let a = wrapd(p.x - riverX(z)); let b = wrapd(p.x - riverX2(z));
    if (a * a + dz2 < dA) { dA = a * a + dz2; zA = z; }
    if (b * b + dz2 < dB) { dB = b * b + dz2; zB = z; }
  }
  let zA0 = zA; let zB0 = zB;
  for (var k = -20; k <= 20; k++) {
    let za = zA0 + f32(k) * 2.; let a = wrapd(p.x - riverX(za)); let da = a * a + (za - p.y) * (za - p.y); if (da < dA) { dA = da; zA = za; }
    let zb = zB0 + f32(k) * 2.; let b = wrapd(p.x - riverX2(zb)); let db = b * b + (zb - p.y) * (zb - p.y); if (db < dB) { dB = db; zB = zb; }
  }
  let r2 = dB < dA; let bd = select(dA, dB, r2); let bz = select(zA, zB, r2);
  let rg = regAt(select(0, 1, r2), bz);
  // the other river's main canyon, so where a wide canyon reaches past half way the two meet without a seam
  let ro = regAt(select(1, 0, r2), select(zB, zA, r2));
  let dO = max(sqrt(select(dB, dA, r2)) - ro.c.y, 0.); let bzO = select(zB, zA, r2);
  // (the river widens into pools here and there, more in the gorge, so its banks do not run like a canal's)
  let d = max(sqrt(bd) - rg.c.y - (3. + 9. * rg.c.x) * ss(.42, .75, pf(p / 4096. * 61. + 2.7, 61. * K, 2)), 0.);
  let q = p / 4096.; let qo = q + select(vec2f(0.), vec2f(.37, .61), r2);
  let halfW = rg.a.x * (1. + .2 * sin(6.2831853 * bz / 4096. * 3. + 1.1 + select(0., 2.3, r2)) + .19 * (pf(q * 3., 3. * K, 2) - .5));
  // main canyon: spurs and amphitheatres from low-frequency noise along the walls
  // (the noise fades out right at the river, so its channel never breaks into separate pools)
  let t0 = d / halfW; let wn = ss(.035, .12, t0 - max(-rg.c.y, 0.) / halfW);
  var t = t0;
  t *= 1. + wn * rg.a.y * (.55 * (pf(q * 10., 10. * K, 3) - .5) + .30 * (pf(q * 26., 26. * K, 3) - .5));
  t += wn * .06 * rg.a.y * (pf(q * 90., 90. * K, 2) - .5);
  // buttresses and joints: metre-scale ins and outs along every wall, so cliffs are not smooth sheets
  t += wn * 9. * (1. - .7 * rg.c.z) / halfW * (pf(q * vec2f(520., 520.) + vec2f(pn(q * 60., 60. * K) * 2.), 520. * K, 2) - .5);
  var e = sat(1. - t);
  { let hwO = ro.a.x * (1. + .2 * sin(6.2831853 * bzO / 4096. * 3. + 1.1 + select(2.3, 0., r2)) + .19 * (pf(q * 3., 3. * K, 2) - .5));
    var tO = dO / hwO;
    tO *= 1. + ro.a.y * (.55 * (pf(q * 10., 10. * K, 3) - .5) + .30 * (pf(q * 26., 26. * K, 3) - .5));
    tO += .06 * ro.a.y * (pf(q * 90., 90. * K, 2) - .5);
    e = max(e, sat(1. - tO)); }
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
  let bump = ss(br, mix(br - .08, br * .5, rg.c.w), bdist + .2 * (pf(q * 50., 50. * K, 3) - .5)) * ss(.12, .4, e) * ss(.97, .8, e);
  e = mix(e, e * (1. - mix(rg.b.y, rg.b.z, bh)), bump);
  // the inner gorge squeezed narrower (rg.b.w > 1), the walls above it stretched to fill
  var u = 1. - e;
  let uA = LW[0] + LW[1] + LW[2]; let sq = rg.b.w;
  if (u < uA / sq) { u = u * sq; } else { u = uA + (u - uA / sq) * (1. - uA) / (1. - uA / sq); }
  var h = terr(u);
  // In the narrows the layers' cliffs would be thinner than one height texel, and a wall like that comes out as 2 m
  // stair-steps in plan. There the wall is one steep, gently waved slope instead (wind-scooped sandstone).
  if (h >= 0. && rg.c.z > .001) {
    let tt = sat((u - LW[0]) / (1. - LW[0]));
    let hsm = .01 + .99 * (mix(tt, ss(0., 1., tt), .35) + .015 * sin(tt * 19. + 6. * pf(q * 40., 40. * K, 2)) * tt * (1. - tt) * 4.);
    h = mix(h, hsm, rg.c.z * .9);
  }
  let R = rimRise(p);
  var y = YR + h * (DP + R);
  if (h < 0.) {
    // the river and its banks: sandy beaches, then the bed
    // (measured from where the centre line falls, so a river narrowed by a negative extra width keeps its deep bed)
    var u0 = max(-rg.c.y, 0.) / halfW; if (u0 < uA / sq) { u0 *= sq; }
    let tl = sat((u - u0) / (LW[0] - u0));
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
// The sun's shadow, full resolution (r16float, rendered in strips): the shadow height at each texel centre, less SHO
// (a point at this x, z is in sunlight above it). Half-float keeps about 0.1 m near the middle heights.
const SHO = 230;
const W_HL = /*wgsl*/`
fn hm(m: i32, p: vec2f) -> f32 { // bilinear height from the max chain (tM level m - 1 is height mip m)
  let n = NT >> u32(m); let s = TX * f32(1 << u32(m)); let c = p / s; let i = vec2i(floor(c)); let f = c - floor(c);
  let a = textureLoad(tM, (i % n + n) % n, m - 1).r; let b = textureLoad(tM, ((i + vec2i(1, 0)) % n + n) % n, m - 1).r;
  let cc = textureLoad(tM, ((i + vec2i(0, 1)) % n + n) % n, m - 1).r; let d = textureLoad(tM, ((i + vec2i(1, 1)) % n + n) % n, m - 1).r;
  return mix(mix(a, b, f.x), mix(cc, d, f.x), f.y);
}
fn hl(m: i32, p: vec2f) -> f32 { // bilinear height at world xz from mip m
  let n = NT >> u32(m); let s = TX * f32(1 << u32(m)); let c = p / s; let i = vec2i(floor(c)); let f = c - floor(c);
  let a = textureLoad(tH, (i % n + n) % n, m).r; let b = textureLoad(tH, ((i + vec2i(1, 0)) % n + n) % n, m).r;
  let cc = textureLoad(tH, ((i + vec2i(0, 1)) % n + n) % n, m).r; let d = textureLoad(tH, ((i + vec2i(1, 1)) % n + n) % n, m).r;
  return mix(mix(a, b, f.x), mix(cc, d, f.x), f.y);
}
`;
const W_SHADOW = W_NOISE + W_CONST + W_FS + /*wgsl*/`
@group(0) @binding(0) var tH: texture_2d<f32>;
@group(0) @binding(1) var<uniform> sun: vec4f;
@group(0) @binding(2) var tM: texture_2d<f32>;
` + W_HL + /*wgsl*/`
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = fc.xy * TX;
  // march toward the sun, coarser mips further out; the highest line toward the sun is
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
  return vec4f(hs - ${SHO}., 0., 0., 1.);
}
`;
// info map, half resolution (rgba8): r = sky visibility, g = how much the high rim has risen here (0-1),
// b = travertine around the waterfall's pools (above 0.5) or slot sandstone (below 0.5), a = how wild the river is
// (the gorge). The region values live here so no pixel has to look the regions up.
const W_BAKE = W_NOISE + W_CONST + W_FS + /*wgsl*/`
@group(0) @binding(0) var tH: texture_2d<f32>;
fn hl(m: i32, p: vec2f) -> f32 {
  let n = NT >> u32(m); let s = TX * f32(1 << u32(m)); let c = p / s; let i = vec2i(floor(c)); let f = c - floor(c);
  let a = textureLoad(tH, (i % n + n) % n, m).r; let b = textureLoad(tH, ((i + vec2i(1, 0)) % n + n) % n, m).r;
  let cc = textureLoad(tH, ((i + vec2i(0, 1)) % n + n) % n, m).r; let d = textureLoad(tH, ((i + vec2i(1, 1)) % n + n) % n, m).r;
  return mix(mix(a, b, f.x), mix(cc, d, f.x), f.y);
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = fc.xy * TX * 2.;
  let hc = hl(0, p);
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
  let rc = regAt(select(0, 1, nearB(p)), p.y).c;
  return vec4f(sky, rimRise(p) / RIM, .5 + .5 * trav - .5 * rc.z * (1. - trav), rc.x);
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
// (a dark line for the trunk from the tree's foot, then the crown's long patch: with the sun this low the shadows of a
// forest overlap, and only shapes this definite still read as tree shadows)
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let t = i.uv.y * .5 + .5; let x = abs(i.uv.x);
  let trunk = ss(.5, .2, x) * ss(0., .03, t) * ss(.5, .4, t);
  let cr = i.uv.x * i.uv.x + (t - .67) * (t - .67) / .1;
  let d = max(trunk * .8, ss(1., .45, cr)) * i.k * 1.5;
  return vec4f(1. - min(d, .9), 0., 0., 1.);
}
`;

// ---------------------------------------------------------------- rock detail textures (made once at load)
// Three tiles of DN x DN texels, each a small height field worked out in code and stored as its slope (rg, so mips
// average correctly), a tone (b, 0.5 = neutral) and one extra mask (a):
//   0 cliff: beds of rock parted by seams, broken into blocks by joints, pitted and grainy; a = varnish streaks
//   1 ground: crusted soil with stones and pebbles; a = stones
//   2 sandstone: sets of thin sweeping cross-beds; a = the odd iron band
// The shaders map them onto the world by position (cliffs from the side, so the beds stay level; flats from above),
// at two sizes each, and the GPU filters them: this is what holds up close, where noise per pixel went soft.
const DN = 1024;
const W_DET = W_NOISE + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> U: vec4f;
const DN = ${DN}.;
// value noise that repeats every P cells (per axis), so each tile wraps
fn qh(i: vec2f, P: vec2f, s: f32) -> vec3f { let w = i - P * floor(i / P); return h33(vec3f(w.x + 31.7, w.y + 113.5, s)); }
fn qn(p: vec2f, P: vec2f, s: f32) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(qh(i, P, s).x, qh(i + vec2f(1., 0.), P, s).x, u.x), mix(qh(i + vec2f(0., 1.), P, s).x, qh(i + vec2f(1., 1.), P, s).x, u.x), u.y);
}
fn qf(p: vec2f, P: vec2f, n: i32, s: f32) -> f32 { var a = .5; var t = 0.; var q = p; var pp = P; for (var i = 0; i < n; i++) { t += a * qn(q, pp, s + f32(i)); q *= 2.; pp *= 2.; a *= .5; } return t / (1. - 2. * a); }
struct D { h: f32, tone: f32, aux: f32 };
fn cliff(q: vec2f) -> D {
  let NB = 5.;
  // beds: their boundaries undulate, and each major bed splits into one to four thinner ones
  let wv = (qf(q * 2., vec2f(2.), 3, 1.) - .5) * .45 + (qn(q * 11., vec2f(11.), 2.) - .5) * .07;
  let mc = q.y * NB + wv; let mi = floor(mc); let rm = qh(vec2f(mi, 0.), vec2f(NB, 1.), 3.);
  let ns = 1. + floor(rm.x * rm.x * 4.99);
  let bc = (mc - mi) * ns; let bi = floor(bc); let bf = bc - bi;
  let rb = qh(vec2f(bi + 7. * mi, mi), vec2f(1e3, NB), 4.);
  // joints: each bed breaks into blocks, offset from the bed below; the cracks wander and come and go
  let nj = 3. + floor(rb.x * 3.99);
  let wig = (qf(vec2f(q.x * 3., q.y * 13.), vec2f(3., 13.), 2, 6.) - .5) * .025 * nj;
  let jc = q.x * nj + rb.y + wig + (qn(vec2f(q.x * 4., bi + 3. * mi), vec2f(4., 1e3), 19.) - .5) * .3;
  let ji = floor(jc); let jf = jc - ji;
  let rj = qh(vec2f(ji, bi + 5. * mi), vec2f(nj, 1e3), 5.);
  // every block sits a little in or out and leans a little; thin beds stand out less than thick ones
  var h = (rm.z - .5) * .03 + ((rb.z - .5) * .028 + (rj.x - .5) * .018 + (jf - .5) * (rj.y - .5) * .02) / sqrt(ns) + (bf - .35) * (rb.y - .3) * .014;
  let ey = min(bf, 1. - bf) / (NB * ns); let ex = min(jf, 1. - jf) / nj;
  let open = ss(.4, .7, qf(q * 7. + 1.7, vec2f(7.), 2, 9.));
  let seam = (1. - ss(0., .005, ey)) * ss(.2, .7, qn(q * vec2f(9., 3.), vec2f(9., 3.), 8.));
  let crack = (1. - ss(0., .003 + .004 * qn(q * vec2f(5., 17.), vec2f(5., 17.), 10.), ex)) * step(.55, rj.z) * open;
  h -= .010 * seam + .014 * crack + .010 * (1. - ss(0., .03, ey)) * (1. - ss(0., .04, ex));
  // weathering: rough faces, thin ledges eaten back along the bedding, spalled hollows, grain
  let r1 = qf(q * 5., vec2f(5.), 5, 7.); let r2 = qf(q * 53., vec2f(53.), 3, 12.); let r4 = qf(q * 23. + 1.3, vec2f(23.), 3, 18.);
  let r3 = qf(vec2f(q.x * 4., q.y * 31.) + r1, vec2f(4., 31.), 3, 15.);
  let pit = ss(.6, .8, qf(q * 9. + .5, vec2f(9.), 3, 20.));
  let lam = qn(vec2f(q.x * 2. + r1 * 2., q.y * 83.), vec2f(2., 83.), 16.); // thin strata inside every bed
  h += (r1 - .5) * .045 + (r3 - .5) * .020 + (r2 - .5) * .003 - pit * .014 + (lam - .5) * .006 + (r4 - .5) * .008 + (r2 - .5) * .003;
  var d: D; d.h = h;
  d.tone = sat(.5 + (rm.y - .5) * .22 + (rb.x - .5) * .14 + (rj.z - .5) * .06 + (r1 - .5) * .3 + (r3 - .5) * .22 + (lam - .5) * .26 + (r2 - .5) * .24 + (r4 - .5) * .2 - .1 * max(seam, crack) - .1 * pit);
  // desert varnish: dark streaks running down the face
  let sk = qf(vec2f(q.x * 31., q.y * 2.), vec2f(31., 2.), 3, 30.);
  d.aux = ss(.55, .78, sk) * (.4 + .6 * qn(q * 5., vec2f(5.), 33.));
  return d;
}
// angular stones scattered on a grid of N cells: x = height 0-1, y = a random number per stone
fn stones(q: vec2f, N: f32, s: f32, keep: f32) -> vec2f {
  let c = q * N; let ci = floor(c); var best = 0.; var rr = 0.;
  let wob = (qn(q * N * 3., vec2f(N * 3.), s + 1.) - .5) * .5;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let o = vec2f(f32(x), f32(y)); let hh = qh(ci + o, vec2f(N), s);
    if (hh.z < keep) {
      var dv = o + .2 + hh.xy * .6 - fract(c); let an = hh.x * 6.28; dv = vec2f(dv.x * cos(an) - dv.y * sin(an), (dv.x * sin(an) + dv.y * cos(an)) * (1. + hh.y));
      let r = (.09 + .2 * fract(hh.z * 37.)) * (1. + wob); let dd = 1. - (abs(dv.x) + abs(dv.y) + length(dv)) * .5 / r;
      if (dd > best) { best = dd; rr = hh.x; }
    }
  } }
  return vec2f(ss(0., .45, best), rr);
}
fn ground(q: vec2f) -> D {
  let f1 = qf(q * 4., vec2f(4.), 6, 40.); let f2 = qf(q * 37., vec2f(37.), 3, 45.); let f3 = qf(q * 13. + 4., vec2f(13.), 4, 47.);
  let s1 = stones(q, 11., 50., .22); let s2 = stones(q, 37., 55., .4);
  var d: D;
  d.h = (f1 - .5) * .045 + (f3 - .5) * .014 + (f2 - .5) * .006 + s1.x * .012 * (.5 + s1.y) + s2.x * .005;
  d.tone = sat(.5 + (f1 - .5) * .5 + (f3 - .5) * .3 + (f2 - .5) * .16 + s1.x * (s1.y * .5 + .15) * .2 + s2.x * (s2.y * .5 + .1) * .16);
  d.aux = max(s1.x, s2.x * .6);
  return d;
}
fn sandst(q: vec2f) -> D {
  let NS = 4.;
  // sets of cross-beds, parted by gently wavy surfaces
  let sc = q.y * NS + (qf(q * 2., vec2f(2.), 2, 70.) - .5) * .9; let si = floor(sc); let sf = sc - si;
  let rs = qh(vec2f(si, 0.), vec2f(NS, 1.), 71.);
  // the thin layers inside a set sweep gently up and down, differently in each set
  let lc = sc * 30. + (rs.y * 2.5 + .5) * sin(6.2831853 * (q.x * (1. + floor(rs.x * 1.99)) + rs.z)) + 2.5 * qf(q * 3., vec2f(3.), 2, 75.);
  let li = floor(lc); let lf = lc - li; let P = vec2f(NS * 30., 1.);
  // tone and hardness drift from layer to layer (smoothly, so nothing steps when seen from a metre away)
  let u = lf * lf * (3. - 2. * lf);
  let t0 = mix(qh(vec2f(li, 0.), P, 77.), qh(vec2f(li + 1., 0.), P, 77.), u);
  let t1 = qn(vec2f(lc * .23, 0.), vec2f(NS * 30. * .23 + .0001, 1.), 78.);
  let eb = 1. - ss(0., .005, min(sf, 1. - sf) / NS);
  let f1 = qf(q * 3., vec2f(3.), 4, 80.); let f2 = qf(q * 41., vec2f(41.), 3, 82.);
  var d: D;
  // harder layers stand a few centimetres proud; the wind has scooped the whole face smooth
  d.h = (t0.x - .5) * .005 + (t1 - .5) * .012 - .005 * eb + (f1 - .5) * .05 + (f2 - .5) * .005;
  d.tone = sat(.5 + (t0.x - .5) * .28 + (t1 - .5) * .3 + (rs.x - .5) * .12 + (f1 - .5) * .18 + (f2 - .5) * .24 - .12 * eb);
  d.aux = ss(.72, .9, t0.y) * ss(.5, .7, t1);
  return d;
}
fn det(q: vec2f) -> D { if (U.x < .5) { return cliff(q); } if (U.x < 1.5) { return ground(q); } return sandst(q); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let q = fc.xy / DN; let e = 1. / DN;
  let d = det(q);
  let sl = vec2f(det(q + vec2f(e, 0.)).h - det(q - vec2f(e, 0.)).h, det(q + vec2f(0., e)).h - det(q - vec2f(0., e)).h) / (2. * e);
  return vec4f(clamp(sl / 4., vec2f(-1.), vec2f(1.)) * .5 + .5, d.tone, d.aux);
}
// mips: each texel the average of the four under it
@group(0) @binding(1) var tS: texture_2d<f32>;
@group(0) @binding(2) var sS: sampler;
@fragment fn fsMip(@builtin(position) fc: vec4f) -> @location(0) vec4f { return textureSampleLevel(tS, sS, fc.xy * 2. / vec2f(textureDimensions(tS)), 0.); }
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
@group(0) @binding(6) var tD: texture_2d_array<f32>;
@group(0) @binding(7) var sD: sampler;
@group(0) @binding(8) var tS: texture_2d<f32>;
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
  let shd = .5 * (sunVis(p, shH(p)) + sunVis(pm, shH(pm)));
  let hz = haze(vd, low) * mix(vec3f(.62, .55, .50), vec3f(1.), shd);
  var c = col * T + hz * (1. - T);
  // far sunlit tops would come out lighter than the air around them and read as snow: past half way into the haze,
  // nothing is brighter than the haze itself (dimmed, not clipped, so the rock keeps its own tan and red)
  let lw = vec3f(.3, .5, .2);
  let rl = dot(c, lw) / max(dot(hz, lw), 1e-4);
  if (rl > 1.) { c = mix(c, c * (1. + .3 * (1. - exp(-(rl - 1.) * 1.5))) / rl, sat((1. - T.g) * 1.6)); }
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
// what the load-time maps say about a place: r = shadow height, g = sky visibility, b = rim rise, a = travertine,
// then slot sandstone and how wild the river is (the gorge)
struct BK { r: f32, g: f32, b: f32, a: f32, sand: f32, gorge: f32, sw: f32 };
fn shH(p: vec3f) -> f32 { return textureSampleLevel(tS, sR, p.xz / WL, 0.).r + ${SHO}.; }
fn bake(p: vec3f) -> BK {
  let t = textureSampleLevel(tB, sR, p.xz / WL, 0.);
  return BK(shH(p), t.r, t.g, sat(t.b * 2. - 1.), sat(1. - t.b * 2.), t.a, 0.);
}
// sunlight at a point from the shadow height under it: decided in 3D, so cliffs, the eagle and trees all agree
// (a crisp edge near the camera, about 2 m of ground; it widens with distance, where a crisp edge would break into teeth)
fn sunVisW(p: vec3f, hs: f32, sw: f32) -> f32 { let w = .45 + sw + .03 * length(p - g.cam.xyz); return ss(-w, w, p.y - hs + w - .1); }
fn sunVis(p: vec3f, hs: f32) -> f32 { return sunVisW(p, hs, 0.); }
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
// one detail layer at three tile sizes t (metres; the finest only near the camera), given the position's screen
// derivatives and fw, metres per pixel: slope.xy, tone (1 = neutral), mask.
// The two larger tiles are never magnified: where a pixel is smaller than a few of their texels they are read from a
// coarser mip, and the next tile down carries the fine detail. Magnified, their thin cracks showed their texels as
// comb-like steps.
fn det2(uv: vec2f, dx: vec2f, dy: vec2f, lay: i32, t: vec3f, near: f32, fw: f32) -> vec4f {
  let k = ${DN}. * fw; let sa = max(1., 5. * t.y / k); let sb = max(1., 6. * t.z / k);
  let a = textureSampleGrad(tD, sD, uv / t.y, lay, dx / t.y * sa, dy / t.y * sa);
  let b = textureSampleGrad(tD, sD, uv / t.z + vec2f(.31, .57), lay, dx / t.z * sb, dy / t.z * sb);
  var r = vec4f((a.rg + b.rg * .8 - .9) * 8., a.b + b.b * .6 + .2, max(a.a, b.a));
  if (near > 0.) {
    let c = textureSampleGrad(tD, sD, uv / t.x + vec2f(.73, .19), lay, dx / t.x, dy / t.x);
    r += vec4f((c.rg - .5) * 8., c.b - .5, 0.) * near;
  }
  return r;
}
// the same from the side of a cliff (u along the face, v = height, so beds stay level all round a butte);
// tilt: the tile turned 58 degrees, for the schist's steeply dipping foliation
fn detSide(u: f32, y: f32, dx: vec2f, dy: vec2f, lay: i32, tilt: bool, near: f32, fw: f32) -> vec4f {
  // (the schist uses smaller tiles: at the big size its cracks came out as ribbons half a metre wide)
  let t = select(vec3f(5.3, 23., 97.), vec3f(2.9, 11., 37.), tilt);
  if (!tilt) { return det2(vec2f(u, y), dx, dy, lay, t, near, fw); }
  let c = .53; let k = .848;
  let d = det2(vec2f(c * u - k * y, k * u + c * y), vec2f(c * dx.x - k * dx.y, k * dx.x + c * dx.y), vec2f(c * dy.x - k * dy.y, k * dy.x + c * dy.y), lay, t, near, fw);
  return vec4f(c * d.x + k * d.y, -k * d.x + c * d.y, d.z, d.w);
}
// Lit rock at p with smooth normal n0. Colour by height through the layer table (stretched where the high rim has
// risen); beds, joints, grain and their relief from the detail textures; soil on the flats; travertine by the pools.
fn shadeRock(p: vec3f, pm: vec3f, n0: vec3f, b: BK) -> vec3f {
  // On steep faces the 2 m normal map varies only across the face, which paints vertical streaks down tall cliffs:
  // there, lean on a normal from 8 m height differences instead.
  // Far away (several metres per pixel) the same smoother normal stands in for the unfiltered 2 m map, which would alias.
  var n = n0;
  // pm is the point on the drawn mesh. Far away the mesh is coarser than the heights, and detail laid on by the true
  // height would wobble across each coarse cell: the detail follows the mesh, only the colour bands the true height.
  let dpx = dpdx(pm); let dpy = dpdy(pm);
  let fw = abs(dpx.y) + abs(dpy.y) + (abs(dpx.x) + abs(dpy.x) + abs(dpx.z) + abs(dpy.z)) * .3; // metres per pixel
  let stp = max(1. - ss(.25, .75, n0.y), ss(.6, 2.5, fw));
  if (stp > .01) {
    let lod = max(2., log2(fw / TX) + 1.);
    let t2 = textureSampleLevel(tN, sR, p.xz / WL + .5 * exp2(floor(lod)) / f32(NT), lod).rg * 2. - 1.;
    n = normalize(mix(n0, vec3f(t2.x, sqrt(max(1. - dot(t2, t2), 0.)), t2.y), stp));
  }
  // which rock: the layer at this height
  let sand = b.sand; let gorge = ss(.5, .95, b.gorge);
  let yy = (p.y - YR) / (DP + b.b * RIM) + (vn(vec3f(p.x * .003, 1.3, p.z * .003)) - .5) * .008;
  var acc = 0.; var i = 0;
  for (; i < NL - 1; i++) { if (yy < acc + LT[i]) { break; } acc += LT[i]; }
  let f = sat((yy - acc) / LT[i]);
  // the schist (and the whole inner gorge up to the Redwall) is foliated; the narrows are cross-bedded sandstone;
  // the patchy edge between kinds comes from one low noise, so no line runs across a wall
  let pn1 = vn(p * vec3f(.03, .05, .03));
  let schist = (i == 1 || (gorge > .2 + .6 * pn1 && yy < .44)) && sand < .5;
  let lay = select(0, 2, !schist && b.sw == 0. && sand > .25 + .5 * pn1);
  // detail from three sides, weighted by which way the face looks
  var tw = pow(abs(n), vec3f(10.)) * vec3f(1., .2, 1.); tw /= tw.x + tw.y + tw.z;
  let near = 1. - ss(.07, .14, fw);
  var sl = vec3f(0.); var side = vec2f(0.); var top = vec4f(0., 0., 1., 0.); var ws = 0.;
  if (lay == 2 && b.sw == 0.) {
    // the slot's walls run along the river (north-south): one mapping along it, so the thin layers flow unbroken
    // across the wall instead of two mappings meeting on every step of the mesh
    let wsd = tw.x + tw.z;
    if (wsd > .04) { let d = det2(vec2f(pm.z + .4 * pm.x, pm.y), vec2f(dpx.z + .4 * dpx.x, dpx.y), vec2f(dpy.z + .4 * dpy.x, dpy.y), 2, vec3f(5.3, 23., 97.), near, fw); sl += wsd * vec3f(.4 * d.x, d.y, d.x); side += wsd * d.zw; ws += wsd; }
  } else {
    if (tw.x > .04) { let d = detSide(pm.z, pm.y, dpx.zy, dpy.zy, lay, schist, near, fw); sl += tw.x * vec3f(0., d.y, d.x); side += tw.x * d.zw; ws += tw.x; }
    if (tw.z > .04) { let d = detSide(pm.x, pm.y, dpx.xy, dpy.xy, lay, schist, near, fw); sl += tw.z * vec3f(d.x, d.y, 0.); side += tw.z * d.zw; ws += tw.z; }
  }
  if (tw.y > .04) { top = det2(pm.xz, dpx.xz, dpy.xz, 1, vec3f(2.9, 11., 47.), near, fw); sl += tw.y * vec3f(top.x, 0., top.y); }
  side = select(vec2f(1., 0.), side / max(ws, 1e-3), ws > 0.);
  // (on faces that lie nearly flat, lines of equal height close into rings: fade the sandstone's layers there)
  if (lay == 2) { side.x = mix(side.x, 1., ss(.25, .6, abs(n.y))); }
  let ns = n;
  n = normalize(n - sl * mix(1., .6, sand));

  // ---- colour
  var c = LC[i];
  // soft blend into the next layer near the top of this one
  if (i < NL - 1) { c = mix(c, LC[i + 1], ss(.86, 1., f) * .5); }
  if (i > 0) { c = mix(c, LC[i - 1], ss(.12, 0., f) * .4); }
  // broad beds within each layer (a slow drift of tone with height), then the beds and blocks of the detail tiles
  c *= .86 + .28 * vn(vec3f(p.x * .002, p.y * .11, p.z * .002));
  if (schist) {
    // grey-violet schist, lighter and darker along the foliation, with pale quartz veins
    let sc = vec3f(.15, .18, .25) * (.25 + .85 * side.x) + vec3f(.22, .19, .18) * ss(.8, .97, side.y) * .6;
    c = mix(c * (.35 + .75 * side.x), sc, select(ss(.46, .40, yy), gorge, i == 1));
  } else {
    c *= .42 + .6 * side.x;
  }
  // the narrows: orange sandstone, its thin layers paler and darker, the odd iron band
  if (sand > .01) {
    let ss1 = mix(vec3f(.62, .25, .10) * (.5 + .52 * side.x), vec3f(.30, .10, .05), side.y * .5 * f32(lay == 2));
    c = mix(c, ss1, sand * (1. - b.a));
  }
  // desert varnish down steep faces, and the red wash from the layers above staining the slopes below them
  let steep = 1. - ss(.35, .8, ns.y);
  if (lay == 0 && !schist) { c *= 1. - steep * .3 * side.y; }
  c = mix(c, c * vec3f(1.08, .9, .82), steep * .3);
  // soil and scrub on flat ground, stones showing through
  let flat = ss(.72, .93, ns.y);
  var soil = mix(c * 1.05, vec3f(.11, .085, .05), .4);
  if (i == NL - 1) { soil = mix(vec3f(.15, .105, .062), vec3f(.10, .09, .05), b.b); } // pine litter on the high rim
  if (i == 3) { soil = vec3f(.15, .11, .07); }
  if (i == 0) { soil = vec3f(.25, .19, .11); }
  c *= mix(1., .5 + .5 * top.z, tw.y);
  soil *= .45 + .55 * top.z;
  soil = mix(soil, c * 1.15, ss(.35, .8, top.w) * .4);
  c = mix(c, soil, flat * .85);
  // travertine: cream-white rock where the waterfall's water runs
  c = mix(c, vec3f(.50, .45, .34) * (.6 + .4 * side.x), b.a * .8);

  // ---- light
  // (tree shadows are baked flat onto the ground: keep them off steep faces, where they would smear)
  let ts = mix(1., textureSampleLevel(tT, sR, p.xz / WL, 0.).r, ss(.55, .8, n0.y));
  let sh = sunVisW(p, b.r, b.sw + 4. * (1. - ss(.3, .8, n0.y))) * ts * eagleSh(p);
  let ndl = sat(dot(n, g.sun.xyz));
  // seams, cracks and the hollows between stones hold less light
  let cav = mix(sat(.55 + .5 * side.x), sat(.6 + .45 * top.z), tw.y) * (1. - .3 * sat(length(sl) * .6) * (1. - tw.y));
  // (fill light comes mostly from above: the undersides of ledges and the lower lips of cracks go darker, their tops
  // lighter, which is what keeps beds and joints crisp on a wall in full shade)
  c *= SUNC * ndl * sh + lightAmb(n, b.g) * cav * (1. - .45 * clamp(sl.y * .5, -.5, 1.)) * (.5 + .5 * ts);
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
  if (g.fogp.w > 3.5 && g.fogp.w < 4.5) { return vec4f(.3, .25, .2, 1.); }
  if (g.fogp.w > 5.5) { return fin(atm(vec3f(.3, .25, .2), p)); }
  let nt = textureSampleLevel(tN, sR, p.xz / WL + .5 / f32(NT), 0.).rg * 2. - 1.;
  let n = vec3f(nt.x, sqrt(max(1. - dot(nt, nt), 0.)), nt.y);
  // On the coarser levels the mesh height between vertices is a straight blend, which would cut the colour bands
  // (and the sand along the river) into zigzags along the cell diagonals: colour and light from the true height.
  var pc = p;
  if (i.lv > .5) { pc.y = hl(0, p.xz); }
  var c = shadeRock(pc, p, n, b);
  // Past the finest mesh level the cells (4-32 m) are coarser than the river, and the water plane would cut stepped
  // diamonds out of them: there the river plane stops (W_RIVER) and the ground itself turns to water wherever the
  // full-resolution height is under the surface.
  let far = ss(100., 130., max(abs(p.x - g.cam.x), abs(p.z - g.cam.z)));
  let wet = ss(YR + .4, YR - .4, pc.y) * far;
  if (wet > .001) {
    let V = normalize(g.cam.xyz - p); let R = reflect(-V, vec3f(0., 1., 0.));
    let fr = .02 + .98 * pow(1. - sat(V.y), 5.);
    let body = vec3f(.06, .10, .055) * (SUNC * .25 * sunVis(p, b.r) + lightAmb(vec3f(0., 1., 0.), b.g) * 1.2);
    c = mix(c, mix(body, sky(vec3f(R.x, abs(R.y), R.z)) * mix(.55, 1., b.g) * vec3f(.75, .9, .8), fr * .7), wet);
  }
  if (g.fogp.w > 4.5) { return fin(c); }
  if (g.fogp.w > 1.5) { return vec4f(vec3f(sunVis(p, b.r), sat(dot(n, g.sun.xyz)), b.g), 1.); }
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
  var hs = 0.;
  for (var k = 0; k < 8; k++) { let a = f32(k) * .7854; hs += textureSampleLevel(tS, sR, uv + vec2f(cos(a), sin(a)) * o * select(1., 3., (k & 1) == 1), 0.).r; }
  b.r = (b.r + hs + ${SHO * 8}.) / 9.;
  b.r = select(b.r, 1e4, n.y < -.35);
  b.g = .15 + .85 * sat(n.y * .5 + .5); b.a = 0.; b.sand = 1.; b.gorge = 0.; b.sw = 14.;
  return fin(atm(shadeRock(i.wp, i.wp, n, b), i.wp));
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
override SPRAY: f32 = 0.; // 1: the pass that draws only the spray, blended (alpha-to-coverage left it stippled)
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let p = i.wp; let t = g.cam.w; let b = bake(p); let sh = sunVis(p, b.r) * eagleSh(p);
  let fl = normalize(i.col.rg * 2. - 1.);
  var c: vec3f; var a = 1.;
  let spray = i.col.b > .5 && i.col.b < .8;
  if (spray != (SPRAY > .5)) { discard; }
  if (spray) {
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
  let p = i.wp; let t = g.cam.w; let fc = i.cp;
  // beyond the finest terrain level the ground draws the water (see W_TERRAIN); a dithered hand-over, no seam
  if (ss(100., 130., max(abs(p.x - g.cam.x), abs(p.z - g.cam.z))) > fract(52.9829189 * fract(dot(fc.xy, vec2f(.06711056, .00583715))))) { discard; }
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
  let b = bake(p); let sh = sunVis(p, b.r) * eagleSh(p);
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
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec4f, @location(3) h: f32, @location(4) base: vec3f };
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
  let lf = i.col.g > i.col.r;
  o.col = vec4f(select(pow(i.col.rgb, vec3f(2.2)), leaf, lf), f32(lf));
  o.h = i.p.y / select(3., 21., pine);
  o.cp = g.vp * vec4f(w, 1.);
  return o;
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(i.n); if (!ff) { n = -n; }
  let lf = i.col.a > .5;
  // needles and bark from the detail tiles, laid on by the position within the tree: clumps of light and dark, small
  // relief, and (with anti-aliasing on) a ragged edge instead of a smooth outline
  let lp = i.wp - i.base;
  let ua = select(vec2f(lp.y * .11, (lp.x + lp.z) * .55), vec2f(lp.x + lp.z * .6, lp.y * 1.3 + lp.z * .5) * .23, lf);
  let ub = select(vec2f(lp.y * .23, (lp.x - lp.z) * .9 + .3), vec2f(lp.z - lp.x * .6, lp.y * 1.3 + lp.x * .5) * .61 + .4, lf);
  let lay = select(0, 1, lf);
  let ta = textureSample(tD, sD, ua, lay); let tb = textureSample(tD, sD, ub, lay);
  let V = normalize(g.cam.xyz - i.wp);
  var al = 1.; var tone = ta.b + tb.b;
  if (lf) {
    let sa = (ta.rg - .5) * 8.; let sb = (tb.rg - .5) * 8.;
    al = ss(.0, .22, abs(dot(n, V)) - .26 + (tone - 1.) * 1.3);
    n = normalize(n - (vec3f(sa.x, 1.3 * sa.y, .6 * sa.x + .5 * sa.y) + vec3f(-.6 * sb.x + .5 * sb.y, 1.3 * sb.y, sb.x)) * .45);
    tone = .3 + .7 * tone * tone;
  } else {
    let sa = (ta.rg + tb.rg - 1.) * 8.;
    n = normalize(n - vec3f(.7 * sa.y, sa.x * .15, .7 * sa.y) * .5);
    tone = .25 + 1.1 * sat(.5 + (tone - 1.) * 2.2);
  }
  let b = bake(i.wp);
  let sh = sunVis(i.wp, b.r) * eagleSh(i.wp);
  let lit = sat(dot(n, g.sun.xyz) * .6 + .4);
  let ao = (.45 + .55 * sat(i.h)) * b.g;
  // (foliage takes its fill light from the sky more than from the red ground under it)
  let na = normalize(n + vec3f(0., select(0., 1.2, lf), 0.));
  var c = i.col.rgb * tone * (SUNC * lit * sh * (.5 + .5 * sat(i.h * 1.4)) + lightAmb(na, ao) * 1.2);
  // the low sun through the needles from behind
  if (lf) { c += i.col.rgb * SUNC * .5 * pow(sat(dot(-V, g.sun.xyz)), 3.) * sh * tone; }
  return vec4f(atm(c, i.wp), al);
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
  let sh = sunVis(i.wp, b.r);
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

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
const W_CONST = /*wgsl*/`
const WL = ${L}.; const NT = ${NT}; const TX = ${TX}.; const YR = ${YR}.; const YT = ${YTOP}.; const DP = ${DEPTH}.;
const NL = ${NL};
const LW = ${wgslArr((l) => l[1] / LAYERS.reduce((s, k) => s + k[1], 0))};
const LT = ${wgslArr((l) => l[2])};
const LK = ${wgslArr((l) => l[3])};
const LC = ${wgslCol};
const RA = vec3f(${RIV.map((r) => r[0].toFixed(1)).join(', ')}); const RF = vec3f(${RIV.map((r) => r[1].toFixed(1)).join(', ')}); const RP = vec3f(${RIV.map((r) => r[2].toFixed(2)).join(', ')});
fn riverX(z: f32) -> f32 { let a = 6.2831853 * z / WL * RF + RP; return WL * .5 + dot(RA, sin(a)); }
fn riverDX(z: f32) -> f32 { let a = 6.2831853 * z / WL * RF + RP; return dot(RA * 6.2831853 / WL * RF, cos(a)); }
// a second canyon half a world away, on another phase of the same curve, so the plateau between is never more than ~1 km
const Z2 = 1371.;
fn riverX2(z: f32) -> f32 { return riverX(z + Z2) + WL * .5; }
fn wrapd(x: f32) -> f32 { return x - WL * round(x / WL); }
// flow direction of whichever river is nearer
fn flowDX(p: vec2f) -> f32 { return select(riverDX(p.y + Z2), riverDX(p.y), abs(wrapd(p.x - riverX(p.y))) < abs(wrapd(p.x - riverX2(p.y)))); }
`;
const W_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0., 1.); }
`;

// ---------------------------------------------------------------- world generation (compute, once at load)
// Height in metres per texel. Erosion e: 0 on the plateau, 1 at the river. Its sources: distance to the river (the
// main canyon, walls bent by noise into spurs and amphitheatres), side canyons (the 0.5 contour of a noise field,
// fading out away from the river) and buttes (Worley cells pushed back up). Then e becomes height through the rock
// layers: a cliff layer climbs steeply over a narrow strip, a slope layer gently over a wide one.
const W_GEN = W_NOISE + W_CONST + /*wgsl*/`
@group(0) @binding(0) var<storage, read_write> H: array<f32>;
fn smax(a: f32, b: f32, k: f32) -> f32 { let h = sat(.5 + .5 * (a - b) / k); return mix(b, a, h) + k * h * (1. - h); }
fn shape(k: f32, t: f32) -> f32 {
  if (k < .5) { return ss(.12, .88, t) * .97 + t * .03; }   // cliff
  if (k < 1.5) { return pow(t, 1.8); }                                                   // talus slope
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
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let p = (vec2f(id.xy)) * TX;
  // distance to the river centre line: coarse search along z, then refine
  var bd = 1e9; var bz = p.y;
  var r2 = false;
  for (var k = -26; k <= 26; k++) {
    let z = p.y + f32(k) * 40.; let dz2 = (z - p.y) * (z - p.y);
    let a = wrapd(p.x - riverX(z)); let b = wrapd(p.x - riverX2(z));
    if (a * a + dz2 < bd) { bd = a * a + dz2; bz = z; r2 = false; }
    if (b * b + dz2 < bd) { bd = b * b + dz2; bz = z; r2 = true; }
  }
  let z0 = bz;
  for (var k = -20; k <= 20; k++) {
    let z = z0 + f32(k) * 2.; var dx = select(wrapd(p.x - riverX(z)), wrapd(p.x - riverX2(z)), r2);
    let d = dx * dx + (z - p.y) * (z - p.y); if (d < bd) { bd = d; bz = z; }
  }
  if (r2) { bz += Z2 * .37; }
  let d = sqrt(bd);
  let q = p / WL;
  let halfW = 430. + 90. * sin(6.2831853 * bz / WL * 3. + 1.1) + 80. * (pf(q * 3., 3., 2) - .5);
  // main canyon: spurs and amphitheatres from low-frequency noise along the walls
  var t = d / halfW;
  t *= 1. + .55 * (pf(q * 10., 10., 3) - .5) + .30 * (pf(q * 26., 26., 3) - .5);
  t += .06 * (pf(q * 90., 90., 2) - .5);
  var e = sat(1. - t);
  // gullies: narrow side canyons every few hundred metres that bite into the walls
  let gq = q * 22. + vec2f(pf(q * 30., 30., 2), pf(q * 30. + 3.3, 30., 2)) * .6;
  let gn = pf(gq, 22., 2);
  let ge = sat(1. - abs(gn - .5) / .045) * ss(1.25, .55, t) * ss(.0, .25, t) * .55;
  e = max(e, ge * (1. - t * .35));
  // side canyons: the 0.5 contour of a noise field, wide and deep near the river, gone 1.5 half-widths beyond the rim
  let n = pf(q * 7. + .37, 7., 3);
  let dn = d / halfW;
  let w = mix(.075, .03, sat((dn - .6) / 1.6));
  let tri = sat(1. - abs(n - .5) / w);
  let te = pow(tri, .75) * ss(2.6, .9, dn) * mix(.82, .32, sat((dn - .5) / 1.8));
  e = smax(e, te, .06);
  // buttes and temples: some Worley cells inside the canyon rise back up, to different layers
  // (cells warped hard and stretched, so the buttes come out as ragged fins and temples rather than discs)
  let c = q * 13. + (vec2f(pf(q * 24., 24., 3), pf(q * 24. + 5.1, 24., 3)) - .5) * 1.1; let ci = floor(c); var bdist = 9.; var bh = 0.;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let o = vec2f(f32(x), f32(y)); let cc = ci + o; let cw = cc - 13. * floor(cc / 13.);
    let hh = h33(vec3f(cw, 5.)); let dv = o + .2 + hh.xy * .6 - fract(c);
    let an = hh.x * 6.28; let el = vec2f(dot(dv, vec2f(cos(an), sin(an))), dot(dv, vec2f(-sin(an), cos(an))) * 1.8);
    let r = length(el);
    if (hh.z > .62 && r < bdist) { bdist = r; bh = (hh.z - .62) / .38; }
  } }
  let bump = ss(.42, .34, bdist + .2 * (pf(q * 50., 50., 3) - .5)) * ss(.12, .4, e) * ss(.97, .8, e);
  e = mix(e, e * (1. - mix(.45, .97, bh)), bump);
  let u = 1. - e;
  var h = terr(u);
  if (h < 0.) {
    // the river and its banks: sandy beaches, then the bed
    let tl = sat(u / LW[0]);
    h = (mix(-7., -.4, ss(.32, .5, tl)) + 4.4 * pow(ss(.5, 1., tl), 1.3)) / DP;
  }
  var y = YR + h * DP;
  // plateau undulation and rubble
  y += 7. * (pf(q * 12., 12., 3) - .5) * ss(.93, 1., u);
  y += 2.2 * (pf(q * 300., 300., 2) - .5) * ss(.0, .3, u);
  H[id.x + id.y * u32(NT)] = y;
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
// bake: r = shadow height (a point at this x, z is in sunlight above it), g = sky visibility, ba = normal xz
const W_BAKE = W_NOISE + W_CONST + /*wgsl*/`
@group(0) @binding(0) var tH: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> sun: vec4f;
@group(0) @binding(3) var tM: texture_2d<f32>;
fn hm(m: i32, p: vec2f) -> f32 { // bilinear height from the max chain
  let n = NT >> u32(m); let s = TX * f32(1 << u32(m)); let c = p / s; let i = vec2i(floor(c)); let f = c - floor(c);
  let a = textureLoad(tM, (i + n) % n, m).r; let b = textureLoad(tM, (i + vec2i(1, 0) + n) % n, m).r;
  let cc = textureLoad(tM, (i + vec2i(0, 1) + n) % n, m).r; let d = textureLoad(tM, (i + vec2i(1, 1) + n) % n, m).r;
  return mix(mix(a, b, f.x), mix(cc, d, f.x), f.y);
}
fn hl(m: i32, p: vec2f) -> f32 { // bilinear height at world xz from mip m
  let n = NT >> u32(m); let s = TX * f32(1 << u32(m)); let c = p / s; let i = vec2i(floor(c)); let f = c - floor(c);
  let a = textureLoad(tH, (i + n) % n, m).r; let b = textureLoad(tH, (i + vec2i(1, 0) + n) % n, m).r;
  let cc = textureLoad(tH, (i + vec2i(0, 1) + n) % n, m).r; let d = textureLoad(tH, (i + vec2i(1, 1) + n) % n, m).r;
  return mix(mix(a, b, f.x), mix(cc, d, f.x), f.y);
}
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let p = vec2f(id.xy) * TX; let n = NT;
  let hc = textureLoad(tH, vec2i(id.xy), 0).r;
  let hx = textureLoad(tH, vec2i((i32(id.x) + 1) % n, i32(id.y)), 0).r - textureLoad(tH, vec2i((i32(id.x) - 1 + n) % n, i32(id.y)), 0).r;
  let hz = textureLoad(tH, vec2i(i32(id.x), (i32(id.y) + 1) % n), 0).r - textureLoad(tH, vec2i(i32(id.x), (i32(id.y) - 1 + n) % n), 0).r;
  let nr = normalize(vec3f(-hx, 2. * TX, -hz));
  // sun: march toward the sun, coarser mips further out; penumbra from the closest miss
  let sd = normalize(sun.xz); let rise = sun.y / length(sun.xz);
  // the highest line toward the sun: max over t of h(p + sd t) - t rise; stop once nothing further can beat it
  var t = 1.5; var hs = -1e4;
  for (var k = 0; k < 220; k++) {
    let m = i32(clamp(log2(t / 40.), 0., 4.));
    let ht = select(hm(m, p + sd * t), hl(0, p + sd * t), m == 0);
    hs = max(hs, ht - t * rise);
    if ((YT + 20.) - t * rise < hs || t > 2400.) { break; }
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
  textureStore(dst, vec2i(id.xy), vec4f(hs, sky, nr.x * .5 + .5, nr.z * .5 + .5));
}
`;
// tree shadows baked into the ground once: a soft ellipse per tree, stretched away from the low sun
const W_TSH = W_CONST + /*wgsl*/`
@group(0) @binding(0) var<storage, read> T: array<vec4f>;
@group(0) @binding(1) var<uniform> sun: vec4f;
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) k: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let t = ii / 9u; let o = vec2f(f32(ii % 3u) - 1., f32((ii / 3u) % 3u) - 1.) * WL;
  let a = T[t * 2u]; let b = T[t * 2u + 1u];
  let hgt = 3.0 * a.w * b.y; let wid = 2.0 * a.w + 1.;
  let sd = -normalize(sun.xz); let rise = sun.y / length(sun.xz);
  let len = hgt * .95 / rise; let ctr = a.xz + o + sd * (len * .5 - wid * .4);
  let c = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2. - 1.;
  let w = ctr + sd * c.y * len * .5 + vec2f(-sd.y, sd.x) * c.x * wid;
  var out: VO; out.cp = vec4f(w.x / WL * 2. - 1., 1. - w.y / WL * 2., 0., 1.); out.uv = c;
  out.k = select(.6, .35, b.w > 1.5);
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
const SUNC = vec3f(1., .66, .40) * 3.4;
const KD = .3;
fn Fg(y: f32) -> f32 { if (y >= YT) { return 0.; } if (y >= YT - DP) { let q = YT - y; return -q * q / (2. * DP); } return y - (YT - DP) - DP * .5; }
// optical depth from c to p: density a above the rim, rising linearly to a * (1 + KD) at the river
fn odepth(c: vec3f, p: vec3f) -> f32 {
  let l = length(p - c); let dy = p.y - c.y;
  var avg = sat((YT - (c.y + p.y) * .5) / DP);
  if (abs(dy) > .5) { avg = (Fg(p.y) - Fg(c.y)) / dy; }
  // a power of the distance rather than plain exponential fog: near air stays clear, the far air closes in
  let de = l * (1. + KD * avg) / g.fogp.x;
  return 2.8 * pow(de, 2.6);
}
// colour of the desert air seen along v: dusty blue away from the sun, gold toward it, warmer and dustier low down
fn haze(v: vec3f, low: f32) -> vec3f {
  let mu = dot(v, g.sun.xyz);
  // pale warm grey-blue away from the sun, dusty peach toward it, warmer and dustier low in the canyon
  var c = mix(vec3f(.36, .38, .44), vec3f(.50, .40, .32), .15 + low * .45);
  c += vec3f(.75, .45, .22) * (pow(sat(mu * .5 + .5), 6.) * .35 + pow(sat(mu), 10.) * .4 + pow(sat(mu), 64.) * .9);
  c *= .92 + .12 * v.y;
  return c;
}
fn atm(col: vec3f, p: vec3f) -> vec3f {
  let v = p - g.cam.xyz; let d = length(v); let vd = v / max(d, 1e-3);
  let tau = odepth(g.cam.xyz, p);
  let T = exp(-tau * vec3f(.9, 1., 1.12));
  let low = sat((YT - min(p.y, g.cam.y)) / DP);
  // air in the canyon's shadow scatters no sunlight: the haze there is dimmer and bluer
  let pm = mix(p, g.cam.xyz, .5);
  let shd = .5 * (sunVis(p, textureSampleLevel(tB, sR, p.xz / WL, 0.)) + sunVis(pm, textureSampleLevel(tB, sR, pm.xz / WL, 0.)));
  let hz = haze(vd, low) * mix(vec3f(.55, .58, .68), vec3f(1.), shd);
  var c = col * T + hz * (1. - T);
  return mix(c, mix(hz, haze(vd, 0.), .5), ss(g.fogp.y * .82, g.fogp.y * .98, d));
}
fn sky(v: vec3f) -> vec3f {
  let up = sat(v.y); let mu = dot(v, g.sun.xyz);
  var c = haze(v, 0.);
  let zen = vec3f(.15, .25, .45) + vec3f(.9, .45, .2) * pow(sat(mu), 6.) * .3;
  c = mix(c, zen, ss(.02, .65, up) * .8);
  // thin high cloud streaks, lit gold from below by the low sun
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
fn sunVis(p: vec3f, b: vec4f) -> f32 { return ss(-2.5, 2.5, p.y - b.r + 1.5); }
fn lightAmb(n: vec3f, ao: f32) -> vec3f {
  return (vec3f(.30, .38, .55) * .7 * (.55 + .45 * n.y) + vec3f(.70, .36, .18) * .6 * (.65 - .35 * n.y)) * (.5 + .5 * ao);
}
fn fin(c: vec3f) -> vec4f { return vec4f(c, 1.); }
`;

// ---------------------------------------------------------------- terrain (geometry clipmap)
// Level k is an N x N grid of cells 2^(k+1) m wide centred on the camera. A cell covered by level k-1 or beyond the
// haze cut collapses to nothing; near its outer edge a level morphs into the next coarser one so the seams close.
const W_TERRAIN = S_B + /*wgsl*/`
override N: f32 = 160.;
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) @interpolate(flat) lv: f32 };
fn hv(k: i32, p: vec2f, mo: f32) -> f32 { return mix(hl(k, p), hl(k + 1, p), mo); }
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ki: u32) -> VO {
  var o: VO;
  let k = i32(ki); let L0 = g.lvl[k]; let s = L0.z; let org = L0.xy;
  let cell = vi / 6u; let cr = vi % 6u;
  let ci = vec2f(f32(cell % u32(N)), f32(cell / u32(N)));
  let dxy = vec2f(f32(cr == 1u || cr == 2u || cr == 4u), f32(cr == 2u || cr == 4u || cr == 5u));
  let cmin = org + ci * s; let cmax = cmin + s;
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
// rock colour from height through the layer table, with sub-bands, desert varnish and soil on the flats
fn rock(p: vec3f, n: vec3f, fw: f32) -> vec3f {
  let yy = (p.y - YR) / DP + (vn(vec3f(p.x * .003, 1.3, p.z * .003)) - .5) * .008;
  var acc = 0.; var i = 0; var f = 0.;
  for (; i < NL - 1; i++) { if (yy < acc + LT[i]) { break; } acc += LT[i]; }
  f = sat((yy - acc) / LT[i]);
  var c = LC[i];
  // soft blend into the next layer near the top of this one
  if (i < NL - 1) { c = mix(c, LC[i + 1], ss(.86, 1., f) * .5); }
  if (i > 0) { c = mix(c, LC[i - 1], ss(.12, 0., f) * .4); }
  // thin beds within each layer
  let bed = vn(vec3f(p.x * .002, p.y * .11, p.z * .002)) * .65 + mix(vn(vec3f(p.x * .004, p.y * .3, p.z * .004)), .5, ss(.6, 1.6, fw * .3)) * .35;
  c *= .72 + .5 * bed;
  // the schist: dark with pink granite veins
  // desert varnish streaks run down steep faces
  let steep = 1. - ss(.35, .8, n.y);
  let st = mix(vn(vec3f(p.x * .12, p.y * .012, p.z * .12)), .5, ss(.3, 1., fw * .12));
  c *= 1. - steep * .45 * ss(.5, .85, st);
  // red wash from the layers above stains the slopes below them
  c = mix(c, c * vec3f(1.08, .9, .82), steep * .3);
  // soil and scrub on flat ground
  let flat = ss(.72, .93, n.y);
  // (linear colours)
  var soil = mix(c * 1.05, vec3f(.11, .085, .05), .4);
  if (i == NL - 1) { soil = vec3f(.15, .105, .062); }
  if (i == 3) { soil = vec3f(.13, .105, .07); }
  if (i == 0) { soil = vec3f(.25, .19, .11); }
  let scrub = ss(.55, .8, mix(vn(p * vec3f(.07, .05, .07)), .3, ss(.4, 1.2, fw * .07))) * select(.3, .5, i == 3 || i == NL - 1);
  soil = mix(soil, soil * vec3f(.6, .62, .5), scrub);
  return mix(c, soil, flat * .85);
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let p = i.wp; let b = bake(p);
  var n = vec3f(b.b * 2. - 1., 0., b.a * 2. - 1.); n.y = sqrt(max(1. - n.x * n.x - n.z * n.z, .0));
  let dist = length(p - g.cam.xyz);
  // small-scale relief by bump mapping a noise height through screen derivatives
  // bedding planes (horizontal ledges every few metres), vertical runnels and grit
  let bp = abs(fract(p.y / 7. + vn(p * vec3f(.01, .03, .01)) * .5) - .5) * 2.; // a continuous triangle wave: ledges every 7 m
  let fw = fwidth(p.y) + fwidth(p.x) * .3 + fwidth(p.z) * .3; // metres per pixel, to fade detail before it shimmers
  let hn = vn(p * vec3f(.45, 1.1, .45)) * (1. - ss(.3, .9, fw)) + vn(p * vec3f(1.6, 2.4, 1.6)) * .4 * (1. - ss(.1, .3, fw))
         + ss(.3, .7, bp) * 1.4 * (1. - ss(.75, .95, n.y)) * (1. - ss(.25, .55, fw / 7.))
         + vn(vec3f(p.x * .35, p.y * .04, p.z * .35)) * .7;
  let dpx = dpdx(p); let dpy = dpdy(p); let dhx = dpdx(hn); let dhy = dpdy(hn);
  let r1 = cross(dpy, n); let r2 = cross(n, dpx); let det = dot(dpx, r1);
  let gr = sign(det) * (dhx * r1 + dhy * r2);
  n = normalize(abs(det) * n - gr * .55 * ss(260., 60., dist));
  let alb = rock(p, n, fw);
  let sh = sunVis(p, b) * textureSampleLevel(tT, sR, p.xz / WL, 0.).r * eagleSh(p);
  let ndl = sat(dot(n, g.sun.xyz));
  var c = alb * (SUNC * ndl * sh + lightAmb(n, b.g));
  // wet sand at the waterline
  c *= 1. - .35 * ss(YR + .8, YR + .1, p.y);
  if (g.fogp.w > 2.5) { return vec4f(alb * 2., 1.); }
  if (g.fogp.w > 1.5) { return vec4f(vec3f(sh, ndl, b.g), 1.); }
  if (g.fogp.w > .5) { return vec4f(vec3f(f32(i.lv == 0.), f32(i.lv == 1.), f32(i.lv == 2.)) * (.3 + .7 * ndl) + f32(i.lv == 3.) * .5, 1.); }
  return fin(atm(c, p));
}
`;

// ---------------------------------------------------------------- the river
const W_RIVER = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var o: VO; let c = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2. - 1.;
  let w = g.cam.xz + c * g.fogp.y; o.wp = vec3f(w.x, YR, w.y); o.cp = g.vp * vec4f(o.wp, 1.); return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let p = i.wp; let t = g.cam.w;
  let depth = max(YR - hl(0, p.xz), 0.);
  let fl = normalize(vec2f(flowDX(p.xz), 1.));
  let q = p.xz - fl * t * 2.2;
  let e = .6;
  let n0 = vn(vec3f(q * .25, t * .3)) + vn(vec3f(q * .9, t * .6)) * .4;
  let nx = vn(vec3f((q + vec2f(e, 0.)) * .25, t * .3)) + vn(vec3f((q + vec2f(e, 0.)) * .9, t * .6)) * .4;
  let nz = vn(vec3f((q + vec2f(0., e)) * .25, t * .3)) + vn(vec3f((q + vec2f(0., e)) * .9, t * .6)) * .4;
  let n = normalize(vec3f((n0 - nx) * .9, 1., (n0 - nz) * .9));
  let V = normalize(g.cam.xyz - p); let R = reflect(-V, n);
  let fr = .02 + .98 * pow(1. - sat(dot(n, V)), 5.);
  let b = bake(p); let sh = sunVis(p, b) * eagleSh(p);
  var refl = sky(vec3f(R.x, abs(R.y), R.z)) * mix(.55, 1., b.g) * vec3f(.75, .9, .8);
  refl += SUNC * 6. * pow(sat(dot(R, g.sun.xyz)), 300.) * sh;
  let body = vec3f(.03, .10, .06) * (SUNC * .25 * sh + lightAmb(vec3f(0., 1., 0.), b.g) * 1.2);
  let sand = vec3f(.30, .24, .16) * (SUNC * .4 * sh + lightAmb(vec3f(0., 1., 0.), b.g));
  var c = mix(sand, body, ss(.0, 1.8, depth));
  c = mix(c, refl, fr * .7);
  // rapids and the foam line at the banks
  let rap = ss(.68, .8, vn(vec3f(q * vec2f(.06, .03), t * .05))) * ss(1.2, 3.5, depth);
  let foam = max(ss(.6, .1, depth) * .6, rap * ss(.5, .75, vn(vec3f(q * 1.3, t * 1.5))));
  c = mix(c, vec3f(.85, .85, .8) * (SUNC * .35 * sh + lightAmb(vec3f(0., 1., 0.), b.g) * 1.3), foam * .7);
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
  lp.x += sin(g.cam.w * 1.3 + i.b.z * 30.) * .04 * lp.y;
  let w = base + vec3f(cy * lp.x - sy * lp.z, lp.y, sy * lp.x + cy * lp.z);
  o.wp = w; o.base = base;
  o.n = vec3f(cy * i.n.x - sy * i.n.z, i.n.y, sy * i.n.x + cy * i.n.z);
  let k = i.b.w; let tn = i.b.z;
  var leaf = vec3f(.022, .036, .016);
  if (k > .5) { leaf = vec3f(.030, .042, .034); }
  if (k > 1.5) { leaf = vec3f(.085, .080, .055); }
  if (k > 2.5) { leaf = vec3f(.050, .11, .025); }
  leaf *= .8 + .4 * tn;
  o.col = select(pow(i.col.rgb, vec3f(2.2)), leaf, i.col.g > i.col.r);
  o.h = i.p.y / 3.;
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
  let n = ign(fc.xy) + ign(fc.xy + 37.) - 1.;
  return vec4f(c + n / 255., 1.);
}
`;

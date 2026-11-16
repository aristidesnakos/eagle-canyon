// ============================================================================
// the canyon: layout constants, regions, rock layers, trees, landmarks, the eagle mesh, viewpoints, the benchmark path
// ============================================================================
// The world is a heightfield that repeats every L metres in both directions (a torus), so the eagle never meets an
// edge. Two rivers run north-south half a world apart, each through a sequence of different canyons (regions).
const L = 8192, NT = 4096, TX = L / NT; // world period (m), heightmap size (texels), metres per texel
const YR = 8, YTOP = 340, DEPTH = YTOP - YR; // river surface, rim plateau, depth of the canyon
const RIM = 110; // the plateau east of river A (west of river B) rises this much higher: a high, forested rim
// the rivers' centre lines, x as a function of z, periodic in z: [amplitude m, cycles per world, phase]
const RIV = [[360, 1, 0.5], [220, 3, 2.0], [90, 5, 1.0], [40, 9, 0.3]];
const RIV2 = [[330, 1, 2.6], [240, 2, 0.9], [100, 6, 4.0], [40, 11, 1.7]];
const rivX = (R, z) => { let x = 0; for (const [a, f, p] of R) x += a * sin(TAU * z / L * f + p); return x; };
const rivDX = (R, z) => { let d = 0; for (const [a, f, p] of R) d += a * TAU / L * f * cos(TAU * z / L * f + p); return d; };
const riverX = (z) => L / 2 + rivX(RIV, z), riverDX = (z) => rivDX(RIV, z);
const riverX2 = (z) => rivX(RIV2, z), riverDX2 = (z) => rivDX(RIV2, z);
const wrapd = (x) => x - L * round(x / L);
// river r's centre at z
const rX = (r, z) => (r ? riverX2(z) : riverX(z)), rDX = (r, z) => (r ? riverDX2(z) : riverDX(z));
// height added to the canyon's depth at x, z: rises from each river toward the middle of the east plateau
const rimRise = (x, z) => RIM * sstep(0, 900, wrapd(x - riverX(z))) * sstep(0, 900, -wrapd(x - riverX2(z)));

// Regions: each river passes through canyons of different character, blended over RTR m.
// [half-width m, wall noise, gullies, side canyons | butte threshold (1+: none), butte height min, max, inner-gorge
//  squeeze | rapids 0-1, extra river half-width m, slot sandstone 0-1, thinner haze 0-1]
const RTYPES = {
  classic: [430, 1.0, 1.0, 1.0, 0.62, 0.45, 0.97, 1.0, 0.25, 0, 0, 0], // the canyon of run 1: spurs, buttes, side canyons
  narrows: [62, 0.22, 0, 0.25, 1.5, 0, 0, 1.0, 0.3, 6, 1, 0],          // a slot of orange sandstone: walls 330 m high, 15 m of river
  basin: [1250, 1.1, 0.8, 0.7, 0.30, 0.55, 0.99, 1.6, 0.15, -15, 0, 1],  // wide open, full of tiered temples, clearer air
  gorge: [600, 0.8, 1.0, 1.0, 0.72, 0.45, 0.95, 2.6, 1.0, 0, 0, 0],    // a deep inner gorge of grey schist, rapids, boulders
};
const RNAMES = Object.keys(RTYPES);
// [start z, type] along river A, then river B
const RSEQ = [
  [[0, 'classic'], [1600, 'narrows'], [2750, 'basin'], [4900, 'gorge'], [6300, 'classic']],
  [[0, 'gorge'], [1300, 'basin'], [3400, 'classic'], [5000, 'narrows'], [5900, 'classic']],
];
const RTR = 350;
// the region parameters at z along river r (the same blend as regAt in the shaders)
const regAt = (r, z0) => {
  const S = RSEQ[r], n = S.length, z = ((z0 % L) + L) % L; let i = 0;
  for (let k = 1; k < n; k++) if (z >= S[k][0]) i = k;
  const j = (i + 1) % n, zn = j ? S[j][0] : L, w = sstep(zn - RTR, zn, z), a = RTYPES[S[i][1]], b = RTYPES[S[j][1]];
  return a.map((v, k) => mix(v, b[k], w));
};
const nearB = (x, z) => abs(wrapd(x - riverX2(z))) < abs(wrapd(x - riverX(z)));

// Landmarks (both on river A): a stone bridge across the river where the narrows open into the basin, and a waterfall
// where a hanging side canyon with travertine pools meets the river from the sunlit east.
const BRIDGE_Z = 2450, BRIDGE_Y = YR + 128;
const FALL_Z = 7250, FALL_TOP = YR + 62, FALL_LIP = 40, POOL = 50, POOLH = 2.4, SIDE_LEN = 900;
// the side canyon's centre line: SIDEN points from the river centre, heading east and bending
const SIDEN = 13, SIDE = (() => {
  const d = riverDX(FALL_Z), n = hypot(1, d), nx = 1 / n, nz = -d / n, tx = d / n, tz = 1 / n, out = [];
  for (let i = 0; i < SIDEN; i++) { const s = i / (SIDEN - 1) * SIDE_LEN, b = 70 * sin(s / 300) + 0.15 * s - 0.0002 * s * s; out.push([riverX(FALL_Z) + nx * s + tx * b, FALL_Z + nz * s + tz * b]); }
  return out;
})();

// Rock layers, bottom to top, after the Grand Canyon's real sequence (scaled to a 332 m deep canyon).
// w: share of the canyon's half-width the layer takes up, t: share of the depth, k: 0 cliff, 1 slope, 2 ledges, 3 river
// banks. The same table shapes the terraces (world generation) and colours the rock by height (shaders), so the
// colour bands always sit on their cliffs. Colours are sRGB albedo.
const LAYERS = [
  // name            w      t     k  colour
  ['river banks',   0.04,  0.01, 3, [0.74, 0.64, 0.50]],
  ['Vishnu schist', 0.07,  0.22, 0, [0.44, 0.40, 0.42]],
  ['Tapeats',       0.02,  0.05, 0, [0.52, 0.38, 0.27]],
  ['Bright Angel',  0.17,  0.10, 1, [0.60, 0.58, 0.45]],
  ['Muav',          0.03,  0.05, 0, [0.62, 0.56, 0.48]],
  ['Redwall',       0.05,  0.12, 0, [0.74, 0.38, 0.25]],
  ['Supai',         0.24,  0.17, 2, [0.80, 0.43, 0.26]],
  ['Hermit',        0.16,  0.10, 1, [0.66, 0.30, 0.19]],
  ['Coconino',      0.04,  0.07, 0, [0.74, 0.57, 0.40]],
  ['Toroweap',      0.12,  0.05, 2, [0.70, 0.50, 0.35]],
  ['Kaibab',        0.06,  0.06, 0, [0.66, 0.52, 0.39]],
];
const NL = LAYERS.length;
const wgslArr = (f) => `array<f32, ${NL}>(${LAYERS.map((l) => f(l).toFixed(4)).join(', ')})`;
const wgslCol = `array<vec3f, ${NL}>(${LAYERS.map((l) => `vec3f(${l[4].map((c) => pow(c, 2.2).toFixed(4)).join(', ')})`).join(', ')})`;
// height of the top of layer i (for placing trees on benches)
const layerTop = (i) => { let h = YR; for (let k = 0; k <= i; k++) h += LAYERS[k][2] * DEPTH; return h; };

// the low sun: late afternoon, 15 degrees up, from the west-south-west (the river runs roughly north-south, so one
// wall glows and the other is in shadow)
const SUN = (() => { const el = 15 * PI / 180, az = 20 * PI / 180; return [-cos(el) * cos(az), sin(el), cos(el) * sin(az)]; })();

// ---------------------------------------------------------------- trees and bushes
// Placed from the finished heightmap H: pinyon and juniper woodland on the rim plateau and the benches, ponderosa pine
// forest with meadows on the high rim, low bushes on the Tonto platform, green tamarisk along the river.
// Instances are sorted into CELLS x CELLS cells of CELLW m. instance: f32 x, y, z, scale | f32 yaw, height factor, tint, kind
const CELLS = 128, CELLW = L / CELLS;
function cellSort(out) {
  const n = out.length / 8, cellOf = new Uint16Array(n), count = new Uint32Array(CELLS * CELLS + 1);
  for (let i = 0; i < n; i++) { const c = (floor(out[i * 8] / CELLW) % CELLS) + CELLS * (floor(out[i * 8 + 2] / CELLW) % CELLS); cellOf[i] = c; count[c + 1]++; }
  for (let c = 0; c < CELLS * CELLS; c++) count[c + 1] += count[c];
  const start = count.slice(), fill = count.slice(0, -1), data = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) { const d = fill[cellOf[i]]++; for (let k = 0; k < 8; k++) data[d * 8 + k] = out[i * 8 + k]; }
  return { data, start, n };
}
function plantTrees(H) {
  rseed(7);
  const hAt = (x, z) => { const i = ((round(x / TX) % NT) + NT) % NT, j = ((round(z / TX) % NT) + NT) % NT; return H[i + j * NT]; };
  const out = [], pines = [], STEP = 5;
  for (let gz = 0; gz < L; gz += STEP) for (let gx = 0; gx < L; gx += STEP) {
    const x = gx + rr(0, STEP), z = gz + rr(0, STEP), h = hAt(x, z);
    const sl = hypot(hAt(x + 4, z) - hAt(x - 4, z), hAt(x, z + 4) - hAt(x, z - 4)) / 8;
    if (sl > 0.5) continue;
    const R = rimRise(x, z), k = (DEPTH + R) / DEPTH, top = YTOP + R, espl = YR + (layerTop(6) - YR) * k, tonto = YR + (layerTop(3) - YR) * k;
    const cl = vnoise(x / 90, 3.1, z / 90), cl2 = vnoise(x / 23, 7.7, z / 23);
    let p = 0, kind = 0, s = 1, hf = 1, list = out;
    if (h > top - 14 && sl < 0.4) {
      const pine = sstep(40, 90, R) * sstep(0.25, 0.5, vnoise(x / 400, 1.7, z / 400) + 0.2);
      if (rnd() < pine) { p = 0.14 * sstep(0.3, 0.6, cl) + 0.006; s = rr(0.6, 1.25); hf = rr(0.7, 1.25); kind = 4; list = pines; }
      else { p = 0.2 * sstep(0.35, 0.75, cl) + 0.02 * cl2; s = rr(0.45, 1.6); hf = rr(0.8, 1.3); kind = rnd() < 0.5 ? 0 : 1; }
    }
    else if (abs(h - espl) < 10 && sl < 0.35) { p = 0.07 * sstep(0.35, 0.7, cl); s = rr(0.5, 1.1); kind = 1; }
    else if (abs(h - tonto) < 14 && sl < 0.35) { p = 0.07 * sstep(0.25, 0.7, cl2); s = rr(0.3, 0.55); hf = rr(0.5, 0.8); kind = 2; }
    else if (h > YR + 0.6 && h < YR + 4.5) { p = 0.30; s = rr(0.45, 0.85); hf = rr(0.7, 1.1); kind = 3; }
    if (p === 0 || rnd() > p) continue;
    if ((list.length / 8) % THIN && rnd() < 1 - 1 / THIN) continue;
    list.push(x, h - 0.3, z, s, rr(0, TAU), hf, rnd(), kind);
  }
  return [cellSort(out), cellSort(pines)];
}

// ---------------------------------------------------------------- thermals
// Columns of rising air inside the canyons, each marked by three dark birds circling in it (as vultures mark thermals).
// thermal: x, y (floor of the circling), z, radius | lift m/s, top height, phase, 0
function makeThermals(hAt) {
  rseed(11); const out = [];
  for (let k = 0; out.length < 110 * 8 && k < 20000; k++) {
    const x = rr(0, L), z = rr(0, L), h = hAt(x, z);
    if (h > YTOP - 60 || h < YR + 30) continue;
    out.push(x, h + 40, z, rr(30, 50), rr(2.8, 4.2), YTOP + rr(120, 220), rr(0, TAU), 0);
  }
  return new Float32Array(out);
}

// ---------------------------------------------------------------- meshes built in code
// tree: short trunk, a lumpy crown of two or three blobs; lo = far version
function meshTree(lo) {
  const m = new Mesh();
  if (!lo) { m.c = [0.30, 0.22, 0.15, 0]; m.lathe([[0, 0.14], [1.1, 0.10], [1.6, 0.05]], 5); }
  // lathe builds along +Z: turn trunk upright
  for (let k = 0; k < m.p.length; k += 3) { const y = m.p[k + 1], z = m.p[k + 2]; m.p[k + 1] = z; m.p[k + 2] = -y; }
  m.c = [0.20, 0.26, 0.13, 0];
  // juniper and pinyon are bushy almost to the ground: a broad low crown with lumps
  const blobs = lo ? [[0, 1.5, 0, 1.45, 1.2]] : [[0, 1.4, 0, 1.45, 1.05], [0.75, 1.0, 0.35, 0.95, 0.8], [-0.6, 1.2, -0.45, 1.0, 0.85], [0.1, 2.3, -0.1, 0.9, 0.8], [-0.2, 0.8, 0.8, 0.8, 0.6]];
  for (const [bx, by, bz, r, ry] of blobs) icosphere(m, lo ? 0 : 1, (x, y, z) => { const k = 0.82 + 0.3 * vnoise(x * 2.2 + bx * 5, y * 2.2 + 9, z * 2.2); return [bx + x * r * k, by + y * ry * k, bz + z * r * k]; });
  return m.build();
}
// ponderosa pine, about 22 m: a straight orange-brown trunk bare for almost half its height, then an open, irregular
// crown of flattish branch masses, broadest in the middle, sparse at the top; lo = far version
function meshPine(lo) {
  const m = new Mesh();
  m.c = [0.30, 0.21, 0.16, 0]; m.lathe(lo ? [[0, 0.7], [17, 0.3]] : [[0, 0.55], [0.6, 0.45], [10, 0.32], [17, 0.18], [22, 0.06]], lo ? 4 : 7);
  for (let k = 0; k < m.p.length; k += 3) { const y = m.p[k + 1], z = m.p[k + 2]; m.p[k + 1] = z; m.p[k + 2] = -y; }
  m.c = [0.20, 0.26, 0.13, 0];
  rseed(5);
  const clumps = lo ? [[0, 14.5, 0, 3.3, 3.8], [0.6, 19.5, 0.3, 2.0, 2.2]] : [];
  if (!lo) for (let i = 0; i < 28; i++) {
    const t = i / 27, y = 7 + t * 15 + rr(-0.5, 0.5), a = i * 2.39 + rr(-0.4, 0.4), R = 3.6 * sin(PI * (0.2 + 0.75 * t)) * (1 - 0.3 * t) * rr(0.55, 1);
    clumps.push([cos(a) * R * 0.85, y, sin(a) * R * 0.85, 0.95 + 0.5 * (1 - t) + rr(-0.2, 0.25), rr(0.55, 0.8)]);
  }
  // (each mass is lumpy and droops a little toward its edge, so no two read as the same disc)
  for (const [bx, by, bz, r, ry] of clumps) icosphere(m, lo ? 0 : 1, (x, y, z) => { const k = 0.62 + 0.75 * vnoise(x * 2.6 + bx * 3, y * 2.6 + by, z * 2.6); return [bx + x * r * k, by + y * r * ry * k - (lo ? 0 : 0.35 * (x * x + z * z) * r), bz + z * r * k]; });
  return m.build();
}
// ---------------------------------------------------------------- landmarks (built after the heightmap, need hAt)
// a point and unit direction along the side canyon at arc length s
function sideAt(s) {
  let acc = 0;
  for (let i = 0; i < SIDEN - 1; i++) {
    const [ax, az] = SIDE[i], [bx, bz] = SIDE[i + 1], l = hypot(bx - ax, bz - az);
    if (s <= acc + l || i === SIDEN - 2) { const t = (s - acc) / l; return [ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / l, (bz - az) / l]; }
    acc += l;
  }
}
const NPOOL = floor((SIDE_LEN - 120 - FALL_LIP) / POOL);
const FALL_DROP = FALL_TOP - YR, FALL_OUT = 3.2 * sqrt(2 * FALL_DROP / 9.81); // the water leaves the lip at 3.2 m/s
const FALL_BASE = sideAt(FALL_LIP - FALL_OUT);
// The stone bridge: a slab of rock arching across the river from wall to wall, its ends buried in the walls.
// Returns the mesh and, for collision, per span sample: centre x, y, z, half thickness, half depth.
function buildBridge(hAt) {
  const z = BRIDGE_Z, d = riverDX(z), n = hypot(1, d), nx = 1 / n, nz = -d / n, tx = d / n, tz = 1 / n, cx = riverX(z);
  const wall = (side) => { for (let o = 4; o < 700; o += 2) if (hAt(cx + nx * side * o, z + nz * side * o) > BRIDGE_Y + 6) return o; return 700; };
  const a = -(wall(-1) + 20), b = wall(1) + 20, NS = 40, NR = 18, m = new Mesh(), rings = [], col = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, o = mix(a, b, t), e = abs(2 * t - 1);
    const y0 = BRIDGE_Y + 13 * sin(PI * t), th = 12 + 18 * e ** 2.5, dp = 13 + 9 * e * e;
    const px = cx + nx * o, pz = z + nz * o, ring = [];
    col.push(px, y0, pz, th, dp);
    for (let k = 0; k < NR; k++) {
      const an = k / NR * TAU, sa = sin(an), ca = cos(an);
      const sy = Math.sign(sa) * abs(sa) ** 0.6, sx = Math.sign(ca) * abs(ca) ** 0.6; // a squarish slab, not a tube
      const w = 0.82 + 0.36 * vnoise(px * 0.06 + k * 0.3, y0 * 0.05, pz * 0.06) + 0.12 * vnoise(px * 0.3, k * 1.7, pz * 0.3);
      ring.push(m.v(px + tx * sx * dp * w, y0 + sy * th * w * (sa > 0 ? 0.85 : 1), pz + tz * sx * dp * w));
    }
    rings.push(ring);
  }
  for (let i = 0; i < NS; i++) for (let k = 0; k < NR; k++) { const k2 = (k + 1) % NR; m.quad(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]); }
  return { mesh: m.build(), col: new Float32Array(col), cx, cz: z, nx, nz, tx, tz, a, b, NS };
}
// The waterfall and the travertine pools above it. Vertex colour: r, g = flow direction (x, z) * 0.5 + 0.5, b = kind
// (0 falling water, 1 pool surface); aux = across the sheet (-1..1).
function buildFall() {
  const m = new Mesh();
  const sheet = (s0, top, drop, w0, rows, out) => {
    const R = [];
    for (let r = 0; r <= rows; r++) {
      const dy = drop * (r / rows) ** 1.25, o = out * sqrt(dy / drop), [x, z, dx, dz] = sideAt(s0 - o), w = w0 * (1 + 0.35 * dy / drop);
      m.c = [-dx * 0.5 + 0.5, -dz * 0.5 + 0.5, 0, 0];
      const row = []; for (let c = 0; c <= 8; c++) { const u = c / 4 - 1; row.push(m.v(x - dz * u * w, top - dy, z + dx * u * w, u)); }
      R.push(row);
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < 8; c++) m.quad(R[r][c], R[r][c + 1], R[r + 1][c + 1], R[r + 1][c]);
  };
  sheet(FALL_LIP, FALL_TOP + 0.3, FALL_DROP + 1.5, 6.5, 18, FALL_OUT);
  // the spray: two loose rings of upright panels around the foot of the fall (kind 0.65; colour a = height share)
  for (const [rad, hgt, seg] of [[7, 14, 10], [12, 22, 12]]) {
    const R = [];
    for (let r = 0; r <= 3; r++) { const row = []; for (let k = 0; k <= seg; k++) { const an = k / seg * TAU; m.c = [0.5, 0.5, 0.65, r / 3]; row.push(m.v(FALL_BASE[0] + cos(an) * rad * (1 + 0.25 * r / 3), YR - 0.5 + hgt * r / 3, FALL_BASE[1] + sin(an) * rad * (1 + 0.25 * r / 3), 0)); } R.push(row); }
    for (let r = 0; r < 3; r++) for (let k = 0; k < seg; k++) m.quad(R[r][k], R[r][k + 1], R[r + 1][k + 1], R[r + 1][k]);
  }
  for (let i = 0; i < NPOOL; i++) {
    const s0 = FALL_LIP + POOL * i, wl = FALL_TOP + POOLH * i, R = [];
    for (let s = s0; s <= s0 + POOL + 0.1; s += 5) {
      const [x, z, dx, dz] = sideAt(min(s, s0 + POOL)); m.c = [-dx * 0.5 + 0.5, -dz * 0.5 + 0.5, 1, 0];
      const hw = i ? 11 : mix(6, 11, sstep(s0, s0 + 15, s)); R.push([m.v(x + dz * hw, wl, z - dx * hw, -1), m.v(x - dz * hw, wl, z + dx * hw, 1)]);
    }
    for (let k = 0; k < R.length - 1; k++) m.quad(R[k][0], R[k][1], R[k + 1][1], R[k + 1][0]);
    if (i > 0) sheet(s0, wl + 0.25, POOLH + 0.4, 3.5, 3, 0.8);
  }
  return m.build();
}

// The eagle: a bald eagle about 2.1 m across the wings. Local axes: +z forward, +y up, +x right.
// aux = signed span (0 at the body, +-1 at the wing tips) drives flapping and folding in the vertex shader.
function meshEagle() {
  const m = new Mesh();
  const BROWN = [0.24, 0.15, 0.09, 1], DARK = [0.12, 0.085, 0.06, 1], WHITE = [0.80, 0.78, 0.72, 1], YEL = [0.95, 0.66, 0.12, 2];
  m.c = BROWN; m.lathe([[-0.32, 0.03], [-0.22, 0.085], [-0.05, 0.12], [0.1, 0.115], [0.22, 0.085], [0.27, 0.07]], 10, 0.85);
  m.c = WHITE; m.lathe([[0.25, 0.072], [0.33, 0.078], [0.41, 0.066], [0.46, 0.045], [0.48, 0.02]], 10, 0.95, 0, 0.03, 0);
  m.c = YEL; m.lathe([[0.455, 0.032], [0.51, 0.022], [0.55, 0.008]], 6, 1, 0, 0.015, 0);
  // eyes: two tiny dark beads
  m.c = [0.02, 0.02, 0.02, 2];
  for (const sx of [-1, 1]) icosphere(m, 0, (x, y, z) => [sx * 0.05 + x * 0.012, 0.06 + y * 0.012, 0.43 + z * 0.012]);
  // tail: a white fan
  m.c = WHITE;
  const tail = [0, 1, 2].map((r) => [-2, -1, 0, 1, 2].map((c) => { const zz = -0.27 - r * 0.15, w = 0.05 + r * 0.06; return [c / 2 * w, 0.01 - r * 0.01, zz]; }));
  m.panel(tail, () => 0, 0.012);
  // wings: inner wing as a grid panel, then six slotted primary feathers past the wrist
  for (const sx of [-1, 1]) {
    m.c = BROWN;
    const span = [0.07, 0.2, 0.36, 0.5, 0.62];
    const rows = [0, 1, 2, 3].map((r) => span.map((x) => {
      const t = (x - 0.07) / 0.55, chord = 0.50 + 0.05 * sin(t * PI) - 0.06 * t, lead = 0.14 - 0.04 * t;
      const z = lead - chord * r / 3, y = 0.03 * sin(r / 3 * PI) * (1 - t * 0.5);
      return [sx * x, y, z];
    }));
    m.panel(rows, (r, c) => sx * (span[c] - 0.07) / 0.98 * (1 + 0 * r), 0.014);
    m.c = DARK;
    for (let f = 0; f < 6; f++) {
      const a = 0.25 - f * 0.13, root = [0.6, 0.0, 0.06 - f * 0.055], len = 0.36 + 0.1 * sin(f / 5 * PI) - f * 0.02;
      const tip = [root[0] + cos(a) * len, 0.0, root[2] + sin(a) * len * 0.6 - 0.03], wid = 0.085;
      const P = [0, 1].map((r) => [0, 1, 2].map((c) => { const t = c / 2, x = mix(root[0], tip[0], t), z = mix(root[2], tip[2], t) + (r - 0.5) * wid * (1 - 0.5 * t); return [sx * x, 0.012 * f * t, z]; }));
      m.panel(P, (r, c) => sx * (mix(root[0], tip[0], c / 2) - 0.07) / 0.98, 0.008);
    }
  }
  return m.build();
}

// ---------------------------------------------------------------- viewpoints and the benchmark path
// Given in a river's frame so they survive changes to the terrain: [z along the river, side (+1 east / -1 west), height
// above the river, camera offset as a share of the distance to the wall at that height (above the rim: of the rim's
// distance), look ahead m, look offset as a share of the wall distance (negative: the other side), look height, river].
// Keys 1-8 jump to them; tools/views.sh renders them. (viewPose, the path: main.js, they need hAt)
const VIEWS = [
  [700, -1, 100, 0.6, 250, 0.3, 120, 0],    // 1 the classic canyon: layered walls and buttes
  [2050, 1, 60, 0.3, 200, -0.3, 70, 0],      // 2 the narrows: a slot 330 m deep
  [2300, 1, 95, 0.15, 150, 0, 130, 0],       // 3 the stone bridge where the narrows open
  [3600, -1, 280, 0.15, 520, -0.5, 180, 0], // 4 the basin and its temples
  [5550, 1, 16, 0.25, 220, -0.2, 14, 0],     // 5 the rapids in the inner gorge
  [7140, -1, 50, 0.45, 110, -0.85, 55, 0],   // 6 the waterfall from the side canyon
  [3700, 1, 470, 1.1, 300, -0.6, 350, 0],   // 7 the high rim: ponderosa forest at the edge
  [3900, 1, 200, 0.4, 400, -0.5, 230, 0],   // 8 past a sunlit cliff into the low sun
];
// the benchmark path: from z = FLYZ0 along river A, one height above the river per 180 m: low through the narrows,
// under the bridge, then up into the basin among the temples
const FLYZ0 = 1500;
const FLYH = [40, 35, 40, 55, 70, 85, 90, 110, 160, 210, 230, 220, 180, 150];

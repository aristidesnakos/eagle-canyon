// ============================================================================
// the canyon: layout constants, rock layers, trees, the eagle mesh, viewpoints and the benchmark path
// ============================================================================
// The world is a heightfield that repeats every L metres in both directions (a torus), so the eagle never meets an
// edge; the haze hides the repeat (about 4 km away at the shortest).
const L = 4096, NT = 2048, TX = L / NT; // world period (m), heightmap size (texels), metres per texel
const YR = 8, YTOP = 340, DEPTH = YTOP - YR; // river surface, rim plateau, depth of the canyon
// the river's centre line: x as a function of z, periodic in z
const RIV = [[300, 2, 0.5], [140, 3, 2.0], [55, 5, 1.0]];
const riverX = (z) => { let x = L / 2; for (const [a, f, p] of RIV) x += a * sin(TAU * z / L * f + p); return x; };
const riverDX = (z) => { let d = 0; for (const [a, f, p] of RIV) d += a * TAU / L * f * cos(TAU * z / L * f + p); return d; };

// Rock layers, bottom to top, after the Grand Canyon's real sequence (scaled to a 332 m deep canyon).
// w: share of the canyon's half-width the layer takes up, t: share of the depth, k: 0 cliff, 1 slope, 2 ledges, 3 river
// banks. The same table shapes the terraces (world generation) and colours the rock by height (shaders), so the
// colour bands always sit on their cliffs. Colours are sRGB albedo.
const LAYERS = [
  // name            w      t     k  colour
  ['river banks',   0.04,  0.01, 3, [0.74, 0.64, 0.50]],
  ['Vishnu schist', 0.07,  0.22, 0, [0.38, 0.31, 0.29]],
  ['Tapeats',       0.02,  0.05, 0, [0.52, 0.38, 0.27]],
  ['Bright Angel',  0.17,  0.10, 1, [0.60, 0.58, 0.45]],
  ['Muav',          0.03,  0.05, 0, [0.62, 0.56, 0.48]],
  ['Redwall',       0.05,  0.12, 0, [0.74, 0.38, 0.25]],
  ['Supai',         0.24,  0.17, 2, [0.80, 0.43, 0.26]],
  ['Hermit',        0.16,  0.10, 1, [0.66, 0.30, 0.19]],
  ['Coconino',      0.04,  0.07, 0, [0.86, 0.73, 0.55]],
  ['Toroweap',      0.12,  0.05, 2, [0.80, 0.62, 0.46]],
  ['Kaibab',        0.06,  0.06, 0, [0.80, 0.69, 0.54]],
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
// Placed from the finished heightmap H: pinyon and juniper woodland on the rim plateau and the benches, low bushes
// on the Tonto platform, green tamarisk along the river. Instances are sorted into CELLS x CELLS cells of CELLW m.
// instance: f32 x, y, z, scale | f32 yaw, height factor, tint, kind
const CELLS = 64, CELLW = L / CELLS;
function plantTrees(H) {
  rseed(7);
  const hAt = (x, z) => { const i = ((round(x / TX) % NT) + NT) % NT, j = ((round(z / TX) % NT) + NT) % NT; return H[i + j * NT]; };
  const out = [], STEP = 5;
  const espl = layerTop(6), tonto = layerTop(3);
  for (let gz = 0; gz < L; gz += STEP) for (let gx = 0; gx < L; gx += STEP) {
    const x = gx + rr(0, STEP), z = gz + rr(0, STEP), h = hAt(x, z);
    const sl = hypot(hAt(x + 4, z) - hAt(x - 4, z), hAt(x, z + 4) - hAt(x, z - 4)) / 8;
    const cl = vnoise(x / 90, 3.1, z / 90), cl2 = vnoise(x / 23, 7.7, z / 23);
    let p = 0, kind = 0, s = 1, hf = 1;
    if (h > YTOP - 14 && sl < 0.4) { p = 0.2 * sstep(0.35, 0.75, cl) + 0.02 * cl2; s = rr(0.45, 1.6); hf = rr(0.8, 1.3); kind = rnd() < 0.5 ? 0 : 1; }
    else if (abs(h - espl) < 10 && sl < 0.35) { p = 0.07 * sstep(0.35, 0.7, cl); s = rr(0.5, 1.1); kind = 1; }
    else if (abs(h - tonto) < 14 && sl < 0.35) { p = 0.07 * sstep(0.25, 0.7, cl2); s = rr(0.3, 0.55); hf = rr(0.5, 0.8); kind = 2; }
    else if (h > YR + 0.6 && h < YR + 4.5 && sl < 0.5) { p = 0.30; s = rr(0.45, 0.85); hf = rr(0.7, 1.1); kind = 3; }
    if (p === 0 || rnd() > p) continue;
    if ((out.length / 8) % THIN && rnd() < 1 - 1 / THIN) continue;
    out.push(x, h - 0.3, z, s, rr(0, TAU), hf, rnd(), kind);
  }
  const n = out.length / 8, cellOf = new Uint16Array(n), count = new Uint32Array(CELLS * CELLS + 1);
  for (let i = 0; i < n; i++) { const c = (floor(out[i * 8] / CELLW) % CELLS) + CELLS * (floor(out[i * 8 + 2] / CELLW) % CELLS); cellOf[i] = c; count[c + 1]++; }
  for (let c = 0; c < CELLS * CELLS; c++) count[c + 1] += count[c];
  const start = count.slice(), fill = count.slice(0, -1), data = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) { const d = fill[cellOf[i]]++; for (let k = 0; k < 8; k++) data[d * 8 + k] = out[i * 8 + k]; }
  return { data, start, n };
}

// ---------------------------------------------------------------- thermals
// Columns of rising air inside the canyons, each marked by three dark birds circling in it (as vultures mark thermals).
// thermal: x, y (floor of the circling), z, radius | lift m/s, top height, phase, 0
function makeThermals(hAt) {
  rseed(11); const out = [];
  for (let k = 0; out.length < 34 * 8 && k < 4000; k++) {
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
// Given in the river's frame so they survive changes to the terrain: [z along the river, side (+1 / -1), height above
// the river, camera offset as a share of the distance to the wall at that height (above the rim: of the rim's
// distance), look ahead m, look offset as a share of the wall distance (negative: the other side), look height].
// Keys 1-6 jump to them; the benchmark renders them at each fog distance. (viewPose, the path: main.js, they need hAt)
const VIEWS = [
  [600, 1, 45, 0.15, 260, -0.1, 35],     // low over the river, down the inner gorge
  [1500, 1, 175, 0.6, 260, -0.2, 150],   // along a wall at mid height
  [2300, -1, 352, 0.9, 320, -0.15, 230], // skimming the rim edge, looking along the canyon
  [3050, 1, 105, 0.55, 230, 0.7, 140],   // down at the Tonto platform, the red walls rising ahead
  [3450, -1, 352, 1.35, 230, 1.1, 340],  // on the rim plateau among pinyon and juniper
  [1050, 1, 150, 0.7, 300, -0.6, 170],   // up the canyon with the low sun ahead: the west wall in silhouette
];
// heights above the river along the benchmark path, one per 180 m of river; the last two run along the rim
const FLYH = [40, 30, 45, 80, 130, 190, 240, 270, 250, 190, 130, 85, 60, 100, 200, 340, 365, 365];

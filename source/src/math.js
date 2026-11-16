// ============================================================================
// math, random numbers, noise, mesh builder (load time only)
// ============================================================================
const { sin, cos, tan, sqrt, min, max, abs, floor, PI, pow, atan2, asin, hypot, exp, round } = Math;
const TAU = PI * 2;
let _seed = 20261116;
const rnd = () => {
  _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rr = (a, b) => a + (b - a) * rnd();
const rseed = (s) => { _seed = (20261116 + Math.imul(s, 7919)) | 0; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const ihash = (x, y, z) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vnoise = (x, y, z) => {
  const ix = floor(x), iy = floor(y), iz = floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = mix(mix(ihash(ix, iy, iz), ihash(ix + 1, iy, iz), fx), mix(ihash(ix, iy + 1, iz), ihash(ix + 1, iy + 1, iz), fx), fy);
  const b = mix(mix(ihash(ix, iy, iz + 1), ihash(ix + 1, iy, iz + 1), fx), mix(ihash(ix, iy + 1, iz + 1), ihash(ix + 1, iy + 1, iz + 1), fx), fy);
  return mix(a, b, fz);
};

// ---------------------------------------------------------------- mesh builder
// vertex format (20 bytes): f32x3 position, snorm8x4 normal + aux (the eagle's wing span, -1 left tip .. 1 right tip),
// unorm8x4 colour (rgb albedo, a = material: 0 matte, 1 feather, 2 beak/eye shine)
class Mesh {
  constructor() { this.p = []; this.i = []; this.aux = []; this.col = []; this.c = [1, 1, 1, 0]; }
  v(x, y, z, aux = 0) { this.p.push(x, y, z); this.aux.push(aux); this.col.push(...this.c); return this.p.length / 3 - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  // surface of revolution around +Z: prof = [[z, r], ...], seg sides, squash y by sy
  lathe(prof, seg, sy = 1, ox = 0, oy = 0, oz = 0) {
    const rings = prof.map(([z, r]) => { const ring = []; for (let s = 0; s < seg; s++) { const a = s / seg * TAU; ring.push(this.v(ox + cos(a) * r, oy + sin(a) * r * sy, oz + z)); } return ring; });
    for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < seg; s++) { const s2 = (s + 1) % seg; this.quad(rings[k][s], rings[k][s2], rings[k + 1][s2], rings[k + 1][s]); }
    return rings;
  }
  // thin double-sided panel through a grid of points P[row][col], thickness th along y
  panel(P, auxFn, th = 0.02) {
    const R = P.length, C = P[0].length, top = [], bot = [];
    for (let r = 0; r < R; r++) { top.push([]); bot.push([]); for (let c = 0; c < C; c++) { const p = P[r][c], a = auxFn(r, c); top[r].push(this.v(p[0], p[1] + th, p[2], a)); bot[r].push(this.v(p[0], p[1] - th, p[2], a)); } }
    for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) { this.quad(top[r][c], top[r][c + 1], top[r + 1][c + 1], top[r + 1][c]); this.quad(bot[r][c], bot[r + 1][c], bot[r + 1][c + 1], bot[r][c + 1]); }
  }
  build() {
    const n = this.p.length / 3, P = this.p, I = this.i, N = new Float32Array(n * 3);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
    }
    const vb = new ArrayBuffer(n * 20), f = new Float32Array(vb), s = new Int8Array(vb), u = new Uint8Array(vb);
    for (let k = 0; k < n; k++) {
      const nx = N[k * 3], ny = N[k * 3 + 1], nz = N[k * 3 + 2], l = hypot(nx, ny, nz) || 1;
      f[k * 5] = P[k * 3]; f[k * 5 + 1] = P[k * 3 + 1]; f[k * 5 + 2] = P[k * 3 + 2];
      s[k * 20 + 12] = round(nx / l * 127); s[k * 20 + 13] = round(ny / l * 127); s[k * 20 + 14] = round(nz / l * 127); s[k * 20 + 15] = round(clamp(this.aux[k], -1, 1) * 127);
      for (let j = 0; j < 4; j++) u[k * 20 + 16 + j] = round(clamp(this.col[k * 4 + j], 0, 1) * 255);
    }
    return { vb, ib: new Uint32Array(I), nv: n };
  }
}
// icosphere (shared vertices) added to mesh m; fn maps each unit vector to a position
function icosphere(m, sub, fn) {
  const t = (1 + sqrt(5)) / 2;
  let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => { const l = hypot(...v); return v.map((c) => c / l); });
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const cache = new Map(), F2 = [];
    const mid = (a, b) => {
      const key = a < b ? a * 65536 + b : b * 65536 + a; let r = cache.get(key);
      if (r === undefined) { const p = [0, 1, 2].map((k) => V[a][k] + V[b][k]); const l = hypot(...p); V.push(p.map((c) => c / l)); r = V.length - 1; cache.set(key, r); }
      return r;
    };
    for (const [a, b, c] of F) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); F2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    F = F2;
  }
  const base = m.p.length / 3;
  for (const v of V) { const p = fn(v[0], v[1], v[2]); m.v(p[0], p[1], p[2]); }
  for (const f of F) m.tri(base + f[0], base + f[1], base + f[2]);
}

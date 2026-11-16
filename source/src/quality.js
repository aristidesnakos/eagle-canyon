// ============================================================================
// quality level and fog distance, chosen before anything is built
// ============================================================================
// LV: 0 High, 1 Medium, 2 Low. Medium keeps every 2nd tree and bush, Low every 4th and drops anti-aliasing.
// localStorage.eagle = "level,pixels". eagleLoad is set while the world is built: still set on the next visit means
// that load crashed the tab, so this one runs a level lower. (Pattern from Abyssal Garden's quality.js.)
const mob = matchMedia('(pointer:coarse)').matches, mem = navigator.deviceMemory;
const keep = (k, v) => { try { localStorage[k] = v; } catch {} };
const URLQ = new URLSearchParams(location.search);
let SV = [], LV, bad;
try { SV = (localStorage.eagle || '').split(','); bad = localStorage.eagleLoad; } catch {}
LV = URLQ.has('q') ? +URLQ.get('q') : SV[0] ? +SV[0] : mob ? (mem > 7 ? 1 : 2) : mem <= 4 ? 2 : 1;
if (bad && LV < 2) { SV = [++LV]; keep('eagle', LV); }
const THIN = 1 << LV, AA = LV > 1 ? 1 : 4;
// The haze is the design (Ari, 15 Nov 2026): you see about FOG metres, and nothing past FOG * 1.25 is drawn.
// This is the one tunable value; ?fog=250 in the address overrides it.
let FOG = URLQ.has('fog') ? +URLQ.get('fog') : 600; // Ari chose 600 m on 16 Nov 2026

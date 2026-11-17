// Records a designed flight frame by frame (dev.html open in the test Chrome): the eagle dives, flaps and banks along a
// path through given points, at its own speed; each frame is exactly 1/FPS of game time.
//   node tools/flight.mjs OUT.mp4 '[[z,side,h],...]' START SECONDS [FPS=60] [FOG=600] [CLEARANCE=10]
// START: where on the path to begin, 0-1. Also writes OUT.wav (the game's wind for the flight) and OUT.json (per frame:
// path time, speed, height, flapping, wing fold).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [out, pts, start, dur, fps = 60, fog = 600, clr = 10] = process.argv.slice(2);
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const wait = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; wait.set(i, (d) => d.error ? j(new Error(d.error.message)) : r(d.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
const dt = 1 / +fps, n = Math.round(+dur * +fps), still = process.env.STILLS; // STILLS=dir: a frame every half second as JPEG, no video
console.log('path', await ev(`EC.full(); EC.fog(${fog}); EC.hud(false); EC.hideMenu(); EC.style(true); JSON.stringify(EC.pts(${pts}, ${clr}))`));
await new Promise((r) => setTimeout(r, 1500));
await ev(`EC.clip(${+start * 60}, ${dt})`);
for (let i = 0; i < 50; i++) await ev(`EC.step(${dt}, ${90 + i * dt})`); // the camera and the eagle settle before the first frame
const ff = still ? null : spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '13', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const log = [];
for (let i = 0; i < n; i++) {
  log.push(await ev(`EC.step(${dt}, ${100 + i * dt})`));
  if (still && i % Math.round(+fps / 2)) continue;
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: still ? 80 : 96 });
  if (still) writeFileSync(`${still}/${String(i).padStart(4, '0')}.jpg`, Buffer.from(r.data, 'base64'));
  else if (!ff.stdin.write(Buffer.from(r.data, 'base64'))) await new Promise((r2) => ff.stdin.once('drain', r2));
}
if (ff) { ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  const k = Math.round(+fps / 10), tr = log.filter((_, i) => i % k === 0).map((l) => [l[1], l[2], l[3], l[4]]);
  writeFileSync(out.replace(/\.mp4$/, '.wav'), Buffer.from(await ev(`EC.wavTrack(${JSON.stringify(tr)}, ${k * dt})`), 'base64'));
  writeFileSync(out.replace(/\.mp4$/, '.json'), JSON.stringify(log)); }
const sp = log.map((l) => l[1]);
console.log(`${n} frames; path time ${log[0][0]} to ${log[n - 1][0]} of 60; speed ${Math.min(...sp)} to ${Math.max(...sp)} m/s; flapping ${log.filter((l) => l[3]).length} frames; diving ${log.filter((l) => l[4] > 0.5).length} frames`);
ws.close();

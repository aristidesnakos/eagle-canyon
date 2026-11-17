// Records a scripted flight frame by frame into a video: each frame is exactly 1/FPS of game time however slow the
// machine (dev.html must be open in the test Chrome, tools/cdp.mjs launch + open).
//   node tools/record.mjs OUT.mp4 T0 SECONDS [FPS=60] [FOG=600] [SLOW=1] ['[z0,[heights]]' for another path]
// SECONDS is video time; SLOW 0.55 flies the path at 0.55 of the benchmark's 39 m/s (water and wings keep real time).
// Also writes OUT.wav: the game's own wind for the same seconds, rendered offline.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [out, t0, dur, fps = 60, fog = 600, slow = 1, path] = process.argv.slice(2);
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const wait = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; wait.set(i, (d) => d.error ? j(new Error(d.error.message)) : r(d.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
await ev(`EC.full(); EC.fog(${fog}); EC.hud(false); EC.hideMenu(); ${path ? `EC.path(...${path});` : ''} 1`);
await new Promise((r) => setTimeout(r, 2000)); // the menu fades out
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '13', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const n = Math.round(+dur * +fps);
for (let i = 0; i < n; i++) {
  await ev(`EC.clip(${+t0 + i / +fps * +slow}, ${1 / +fps}, ${100 + i / +fps})`);
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  if (!ff.stdin.write(Buffer.from(r.data, 'base64'))) await new Promise((r2) => ff.stdin.once('drain', r2));
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r));
writeFileSync(out.replace(/\.mp4$/, '.wav'), Buffer.from(await ev(`EC.wav(${+t0}, ${+dur}, ${+slow})`), 'base64'));
console.log(`recorded ${n} frames at ${fps} fps -> ${out} (+ .wav)`);
ws.close();

// Drives a separate, throw-away Chrome over the DevTools protocol: no packages, Node 22's own WebSocket.
//   node tools/cdp.mjs launch                 start Chrome (own temp profile, port 9333)
//   node tools/cdp.mjs open URL [W H]         open URL in the page, viewport W x H device pixels (default 1920x1080)
//   node tools/cdp.mjs eval 'JS'              evaluate JS in the page (awaits promises), print the result
//   node tools/cdp.mjs shot OUT.png           screenshot of the viewport
//   node tools/cdp.mjs key CODE [down|up]     send a key (e.g. KeyB, Space)
//   node tools/cdp.mjs frames DIR N [EVERYms] N screenshots, one per EVERY ms (for a short clip)
//   node tools/cdp.mjs quit
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = 9333, CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = process.env.EC_PROFILE || path.join(tmpdir(), 'eagle-canyon-chrome');
const [cmd, ...args] = process.argv.slice(2);

async function page() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const p = list.find((t) => t.type === 'page');
  const ws = new WebSocket(p.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; wait.set(i, (d) => d.error ? j(new Error(d.error.message)) : r(d.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, close: () => ws.close() };
}
// sizes the real window so the page is w x h device pixels (an emulated size would end with this connection)
async function metrics(s, w, h) {
  const { windowId } = await s('Browser.getWindowForTarget');
  for (let i = 0; i < 3; i++) {
    const r = await s('Runtime.evaluate', { expression: '[innerWidth, innerHeight, devicePixelRatio]', returnByValue: true });
    const [iw, ih, dpr] = r.result.value; const { bounds } = await s('Browser.getWindowBounds', { windowId });
    const dw = Math.round(w / dpr) - iw, dh = Math.round(h / dpr) - ih; if (!dw && !dh) return;
    await s('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal', width: bounds.width + dw, height: bounds.height + dh } });
    await new Promise((r) => setTimeout(r, 300));
  }
}
const KEYS = { Space: ' ', KeyB: 'b', KeyF: 'f', KeyH: 'h', KeyW: 'w', KeyA: 'a', KeyD: 'd', KeyS: 's', Escape: 'Escape' };
const key = (s, code, type) => s('Input.dispatchKeyEvent', { type: type === 'up' ? 'keyUp' : 'rawKeyDown', code, key: KEYS[code] || code.replace(/^(Key|Digit)/, '').toLowerCase(), windowsVirtualKeyCode: code.startsWith('Key') || code.startsWith('Digit') ? code.slice(-1).toUpperCase().charCodeAt(0) : code === 'Space' ? 32 : 0 });

if (cmd === 'launch') {
  mkdirSync(PROFILE, { recursive: true });
  const c = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-webgpu', '--enable-webgpu-developer-features', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--window-size=1000,640', '--window-position=0,0', 'about:blank'], { detached: true, stdio: 'ignore' });
  c.unref();
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); console.log('chrome up, profile', PROFILE); process.exit(0); } catch { await new Promise((r) => setTimeout(r, 200)); } }
  console.log('chrome did not come up'); process.exit(1);
}
const { send, close } = await page();
try {
  if (cmd === 'open') {
    const [url, w = 1920, h = 1080] = args; await metrics(send, +w, +h);
    await send('Page.navigate', { url }); console.log('opened', url, `${w}x${h}`);
  } else if (cmd === 'size') {
    await metrics(send, +args[0], +args[1]);
    const r = await send('Runtime.evaluate', { expression: '[innerWidth*devicePixelRatio, innerHeight*devicePixelRatio]', returnByValue: true }); console.log('page is', r.result.value.join('x'));
  } else if (cmd === 'eval') {
    const r = await send('Runtime.evaluate', { expression: args[0], awaitPromise: true, returnByValue: true });
    console.log(r.exceptionDetails ? 'ERROR ' + JSON.stringify(r.exceptionDetails) : typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value));
  } else if (cmd === 'shot') {
    const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(args[0], Buffer.from(r.data, 'base64')); console.log('saved', args[0]);
  } else if (cmd === 'key') {
    if (args[1] !== 'up') await key(send, args[0], 'down');
    if (args[1] !== 'down') await key(send, args[0], 'up');
  } else if (cmd === 'frames') {
    const [dir, n, every = 100] = args; mkdirSync(dir, { recursive: true });
    for (let i = 0; i < +n; i++) {
      const t = Date.now(); const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
      writeFileSync(path.join(dir, `f${String(i).padStart(3, '0')}.jpg`), Buffer.from(r.data, 'base64'));
      const left = +every - (Date.now() - t); if (left > 0) await new Promise((r) => setTimeout(r, left));
    }
    console.log('saved', n, 'frames to', dir);
  } else if (cmd === 'quit') {
    await send('Browser.close').catch(() => 0);
  }
} finally { close(); }

// screenshot of URL with a transparent background: node alpha.mjs URL OUT.png
const [url, out] = process.argv.slice(2);
import { writeFileSync } from 'node:fs';
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const wait = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; wait.set(i, (d) => d.error ? j(new Error(d.error.message)) : r(d.result)); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.navigate', { url }); await new Promise((r) => setTimeout(r, 2500));
await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => 1)', awaitPromise: true });
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
const r = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(r.data, 'base64'));
await send('Emulation.setDefaultBackgroundColorOverride', {});
console.log('saved', out); ws.close();

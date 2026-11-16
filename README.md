# Eagle Canyon (spike)

**You are a bald eagle flying through Arizona's Grand Canyon.** A playable browser prototype: one HTML file, WebGPU, no
engine, everything made in code. The first run of the bird game spike (Chimneys repo, `docs/studio/BIRD_GAME_SPIKE.md`),
16 Nov 2026. Built on Abyssal Garden (see `CREDITS.md`).

## Play

Open `index.html` in Chrome or Edge on a desktop computer (WebGPU). Click **Fly**.

| | |
|---|---|
| Flap to climb | `W` or `Space` |
| Bank and turn | `A` / `D`, or move the mouse left / right |
| Nose up / down | mouse up / down, or the arrow keys |
| Dive (wings folded) | hold `Shift` |
| Flare and slow down | hold `S` |
| Thinner / thicker haze | `[` / `]` (50 m steps) |
| Viewpoints | `1` to `6` |
| Stats | `H` |

Gliding sinks slowly; diving trades height for speed and pulling up trades it back. Touching rock bumps and slows you;
you never die. The world repeats every 4 km in both directions, so there is no edge.

The haze is the design: you see about 400 m (`?fog=250` or `?fog=600` in the address changes it; nothing past 1.25 times
that distance is drawn, which is what keeps the rendering light).

## Build

Node 18+. In `source/`: `npm install` (esbuild only), then `npm run build` for `index.html` or `npm run build:dev` for
`dev.html` (adds `F` scripted flight, `B` benchmark and `window.EC` for the tools).

## Measure

`tools/cdp.mjs` drives a separate throw-away Chrome (own profile) over the DevTools protocol; `tools/views.sh FOG DIR`
renders the six viewpoints, `tools/clip.sh START SECONDS FOG DIR` a 30 fps clip, and in the page
`EC.bench(400)` runs the 60 s fly-through at full resolution and returns frame and GPU times. Results: `RESULTS.md`.

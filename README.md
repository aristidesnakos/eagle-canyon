# Eagle Canyon (spike)

**You are a bald eagle flying through Arizona's Grand Canyon.** A playable browser prototype: one HTML file, WebGPU, no
engine, everything made in code. The bird game spike (Chimneys repo, `docs/studio/BIRD_GAME_SPIKE.md`): run 1 built it,
run 2 made the world varied, run 3 made it sharp up close, all 16 Nov 2026. Built on Abyssal Garden (see `CREDITS.md`).

The code is on GitHub: https://github.com/aristidesnakos/eagle-canyon

## Play

Clone the repository or download `index.html`, then open it in Chrome or Edge on a desktop computer (WebGPU). Click
**Fly**.

| | |
|---|---|
| Flap to climb | `W` or `Space` |
| Bank and turn | `A` / `D`, or move the mouse left / right |
| Nose up / down | mouse up / down, or the arrow keys |
| Dive (wings folded) | hold `Shift` |
| Flare and slow down | hold `S` |
| Thinner / thicker haze | `[` / `]` (50 m steps) |
| Viewpoints | `1` to `8` |
| Stats | `H` |

Gliding sinks slowly; diving trades height for speed and pulling up trades it back. Touching rock bumps and slows you;
you never die. The world is 8 km across and repeats in both directions, so there is no edge.

## Where to fly

Two rivers run north to south, each through a chain of different canyons. Along the first river (keys 1 to 6 jump there):
the classic canyon with its buttes and side canyons, then **the narrows** (a slot 330 m deep and 15 m wide at the water),
**the stone bridge** where the slot opens, **the basin** (more than 2 km across, full of tiered temples), **the gorge**
(a dark inner gorge with rapids and boulders) and, back in a classic stretch, **the waterfall** that drops from a hanging
side canyon of blue-green travertine pools. East of the first river the rim rises 110 m higher and carries **a ponderosa
pine forest** (key 7). The second river runs the same kinds of canyon in another order.

The haze is the design: you see about 600 m (`?fog=250` or `?fog=400` in the address changes it; nothing past 1.25 times
that distance is drawn, which is what keeps the rendering light).

## What makes it sharp (run 3)

Rock, soil, bark and needles get their fine detail from three small textures drawn in code when the page loads (rock
beds with joints, cross-bedded sandstone, stony ground). They are mapped onto the world by position at three sizes,
so strata stay level and nothing stretches on a cliff, and the GPU filters them. This costs less than the per-pixel noise
it replaced, and the time saved lets the game draw every pixel of a 2560×1600 screen. The sun's shadows are stored
every 2 m with an edge about 2 m wide.

## Build

Node 18+. In `source/`: `npm install` (esbuild only), then `npm run build` for `index.html` or `npm run build:dev` for
`dev.html` (adds `F` scripted flight, `B` benchmark and `window.EC` for the tools).

## Measure

`tools/cdp.mjs` drives a separate throw-away Chrome (own profile) over the DevTools protocol; `tools/views.sh FOG DIR`
renders the eight viewpoints, `tools/close.sh DIR` eight close-ups (`tools/sharp.sh DIR` scores their fine detail),
`tools/bench3.sh` times run 2 against run 3, `tools/record.mjs` and `tools/flight.mjs` record a scripted or a designed flight frame by frame into a video, `tools/clip.sh START SECONDS FOG DIR` a 30 fps clip, and in the page
`EC.bench(400)` runs the 60 s fly-through at full resolution and returns frame and GPU times. Results: `RESULTS.md`.

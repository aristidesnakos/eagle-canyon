# Results: first run of the bird game spike (16 Nov 2026)

Predictions P0–P4 and the kill line are from `docs/studio/BIRD_GAME_SPIKE.md` in the Chimneys repo, written 15 Nov
2026 before anything was built. Raw log: `results/bench-2026-11-16.txt`.

**How measured:** M2 MacBook Pro (8 GB, macOS 26.4), Chrome 157 in a separate throw-away profile driven by
`tools/cdp.mjs`, page sized to 1920×1080 device pixels (720p for the kill line). Each run is the 60 s scripted
fly-through (`EC.bench`, `tools/bench.sh`) with the resolution held at 100%, GPU time from timestamp queries.
Unity not running, one copy of the game, no other test tabs. **Not fully quiet:** Ari's own Chrome stayed open
(about 570 MB) and the load average was about 3 at the start; I didn't close Ari's browser.

| # | Prediction | Measured | Result |
|---|---|---|---|
| P0 | Abyssal Garden unchanged, Medium, 1080p window: baseline (High on 15 Nov: 50 fps, GPU 18.1 ms at 29% of the pixels) | Medium holds 60 fps only by dropping to 942×530 (24% of the pixels) and its shortest draw distance; GPU 12.9 ms average, 15.4 ms p99, 22.1 ms max | Recorded |
| P1 | Eagle build, Medium, haze 400 m, full 1080p: ≥ 60 fps average, GPU ≤ 12 ms, no frame over 25 ms | 59.9 fps; GPU 7.02 ms average (p99 12.88, max 14.7); frame max 18.3 ms, 0 frames over 25 ms | **Pass** |
| P2 | GPU at 600 m ≤ 1.5 × GPU at 250 m | 8.26 ms vs 6.94 ms = **1.19×** | **Pass**, but read the note |
| P3 | ≤ 300 KB minified | `index.html` 54.9 KB (22.8 KB gzipped) | **Pass** |
| P4 | Ari, 5 minutes: "keep flying" ≥ 4/5 and a haze that reads as weather | 3/5 ("I need more diversity in my terrain"); haze 600 m | **Miss** on the rating; the haze pick is made |
| Kill | < 45 fps at 720p with haze 250 m kills the approach | 60 fps, GPU 4.23 ms average (max 9.1) | **Not killed**, by a wide margin |

**Note on P2.** It passes, but the reason in the plan ("if more, fog distance is the main cost lever, as assumed")
turns out the other way: going from 250 m to 600 m costs only about 1.3 ms. Most of the frame is per-pixel shading
(terrain detail, haze), which doesn't depend on how far you see. So on this Mac the haze is not what keeps the game
light; the simple scene is. In practice: 600 m is affordable, and the haze distance can be chosen for the look.

**Cautions.** One run per setting, not interleaved; the frame-rate cap is the display's 60 Hz, so fps can't show
headroom (GPU time does). The final haze change (clear first third) came after the timed runs; it changes a few
arithmetic steps per pixel and was not re-timed.

## Visual critic

A separate subagent saw only renders (6 fixed views at 1920×1080 at each haze distance) and a 5 s 30 fps clip, never
the code. Three rounds.

- **Round 1** (critical: cold lavender haze reading as a wall; majors: pinstripe strata that shimmer, rounded
  "melted wax" shapes, snow-like caps, black gorge with contour-loop marks, noisy plateau, lollipop trees, midday
  sky). Fixed: warm haze clear near, broad strata with anti-aliasing, harder cliffs and flatter buttes, warmer caps,
  more bounce light, veins removed, darker trees with long shadows, no sky streak, greener river.
- **Round 2** (critical: haze still too grey and filling in by half the distance; majors: too few visible bands and
  smooth slabs, vertical smears on steep faces, spiky silhouettes, blocky plateau ground, sun shape changing with
  haze). Its verdict on distance: **600 m reads most like weather**; 250 m reads as being inside a cloud.
  Fixed after it: haze clear for the first third of the distance, warmer toward the sun.
- **Round 3** (final): highest severity still **critical**. The haze tint near the horizon is still cool lavender-grey,
  so fogged cliff tops go whitish and view 3 reads as snowy peaks; it wants a warm dusty peach/ochre haze. Majors:
  at 250 and 400 m the rim view empties out (the haze needs to be thinner at rim height than in the gorge) and the
  fade jumps from clear to white with no middle depth plane; sawtooth teeth on steep ridgelines (the mesh is too coarse
  for vertical cliffs); strata barely read on shaded walls. Moderates: stretched slope texture on the platform,
  blocky plateau ground, bright round trees, the sun sitting high in view 6, the eagle not darkening in shade.
  Its verdict again: **600 m reads most like weather**; 250 m reads as a fog bank; the colour fix matters more
  than the distance.

**Not met:** the gate was "iterate until nothing above minor". It isn't met; the open items are listed above and
are the first job of the next session.

## Ari's answers (16 Nov 2026, page db `answers/eagle-1`)

- **Haze:** 600 m. It is now the default (`quality.js`).
- **Keep flying after 5 minutes:** 3 of 5, below the 4 the plan asked for. His note: "I need more diversity in my
  terrain". So the renderer is fast enough, but the world is too samey to hold him: one kind of canyon repeating every 4 km.
- **What exploring should give next:** all five offered: places to find that fill in a map, a nest to come back to,
  riding the air (thermals, updrafts, gusts), fishing at the river, and time passing from dawn to night. Not "the view is
  enough".

## Haze fix after the answers

Warm dusty tan-rose away from the sun and peach-gold toward it (no more lavender), thinner than the set distance at
rim height and about twice as thick at the river, and a gentler fade with a middle depth plane. Not re-timed.
Critic round 4 (on the 400 and 600 m renders): highest severity down from critical to **major**. Toward the sun and down
the gorge the haze now reads as warm dusty air with three or four depth planes, and 600 m is clearly better than 400 m.
The major left was the haze away from the sun (rim and plateau views) still going cool grey-mauve. That side and the sky's
horizon were warmed once more afterwards, checked by eye but not re-reviewed. Still open from the critic: stretched texture
and sawtooth edges on steep faces, the near-black inner-gorge walls, the speckled platform slope, faint sky banding.

## What was built

`index.html` (54.9 KB): a WebGPU renderer written for this game on Abyssal Garden's skeleton. A 4 km heightfield that
repeats in both directions with two canyons, shaped through the Grand Canyon's real rock sequence (Kaibab to
Vishnu schist: cliffs and slopes, and the colour follows the same table), side canyons, gullies and buttes. A river with
banks and foam. Several thousand pinyon, juniper, bushes and tamarisk (Medium keeps half). A late-afternoon sun at 15 degrees with
shadows baked once as a shadow-height map, so the sun is decided in 3D. Height-dependent haze with one tunable distance.
The eagle built in code (flapping, folding to dive, banking), a glide/flap/dive flight model with a coordinated turn,
bump-and-slow collision, a chase camera, thermals marked by circling birds, wind and wingbeat sound made live.

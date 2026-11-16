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

---

# Run 2: a varied world (16 Nov 2026)

## Predictions (written before building)

**Hypothesis.** Ari's 3/5 comes from sameness, not from the flying or the look. A world of clearly different places a
minute or two apart (a narrow slot, a wide basin full of temples, a rapids gorge, a waterfall from a side canyon, a stone
bridge to fly under, a pine forest on a higher rim), on a map four times larger (8 km, so a glide along one river meets
the same place again only after about 8 minutes) will lift "keep flying" to 4 or more, without breaking the frame budget.

Baseline for the new numbers, measured just before building: the page reaches the menu 0.7 s after load; the test
Chrome's GPU process uses 346 MB (peak 488 MB).

| # | Prediction | Measured | Result |
|---|---|---|---|
| R1 | Ari, after 5 minutes: "keep flying" 4/5 or more | Waiting for Ari: the question is on his page, saved to `answers/eagle-2` | Open |
| R2 | Full 1080p, Medium, haze 600 m, fly-through through the new places: ≥ 60 fps average, GPU ≤ 12 ms average, no frame over 25 ms | 59.9 fps; GPU 10.81 ms average (p99 17.29, max 19.77); frame max 19.5 ms, 0 frames over 25 ms | **Pass** |
| R3 | `index.html` ≤ 300 KB (expected about 80 KB) | 72.1 KB (28.8 KB gzipped) | **Pass** |
| R4 | The 8 km world costs at most 2.5 times the memory: test Chrome GPU process ≤ 850 MB, menu ≤ 5 s after load | GPU process 519 MB (peak 648 MB) in a fresh test Chrome, 1.5 times the baseline; menu 2.2 s after load (3 reloads: 2.32, 2.17, 2.24 s) | **Pass** |
| R5 | Visual critic, final round: nothing above minor | Highest severity **moderate** after six rounds (no major or critical); 11 moderate items left, listed below | **Miss** |

Raw log: `results/bench-run2-2026-11-16.txt`. Same conditions as run 1: Unity not running, one copy of the game, but Ari's
own Chrome open (about 900 MB) and a load average of about 3.7. The benchmark path now starts in the classic canyon,
runs the narrows, passes under the stone bridge and climbs into the basin.

**Notes on R2.** GPU time rose from 8.3 ms (run 1, haze 600 m) to 10.8 ms. The cost is per-pixel shading (region lookup,
smoother far normals, the far-water check), not the bigger world. Haze distance is still a weak lever: 250 m saves
0.7 ms. The slowest 1% of GPU frames (17.3 ms) is now over a 60 Hz frame. Frames still arrived on time in the run, but
there is less headroom than in run 1, and the next feature should be timed before it is kept. The 720p kill-line run:
60 fps, GPU 7.5 ms.

**Notes on R4.** The heights doubled in each direction (4096² over 8 km, still 2 m per texel). Kept down by baking sun
and sky at half resolution and putting normals in their own small texture with mips. Generation runs in four GPU strips
so no single job runs long.

## What was built

Two rivers now run north to south through 8 km, each through a chain of regions that blend over 350 m:

- **Classic** (run 1's canyon): spurs, buttes, side canyons.
- **The narrows:** a slot of smooth orange sandstone, 330 m deep, about 15 m of river.
- **The basin:** 2.5 km across, tiered temples, clearer air while you're in it.
- **The gorge:** a squeezed inner gorge of grey-violet schist, with rapids, standing waves and boulders.

River A runs classic, narrows, basin, gorge, classic; river B runs the same kinds in another order.

Two landmarks on river A:
- **The stone bridge**, a rock arch where the narrows open, which you can fly under or over (with collision).
- **The waterfall**, dropping from a hanging side canyon of blue-green travertine pools, with spray at its foot.

The plateau east of river A rises 110 m (the rock layers stretch to match) and carries **ponderosa pine forest** with
meadows: 41,000 pines on Medium, a new mesh.

Also: eight viewpoints (keys 1–8), a chase camera that no longer pops over the rim from inside the slot, and river
channels that never run dry (a check in `dev.html`, `EC.dry()`: 0 of 512 samples dry on river B, 1 on river A).

### Fixes for the run 1 critic's open items

- **Stretched texture on steep faces:** steep and far ground now reads a smoother normal from the normal mips. Better,
  but it is still the most common remaining complaint.
- **Saw-tooth edges:** each terrain cell splits along the diagonal that follows the rock; far shadow edges soften with
  distance. Remaining: small steps on some slot rims.
- **Near-black inner-gorge walls:** bounce light now comes from the sunlit walls across the canyon. The darkest wall
  measured about RGB 40/32/33, "readable" in every round from 3 on.
- **Speckled slope:** soil and rock colour now come from the smooth normal, not the bumped one.
- **Sky banding:** a stronger triangular dither. No banding found in any of the six rounds.

### Bugs found while verifying

- An isolated-pinnacle pass after generation.
- The far river drawn from the full-resolution heights. In the basin the river had shown as a stepped dashed line.
  There were two causes: the wall noise had lifted parts of the bed above the water, and the coarse mesh can't hold a
  narrow channel.
- The noise hash was nearly symmetric in x and y, which mirrored every noise field about the world's diagonal and left
  a crease along it.
- Tree shadows smeared down steep walls.

## Visual critic, run 2

Six rounds. Each round was a fresh subagent that saw only the eight viewpoint stills (1920×1080, haze 600 m) and 14
frames of a 7 s clip, never the code. From round 3 on, the brief defined the severities ("major" = a player would notice
within seconds and find it wrong or broken), because the first rounds used them loosely.

| Round | Highest | What it said, in short | Done after it |
|---|---|---|---|
| 1 | Major | Slot, gorge, bridge and waterfall views all looked like the same two brown walls; the basin dissolved in haze; spikes in the slot (they were boulders); cream "snowy" tops; the clip never reached the bridge | A colour and rock style per region, clearer basin air, domed boulders, warmer tops, stronger bounce light, rapids |
| 2 | Major | The clip missed the bridge (it sat above the frame); basin temples read as spikes; saw-tooth shadow edges far away | Path and clip through the bridge, tiered temples, softer far shadows, waterfall spray, new viewpoints |
| 3 | **Moderate** | All eight places read and differ; the clip shows slot, bridge, open canyon. Left: weak classic view, shadow speckle under the bridge, stepped basin river, gorge too brown, card-like spray | Normal mips (also fixed the GPU budget), bridge shadow, cooler schist, viewpoints |
| 4 | Major | One major: the basin river drawn as a staircase | Far water from the full-resolution heights, pinnacle pass |
| 5 | Major | The same staircase line | Traced to the noise hash's mirror seam and dry river stretches; fixed both |
| 6 (final) | **Moderate** | Nothing broken. All eight places read; the clip changes place clearly | See below |

Open items from round 6, all moderate:

- The gorge walls are still dark maroon rather than grey schist.
- Stretched or chevron texture on some steep faces (views 4 and 8).
- A hard light edge on one end of the bridge.
- Vertical stripes on the slot walls, which want flowing sandstone bands.
- Dark smears on a bench face after the bridge.
- A curb-like line along the rim edge in view 7.
- Basin temples still too peaked.
- The classic view's mid wall lost in haze.
- A canal-straight gorge river.
- Dither stipple on the waterfall spray.

Minor: a stepped far line in the basin, the flat cut the waterfall leaves from, rust-red sunlit pine tops, ground
mottle, rim steps, the eagle's wingtips edge-on.

**Not met:** the gate was "nothing above minor". It reached moderate (from major) and stopped there. The open items
above are the next run's first job. The critics' severities also drifted between rounds (the same river was moderate
in round 3 and major in round 4), so one more round would not have proven much without the changes.

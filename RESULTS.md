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
| R1 | Ari, after 5 minutes: "keep flying" 4/5 or more | **4 of 5**, no note (Ari, 16 Nov 2026, page db `answers/eagle-2`; run 1 was 3) | **Pass** |
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

---

# Run 3: much more resolution (16 Nov 2026)

Ari, after rating run 2 at 4 of 5: "It's looking good but I would like for it to be like much more resolution and for
you to exercise your judgment for how this should be best developed."

## Predictions (written before building)

**Where the softness comes from** (measured on the run 2 build before changing anything):

- **Blurry surfaces.** All rock detail is smooth noise worked out per pixel. Nothing in it is finer than about half a
  metre, and nothing has a hard edge. On the eight close-up stills the fine-detail score is 0.78, and about 0.5 of
  that is the dither added against sky banding.
- **Soft shadow edges.** The sun's shadow is stored every 4 m and its edge is spread over about 9 m of ground.
- **Not the pixel count.** On this Mac's own screen (2560×1600) the run 2 build already holds 60 fps at every pixel
  in the fly-through (GPU 12.7 ms average, p99 15.2). But the game caps itself at 90% of this screen, and its automatic
  scaler ended two test flights at 66% and 90%. So part of the softness is an upscaled picture.
- **Cost.** About two thirds of each frame is that per-pixel rock noise (terrain drawn flat: 3 to 4 ms; shaded: 10 to
  14 ms). So it's also the place to win time back.

**Hypothesis.** Replacing the per-pixel noise with small detail textures made once at load will make the rock both
sharper and cheaper. The textures hold bedding ledges, joints and grain, are mapped onto cliffs by world position so
strata stay horizontal, and are filtered by the GPU. Together with sun shadows stored at full resolution with a
narrow edge, this will read as "much more resolution" at flying distance and up close, on the same heights. The
time won back goes to drawing every pixel of the screen.

"Fine-detail score" = mean absolute difference between a still and its own 2-pixel blur (luma, 0 to 255), from
`tools/sharp.sh`. It rewards noise as well as detail, so the critic has to confirm the detail reads as rock.

| # | Prediction | Measured | Result |
|---|---|---|---|
| S1 | Full 1080p, Medium, haze 600 m, fly-through: ≥ 60 fps, GPU ≤ 12 ms average and p99 ≤ 16.7 ms, no frame over 25 ms. And no slower than the run 2 build timed in the same session (today, before building: 8.8 ms average, p99 14.4; run 2's own log said 10.8 and 17.3, so sessions differ by 2 ms) | 59.9 to 60 fps; GPU **10.4 and 9.9 ms** average (p99 11.6 and 11.5, max 12.9); frame max 18.9 ms, 0 frames over 25 ms. The run 2 build in the same session: 12.6 and 12.4 ms (p99 15.3 and 15.7). In the three earlier sessions run 3 was also about 2 ms lower each time (7.5 against 9.7, 8.0 against 9.7, 10.3 against 12.3) | **Pass** |
| S2 | This Mac's own screen, 2560×1600, every pixel: ≥ 60 fps, GPU ≤ 12.7 ms average (run 2 build today: 12.7, p99 15.2), and the automatic scaler ends the flight at 100% of the screen (run 2 build: 66% and 90% in two flights) | 59.9 fps; GPU **12.5 and 11.8 ms** average (p99 15.4 and 16.0); the run 2 build in the same session: 13.8 ms. The scaler ended both flights at **100%** of the screen (2560×1600), as it did in all 8 flights across the four sessions | **Pass**, by a narrow margin on the GPU average |
| S3 | Fine-detail score, mean of the 8 close-up stills: ≥ 2.0 (run 2 build: 0.78). Mean of the 8 viewpoints: ≥ 1.3 (run 2 build: 0.85) | Close-ups **1.76** (from 0.78). Viewpoints **1.87** (from 0.85) | **Miss** on the close-ups, **pass** on the viewpoints |
| S4 | Blind pairs: a critic shown 8 close-up pairs (run 2 and run 3, sides shuffled, no labels) picks run 3 as the sharper, more detailed one in ≥ 7 of 8 | **8 of 8**, twice (two fresh judges, two shuffles), all but one pick at high confidence | **Pass** |
| S5 | `index.html` ≤ 300 KB (expected about 90 KB) | 83.7 KB (32.9 KB gzipped) | **Pass** |
| S6 | Test Chrome GPU process ≤ 850 MB (run 2: 519 MB); menu ≤ 5 s after load (run 2: 2.2 s) | GPU process 656 MB (peak 677 MB) in a fresh test Chrome, measured as in run 2 (an earlier run 3 build measured 556 MB, peak 668, the same way); menu 2.4 to 2.5 s after load | **Pass** |
| S7 | Visual critic, final round: the gate is again "nothing above minor". My honest expectation: it stops at moderate a third time, with 4 or fewer moderate items (run 2 ended with 10) | Final round (5): highest severity **moderate**, no major or critical; **10** moderate and 10 minor items. Rounds 1, 3 and 4 each had majors, fixed before the next round | **Miss** on the gate, and on my own expectation of four or fewer |

Raw logs: `results/bench-run3-2026-11-16.txt` (the final build) and `results/bench-run3-earlier-2026-11-16.txt` (three
earlier sessions the same evening, on earlier run 3 builds). `tools/bench3.sh` times the run 2 build and the run 3
build in turn (A, B, A, B), because the same build measures 2 ms apart between sessions.

**Conditions.** Unity not running, one copy of the game in the test Chrome. **Not quiet:** Ari's own Chrome stayed open
(about 30 processes) and the load average was 7.3 at the start. The critic subagents ran during parts of the timing
(they only read images, but they are not nothing). I didn't close Ari's browser.

**Notes on S1 and S2.** GPU time on this Mac moves with the session (the GPU runs slower when it has less to do), so
only the same-session comparison means much. In all four sessions run 3 was about 2 ms under run 2 at 1080p. The game's
resolution cap was also raised from 2560×1440 to 2560×1600, so on this screen it now draws every pixel, where run 2
could not pass 90%.

**Note on S3.** The close-up score more than doubled (0.78 to 1.76) but stopped short of the 2.0 I predicted. The
slot walls are meant to be smooth, and walls in full shade carry little contrast. An earlier build of this run scored
higher with harsher patterns, which the critic read as masonry and wood grain, so I did not chase the number.

**Note on S4.** Run twice with fresh judges: first on the round 3 stills (the shuffle happened to put run 3 on the
left in 7 of 8), then on the round 4 stills with a forced 4/4 split. 8 of 8 both times. Both judges also said the new
detail has faults of its own: joints that form an even crackle net, and a hint of wood grain in the slot.

## What was built

- **Rock detail from textures made at load.** Three 1024² tiles are drawn in code when the page opens (18 MB with
  mips): bedded rock with joints, thin strata, pits and grain; cross-bedded sandstone; stony soil. The shaders lay them
  onto the world by position (cliffs from the side with height as one axis, so beds stay level round a butte; flats from
  above) at three sizes each (about 5, 23 and 97 m), and the GPU filters them with anisotropy. They replace about a dozen
  noise evaluations per pixel, which is where the 2 ms came from.
- **Every region its own rock.** The gorge's schist is the bedded tile turned 58 degrees at smaller sizes, grey with
  pale veins. The narrows use the sandstone tile with one mapping along the river, so the thin layers flow unbroken.
- **The slot's walls reshaped.** Their cliffs were thinner than one 2 m height texel, which is what made the vertical
  stair-steps. In the narrows the wall is now one steep, gently waved slope.
- **Sun shadows at full resolution.** Shadow heights every 2 m (were 4 m), with an edge about 2 m wide near the camera
  (was about 9 m), wider on steep faces and with distance. Sky light, rim rise, travertine and the region values moved
  into one small map, so no pixel looks the regions up any more.
- **Trees.** Needle and bark texture from the same tiles, ragged crown edges, less red under the crowns, lumpier pine
  crowns, and real shadows: a trunk line and a crown patch per tree, where run 2 had one blurred ellipse.
- **From the run 2 critic's list:** grey gorge rock; flowing bands in the slot; flat-topped basin temples; the gorge
  river widens into pools (0 of 512 samples dry on either river); smooth blended spray in place of the stipple; a
  classic viewpoint that is not lost in haze; far sunlit rock dimmed to the haze but keeping its own colour.
- **Tools:** `tools/close.sh` (eight close-up stills), `tools/sharp.sh` (the fine-detail score), `tools/bench3.sh`,
  and in `dev.html` `EC.gpu`, `EC.force`, `EC.settle`, `EC.look`.

## Visual critic, run 3

Five rounds, each a fresh subagent that saw only renders: the eight viewpoints, eight close-ups and 14 frames of the
7 s clip through the slot and under the bridge. Same brief and severity wording as run 2's rounds 3 to 6, plus the
close-ups and three new risks to check (man-made-looking patterns, noise, places still blurry).

| Round | Highest | What it said, in short | Done after it |
|---|---|---|---|
| 1 | Major (2) | Gorge and waterfall walls still soft streaks up close; vertical stair-stepped strips on the slot walls. 9 moderates | Schist from the bedded tile; slot walls reshaped and mapped along the river; thin strata; softer shadow edge on steep faces |
| 2 | **Moderate** (10) | "Line work is now crisp almost everywhere, but it sits on a soft base": no grain between the lines; trees behind the rock in finish; the same squiggle motif everywhere | Grain and pitting; straighter beds; no soil cracks; slopes take detail from the side; tree foot shadows |
| 3 | Major (1) | Schist cracks blown up into wide ribbons with a comb-like edge | Smaller tiles for the schist; the two larger tiles never magnified; detail follows the drawn mesh far away; bedded rock on the bridge |
| 4 | Major (1) | "Trees cast no shadows; the forest looks like models on a table" (rounds 2 and 3 had called this moderate) | Trunk-and-crown tree shadows; sparser, straighter joints; no dark ring round stones; stronger bark |
| 5 (final) | **Moderate** (10) | No major or critical. All eight places read and differ; the clip changes place clearly | Nothing: this is where the run stops |

Open items from round 5, all moderate:

- Joints on the classic and basin cliffs read as masonry, most of all on round towers.
- The slot's sandstone reads as polished wood: it wants sand grain and broken line runs.
- Schist walls look smeared along the foliation, with plank-like grooves.
- The stone bridge is a box beam, not a rounded arch.
- The wall beside the waterfall is bland.
- Pines are stacked blobs, not ponderosa.
- Mid-distance forms go pale cream in the haze and lose their strata.
- The haze swallows the slot's far wall at short range.
- Red ground near the camera in the basin is flat.
- The rim edge shows a kerb-like saw-tooth strip.

Minor: dotted mesh where the river plane hands over to the far water, a uniform pale outline along the river, a
ribbon-like waterfall, thin spikes, track-like lines on gentle ground, colour blotches that ignore the strata, a red
fringe on sun/shade edges, a few squiggle lines, pale flecks on one dark slope, the eagle hidden in one close-up.

**Not met, again.** The gate was "nothing above minor"; my own expectation was moderate with four or fewer items. It
ended at moderate with ten. What changed is what the items are about: run 2's were blur, stretched texture and wrong
colour; run 3's are mostly about the new detail looking drawn or built (masonry joints, wood grain, plank grooves),
plus the shapes the detail sits on (the bridge, the towers, the pines). Severities drifted between rounds as in run 2
(tree shadows were moderate, moderate, then major). The next step for the look is shape, not more texture: a real arch,
stepped temples, tree models, and joints that follow the rock instead of a grid.

## What this run taught

- **"More resolution" was detail and shadow edges, not pixel count.** The run 2 build could already hold 60 fps at
  every pixel of this screen. The picture was soft because nothing in it was finer than half a metre.
- **Detail textures made in code beat noise per pixel twice over:** sharper, and cheaper.
- **A sharpness number is easy to raise with ugly patterns.** The blind pairs and the critic were the useful measures.

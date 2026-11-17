# X thread: Eagle Canyon (drafted 16 Nov 2026)

> **Posted 17 Nov 2026** from @just_aristides, on Ari's yes to the exact text: https://x.com/just_aristides/status/2122591559090602085
> (eight posts, the video on post 1, the four before/after images on post 2). **AI-drafted text** (Claude Fable 5.2). Same format and rules as the Chimneys drafts (`~/Documents/chimneys/docs/launch/THREADS.md` section 7): every
> number has a source, misses are told plainly, footage is labelled, no link to a page that does not exist.
> Order asked for by Ari (16 Nov): the hook with the finished game first, then before/after contrasting Opus 5.5
> with Fable 5.2, then how it was built, then the repo so people can play.

**Platform.** X, from Ari's own account. Each post is at most 280 characters (a link counts as 23).

**Hook.** An eagle over a canyon in your browser: one HTML file, 84 KB, no engine, no image files.

**Proof assets.**
- Post 1: `out/video/eagle-canyon-x-v2.mp4` (18.2 s, 1920×1080, 60 fps, 23 MB; not in git, `out/` is ignored). The
  second cut, after Ari asked for shorter and more dynamic. **Recorded in the game**, frame by frame, on five designed
  flights with hard cuts: through the slot and under the stone bridge, a low banking run down the gorge, a pass over
  the pine rim, a dive past the travertine pools and the waterfall, a flapping climb beside a sunlit cliff into the
  sun. Not hand-flown: a recording script moves the eagle along each path at 20 to 60 m/s and sets its wings the way
  the game's eagle behaves (folded in a dive, flapping to climb, banked into turns); the chase camera is the game's,
  following 2.2 times tighter than in play. The sound is the game's own wind and wingbeats, rendered by the game's
  sound code on the same clock. Title card for the first 3 s; end card with the play link and the repo for the last 2.4 s.
  (The first cut, 28.3 s and calmer, is `out/video/eagle-canyon-x.mp4`.)
- Post 2: `launch/img/pair-1-wall.png`, `pair-2-slot.png`, `pair-3-gorge.png`, `pair-4-pines.png`. Each is two cuts
  from the game at full size, same camera spot: left the run 2 build (written with Claude Opus 5.5), right the run 3
  build (written with Claude Fable 5.2). Labelled on the image.
- Post 7: https://aristidesnakos.github.io/eagle-canyon/ (GitHub Pages, turned on 16 Nov on Ari's yes; serves
  `index.html` from `main`; checked the same day: HTTP 200, byte-identical to the repo's file, and the menu loads in
  desktop Chrome) and https://github.com/aristidesnakos/eagle-canyon (public).

```post
Made a little game in a day with Claude: you're an eagle gliding through the Grand Canyon, in a browser tab.

One HTML file, 84 KB, no engine, no image files: the code draws every rock, tree and shadow. 60 fps on an 8 GB MacBook.

Before/after and the link to fly it below.
```

```post
Same game, same day, same Mac, same camera spots.

Left: as built with Claude Opus 5.5.
Right: one more pass with Claude Fable 5.2, after I asked for "much more resolution".

Cut from the game at full size, not shrunk.
```

```post
I thought "more resolution" meant more pixels. Fable measured first: the old build already ran 60 fps at every pixel of my screen.

The softness was that nothing in the picture was finer than half a metre. And about two thirds of each frame went on drawing that blur.
```

```post
The fix: three small textures the code draws when the page loads (rock beds with joints, sandstone layers, stony ground), laid onto the world by position so the strata stay level.

Sharper, and cheaper: 10.4 ms of GPU per frame against 12.6 for the old build, timed back to back.
```

```post
Predictions were written before building. 5 of 7 held.

A blind judge picked the new close-ups as sharper in 8 of 8 shuffled pairs, twice.

Misses: my own detail score (1.76, predicted 2.0), and an image critic that still lists 10 flaws: rock joints like masonry, pines like toys.
```

```post
The day, in three runs:

1. The canyon and the flying. I rated "want to keep flying" 3 of 5: too samey.
2. An 8 km world: a slot, a stone bridge, a gorge, a waterfall, a pine rim. 4 of 5. (Opus 5.5)
3. The detail. (Fable 5.2)

Not a model benchmark: run 3 stood on run 2.
```

```post
Fly it yourself, in your browser:
https://aristidesnakos.github.io/eagle-canyon/

Desktop Chrome or Edge (it needs WebGPU). Click Fly. Keys 1 to 8 jump between the places.

The code, every measurement and every miss:
https://github.com/aristidesnakos/eagle-canyon
```

```post
Built by me with Claude as the engineering team. It starts from Abyssal Garden by Noniv (MIT), credited in the repo.

If you fly it, press H: what frame rate do you get, and on what machine? Reply with yours.
```

**Call to action.** Replies that give a frame rate and a machine (counted by hand); repo stars and clones as a second read.

**Does not claim.**
- That the two models were compared fairly. Fable started from Opus's working game and had a different job (detail);
  Opus's runs built the game and the variety. Post 6 says so.
- That the video is hand-flown (see the label above). Post 1 says "recorded in the game", which is true; it does not
  say "me playing".
- That the game is finished. The play link is the file on GitHub Pages; it follows whatever is on `main`.
- That it runs on phones or in Safari or Firefox: only desktop Chrome on this Mac was measured.
- That the look is clean: the critic's ten open items are in `RESULTS.md`.

**Sources** (all in this repo's `RESULTS.md` unless said).
- 84 KB: `index.html` is 83.7 KB in the run 3 table (S5). Re-measure before posting if the file changed.
- 60 fps on an 8 GB MacBook: S1 (1080p) and S2 (2560×1600), M2 MacBook, Chrome.
- "Built in a day": runs 1 to 3 are all dated 16 Nov 2026 (README); the plan and predictions were written 15 Nov.
- Opus 5.5 and Fable 5.2: the commit trailers (`git log`: 7 commits Opus 5.5 for runs 1 and 2, 3 commits Fable 5.2
  for run 3) and `AI_CONTENT.md`.
- "60 fps at every pixel of my screen", "finer than half a metre", "two thirds of each frame": run 3, "Where the
  softness comes from".
- 10.4 against 12.6 ms: S1, same session (the second pair was 9.9 against 12.4).
- 5 of 7: S1, S2, S4, S5, S6 pass; S3 missed on the close-ups (1.76 against 2.0); S7 missed (10 moderate items).
- 8 of 8, twice: S4 and its note.
- 3 of 5, "too samey" (Ari's words were "I need more diversity in my terrain"), 4 of 5: run 1 "Ari's answers" and run 2 R1.
- Abyssal Garden by Noniv, MIT: `CREDITS.md`.

**Prediction** (frozen at the first post; Ari may edit before). Impressions of post 1 at 7 days: about 800 (80% range
150 to 8,000). Replies with a frame rate: 3 (0 to 15). Share of replies objecting to AI: 20%. Below 1,000 impressions
is inconclusive: change the distribution, not the content.

## The video: how it was made and checked (16 Nov 2026)

- **Record:** `tools/flight.mjs` drives `dev.html` in the test Chrome and steps the game one frame at a time (each frame
  is exactly 1/60 s of game time), so a busy Mac cannot drop or tear frames. Points are [metres along river A, metres
  to the side of it, height above the river]; then where on the path to start (0 to 1), seconds, and ground clearance:
  - slot and bridge: `[[1700,0,430],[1820,4,400],[1940,-6,300],[2060,6,170],[2180,-4,95],[2300,5,82],[2420,0,90],[2540,-10,105],[2660,20,150],[2780,60,210]]`, 0.58, 4.4 s, 10 m
  - gorge: `[[5300,0,40],[5380,8,20],[5460,-9,11],[5540,9,10],[5620,-9,11],[5700,9,10],[5780,-8,12],[5860,0,26]]`, 0.2, 3.4 s, 7 m
  - pine rim: `[[3450,1230,490],[3560,1150,484],[3670,1060,480],[3780,960,470],[3890,860,380],[4000,780,290],[4110,720,250]]`, 0.47, 4.8 s (first 2.4 s used), 10 m
  - waterfall dive: `[[6940,10,200],[7060,14,185],[7160,14,150],[7230,10,95],[7290,4,45],[7360,0,22],[7450,-6,18],[7550,0,28]]`, 0.2, 4.4 s (0.9 to 4.3 s used), 8 m
  - sunlit cliff: `[[3000,110,200],[3100,125,208],[3200,140,220],[3300,150,232],[3400,150,240],[3500,140,236]]`, 0.15, 4.6 s, 10 m
- **Cut:** ffmpeg only: five clips joined with hard cuts, the two cards (`launch/cards/title.html`), sound levelled to
  -14 LUFS.
- **Checked:** H.264 High, 1920×1080, 60 fps, 1,092 frames, AAC 48 kHz stereo; loudness -14.1 LUFS, peak -1.4 dB;
  0 frozen frames, 0 black frames, exactly the 4 intended cuts; first frame is picture, not black; title and end
  frames read at full size. sha256 `489c5440a57b9eba2466895dbbd831a9a99e43d6f3c2a23cbd59b3eea61e90f6`.
- **Format:** landscape, for X. This is not the vertical 1080×1920 format of the gameplay-shorts runbook; a vertical
  cut for Shorts or Reels would be recorded again at that shape, not cropped from this one.
- **Approved:** Ari approved this cut as the thread's video on 16 Nov 2026 ("Yes, use it"), then the full text
  ("Yes, post it"), then post 1 in his journal voice (`~/.claude/voice/x.md`) and a size-only 8.9 MB upload copy
  (`out/video/eagle-canyon-x-v2-upload.mp4`: same cut, 1080p60, two-pass at 3.9 Mbit/s, SSIM 0.976 against the approved file).
- **Posted:** 17 Nov 2026, one "Post all" from @just_aristides. Posts 1 to 8: 2122591559090602085, 2122591561372348855, 2122591564304130195, 2122591567282426077, 2122591569375117799, 2122591571451244922, 2122591574291010045, 2122591577172549857 (each under
  `x.com/just_aristides/status/`). Read back on the thread page: all eight are his, in order, with the video on post 1,
  four images on post 2 and both links on post 7. The 7-day read is due 24 Nov.

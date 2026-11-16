#!/bin/bash
# a fly-through clip at fixed 30 fps steps: tools/clip.sh START_S SECONDS FOG OUTDIR -> OUTDIR/clip.mp4 + frames
set -e
cd "$(dirname "$0")/.."
T0=$1; DUR=$2; F=$3; O=$4; mkdir -p "$O/frames"; rm -f "$O"/frames/*.jpg
node tools/cdp.mjs eval "EC.full(); EC.fog($F); EC.hud(false); 1" >/dev/null
N=$(python3 -c "print(int($DUR*30))")
for ((i=0; i<N; i++)); do
  T=$(python3 -c "print($T0 + $i/30)")
  node tools/cdp.mjs eval "EC.clip($T)" >/dev/null
  node tools/cdp.mjs shot "$O/frames/$(printf %04d $i).png" >/dev/null
done
ffmpeg -loglevel error -y -framerate 30 -i "$O/frames/%04d.png" -c:v libx264 -pix_fmt yuv420p -crf 20 "$O/clip.mp4"
echo "clip: $O/clip.mp4 ($N frames)"

#!/bin/bash
# fine-detail score of each PNG in DIR: mean absolute difference (0-255 luma) between the image and its 2 px Gaussian blur
for f in "$1"/*.png; do
  v=$(ffmpeg -hide_banner -i "$f" -filter_complex "[0]format=gray,split[a][b];[b]gblur=sigma=2[c];[a][c]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - 2>/dev/null | grep YAVG | cut -d= -f2)
  echo "$(basename $f) $v"
done | awk '{print; if ($1 ~ /close/) {c+=$2; nc++} else {v+=$2; nv++}} END {printf "close-ups mean %.3f  views mean %.3f\n", c/(nc?nc:1), v/(nv?nv:1)}'

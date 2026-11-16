#!/bin/bash
# renders the viewpoints at one fog distance: tools/views.sh FOG OUTDIR  (dev.html must be open in the test Chrome)
set -e
cd "$(dirname "$0")/.."
F=${1:-400}; O=${2:-out}; mkdir -p "$O"
node tools/cdp.mjs eval "EC.full(); EC.fog($F); EC.hud(false); 1" >/dev/null
N=$(node tools/cdp.mjs eval "EC.nviews()"); for ((i=0; i<N; i++)); do
  node tools/cdp.mjs eval "EC.view($i); 1" >/dev/null; sleep 0.7
  node tools/cdp.mjs shot "$O/view$((i+1))-fog$F.png" >/dev/null
done
echo "rendered $N views at fog $F into $O"

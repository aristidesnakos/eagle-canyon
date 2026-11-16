#!/bin/bash
# renders the 6 viewpoints at one fog distance: tools/views.sh FOG OUTDIR  (dev.html must be open in the test Chrome)
set -e
cd "$(dirname "$0")/.."
F=${1:-400}; O=${2:-out}; mkdir -p "$O"
node tools/cdp.mjs eval "EC.full(); EC.fog($F); EC.hud(false); 1" >/dev/null
for i in 0 1 2 3 4 5; do
  node tools/cdp.mjs eval "EC.view($i); 1" >/dev/null; sleep 0.7
  node tools/cdp.mjs shot "$O/view$((i+1))-fog$F.png" >/dev/null
done
echo "rendered 6 views at fog $F into $O"

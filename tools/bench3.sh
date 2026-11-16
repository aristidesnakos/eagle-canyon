#!/bin/bash
# run 3 timing: the run 2 build (A, a dev.html built from commit 49e8db6) and the run 3 build (B) interleaved, at 1080p
# and at this Mac's own 2560x1600 screen. Usage: EC_PROFILE=dir tools/bench3.sh RUN2_DEV_HTML OUT.txt
cd "$(dirname "$0")/.."
A=$1; OUT=$2; : > "$OUT"
log() { echo "$@" | tee -a "$OUT"; }
ev() { node tools/cdp.mjs eval "$1"; }
log "date: $(date '+%Y-%m-%d %H:%M')  load: $(uptime | sed 's/.*load averages: //')  unity: $(pgrep -x Unity >/dev/null && echo running || echo none)  other Chrome processes: $(pgrep -f 'Google Chrome' | wc -l | tr -d ' ')"
openp() { node tools/cdp.mjs open "file://$1" 1920 1080 >/dev/null; sleep 13; }
B=$PWD/dev.html
NAT='(async()=>{EC.force(2560,1600);const r=await EC.bench(600);EC.force(0,0);return JSON.stringify(r)})()'
for round in 1 2; do
  openp $A; log "A$round run2 1080p fog 600: $(ev "EC.bench(600).then(r => JSON.stringify(r))")"
  [ $round = 1 ] && log "A$round run2 2560x1600 fog 600: $(ev "$NAT")"
  openp $B; log "B$round run3 1080p fog 600: $(ev "EC.bench(600).then(r => JSON.stringify(r))")"
  log "B$round run3 2560x1600 fog 600: $(ev "$NAT")"
done
for f in 400 250; do log "B run3 1080p fog $f: $(ev "EC.bench($f).then(r => JSON.stringify(r))")"; done
node tools/cdp.mjs size 1280 720 >/dev/null; sleep 2
log "B run3 720p fog 250: $(ev "EC.bench(250).then(r => JSON.stringify(r))")"
node tools/cdp.mjs size 1920 1080 >/dev/null; sleep 2
for k in 1 2; do log "B run3 scaler on a 2560x1600 screen, flight $k: $(ev "EC.settle(2560,1600,60).then(r => JSON.stringify(r))")"; done
log "done $(date '+%H:%M')  load: $(uptime | sed 's/.*load averages: //')"

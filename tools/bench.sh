#!/bin/bash
# The scored runs: P0 (Abyssal Garden unchanged, Medium) then Eagle Canyon at haze 400, 250, 600 (1080p, full
# resolution, Medium) and the kill-line run (720p, haze 250). Usage: tools/bench.sh AG_DEV_HTML OUT.txt
# (AG_DEV_HTML '-' skips P0; run 2 does that)
cd "$(dirname "$0")/.."
AG=$1; OUT=$2; : > "$OUT"
log() { echo "$@" | tee -a "$OUT"; }
log "date: $(date '+%Y-%m-%d %H:%M')  load: $(uptime | sed 's/.*load averages: //')  unity: $(pgrep -x Unity >/dev/null && echo running || echo none)"
if [ "$AG" != "-" ]; then
node tools/cdp.mjs open "file://$AG" 1920 1080 >/dev/null; sleep 2
node tools/cdp.mjs eval "localStorage.abyssal='1'; localStorage.abyssalLoad=''; location.reload(); 1" >/dev/null; sleep 14
node tools/cdp.mjs eval "document.getElementById('d').click(); 1" >/dev/null; node tools/cdp.mjs key KeyH; sleep 25
log "P0 settled: $(node tools/cdp.mjs eval "document.getElementById('i').textContent")"
node tools/cdp.mjs key KeyB; sleep 66
log "P0 bench: $(node tools/cdp.mjs eval "document.getElementById('i').textContent.replace(/\n/g,' | ')")"
fi
node tools/cdp.mjs open "file://$PWD/dev.html" 1920 1080 >/dev/null; sleep 12
for f in 600 400 250; do log "EC 1080p fog $f: $(node tools/cdp.mjs eval "EC.bench($f).then(r => JSON.stringify(r))")"; done
node tools/cdp.mjs size 1280 720 >/dev/null; sleep 2
log "EC 720p fog 250: $(node tools/cdp.mjs eval "EC.bench(250).then(r => JSON.stringify(r))")"
node tools/cdp.mjs size 1920 1080 >/dev/null
log "done $(date '+%H:%M')"

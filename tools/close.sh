#!/bin/bash
# close-up stills: close.sh OUTDIR  (dev.html open). Poses in the river frame, same tuple as VIEWS.
cd ~/Documents/eagle-canyon
O=$1; mkdir -p "$O"
node tools/cdp.mjs eval "EC.full(); EC.fog(600); EC.hud(false); 1" >/dev/null
i=1
for v in "[900,-1,150,0.88,60,0.95,140,0]" "[2050,1,60,0.8,45,0.95,62,0]" "[5550,1,16,0.8,40,0.95,20,0]" "[3600,-1,280,0.9,70,0.97,265,0]" "[7140,-1,50,0.8,50,-0.9,45,0]" "[3700,1,470,1.02,40,1.04,455,0]" "[1000,1,60,0.85,50,0.97,55,0]" "[2440,1,120,0.5,30,0.9,125,0]"; do
  node tools/cdp.mjs eval "EC.look($v); 1" >/dev/null; sleep 0.7
  node tools/cdp.mjs shot "$O/close$i.png" >/dev/null; i=$((i+1))
done
echo done

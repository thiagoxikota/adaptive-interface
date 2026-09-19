#!/usr/bin/env bash
# Rebuilds the y4m clips used as a fake camera by scripts/fake-camera-run.mjs.
# Source: the interactive-head clips (900x1200, 24 fps, 8 s). Output ~560 MB.
set -euo pipefail
SRC="${SRC:-$HOME/xikota-os/_design/interactive-head/assets}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/tests/fixtures"
if [ -L "$OUT" ] && [ ! -e "$OUT" ]; then rm "$OUT"; fi
mkdir -p "$OUT"
df -h "$OUT" | tail -1
for c in smile left right startle; do
  ffmpeg -v error -y -i "$SRC/$c.mp4" -vf "scale=480:640,fps=24" -pix_fmt yuv420p "$OUT/$c.y4m"
done
ffmpeg -v error -y -t 3 -i "$SRC/smile.mp4" -vf "crop=iw/1.4:ih/1.4,scale=480:640,fps=24" -pix_fmt yuv420p "$OUT/close-neutral.y4m"
ffmpeg -v error -y -i "$SRC/smile.mp4" -vf "crop=iw/1.4:ih/1.4,scale=480:640,fps=24" -pix_fmt yuv420p "$OUT/close-smile.y4m"
ffmpeg -v error -y -i "$SRC/smile.mp4" -filter_complex "[0:v]trim=0:2.5,setpts=PTS-STARTPTS,scale=480:640[a];[0:v]trim=0:2.5,setpts=PTS-STARTPTS,crop=iw/1.4:ih/1.4,scale=480:640[b];[a][b]concat=n=2:v=1:a=0,fps=24" -pix_fmt yuv420p "$OUT/approach.y4m"
ffmpeg -v error -y -i "$SRC/smile.mp4" -filter_complex "[0:v]trim=0:2.5,setpts=PTS-STARTPTS,scale=480:640[a];[0:v]trim=0:2.5,setpts=PTS-STARTPTS,crop=iw/1.4:ih/1.4,scale=480:640[b];[0:v]trim=4:8,setpts=PTS-STARTPTS,crop=iw/1.4:ih/1.4,scale=480:640[c];[a][b][c]concat=n=3:v=1:a=0,fps=24" -pix_fmt yuv420p "$OUT/approach-then-smile.y4m"
ls -la "$OUT"

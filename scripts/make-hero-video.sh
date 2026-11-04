#!/usr/bin/env bash
# Turns a phone screen recording into the website hero video.
# Usage: bash scripts/make-hero-video.sh screens/recording.mp4
# Needs ffmpeg. Output: assets/eaves-hero.mp4 and assets/eaves-hero-poster.webp
set -euo pipefail

IN="${1:?Usage: bash scripts/make-hero-video.sh <recording.mp4>}"
OUT="assets"

# Crop the 108px status bar (top) and 148px system navigation (bottom) of a
# 1080x2340 recording and scale to 720px wide. Feed scroll for 4.15s, a short
# crossfade to the event details screen (frozen from 5.7s) and hold it.
FC="[0:v]crop=1080:2084:0:108,scale=720:-2,fps=30,split[a][b];\
[a]trim=0:4.15,setpts=PTS-STARTPTS[v1];\
[b]trim=start=5.7:end=5.75,setpts=PTS-STARTPTS,loop=loop=150:size=1,fps=30[v2];\
[v1][v2]xfade=transition=fade:duration=0.15:offset=4.0[x];\
[x]trim=duration=6.5,setpts=PTS-STARTPTS[out]"

ffmpeg -v error -y -i "$IN" -filter_complex "$FC" -map "[out]" -an \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 28 -maxrate 700k -bufsize 1400k -preset slow -movflags +faststart "$OUT/eaves-hero.mp4"
ffmpeg -v error -y -ss 0.1 -i "$IN" -vf "crop=1080:2084:0:108,scale=720:-2" -frames:v 1 \
  -c:v libwebp -quality 80 "$OUT/eaves-hero-poster.webp"

ls -la "$OUT"/eaves-hero*
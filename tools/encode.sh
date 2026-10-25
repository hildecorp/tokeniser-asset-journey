#!/usr/bin/env bash
# Loudness normalises the mix and encodes the final videos from the rendered frames.
#   tools/encode.sh clean|subs|audio
# clean: media/<name>-clean.mp4 (no subtitles, used by the website with the VTT track)
# subs:  media/<name>.mp4       (subtitles burned in, the main deliverable)
# audio: build/audio/final.wav and media/<name>.m4a (soundtrack for the live animation page)
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=tokeniser-asset-journey
FPS=60
mkdir -p media

normalise() {
  # Two pass EBU R128 normalisation to -16 LUFS integrated, -1.5 dBTP true peak.
  local stats
  stats=$(ffmpeg -hide_banner -nostats -i build/audio/mix.wav -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
  local mi mtp mlra mth off
  mi=$(echo "$stats" | python3 -c 'import json,sys; print(json.load(sys.stdin)["input_i"])')
  mtp=$(echo "$stats" | python3 -c 'import json,sys; print(json.load(sys.stdin)["input_tp"])')
  mlra=$(echo "$stats" | python3 -c 'import json,sys; print(json.load(sys.stdin)["input_lra"])')
  mth=$(echo "$stats" | python3 -c 'import json,sys; print(json.load(sys.stdin)["input_thresh"])')
  off=$(echo "$stats" | python3 -c 'import json,sys; print(json.load(sys.stdin)["target_offset"])')
  ffmpeg -hide_banner -loglevel error -y -i build/audio/mix.wav \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$mi:measured_TP=$mtp:measured_LRA=$mlra:measured_thresh=$mth:offset=$off:linear=true,aresample=48000" \
    -c:a pcm_s24le build/audio/final.wav
}

encode() {
  local frames=$1 out=$2
  ffmpeg -hide_banner -loglevel error -stats -y \
    -framerate "$FPS" -i "build/frames/$frames/%06d.png" -i build/audio/final.wav \
    -map 0:v -map 1:a \
    -vf "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p" \
    -c:v libx264 -preset slow -crf 17 -tune animation -profile:v high -level 4.2 \
    -g 120 -bf 3 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    -movflags +faststart -shortest \
    -map_metadata -1 -metadata title="From Farmland to Token: tokenisation on Redbelly Network through Tokeniser" \
    "$out"
}

case "${1:-}" in
  audio)
    normalise
    ffmpeg -hide_banner -loglevel error -y -i build/audio/final.wav -c:a aac -b:a 160k -map_metadata -1 "media/$NAME.m4a"
    ;;
  clean) encode clean "media/$NAME-clean.mp4" ;;
  subs) encode subs "media/$NAME.mp4" ;;
  *) echo "usage: tools/encode.sh audio|clean|subs" >&2; exit 2 ;;
esac

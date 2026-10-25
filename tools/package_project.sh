#!/usr/bin/env bash
# Zips the project files (everything needed to rebuild the video, without the rendered MP4s).
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=tokeniser-asset-journey
mkdir -p downloads
rm -f "downloads/$NAME-project.zip"
zip -q -r -X "downloads/$NAME-project.zip" \
  README.md LICENCES.md package.json requirements.txt vercel.json .vercelignore index.html \
  animation assets content evidence licences tools docs \
  media/$NAME.srt media/$NAME.vtt media/$NAME.m4a media/poster.jpg \
  -x '*.DS_Store' -x '__pycache__/*'
ls -la "downloads/$NAME-project.zip"

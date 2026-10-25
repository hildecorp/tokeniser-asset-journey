#!/usr/bin/env bash
# Full rebuild, in order. Needs the voice model (PIPER_VOICE=/path/en_GB-alba-medium.onnx),
# Python packages from requirements.txt, Node with Playwright, FFmpeg, zip and poppler-utils.
#   tools/build_all.sh [--sources]   --sources also recaptures the source snapshots first
set -euo pipefail
cd "$(dirname "$0")/.."
export BASE=${BASE:-http://127.0.0.1:8123}
python3 -m http.server 8123 --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1
[[ "${1:-}" == "--sources" ]] && node tools/capture_sources.cjs
python3 tools/build_voice.py --voice "${PIPER_VOICE:?set PIPER_VOICE to en_GB-alba-medium.onnx}"
python3 tools/build_subs.py
rm -rf build/frames
node tools/render.cjs                 # clean frames, sound cues, on-screen text audit
python3 tools/build_audio.py
tools/encode.sh audio
tools/encode.sh clean
node tools/render.cjs --subs
tools/encode.sh subs
python3 tools/build_docs.py
node tools/print_pdf.cjs
python3 tools/build_site.py
tools/package_project.sh
python3 tools/check.py || true
python3 tools/build_site.py           # again, so the page shows the check results
tools/package_project.sh
python3 tools/check.py

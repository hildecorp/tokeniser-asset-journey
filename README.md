# From Farmland to Token

An animated explainer, 87 seconds long, that follows one regulated real-world asset step by step: an Australian farmland fund whose units become compliant tokens on Redbelly Network, issued through Tokeniser. Written for people with no crypto background.

The website in this repository (`index.html`) plays the video and shows the full script, a synced transcript, the fact check, every download and the verification report. It is a static site with no build step, ready for Vercel.

## Deliverables

| Brief item | File |
| --- | --- |
| 1. Script, as a shared document | `docs/script/From-Farmland-to-Token-Script.pdf` and `.docx`: timecodes, voiceover, every on-screen word, visuals, and the verbatim source quote for each of the 23 claims |
| 2. Final video, 60 to 90 seconds, subtitles | `media/tokeniser-asset-journey.mp4` (subtitles burned in), `media/tokeniser-asset-journey-clean.mp4` (no subtitles), `media/tokeniser-asset-journey.srt`, `media/tokeniser-asset-journey.vtt` |
| 3. Project files | This repository, also zipped at `downloads/tokeniser-asset-journey-project.zip` |
| 4. Licence proof | `LICENCES.md` and the licence texts in `licences/` |

Video specs: MP4, H.264 High, 1920 x 1080 (16:9), 60 fps, yuv420p BT.709, AAC 48 kHz stereo, loudness -16 LUFS with true peak at or below -1.5 dBTP.

## The story

| Time | Scene | What the viewer learns |
| --- | --- | --- |
| 0:00 | The question | How does a real-world asset become a token? A four step rail sets up the journey |
| 0:07 | The asset | An Australian farmland fund. Investors hold its units. Today the register sits across separate systems, updated after the fact |
| 0:15 | The idea | Tokenisation records that ownership as digital tokens, with the fund's rules programmed in. The farmland itself does not change |
| 0:21 | Two layers | The manager uses Tokeniser, a familiar platform. Redbelly Network, Australia's public digital token infrastructure, runs underneath |
| 0:29 | Step 1. Set up | The fund is verified and its rules (wholesale investors only, transfer restrictions) are encoded into the token |
| 0:37 | Step 2. Investors | Each investor is verified through Averer and gets a wallet on Redbelly Network. An unverified investor gets no tokens |
| 0:44 | Step 3. Issue | Tokens are minted on Redbelly Network into verified wallets and the register updates immediately |
| 0:51 | Step 4. Transfer | Every transfer is checked against the rules first. A transfer to an ineligible investor is rejected |
| 0:59 | Settlement | A compliant transfer settles in seconds. With their own wallets, transfer and payment complete together, final once confirmed |
| 1:10 | The record | Every check, transfer and rejection is recorded for auditors and regulators |
| 1:15 | The result | Same farmland, same fund. Its units are now compliant tokens on Redbelly Network |
| 1:22 | Close | Tokeniser, built on Redbelly Network. Illustrative example, not financial advice |

## Design

- **Two layers, two brands.** The light layer is Tokeniser (its warm white, ink `#343740` and mint `#A2FFC8`, taken from tokeniser.com). The dark layer underneath is Redbelly Network (slate `#142530`, grey `#283A46`, red `#FF5050` from the Redbelly brand kit). The colour tells the viewer which layer is doing the work.
- **Type.** Readex Pro, the Redbelly brand typeface, for everything. JetBrains Mono only for machine values, as the Task Board brand kit asks.
- **Voice rules.** Plain English, one idea per sentence, no em or en dashes, no emoji, no hype words, no prices or returns. Checked automatically.
- **Sync.** Every animation cue is keyed to the exact word in the narration (`Wd('l05', 'verified')`), using word timings measured from the voiceover.

## How it is built

One file, `content/script.json`, holds every voiceover line, every on-screen string, the visuals and the source quote behind each claim. Everything else is generated from it, so the video, subtitles, documents and website cannot drift apart.

| Path | What it does |
| --- | --- |
| `content/script.json` | The single source of truth |
| `content/sources.json`, `tools/capture_sources.cjs`, `evidence/` | Dated text snapshot of every source page, with SHA-256 hashes in `evidence/manifest.json` |
| `tools/build_voice.py` | Speaks each line with Piper (`en_GB-alba-medium`), six takes per line, and keeps the take speech recognition hears most clearly. Writes `content/timeline.json` |
| `tools/build_subs.py` | Word timestamps (`content/words.json`), subtitle cues (`content/subtitles.json`), SRT and WebVTT. Subtitle text is always the script's own text |
| `animation/engine.js`, `animation/scenes.js`, `animation/index.html` | The animation. `renderAt(t)` draws any frame from scratch, so every frame is a pure function of time. Open `animation/index.html` for a live, scrubbable preview with sound |
| `tools/render.cjs` | Renders all 5,200 frames at their exact times in headless Chromium (4 workers), exports the sound cue list and the list of every string drawn on screen |
| `tools/build_audio.py` | Original score and sound effects synthesised from code, ducked under the voice, mixed |
| `tools/encode.sh` | Two pass loudness normalisation to -16 LUFS, H.264 encode of both videos |
| `tools/build_docs.py`, `tools/print_pdf.cjs` | Script document as Word and PDF |
| `tools/build_site.py`, `assets/site.css`, `assets/site.js` | The website |
| `tools/check.py` | Every check below. Writes `docs/verification-report.md` and `content/checks.json` |
| `tools/build_all.sh` | The whole pipeline, in order |

## Verification

`python3 tools/check.py` confirms that:

- every claim's quote is found word for word in a dated snapshot of a supplied resource, and no snapshot has changed since capture
- the SRT, WebVTT and word timings carry exactly the script's voiceover text
- every string the animation draws is listed in the script document, and every listed string is drawn
- the PDF and Word documents contain every voiceover line, every on-screen string and every source quote
- there are no em or en dashes, emoji, hype words, prices, returns or exclamation marks; the illustrative example note is on screen
- both videos are 1920 x 1080, 60 fps, H.264 and AAC, between 60 and 90 seconds, at -16 LUFS
- subtitles are burned into the main video
- speech recognition of the finished video matches the script
- no names, handles or credit lines appear in the video, subtitles, documents, metadata or website
- licence proof exists for every third party asset, and the website loads nothing from other domains

The latest results are in `docs/verification-report.md` and on the website.

## Rebuild

Requirements: Python 3.11 or later with `requirements.txt`, Node 18 or later with Playwright and Chromium, FFmpeg, `zip` and `poppler-utils`. The voice model files `en_GB-alba-medium.onnx` and `.onnx.json` come from `huggingface.co/rhasspy/piper-voices` (`en/en_GB/alba/medium`).

```
pip install -r requirements.txt
npm install && npx playwright install chromium
PIPER_VOICE=/path/to/en_GB-alba-medium.onnx tools/build_all.sh
```

Preview the animation while editing:

```
python3 -m http.server 8123
# open http://127.0.0.1:8123/animation/index.html
```

## Deploy

Import the repository in Vercel with the framework preset **Other**, no build command and no output directory. `vercel.json` sets caching and the subtitle content type; `.vercelignore` keeps the build tools out of the deployment.

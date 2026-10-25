# Licences and permissions

Licence proof for everything in the explainer that was not made for this project. Every licence below allows commercial use. No stock footage, stock images, stock music, sound libraries or AI image generators were used.

## Summary

| Element | Used for | Source | Licence | Proof in this repository |
| --- | --- | --- | --- | --- |
| Readex Pro | All type in the video, the script document and the website | Typeface named in the Redbelly brand kit. Files from the Google Fonts repository, `ofl/readexpro` | SIL Open Font License 1.1. Free for commercial use, embedding allowed | `licences/OFL-ReadexPro.txt` (also `assets/fonts/OFL-ReadexPro.txt`) |
| JetBrains Mono | Machine values only (labels, times, addresses), as the Task Board brand kit specifies | Google Fonts repository, `ofl/jetbrainsmono` | SIL Open Font License 1.1 | `licences/OFL-JetBrainsMono.txt` |
| Voice: Piper voice `en_GB-alba-medium` | Voiceover | `huggingface.co/rhasspy/piper-voices`, path `en/en_GB/alba/medium` | Voice model repository: MIT. Training data: Alba speech corpus, Creative Commons Attribution 4.0 (commercial use allowed with attribution, given below) | `licences/alba-medium-MODEL_CARD.txt`, `licences/piper-voices-README-header.txt`, `licences/alba-speech-corpus-rights.txt`, `licences/CC-BY-4.0-legalcode.txt` |
| Music | Score under the whole video | Original. Composed and synthesised from code by `tools/build_audio.py` (oscillators, filtered noise, synthetic reverb). No samples, loops or presets | Original work made for this project | `tools/build_audio.py` |
| Sound effects | Clicks, checks, whooshes, lock and settle sounds | Original. Synthesised from code by `tools/build_audio.py` | Original work made for this project | `tools/build_audio.py` |
| Animation, illustration and icons | Every frame of the video | Original. Drawn in code (`animation/`) | Original work made for this project | `animation/` |
| Redbelly Network logos | Network layer in the video, end card, website | Official Redbelly brand kit, `redbelly.network/brand`, "All Redbelly Logos" pack | Brand assets published by Redbelly Network for use with its name. Used unmodified, in the colour versions supplied (negative version on dark backgrounds) | `assets/brand/redbelly-*.svg` |
| Tokeniser logo | Platform window, end card, website | `tokeniser.com`: header logo (SVG) and the footer logo for dark backgrounds (mint) | Trademark of Tokeniser Pty Ltd, used unmodified to identify the product this explainer is made for | `assets/brand/tokeniser-logo*.svg/png` |

## Attribution required by CC BY 4.0

The voice model is trained on the Alba speech corpus, which is licensed under Creative Commons Attribution 4.0 International:

> Voiceover synthesised with the Piper voice en_GB-alba-medium, trained on the Alba speech corpus by Cassia Valentini-Botinhao and Junichi Yamagishi, University of Edinburgh (2019), https://doi.org/10.7488/ds/2506, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). The dataset was not modified.

The corpus terms note that use derogatory to the voice talent is prohibited. This explainer is a neutral, factual corporate video and meets that condition.

## Tools used (not part of the deliverable)

These programs were used to make the files but are not distributed inside them. Their licences cover the software, not the audio, images or video they produce.

| Tool | Licence | Use |
| --- | --- | --- |
| piper-tts | GPL-3.0 | Runs the voice model |
| faster-whisper with Whisper `small.en` | MIT | Speech recognition: picks the clearest voice take, times every word, checks the final mix |
| FFmpeg | LGPL / GPL | Encoding and loudness measurement |
| Chromium via Playwright | BSD / Apache 2.0 | Renders the animation frame by frame, prints the PDF |
| NumPy, SciPy, soundfile, python-docx, jiwer | BSD / MIT | Audio synthesis, Word document, checks |

## Facts and quotes

Quotes in the script document are short extracts from tokeniser.com and redbelly.network, reproduced for fact checking, as the brief requires. Text snapshots in `evidence/` exist only so the quotes can be verified against the pages as they were on the capture date.

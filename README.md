# Tokeniser Asset Journey

An animated explainer, 60 to 90 seconds long, that follows one regulated
real-world asset step by step: from the real world to a compliant token on
Redbelly Network, issued through Tokeniser.

Work in progress. This repository is built in the open, one commit at a time.

## Layout

| Path | What it holds |
| --- | --- |
| `content/sources.json` | Every page the script relies on |
| `evidence/` | Dated text snapshot of each source page, with a SHA-256 manifest |
| `assets/fonts/` | Readex Pro (Redbelly brand typeface) and JetBrains Mono, both SIL OFL 1.1 |
| `assets/brand/` | Official Redbelly logos from the Redbelly brand kit, and the Tokeniser logo |
| `tools/` | Build tools |

## Recapture the sources

```
node tools/capture_sources.cjs
```

Needs Node 18 or later with Playwright and Chromium.

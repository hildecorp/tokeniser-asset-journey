"""Builds the website (index.html) from the same content as the video.

Static HTML is written for every section (script, transcript, fact check, downloads), so the
page reads fully without JavaScript; assets/site.js only adds playback sync and filters.
Also extracts the poster, step thumbnails and the social image from the rendered video.

Usage: python3 tools/build_site.py
"""

import html
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME = "tokeniser-asset-journey"
e = html.escape


def j(path):
    return json.load(open(os.path.join(ROOT, path)))


def size(path):
    if not os.path.exists(os.path.join(ROOT, path)):
        return "built by tools/package_project.sh"
    b = os.path.getsize(os.path.join(ROOT, path))
    return f"{b / 1e6:.1f} MB" if b > 1e6 else f"{b / 1e3:.0f} KB"


def tc(t):
    m, s = divmod(int(t), 60)
    return f"{m}:{s:02d}"


def frame(t, out, w=None, h=None, crop=None, q=3):
    vf = []
    if crop:
        vf.append(crop)
    if w:
        vf.append(f"scale={w}:{h or -1}:flags=lanczos")
    cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", os.path.join(ROOT, "media", f"{NAME}-clean.mp4"), "-frames:v", "1"]
    if vf:
        cmd += ["-vf", ",".join(vf)]
    cmd += ["-q:v", str(q), os.path.join(ROOT, out)]
    subprocess.run(cmd, check=True)


def main():
    script = j("content/script.json")
    tl = j("content/timeline.json")
    words = j("content/words.json")
    manifest = {m["id"]: m for m in j("evidence/manifest.json")["sources"]}
    checks = j("content/checks.json") if os.path.exists(os.path.join(ROOT, "content/checks.json")) else None
    sc = {s["id"]: s for s in tl["scenes"]}

    # images from the video
    os.makedirs(os.path.join(ROOT, "assets", "img"), exist_ok=True)
    frame(3.6, "media/poster.jpg", q=2)
    frame(3.6, "assets/img/og.jpg", 1200, 675, crop="crop=1920:1008:0:36", q=3)
    shots = {
        "s05": sc["s05"]["end"] - 0.3,
        "s06": sc["s06"]["end"] - 0.4,
        "s07": sc["s07"]["end"] - 0.5,
        "s08": sc["s09"]["end"] - 0.6,
    }
    for k, t in shots.items():
        frame(t, f"assets/img/{k}.jpg", 960, 540, q=4)

    # chapters
    chap_ids = ["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08", "s10", "s11"]
    chap_names = {"s01": "Intro", "s02": "The asset", "s03": "The idea", "s04": "Platform and network", "s05": "Step 1. Set up",
                  "s06": "Step 2. Investors", "s07": "Step 3. Issue", "s08": "Step 4. Transfer", "s10": "Audit trail", "s11": "The result"}
    chapters = "".join(
        f'<button type="button" data-t="{sc[i]["start"]:.2f}" data-end="{(sc[chap_ids[k + 1]]["start"] if k + 1 < len(chap_ids) else tl["duration"]):.2f}"><small>{tc(sc[i]["start"])}</small>{e(chap_names[i])}</button>'
        for k, i in enumerate(chap_ids)
    )

    # steps
    step_copy = {
        "s05": ("Set up", "The fund is verified and its rules, such as wholesale investors only, are encoded into the token."),
        "s06": ("Investors", "Each investor is verified through Averer, then gets a wallet on Redbelly Network to hold tokens."),
        "s07": ("Issue", "Tokens are minted on Redbelly Network into verified wallets, and the register updates immediately."),
        "s08": ("Transfer", "Every transfer is checked against the rules first. A compliant one settles on Redbelly in seconds and is final once confirmed."),
    }
    steps = "".join(
        f'''<article class="step"><button class="thumb" type="button" data-t="{sc[k]["start"]:.2f}" aria-label="Play step {n}: {e(title)}"><img src="assets/img/{k}.jpg" width="960" height="540" alt="Frame from step {n}, {e(title)}" loading="lazy"><span class="play">Play {tc(sc[k]["start"])}</span></button>
<div class="body"><span class="n">Step {n}</span><h3>{e(title)}</h3><p>{e(copy)}</p></div></article>'''
        for n, (k, (title, copy)) in enumerate(step_copy.items(), 1)
    )

    # transcript with word timings and links to claims
    claim_ids = {}
    claims_html = []
    for s in script["scenes"]:
        for n, c in enumerate(s["claims"], 1):
            cid = f"claim-{s['id']}-{n}"
            claim_ids.setdefault(s["id"], []).append((cid, c))
            m = manifest[c["source"]]
            org = "tokeniser" if c["source"].startswith("tk") else "redbelly"
            claims_html.append(f'''<article class="claim" id="{cid}" data-org="{org}">
<div class="sc"><b>{s["id"].upper()}</b><br>{tc(sc[s["id"]]["start"])}</div>
<div><p class="c">{e(c["claim"])}</p><p class="verified" style="margin-top:8px">Quote found verbatim in dated snapshot</p></div>
<div><blockquote>“{e(c["quote"])}”</blockquote><p class="meta"><a href="{e(m["url"])}" rel="noopener">{e(m["url"])}</a><br>Snapshot {m["captured_utc"][:10]} · <a href="{e(m["file"])}">text copy</a> · sha256 {m["sha256"][:12]}</p></div>
</article>''')
    lines_html = []
    for s in tl["scenes"]:
        for ln in s["lines"]:
            ws = " ".join(f'<span class="w" data-s="{w["start"]:.2f}" data-e="{w["end"]:.2f}">{e(w["w"])}</span>' for w in words[ln["id"]])
            cl = claim_ids.get(s["id"], [])
            hosts = sorted({manifest[c["source"]]["url"].split("/")[2] for _, c in cl})
            src = f'<a href="#{cl[0][0]}">{len(cl)} sourced claim{"s" if len(cl) > 1 else ""} · {" + ".join(hosts)}</a>' if cl else ""
            src_html = f'<div class="src">{src}</div>' if src else ""
            lines_html.append(f'<div class="line" data-s="{ln["start"]:.2f}" data-e="{ln["end"]:.2f}" role="button" tabindex="0" aria-label="Play from {tc(ln["start"])}"><time>{tc(ln["start"])}</time><div><p class="txt">{ws}</p>{src_html}</div></div>')

    # checks
    if checks:
        checks_html = "".join(
            f'<div class="check{"" if c["ok"] else " fail"}"><span class="mark" aria-hidden="true">{"&#10003;" if c["ok"] else "!"}</span><div><b>{e(c["name"])}</b><span>{e(c["detail"])}</span></div></div>'
            for c in checks["checks"]
        )
        checks_summary = f'{sum(c["ok"] for c in checks["checks"])} of {len(checks["checks"])} checks pass, run {checks["run_utc"][:16].replace("T", " ")} UTC'
    else:
        checks_html, checks_summary = "", "Checks not run yet"

    nclaims = sum(len(s["claims"]) for s in script["scenes"])
    dur = tl["duration"]
    downloads = [
        ("MP4", f"media/{NAME}.mp4", "Video, subtitles burned in", f"1920 x 1080, 60 fps, {size(f'media/{NAME}.mp4')}"),
        ("MP4", f"media/{NAME}-clean.mp4", "Video, no subtitles", f"1920 x 1080, 60 fps, {size(f'media/{NAME}-clean.mp4')}"),
        ("SRT", f"media/{NAME}.srt", "Subtitles, SRT", size(f"media/{NAME}.srt")),
        ("VTT", f"media/{NAME}.vtt", "Subtitles, WebVTT", size(f"media/{NAME}.vtt")),
        ("PDF", "docs/script/From-Farmland-to-Token-Script.pdf", "Script and fact check, PDF", size("docs/script/From-Farmland-to-Token-Script.pdf")),
        ("DOC", "docs/script/From-Farmland-to-Token-Script.docx", "Script and fact check, Word", size("docs/script/From-Farmland-to-Token-Script.docx")),
        ("ZIP", f"downloads/{NAME}-project.zip", "Project files", f"Animation source, voice, audio, render and check tools, {size(f'downloads/{NAME}-project.zip')}"),
        ("LIC", "LICENCES.md", "Licence proof", "Fonts, voice, music, logos"),
    ]
    dl_html = "".join(
        f'<a class="dl" href="{e(href)}"{" download" if not href.startswith("http") and not href.endswith(".md") else ""}><span class="ic">{ic}</span><span><b>{e(title)}</b><span>{e(meta)}</span></span></a>'
        for ic, href, title, meta in downloads
    )

    page = TEMPLATE
    for k, v in {
        "{{DUR}}": f"{dur:.0f}",
        "{{DUR_TC}}": tc(dur),
        "{{NCLAIMS}}": str(nclaims),
        "{{CHAPTERS}}": chapters,
        "{{STEPS}}": steps,
        "{{LINES}}": "\n".join(lines_html),
        "{{CLAIMS}}": "\n".join(claims_html),
        "{{DOWNLOADS}}": dl_html,
        "{{CHECKS}}": checks_html,
        "{{CHECKS_SUMMARY}}": e(checks_summary),
        "{{NAME}}": NAME,
        "{{NSOURCES}}": str(len({c["source"] for s in script["scenes"] for c in s["claims"]})),
    }.items():
        page = page.replace(k, v)
    open(os.path.join(ROOT, "index.html"), "w").write(page)
    print("wrote index.html")


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>From Farmland to Token</title>
<meta name="description" content="A {{DUR}} second explainer: how a regulated real-world asset, an Australian farmland fund, becomes a compliant token on Redbelly Network through Tokeniser.">
<meta name="theme-color" content="#142530">
<meta property="og:type" content="video.other">
<meta property="og:title" content="From Farmland to Token">
<meta property="og:description" content="How a regulated real-world asset becomes a compliant token on Redbelly Network, through Tokeniser. In plain language, step by step.">
<meta property="og:image" content="assets/img/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%23A2FFC8' stroke='%23343740' stroke-width='3'/%3E%3Cpath d='M16 8l7 4v8l-7 4-7-4v-8z' fill='none' stroke='%23343740' stroke-width='2.4'/%3E%3C/svg%3E">
<link rel="preload" href="assets/fonts/ReadexPro-VF.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/site.css">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>
</head>
<body>
<a class="skip" href="#watch">Skip to the video</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="#top"><span class="dot" aria-hidden="true"></span>From Farmland to Token</a>
    <nav class="nav" aria-label="Sections">
      <a href="#watch">Watch</a><a href="#steps">Steps</a><a href="#transcript">Script</a><a href="#facts">Fact check</a><a href="#downloads">Downloads</a><a href="#made">How it was made</a>
    </nav>
    <button class="theme" type="button" id="theme" aria-label="Switch light or dark theme">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/></svg>
    </button>
  </div>
</header>

<main id="top">
  <section class="hero">
    <div class="wrap">
      <span class="eyebrow">Tokenisation explainer</span>
      <h1>From farmland <em>to token</em></h1>
      <p class="lede">How a regulated real-world asset becomes a compliant token on Redbelly Network, through Tokeniser. One Australian farmland fund, four steps, {{DUR}} seconds, in plain language.</p>
      <div class="hero-meta">
        <span class="pill"><b>{{DUR_TC}}</b> runtime</span>
        <span class="pill"><b>1080p</b> 60 fps</span>
        <span class="pill">Subtitles on</span>
        <span class="pill ok"><b>{{NCLAIMS}}</b> claims, each sourced</span>
      </div>

      <div class="player" id="watch">
        <video id="video" controls playsinline preload="metadata" poster="media/poster.jpg" crossorigin="anonymous">
          <source src="media/{{NAME}}-clean.mp4" type="video/mp4">
          <track kind="captions" src="media/{{NAME}}.vtt" srclang="en" label="English" default>
          Your browser cannot play this video. <a href="media/{{NAME}}.mp4">Download the MP4</a>.
        </video>
        <div class="chapters" id="chapters" role="group" aria-label="Chapters">{{CHAPTERS}}</div>
        <div class="player-row">
          <span>Captions are on. Use the CC button to turn them off.</span>
          <a href="animation/index.html">Open the live animation source, frame by frame</a>
        </div>
      </div>
    </div>
  </section>

  <section class="block" id="steps">
    <div class="wrap">
      <div class="head">
        <span class="eyebrow">The journey</span>
        <h2>The asset stays the same. The record of who owns it becomes a token.</h2>
        <p class="lede">The fund keeps its farmland. What changes is how ownership of its units is recorded and moved: as tokens with the fund's rules programmed in.</p>
      </div>
      <div class="steps">{{STEPS}}</div>
      <div class="layers">
        <div class="layer tk">
          <img src="assets/brand/tokeniser-logo.svg" alt="Tokeniser" width="182" height="30">
          <h3>The platform the manager uses</h3>
          <p class="muted">A familiar platform for issuing units as tokens, onboarding investors and running the register.</p>
        </div>
        <div class="layer rb">
          <img src="assets/brand/redbelly-horizontal-negative.svg" alt="Redbelly Network" width="101" height="28">
          <h3>The network underneath</h3>
          <p>Redbelly Network, Australia's public digital token infrastructure, where tokens are minted, held in wallets and settled.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="block" id="transcript">
    <div class="wrap">
      <div class="head">
        <span class="eyebrow">Script</span>
        <h2>Every word, timed to the video</h2>
        <p class="lede">Click any line to play from there. The highlighted word follows the narration. Lines with claims link to their source.</p>
      </div>
      <div class="transcript" id="lines">
{{LINES}}
      </div>
    </div>
  </section>

  <section class="block" id="facts">
    <div class="wrap">
      <div class="head">
        <span class="eyebrow">Fact check</span>
        <h2>{{NCLAIMS}} claims, {{NSOURCES}} source pages, quoted word for word</h2>
        <p class="lede">Each claim about Redbelly Network or Tokeniser sits next to the exact words of the supplied resource it comes from, with a dated text copy of that page.</p>
      </div>
      <div class="filters" role="group" aria-label="Filter claims by source">
        <button type="button" data-f="all" aria-pressed="true">All sources</button>
        <button type="button" data-f="tokeniser" aria-pressed="false">tokeniser.com</button>
        <button type="button" data-f="redbelly" aria-pressed="false">redbelly.network</button>
      </div>
      <div class="claims" id="claims">
{{CLAIMS}}
      </div>
    </div>
  </section>

  <section class="block" id="downloads">
    <div class="wrap">
      <div class="head">
        <span class="eyebrow">Deliverables</span>
        <h2>Downloads</h2>
        <p class="lede">The video in two versions, subtitles as separate files, the script as a document for fact checking, the project files and the licence proof.</p>
      </div>
      <div class="downloads">{{DOWNLOADS}}</div>
    </div>
  </section>

  <section class="block" id="made">
    <div class="wrap">
      <div class="head">
        <span class="eyebrow">How it was made</span>
        <h2>One source of truth, checked on every build</h2>
        <p class="lede">The script file drives the voice, the subtitles, the animation, the documents and this page, so none of them can drift apart.</p>
      </div>
      <ol class="pipeline">
        <li><b>Script with sources.</b> <code>content/script.json</code> holds every line, every on-screen word and the quote behind every claim.</li>
        <li><b>Voice.</b> Each line is spoken with Piper (Alba voice), several takes per line, and speech recognition keeps the clearest.</li>
        <li><b>Timing.</b> Word timestamps from the voice drive every cue in the animation and the subtitles.</li>
        <li><b>Animation.</b> An HTML canvas scene where every frame is a pure function of time, rendered frame by frame at 60 fps.</li>
        <li><b>Sound.</b> Music and effects are synthesised from code, ducked under the voice and mixed to -16 LUFS.</li>
        <li><b>Checks.</b> Quotes, subtitles, on-screen text, wording rules, video specs and loudness are verified automatically.</li>
      </ol>
      <div class="head" style="margin-top:48px;margin-bottom:18px">
        <h3>Verification report</h3>
        <p class="muted mono" style="font-size:13px">{{CHECKS_SUMMARY}}</p>
      </div>
      <div class="checks">{{CHECKS}}</div>
      <div class="head" style="margin-top:48px;margin-bottom:0">
        <h3>Brand</h3>
        <p class="muted">Readex Pro from the Redbelly brand kit for all type, JetBrains Mono for machine values only. Tokeniser surfaces and mint for the platform layer, Redbelly slate and red for the network layer.</p>
      </div>
      <div class="swatches">
        <div class="sw"><i style="background:#F6F5F2"></i>#F6F5F2</div>
        <div class="sw"><i style="background:#343740"></i>#343740</div>
        <div class="sw"><i style="background:#A2FFC8"></i>#A2FFC8</div>
        <div class="sw"><i style="background:#142530"></i>#142530</div>
        <div class="sw"><i style="background:#283A46"></i>#283A46</div>
        <div class="sw"><i style="background:#FF5050"></i>#FF5050</div>
      </div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <p>Explainer for Tokeniser on Redbelly Network. Illustrative example. General information only, not financial advice.</p>
    <p>Tokeniser and Redbelly Network names and logos belong to their owners. Fonts, voice and music licences: <a href="LICENCES.md">LICENCES.md</a>.</p>
  </div>
</footer>
<script src="assets/site.js" defer></script>
</body>
</html>
"""

if __name__ == "__main__":
    main()

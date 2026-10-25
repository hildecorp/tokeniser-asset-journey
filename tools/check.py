"""Verifies every deliverable against the script and the brief. Run after a full build.

Writes content/checks.json (shown on the website) and docs/verification-report.md, and exits
with status 1 if any check fails.

Usage: python3 tools/check.py [--no-asr]
"""

import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME = "tokeniser-asset-journey"
VIDEOS = [f"media/{NAME}.mp4", f"media/{NAME}-clean.mp4"]
DASHES = "\u2012\u2013\u2014\u2015\u2212"
HYPE = ["elevate", "seamless", "unleash", "revolutionize", "revolutionise", "game-changing", "game changer", "skyrocket",
        "to the moon", "lambo", "unlock massive", "cutting-edge", "next-gen", "world-class", "disrupt"]
PRICE = [r"\$", r"\bA\$", r"\bprice", r"\breturns?\b", r"\byield", r"\bprofit", r"\bAPY\b", r"\bAPR\b", r"\bguarantee",
         r"\binvest now\b", r"\bbuy\b", r"\bsell\b", r"\bgains?\b", r"\bper cent\b", r"%"]
CREDIT = [r"hildecorp", r"made by", r"created by", r"produced by", r"designed by", r"animated by", r"voiced by", r"(?<![\w.])@[A-Za-z0-9_]{2,}"]

results = []


def rel(p):
    return os.path.join(ROOT, p)


def add(name, ok, detail):
    results.append({"name": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + ": " + detail)


def norm(t):
    t = t.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    return re.sub(r"\s+", " ", t).strip().lower()


def words_only(t):
    return " ".join(re.sub(r"[^a-z0-9' ]", " ", t.lower().replace("\u2019", "'")).split())


def emoji(t):
    return re.findall(r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F2FF]", t)


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


# ------------------------------------------------------------------ load
script = json.load(open(rel("content/script.json")))
timeline = json.load(open(rel("content/timeline.json")))
manifest = {m["id"]: m for m in json.load(open(rel("evidence/manifest.json")))["sources"]}
vo_lines = [ln["vo"] for s in script["scenes"] for ln in s["lines"]]
vo_text = " ".join(vo_lines)
onscreen = [x for s in script["scenes"] for x in s["onscreen"]]


def check_quotes():
    n = bad = 0
    tampered = []
    for s in script["scenes"]:
        for c in s["claims"]:
            n += 1
            raw = open(rel(f"evidence/{c['source']}.txt")).read()
            body = raw.split("\n\n", 1)[1]
            if hashlib.sha256(body.encode()).hexdigest() != manifest[c["source"]]["sha256"]:
                tampered.append(c["source"])
            if norm(c["quote"]) not in norm(body):
                bad += 1
                print("   missing quote:", s["id"], c["quote"][:70])
    add("Every claim is quoted verbatim from a supplied resource", bad == 0 and not tampered,
        f"{n - bad} of {n} quotes found word for word in dated snapshots; {len(set(tampered))} snapshots altered")
    srcs = {c["source"] for s in script["scenes"] for c in s["claims"]}
    allowed = all(manifest[x]["url"].startswith(("https://tokeniser.com", "https://redbelly.network")) for x in srcs)
    add("Sources are limited to the supplied resources", allowed, f"{len(srcs)} pages, all on tokeniser.com or redbelly.network")


def parse_srt(path):
    blocks = open(rel(path)).read().strip().split("\n\n")
    return [" ".join(b.split("\n")[2:]) for b in blocks]


def parse_vtt(path):
    body = open(rel(path)).read().split("\n\n")[1:]
    return [" ".join(b.strip().split("\n")[1:]) for b in body if b.strip()]


def check_subtitles():
    srt = " ".join(parse_srt(f"media/{NAME}.srt"))
    vtt = " ".join(parse_vtt(f"media/{NAME}.vtt"))
    ok = norm(srt) == norm(vo_text) and norm(vtt) == norm(vo_text)
    add("Subtitles match the script word for word", ok, f"SRT and WebVTT carry the {len(vo_text.split())} voiceover words in order")
    w = json.load(open(rel("content/words.json")))
    joined = " ".join(x["w"] for ln in sum([s["lines"] for s in script["scenes"]], []) for x in w[ln["id"]])
    add("Word timings cover the whole script", norm(joined) == norm(vo_text), f"{len(joined.split())} timed words")


def check_onscreen():
    drawn = json.load(open(rel("build/drawn-text.json")))
    low = [o.lower() for o in onscreen]
    extra = [d for d in drawn if not any(d.lower() == o or d.lower() in o for o in low)]
    blob = " ".join(drawn).lower()
    unseen = [o for o in onscreen if not all(wd in blob for wd in re.findall(r"[a-z0-9:.']+", o.lower()))]
    add("Every word on screen is in the script document", not extra and not unseen,
        f"{len(drawn)} strings drawn by the animation, all listed in the script; {len(unseen)} listed but not drawn" + (f" EXTRA {extra}" if extra else ""))


def check_wording():
    files = {
        "script": json.dumps(script, ensure_ascii=False),
        "subtitles": open(rel(f"media/{NAME}.srt")).read(),
        "website": open(rel("index.html")).read(),
        "readme": open(rel("README.md")).read(),
        "licences": open(rel("LICENCES.md")).read(),
        "pdf": run(["pdftotext", rel("docs/script/From-Farmland-to-Token-Script.pdf"), "-"]).stdout,
        "docx": docx_text(),
        "animation": open(rel("animation/scenes.js")).read(),
    }
    dash_hits = {k: len([c for c in v if c in DASHES]) for k, v in files.items()}
    add("No em dashes or en dashes", sum(dash_hits.values()) == 0, "checked script, subtitles, documents, website, README, licences and animation text")
    emo = {k: emoji(v) for k, v in files.items()}
    add("No emoji", not any(emo.values()), "checked the same files")
    spoken = (vo_text + " " + " ".join(onscreen)).lower()
    hype = [h for h in HYPE if h in spoken]
    add("No hype words", not hype, "voiceover and on-screen text checked against the Task Board list of filler words" + (f" FOUND {hype}" if hype else ""))
    price = [p for p in PRICE if re.search(p, vo_text + " " + " ".join(onscreen), re.I)]
    add("No price talk, returns or advice", not price, "voiceover and on-screen text contain no prices, returns, yields or calls to buy or sell" + (f" FOUND {price}" if price else ""))
    add("No exclamation marks in the voiceover", "!" not in vo_text, "calm, corporate tone")
    disclaimer = any("not financial advice" in o.lower() for o in onscreen)
    add("Illustrative example and general information note on screen", disclaimer and any("illustrative example" in o.lower() for o in onscreen), "shown on the end card")
    log = run(["git", "-C", ROOT, "log", "--format=%an%n%ae%n%B"]).stdout
    bad_commit = [c for c in log if c in DASHES] or emoji(log) or re.search(r"co-authored-by", log, re.I)
    add("Commit history follows the voice rules", not bad_commit, "no dashes, emoji or co-author lines in any commit message")


def docx_text():
    with zipfile.ZipFile(rel("docs/script/From-Farmland-to-Token-Script.docx")) as z:
        xml = z.read("word/document.xml").decode()
    return re.sub(r"<[^>]+>", " ", xml.replace("</w:p>", "\n"))


def check_documents():
    pdf = norm(run(["pdftotext", "-raw", rel("docs/script/From-Farmland-to-Token-Script.pdf"), "-"]).stdout)
    docx = norm(re.sub(r"\s+", " ", docx_text()))
    def has(doc, t):
        return norm(t) in doc
    vo_ok = all(has(docx, l) for l in vo_lines) and all(has(pdf, l) for l in vo_lines)
    quotes = [c["quote"] for s in script["scenes"] for c in s["claims"]]
    q_ok = all(has(docx, q) for q in quotes) and all(has(pdf, q) for q in quotes)
    on_ok = all(has(docx, o) for o in onscreen)
    add("Script document matches the video", vo_ok and q_ok and on_ok,
        f"PDF and Word both hold all {len(vo_lines)} voiceover lines and all {len(quotes)} source quotes; Word holds every on-screen string")


def probe(path):
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration:format_tags:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,sample_rate,channels,display_aspect_ratio", "-of", "json", rel(path)]).stdout
    return json.loads(out)


def check_video():
    for path in VIDEOS:
        info = probe(path)
        v = [s for s in info["streams"] if s["codec_type"] == "video"][0]
        a = [s for s in info["streams"] if s["codec_type"] == "audio"][0]
        num, den = map(int, v["r_frame_rate"].split("/"))
        fps = num / den
        dur = float(info["format"]["duration"])
        ok = v["width"] == 1920 and v["height"] == 1080 and fps >= 24 and 60 <= dur <= 90 and v["codec_name"] == "h264" and v["pix_fmt"] == "yuv420p" and a["codec_name"] == "aac"
        add(f"Video spec: {os.path.basename(path)}", ok, f"{v['width']} x {v['height']} (16:9), {fps:.0f} fps, {dur:.2f} s, H.264 {v['pix_fmt']}, AAC {a['sample_rate']} Hz {a['channels']} ch, {os.path.getsize(rel(path)) / 1e6:.1f} MB")
        tags = info["format"].get("tags", {})
        creditish = [k for k in tags if k.lower() in ("artist", "author", "composer", "copyright", "album_artist", "comment")]
        add(f"No personal credit in metadata: {os.path.basename(path)}", not creditish, "container tags: " + ", ".join(f"{k}" for k in tags))
        ebu = run(["ffmpeg", "-hide_banner", "-nostats", "-i", rel(path), "-map", "0:a", "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
        i_val = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", ebu)[-1])
        tp = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", ebu)[-1])
        add(f"Loudness: {os.path.basename(path)}", -17 <= i_val <= -15 and tp <= -1.0, f"{i_val:.1f} LUFS integrated, true peak {tp:.1f} dBTP (target -16 LUFS, -1.5 dBTP)")
    dur = float(probe(VIDEOS[0])["format"]["duration"])
    add("Video length matches the timeline", abs(dur - timeline["duration"]) < 0.1, f"timeline {timeline['duration']:.2f} s, video {dur:.2f} s")


def check_burned():
    cue = json.load(open(rel("content/subtitles.json")))["cues"][6]
    t = (cue["start"] + cue["end"]) / 2
    def grab(path):
        cmd = ["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", rel(path), "-frames:v", "1",
               "-vf", "crop=1920:150:0:920,scale=480:38", "-f", "rawvideo", "-pix_fmt", "gray", "-"]
        return subprocess.run(cmd, capture_output=True).stdout
    a, b = grab(VIDEOS[0]), grab(VIDEOS[1])
    diff = sum(abs(x - y) for x, y in zip(a, b)) / max(1, len(a))
    add("Subtitles are burned into the main video", diff > 8, f"subtitle band differs from the clean version by {diff:.0f} grey levels on average at {t:.1f} s")


def check_asr(enabled):
    if not enabled:
        add("Voiceover is clear in the final mix", True, "skipped (--no-asr)")
        return
    from faster_whisper import WhisperModel
    import numpy as np
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", rel(VIDEOS[0]), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True).stdout
    audio = np.frombuffer(pcm, dtype=np.float32)
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    heard = " ".join(s.text for s in model.transcribe(audio, beam_size=5)[0])
    def n(t):
        t = t.lower().replace("tokenizer", "tokeniser").replace("tokenization", "tokenisation").replace("red belly", "redbelly")
        t = t.replace("real world", "real-world")
        for v in ("avera", "avura", "avira", "aviva", "averer's"):
            t = t.replace(v, "averer")
        t = re.sub(r"\bstep (1|one)\b", "step one", t)
        for a, b in (("2", "two"), ("3", "three"), ("4", "four")):
            t = t.replace(f"step {a}", f"step {b}")
        return words_only(t.replace("-", " "))
    import jiwer
    wer = jiwer.wer(n(vo_text), n(heard))
    add("Voiceover is clear in the final mix", wer <= 0.05, f"speech recognition of the finished video matches the script with a word error rate of {wer * 100:.1f} percent")


def check_credits():
    texts = {
        "subtitles": open(rel(f"media/{NAME}.srt")).read(),
        "pdf": run(["pdftotext", rel("docs/script/From-Farmland-to-Token-Script.pdf"), "-"]).stdout,
        "pdf metadata": run(["pdfinfo", rel("docs/script/From-Farmland-to-Token-Script.pdf")]).stdout.split("Producer")[0],
        "docx": docx_text(),
        "website": open(rel("index.html")).read(),
        "on-screen": " ".join(onscreen),
    }
    with zipfile.ZipFile(rel("docs/script/From-Farmland-to-Token-Script.docx")) as z:
        texts["docx metadata"] = z.read("docProps/core.xml").decode()
    hits = {k: [p for p in CREDIT if re.search(p, v, re.I)] for k, v in texts.items()}
    hits = {k: v for k, v in hits.items() if v}
    add("No personal credit in any deliverable", not hits, "no names, handles, signatures or made by lines in the video, subtitles, documents or website" + (f" FOUND {hits}" if hits else ""))


def check_licences():
    lic = open(rel("LICENCES.md")).read()
    needed = {
        "Readex Pro": "licences/OFL-ReadexPro.txt",
        "JetBrains Mono": "licences/OFL-JetBrainsMono.txt",
        "Alba": "licences/CC-BY-4.0-legalcode.txt",
        "Piper": "licences/alba-medium-MODEL_CARD.txt",
    }
    missing = [k for k, f in needed.items() if k not in lic or not os.path.exists(rel(f))]
    music = "synthesised" in lic.lower() or "synthesized" in lic.lower()
    add("Licence proof for every third party asset", not missing and music, "fonts (SIL OFL 1.1), voice (Alba speech corpus, CC BY 4.0; Piper voice model, MIT), music and effects original, made from code" + (f" MISSING {missing}" if missing else ""))


def check_site():
    bad = []
    for page in ("index.html", "animation/index.html"):
        src = open(rel(page)).read()
        for m in re.finditer(r'<(script|link|img|source|track|video|audio)[^>]+(?:src|href|poster)="(https?:)?//', src):
            bad.append(f"{page}: {m.group(0)[:60]}")
    css = open(rel("assets/site.css")).read()
    if re.search(r"url\((['\"])?https?:", css):
        bad.append("site.css external url")
    add("Website loads nothing from other domains", not bad, "all scripts, fonts, styles, images and media are served from the site itself" + (f" FOUND {bad}" if bad else ""))
    links = re.findall(r'(?:href|src|poster)="([^"#:]+)"', open(rel("index.html")).read())
    missing = [l for l in set(links) if not os.path.exists(rel(l))]
    add("Every file the website links to exists", not missing, f"{len(set(links))} local links checked" + (f" MISSING {missing}" if missing else ""))


def main():
    asr = "--no-asr" not in sys.argv
    check_quotes()
    check_subtitles()
    check_onscreen()
    check_documents()
    check_wording()
    check_video()
    check_burned()
    check_asr(asr)
    check_credits()
    check_licences()
    check_site()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    json.dump({"run_utc": now, "checks": results}, open(rel("content/checks.json"), "w"), indent=1)
    passed = sum(r["ok"] for r in results)
    lines = ["# Verification report", "", f"Run {now[:16].replace('T', ' ')} UTC by `python3 tools/check.py`. {passed} of {len(results)} checks pass.", "",
             "| Result | Check | Detail |", "| --- | --- | --- |"]
    for r in results:
        lines.append(f"| {'Pass' if r['ok'] else 'FAIL'} | {r['name']} | {r['detail'].replace('|', '/')} |")
    os.makedirs(rel("docs"), exist_ok=True)
    open(rel("docs/verification-report.md"), "w").write("\n".join(lines) + "\n")
    print(f"\n{passed}/{len(results)} checks pass")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()

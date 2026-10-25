"""Word timings and subtitles from the voiceover.

Runs speech recognition with word timestamps over each voiceover line, matches the
recognised words back to the script's own words, and writes:

  content/words.json         every script word with its start and end time
  content/subtitles.json     subtitle cues, used to burn subtitles into the video
  media/<name>.srt, .vtt     the same cues as separate subtitle files

Subtitle text is always the script's text, never the recogniser's, so the
subtitles cannot drift from the script.

Usage: python3 tools/build_subs.py
"""

import difflib
import json
import os
import re
from math import gcd

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel
from scipy.signal import resample_poly

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME = "tokeniser-asset-journey"
MAX_LINE = 42      # characters per subtitle line
MAX_LINES = 2
MIN_CUE = 1.0      # seconds
GAP = 0.08         # minimum gap between cues
KEEP_WITH_NEXT = {"Redbelly", "a", "an", "the"}  # never end a subtitle line on these


def norm(word):
    word = word.lower().replace("tokenizer", "tokeniser").replace("tokenization", "tokenisation")
    return re.sub(r"[^a-z0-9]", "", word)


def script_tokens(text):
    """Split the script line into display words, and matching tokens for alignment."""
    words = text.split()
    tokens = []
    for i, w in enumerate(words):
        for part in re.split(r"-", w):
            n = norm(part)
            if n:
                tokens.append((n, i))
    return words, tokens


def asr_words(model, audio, sr, offset):
    g = gcd(sr, 16000)
    a16 = resample_poly(audio, 16000 // g, sr // g).astype(np.float32)
    segments, _ = model.transcribe(a16, beam_size=5, word_timestamps=True)
    out = []
    for seg in segments:
        for w in seg.words:
            for part in re.split(r"[-\s]", w.word.replace("Red Belly", "Redbelly").replace("Red belly", "Redbelly")):
                n = norm(part)
                if n:
                    out.append((n, offset + w.start, offset + w.end))
    # "Red Belly" can come back as two words, join them so they match the script.
    joined = []
    for item in out:
        if joined and joined[-1][0] == "red" and item[0] == "belly":
            joined[-1] = ("redbelly", joined[-1][1], item[2])
        else:
            joined.append(item)
    return joined


def align(line, heard):
    words, tokens = script_tokens(line["text"])
    times = [[None, None] for _ in words]
    sm = difflib.SequenceMatcher(a=[t[0] for t in tokens], b=[h[0] for h in heard], autojunk=False)
    for block in sm.get_matching_blocks():
        for k in range(block.size):
            wi = tokens[block.a + k][1]
            _, s, e = heard[block.b + k]
            times[wi][0] = s if times[wi][0] is None else min(times[wi][0], s)
            times[wi][1] = e if times[wi][1] is None else max(times[wi][1], e)
    # Words the recogniser missed (names, mostly) get times between their neighbours.
    known = [i for i, t in enumerate(times) if t[0] is not None]
    for i, t in enumerate(times):
        if t[0] is not None:
            continue
        prev = max([k for k in known if k < i], default=None)
        nxt = min([k for k in known if k > i], default=None)
        a = times[prev][1] if prev is not None else line["start"]
        b = times[nxt][0] if nxt is not None else line["end"]
        gap = [k for k in range(prev + 1 if prev is not None else 0, nxt if nxt is not None else len(words))]
        j = gap.index(i)
        step = (b - a) / len(gap)
        t[0], t[1] = a + j * step, a + (j + 1) * step
    out = []
    for w, (s, e) in zip(words, times):
        s = min(max(s, line["start"]), line["end"])
        e = min(max(e, s + 0.05), line["end"] + 0.05)
        out.append({"w": w, "start": round(s, 3), "end": round(e, 3)})
    return out


def wrap(words):
    """Lay words out on one line, or two balanced lines of at most MAX_LINE characters."""
    one = " ".join(words)
    if len(one) <= MAX_LINE:
        return [one]
    best = None
    for k in range(1, len(words)):
        a, b = " ".join(words[:k]), " ".join(words[k:])
        if len(a) > MAX_LINE or len(b) > MAX_LINE or words[k - 1] in KEEP_WITH_NEXT:
            continue
        cost = max(len(a), len(b)) - (6 if words[k - 1][-1] in ",:;" else 0)
        if best is None or cost < best[0]:
            best = (cost, [a, b])
    return best[1] if best else None


def fits(chunk):
    return wrap([x["w"] for x in chunk]) is not None


def split_chunk(chunk):
    """Split a sentence into cues that each fit on two lines, breaking at commas when possible."""
    if fits(chunk):
        return [chunk]
    options = []
    for k in range(1, len(chunk)):
        a, b = chunk[:k], chunk[k:]
        if not fits(a):
            continue
        la, lb = len(" ".join(x["w"] for x in a)), len(" ".join(x["w"] for x in b))
        if min(la, lb) < 14:
            continue
        bonus = 80 if chunk[k - 1]["w"][-1] in ",:;" else 0
        options.append((abs(la - lb) - bonus, k))
    k = min(options)[1]
    return [chunk[:k]] + split_chunk(chunk[k:])


def cues_for_line(words):
    """One cue per sentence, split further (at a comma where possible) when it does not fit on two lines."""
    sentences, cur = [], []
    for w in words:
        cur.append(w)
        if w["w"][-1] in ".?!":
            sentences.append(cur)
            cur = []
    if cur:
        sentences.append(cur)
    cues = []
    for s in sentences:
        cues.extend(split_chunk(s))
    return cues


def ts(t, sep):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def main():
    timeline = json.load(open(os.path.join(ROOT, "content", "timeline.json")))
    audio, sr = sf.read(os.path.join(ROOT, "build", "audio", "voice.wav"), dtype="float32")
    model = WhisperModel("small.en", device="cpu", compute_type="int8")

    words_out = {}
    cues = []
    for scene in timeline["scenes"]:
        for line in scene["lines"]:
            a = int(max(0, line["start"] - 0.05) * sr)
            b = int(min(len(audio) / sr, line["end"] + 0.1) * sr)
            heard = asr_words(model, audio[a:b], sr, a / sr)
            words = align(line, heard)
            words_out[line["id"]] = words
            for c in cues_for_line(words):
                cues.append({
                    "line": line["id"],
                    "start": c[0]["start"],
                    "end": c[-1]["end"],
                    "lines": wrap([x["w"] for x in c]),
                })

    # Timing polish: a short lead in, a readable minimum length, no overlaps.
    for i, c in enumerate(cues):
        c["start"] = max(0.0, c["start"] - 0.12)
        c["end"] = c["end"] + 0.25
        if c["end"] - c["start"] < MIN_CUE:
            c["end"] = c["start"] + MIN_CUE
    for i in range(len(cues) - 1):
        if cues[i]["end"] > cues[i + 1]["start"] - GAP:
            cues[i]["end"] = round(cues[i + 1]["start"] - GAP, 3)
    for c in cues:
        c["start"], c["end"] = round(c["start"], 3), round(c["end"], 3)

    with open(os.path.join(ROOT, "content", "words.json"), "w") as f:
        json.dump(words_out, f, indent=1)
        f.write("\n")
    with open(os.path.join(ROOT, "content", "subtitles.json"), "w") as f:
        json.dump({"cues": cues}, f, indent=1)
        f.write("\n")

    os.makedirs(os.path.join(ROOT, "media"), exist_ok=True)
    srt, vtt = [], ["WEBVTT", ""]
    for i, c in enumerate(cues, 1):
        text = "\n".join(c["lines"])
        srt += [str(i), f"{ts(c['start'], ',')} --> {ts(c['end'], ',')}", text, ""]
        vtt += [f"{ts(c['start'], '.')} --> {ts(c['end'], '.')}", text, ""]
    open(os.path.join(ROOT, "media", f"{NAME}.srt"), "w").write("\n".join(srt))
    open(os.path.join(ROOT, "media", f"{NAME}.vtt"), "w").write("\n".join(vtt))
    for c in cues:
        print(f"{c['start']:6.2f} {c['end']:6.2f}  {' / '.join(c['lines'])}")


if __name__ == "__main__":
    main()

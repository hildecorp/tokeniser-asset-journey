"""Voiceover for the explainer, one script line at a time.

Reads content/script.json, speaks every line with the Piper voice en_GB-alba-medium
(Alba speech corpus, CC BY 4.0, see LICENCES.md), trims each take, places it on the
timeline with the pauses set in the script, and writes:

  build/audio/voice.wav      voiceover, mono, at the voice's own sample rate
  content/timeline.json      start and end of every line and scene, in seconds

Usage:
  python3 tools/build_voice.py --voice /path/to/en_GB-alba-medium.onnx
The .onnx file and its .onnx.json come from huggingface.co/rhasspy/piper-voices
(en/en_GB/alba/medium).
"""

import argparse
import json
import os
import re

import numpy as np
import soundfile as sf
from piper import PiperVoice, SynthesisConfig

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEAD_IN = 1.2         # seconds of picture before the first word
SCENE_LEAD = 0.4      # a scene starts this long before its first word


def respell(text, table):
    """Swap words the phonemiser gets wrong for spellings it reads correctly."""
    for word, spoken in table.items():
        text = re.sub(r"\b%s\b" % re.escape(word), spoken, text)
    return text


def trim(audio, sr, threshold=0.006, pad=0.025):
    """Cut leading and trailing silence, keeping a short natural pad."""
    loud = np.where(np.abs(audio) > threshold)[0]
    if len(loud) == 0:
        return audio
    a = max(0, loud[0] - int(pad * sr))
    b = min(len(audio), loud[-1] + int(pad * sr))
    return audio[a:b]


def fade(audio, sr, ms=10):
    n = int(sr * ms / 1000)
    ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)
    audio[:n] *= ramp
    audio[-n:] *= ramp[::-1]
    return audio


def normalise(text):
    text = text.lower().replace("tokenizer", "tokeniser").replace("tokenization", "tokenisation")
    text = text.replace("red belly", "redbelly").replace("-", " ")
    return " ".join(re.sub(r"[^a-z0-9' ]", " ", text).split())


class Judge:
    """Scores each take with speech recognition, so the clearest take is kept."""

    def __init__(self):
        from faster_whisper import WhisperModel
        import jiwer
        from scipy.signal import resample_poly
        self.model = WhisperModel("small.en", device="cpu", compute_type="int8")
        self.wer = jiwer.wer
        self.resample = resample_poly

    def score(self, audio, sr, text):
        from math import gcd
        g = gcd(sr, 16000)
        a16 = self.resample(audio, 16000 // g, sr // g).astype(np.float32)
        heard = " ".join(s.text for s in self.model.transcribe(a16, beam_size=5)[0]).strip()
        return self.wer(normalise(text), normalise(heard)), heard


def speak(voice, text, cfg):
    syn = SynthesisConfig(
        length_scale=cfg["length_scale"],
        noise_scale=cfg["noise_scale"],
        noise_w_scale=cfg["noise_w_scale"],
    )
    chunks = list(voice.synthesize(text, syn))
    return np.concatenate([c.audio_float_array for c in chunks]).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default=os.environ.get("PIPER_VOICE", os.path.join(ROOT, "..", "models", "en_GB-alba-medium.onnx")))
    args = ap.parse_args()

    script = json.load(open(os.path.join(ROOT, "content", "script.json")))
    cfg = script["voice"]
    voice = PiperVoice.load(args.voice)
    sr = voice.config.sample_rate
    takes = int(cfg.get("takes", 1))
    judge = Judge() if takes > 1 else None

    t = LEAD_IN
    pieces = []
    scenes = []
    for i, scene in enumerate(script["scenes"]):
        start = 0.0 if i == 0 else max(scenes[-1]["start"] + 0.5, t - SCENE_LEAD)
        lines = []
        for line in scene["lines"]:
            # Piper samples noise, so every take differs slightly. Keep the clearest.
            best = None
            for _ in range(takes):
                audio = fade(trim(speak(voice, respell(line["vo"], cfg["respell"]), cfg), sr), sr)
                wer, heard = judge.score(audio, sr, line["vo"]) if judge else (None, "")
                if best is None or (wer is not None and wer < best[1]):
                    best = (audio, wer, heard)
                if wer == 0:
                    break
            audio, wer, heard = best
            dur = len(audio) / sr
            pieces.append((t, audio))
            entry = {"id": line["id"], "text": line["vo"], "start": round(t, 3), "end": round(t + dur, 3)}
            if judge:
                entry["asr_wer"] = round(wer, 3)
                entry["asr_heard"] = heard
            lines.append(entry)
            print(f"{line['id']}  {t:6.2f}s  {dur:5.2f}s  wer={wer}  {line['vo'][:56]}")
            t += dur + line.get("pause_after", 0.5)
        if not scene["lines"]:
            t += scene.get("hold", 3.0)
        if scenes:
            scenes[-1]["end"] = round(start, 3)
        scenes.append({"id": scene["id"], "title": scene["title"], "step": scene["step"], "start": round(start, 3), "lines": lines})
    total = round(t, 3)
    scenes[-1]["end"] = total

    out = np.zeros(int(total * sr) + sr, dtype=np.float32)
    for start, audio in pieces:
        a = int(round(start * sr))
        out[a:a + len(audio)] += audio
    out = out[: int(total * sr)]
    out *= 0.891 / float(np.max(np.abs(out)))  # headroom, the mix sets the final loudness

    os.makedirs(os.path.join(ROOT, "build", "audio"), exist_ok=True)
    sf.write(os.path.join(ROOT, "build", "audio", "voice.wav"), out, sr, subtype="PCM_24")
    timeline = {
        "duration": total,
        "fps": 60,
        "voice": {"engine": cfg["engine"], "voice": cfg["voice"]},
        "scenes": scenes,
    }
    with open(os.path.join(ROOT, "content", "timeline.json"), "w") as f:
        json.dump(timeline, f, indent=2)
        f.write("\n")
    print(f"total {total:.2f}s")


if __name__ == "__main__":
    main()

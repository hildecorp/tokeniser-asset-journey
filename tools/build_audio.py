"""Original music, sound effects and the final mix, all generated from code.

Nothing here is sampled or downloaded: every note and effect is synthesised below, so the
soundtrack needs no third party licence. The arrangement follows the same timeline as the
picture (content/timeline.json) and effects land on the cues the animation exports
(build/sfx.json, written by tools/render.cjs).

Outputs:
  build/audio/music.wav   score, stereo 48 kHz
  build/audio/sfx.wav     sound effects, stereo 48 kHz
  build/audio/mix.wav     voice + ducked music + effects, before loudness normalisation

Usage: python3 tools/build_audio.py
"""

import json
import os

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(20261025)


# ------------------------------------------------------------------ helpers
def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    sus = max(0, n - a - d - r)
    e = np.concatenate([
        np.linspace(0, 1, max(a, 1), endpoint=False),
        np.linspace(1, s, max(d, 1), endpoint=False),
        np.full(sus, s),
        np.linspace(s, 0, max(r, 1)),
    ])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def lowpass(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def highpass(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def place(buf, sig, t, gain=1.0, pan=0.0):
    """Add a mono or stereo signal into a stereo buffer at time t, with equal power pan."""
    i = int(round(t * SR))
    if i >= buf.shape[0]:
        return
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l, sig * r], axis=1) * np.sqrt(2)
    n = min(len(sig), buf.shape[0] - i)
    if i < 0:
        sig, n, i = sig[-i:], min(len(sig) + i, buf.shape[0]), 0
    buf[i:i + n] += sig[:n] * gain


def reverb(x, seconds=2.2, mix=0.25, predelay=0.02, seed=1):
    """Stereo convolution reverb with a synthetic, exponentially decaying impulse response."""
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    decay = np.exp(-t * 6.9 / seconds)
    ir = np.stack([r.standard_normal(n) * decay, r.standard_normal(n) * decay], axis=1)
    ir[:, 0] = lowpass(ir[:, 0], 6000)
    ir[:, 1] = lowpass(ir[:, 1], 6000)
    ir = np.pad(ir, ((int(predelay * SR), 0), (0, 0)))
    ir /= np.sqrt(np.sum(ir ** 2) / 2)
    wet = np.stack([fftconvolve(x[:, 0], ir[:, 0])[: len(x)], fftconvolve(x[:, 1], ir[:, 1])[: len(x)]], axis=1)
    return x * (1 - mix) + wet * mix


def add(*sigs):
    """Sum mono signals of different lengths."""
    n = max(len(x) for x in sigs)
    return sum(np.pad(x, (0, n - len(x))) for x in sigs)


def tone(freq, dur, partials=((1, 1.0),), decay=3.0, attack=0.004, detune=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for mult, amp in partials:
        f = freq * mult * (1 + detune)
        out += amp * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)) * np.exp(-t * decay * mult ** 0.5)
    a = int(attack * SR)
    out[:a] *= np.linspace(0, 1, a)
    return out


# ------------------------------------------------------------------ score
# D major, four chords, each held for two bars: Dmaj9, Bm9, Gmaj7(add9), A6sus.
CHORDS = [
    {"root": 38, "pad": [50, 54, 57, 61, 64], "arp": [62, 66, 69, 73, 76, 73, 69, 66]},
    {"root": 35, "pad": [47, 50, 54, 57, 61], "arp": [59, 62, 66, 69, 73, 69, 66, 62]},
    {"root": 31, "pad": [43, 47, 50, 54, 57], "arp": [55, 59, 62, 66, 69, 66, 62, 59]},
    {"root": 33, "pad": [45, 50, 52, 54, 57], "arp": [57, 62, 64, 66, 69, 66, 64, 62]},
]


def pad_voice(notes, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    left = np.zeros(n)
    right = np.zeros(n)
    for k, note in enumerate(notes):
        f = midi(note)
        for det, side in ((-0.0035, 0), (0.0035, 1)):
            ph = rng.uniform(0, 2 * np.pi)
            # soft saw from a few harmonics
            w = sum((0.55 / h) * np.sin(2 * np.pi * f * (1 + det) * h * t + ph * h) for h in range(1, 6))
            (left if side == 0 else right)[:] += w / len(notes)
    e = env_adsr(n, 1.2, 0.5, 0.85, 1.6)
    left, right = lowpass(left * e, 1700), lowpass(right * e, 1700)
    return np.stack([left, right], axis=1)


def pluck(note, dur=0.9):
    f = midi(note)
    s = tone(f, dur, partials=((1, 1.0), (2, 0.35), (3, 0.12), (4.01, 0.06)), decay=5.5, attack=0.003)
    return lowpass(s, 5200)


def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 11) * 0.9


def hat():
    n = int(0.06 * SR)
    x = highpass(rng.standard_normal(n), 7000) * np.exp(-np.arange(n) / SR * 70)
    return x * 0.25


def bass(note, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(note)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    return lowpass(x * env_adsr(n, 0.04, 0.3, 0.7, 0.5), 400) * 0.7


def build_music(tl):
    dur = tl["duration"] + 0.5
    sc = {s["id"]: s for s in tl["scenes"]}
    buf = np.zeros((int(dur * SR) + SR, 2))
    t_bass = sc["s04"]["start"] + 3.2       # the network layer arrives, the bass with it
    t_drums = sc["s05"]["start"]
    t_drums_out = sc["s11"]["start"]
    t_arp = sc["s02"]["start"] - 0.4
    t_end = sc["s12"]["start"]
    nbars = int(np.ceil(dur / BAR))
    for b in range(nbars):
        t0 = b * BAR
        if t0 >= dur:
            break
        ch = CHORDS[(b // 2) % 4]
        last = t0 >= t_end - BAR
        if b % 2 == 0 and not last:
            place(buf, pad_voice(ch["pad"], 2 * BAR + 1.8), t0, gain=0.34)
        if last and t0 < t_end:
            pass
        # arpeggio, eighth notes
        if t0 + BAR > t_arp and t0 < t_end - 0.2:
            for k in range(8):
                tt = t0 + k * BEAT / 2
                if tt < t_arp or tt > t_end - 0.3:
                    continue
                vel = 0.8 if k % 2 == 0 else 0.55
                place(buf, pluck(ch["arp"][k]), tt, gain=0.16 * vel, pan=-0.45 if k % 2 else 0.45)
        if t0 >= t_bass - BAR and t0 < t_end:
            for k in (0, 2.5):
                tt = t0 + k * BEAT
                if tt >= t_bass and tt < t_end:
                    place(buf, bass(ch["root"], BEAT * 2.2), tt, gain=0.42)
        if t_drums <= t0 + BAR and t0 < t_drums_out:
            for k in range(4):
                tt = t0 + k * BEAT
                if t_drums <= tt < t_drums_out:
                    if k in (0, 2):
                        place(buf, kick(), tt, gain=0.30)
                    place(buf, hat(), tt + BEAT / 2, gain=0.5, pan=0.3)
    # final resolve on D, held under the end card
    final = pad_voice([50, 54, 57, 62, 66, 69], 5.5)
    place(buf, final, t_end - 0.1, gain=0.36)
    place(buf, bass(38, 4.0), t_end - 0.1, gain=0.38)
    for k, note in enumerate([74, 78, 81, 86]):
        place(buf, pluck(note, 2.5), t_end + 0.35 + k * 0.09, gain=0.13, pan=-0.3 + k * 0.2)
    buf = reverb(buf, 2.4, 0.28)
    # fade in and fade out
    n_end = int((tl["duration"]) * SR)
    fade_in = int(1.5 * SR)
    buf[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    fo = int(2.2 * SR)
    buf[n_end - fo:n_end] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    buf[n_end:] = 0
    return buf[:n_end]


# ------------------------------------------------------------------ sound effects
def fx(kind):
    if kind == "tick":
        return tone(1900, 0.08, ((1, 1), (2.7, 0.3)), decay=60) * 0.5
    if kind == "tick-run":
        out = np.zeros(int(0.9 * SR))
        for i in range(10):
            s = tone(1500 + i * 60, 0.06, ((1, 1),), decay=70) * 0.35
            a = int(i * 0.06 * SR)
            out[a:a + len(s)] += s
        return out
    if kind == "pop":
        n = int(0.09 * SR)
        t = np.arange(n) / SR
        f = 420 + 700 * (t / t[-1])
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40) * 0.5
    if kind == "check":
        return (tone(midi(86), 0.6, ((1, 1), (2, 0.2)), decay=7) + 0.8 * np.pad(tone(midi(93), 0.6, ((1, 1),), decay=7), (int(0.07 * SR), 0))[: int(0.6 * SR)]) * 0.28
    if kind == "whoosh":
        n = int(0.6 * SR)
        x = rng.standard_normal(n)
        t = np.arange(n) / SR
        e = np.sin(np.pi * t / t[-1]) ** 2
        lo = bandpass(x, 300, 1200) * (1 - t / t[-1])
        hi = bandpass(x, 1200, 5000) * (t / t[-1])
        return (lo + hi) * e * 0.22
    if kind == "deep":
        n = int(1.6 * SR)
        t = np.arange(n) / SR
        f = 42 + 30 * np.exp(-t * 4)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
        air = lowpass(rng.standard_normal(n), 900) * np.exp(-t * 3) * 0.15
        return (body + air) * 0.6
    if kind == "step":
        a = tone(midi(81), 0.5, ((1, 1), (3, 0.1)), decay=9) * 0.18
        k = kick()[: len(a)] * 0.25
        return a + np.pad(k, (0, len(a) - len(k)))
    if kind == "scan":
        n = int(1.0 * SR)
        t = np.arange(n) / SR
        f = 900 + 500 * t
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / t[-1]) * 0.06
    if kind == "drop":
        n = int(0.25 * SR)
        t = np.arange(n) / SR
        f = 150 * np.exp(-t * 6) + 60
        return add(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 18) * 0.55, tone(2200, 0.05, decay=80) * 0.15)
    if kind == "mint":
        out = np.zeros(int(1.2 * SR))
        for i, note in enumerate([81, 86, 90, 93]):
            s = tone(midi(note), 0.9, ((1, 1), (2.01, 0.25)), decay=6) * 0.2
            a = int(i * 0.07 * SR)
            out[a:a + len(s)] += s[: len(out) - a]
        sparkle = highpass(rng.standard_normal(len(out)), 6000) * np.exp(-np.arange(len(out)) / SR * 5) * 0.03
        return out + sparkle
    if kind == "deny":
        n = int(0.42 * SR)
        t = np.arange(n) / SR
        a = np.sign(np.sin(2 * np.pi * 196 * t)) * (t < 0.16)
        b = np.sign(np.sin(2 * np.pi * 165 * t)) * (t >= 0.2)
        return lowpass((a + b) * np.exp(-((t % 0.2) * 10)), 1400) * 0.14
    if kind == "deny-soft":
        n = int(0.3 * SR)
        t = np.arange(n) / SR
        return lowpass(np.sign(np.sin(2 * np.pi * 165 * t)) * np.exp(-t * 9), 1200) * 0.08
    if kind == "lock":
        n = int(0.4 * SR)
        t = np.arange(n) / SR
        click = highpass(rng.standard_normal(n), 2500) * np.exp(-t * 120) * 0.35
        thump = np.sin(2 * np.pi * 90 * t) * np.exp(-t * 16) * 0.5
        ring = tone(midi(88), 0.4, ((1, 1),), decay=10)[:n] * 0.08
        return click + thump + ring
    if kind == "shimmer":
        out = np.zeros(int(1.2 * SR))
        for i, note in enumerate([86, 88, 90, 93, 95, 98]):
            s = tone(midi(note), 0.8, ((1, 1),), decay=7) * 0.08
            a = int(i * 0.05 * SR)
            out[a:a + len(s)] += s[: len(out) - a]
        return out
    if kind == "swell":
        n = int(1.6 * SR)
        t = np.arange(n) / SR
        x = bandpass(rng.standard_normal(n), 400, 3000)
        return x * (t / t[-1]) ** 2 * np.exp(-np.maximum(0, t - 1.4) * 30) * 0.12
    if kind == "chime":
        out = np.zeros(int(2.6 * SR))
        for i, note in enumerate([74, 78, 81, 86]):
            s = tone(midi(note), 2.4, ((1, 1), (2, 0.18), (3.01, 0.05)), decay=2.4) * 0.15
            a = int(i * 0.08 * SR)
            out[a:a + len(s)] += s[: len(out) - a]
        return out
    raise ValueError(kind)


PAN = {"pop": 0.2, "tick": -0.2, "check": 0.15, "deny": 0.0, "whoosh": 0.0, "mint": -0.1, "lock": 0.0}


def build_sfx(cues, duration):
    buf = np.zeros((int((duration + 3) * SR), 2))
    for c in cues:
        sig = fx(c["kind"])
        place(buf, sig, c["t"], gain=c.get("gain", 1.0), pan=PAN.get(c["kind"], 0.0))
    buf = reverb(buf, 1.4, 0.18, seed=2)
    return buf[: int(duration * SR)]


# ------------------------------------------------------------------ mix
def envelope(x, attack=0.02, release=0.35):
    """Smoothed level of a mono signal, used to duck the music under the voice."""
    a = np.exp(-1 / (attack * SR))
    r = np.exp(-1 / (release * SR))
    lvl = np.abs(x)
    # decimate for speed, then upsample
    hop = 240
    blocks = lvl[: len(lvl) // hop * hop].reshape(-1, hop).max(axis=1)
    env = np.zeros_like(blocks)
    prev = 0.0
    ah, rh = a ** hop, r ** hop
    for i, v in enumerate(blocks):
        coef = ah if v > prev else rh
        prev = coef * prev + (1 - coef) * v
        env[i] = prev
    env = np.repeat(env, hop)
    return np.pad(env, (0, len(x) - len(env)), mode="edge")


def main():
    tl = json.load(open(os.path.join(ROOT, "content", "timeline.json")))
    cues = json.load(open(os.path.join(ROOT, "build", "sfx.json")))["cues"]
    duration = tl["duration"]
    n = int(duration * SR)

    voice, vsr = sf.read(os.path.join(ROOT, "build", "audio", "voice.wav"), dtype="float64")
    from math import gcd
    g = gcd(vsr, SR)
    voice = resample_poly(voice, SR // g, vsr // g)
    voice = highpass(voice, 75)
    # gentle presence lift around 3 kHz for clarity under music
    voice = voice + 0.18 * bandpass(voice, 2200, 4800)
    voice = np.pad(voice, (0, max(0, n - len(voice))))[:n]

    music = build_music(tl)
    music = np.pad(music, ((0, max(0, n - len(music))), (0, 0)))[:n]
    sfx = build_sfx(cues, duration)
    sfx = np.pad(sfx, ((0, max(0, n - len(sfx))), (0, 0)))[:n]

    # ducking: music drops by up to 9 dB while the voice speaks
    env = envelope(voice)
    env = env / (env.max() + 1e-9)
    duck_db = -9.0 * np.clip(env * 6, 0, 1)
    duck = 10 ** (duck_db / 20)
    music *= duck[:, None]

    voice_st = np.stack([voice, voice], axis=1)
    mix = voice_st * 1.0 + music * 0.72 + sfx * 0.7
    peak = np.max(np.abs(mix))
    mix *= 0.89 / peak

    out = os.path.join(ROOT, "build", "audio")
    sf.write(os.path.join(out, "music.wav"), music.astype(np.float32), SR, subtype="PCM_24")
    sf.write(os.path.join(out, "sfx.wav"), sfx.astype(np.float32), SR, subtype="PCM_24")
    sf.write(os.path.join(out, "mix.wav"), mix.astype(np.float32), SR, subtype="PCM_24")
    print(f"mix {duration:.2f}s written, pre-normalisation peak scaled from {peak:.2f}")


if __name__ == "__main__":
    main()

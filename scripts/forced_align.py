"""Word-exact timing for a transcript (forced alignment), run after Parakeet.

Parakeet decides *which* words were said; its timestamps are approximate
(recorded in 80 ms steps, and some words land a few hundred ms off). This
script re-times the words it already found: a wav2vec2 speech model scores
every 20 ms slice of audio for each letter, then the known letters are fitted
onto the slices in order (a dynamic-programming search), and each word's start
and end are read off where its first and last letters land.

Input  (stdin):  JSON list of {"text", "start", "end"} in ms (Parakeet's words).
Output (stdout): JSON {"words": [{"start", "end"}...], "aligned": n, "pieces": n, "fallbacks": n}
Progress goes to stderr.

Usage:  python forced_align.py <audio-file>
Model:  scripts/setup-aligner.sh downloads it (CAST_ALIGN_MODEL_DIR overrides the folder).
"""

import json
import os
import subprocess
import sys

import numpy as np
import onnxruntime as ort

MODEL_DIR = os.environ.get("CAST_ALIGN_MODEL_DIR", os.path.expanduser("~/.cache/cast/models/wav2vec2-base-960h"))
RATE = 16000
FRAME_S = 0.02                 # wav2vec2 emits one slice per 320 samples
PIECE_MAX_S = 20.0             # keep pieces short: fast, and errors stay local
PIECE_SPLIT_GAP_S = 0.6        # start a new piece at a pause this long
MARGIN_S = 0.8                 # extra audio either side, since Parakeet's times can be off
MIN_TOKEN_PROB = 0.02          # below this average confidence, keep Parakeet's times
MAX_MOVE_S = 2.0               # a word moving further than this means the piece misaligned
QUIET_SHARE = 0.12             # a word span quieter than this share of the piece's peak is "near silence"
FILLERS = {"um", "uh", "umm", "uhh", "hmm", "mm", "mhm", "ah", "er", "erm"}  # the model never heard these in training


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def load_audio(path):
    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-i", path,
         "-vn", "-ac", "1", "-ar", str(RATE), "-f", "s16le", "pipe:1"],
        check=True, stdout=subprocess.PIPE,
    ).stdout
    return np.frombuffer(raw, dtype=np.int16)


def letters(text, vocab):
    return [c for c in text.upper() if c in vocab and c not in ("|",) and len(c) == 1]


def log_softmax(x):
    m = x.max(axis=-1, keepdims=True)
    return x - m - np.log(np.exp(x - m).sum(axis=-1, keepdims=True))


def viterbi(emission, tokens, blank):
    """Standard CTC forced alignment: the best placement of `tokens` (in order)
    over the frames, where each token may last any number of frames and
    "blank" (no sound change) may sit between tokens. Returns, for each frame,
    the token index it belongs to (-1 for blank), and the average confidence
    of the frames that carry a token.
    """
    T = emission.shape[0]
    ext = [blank]
    for tok in tokens:
        ext += [tok, blank]
    S = len(ext)
    ext = np.array(ext)
    lp = emission[:, ext]                      # T x S
    skip_ok = np.zeros(S, dtype=bool)
    skip_ok[2:] = (ext[2:] != blank) & (ext[2:] != ext[:-2])
    dp = np.full((T, S), -np.inf, dtype=np.float32)
    bp = np.zeros((T, S), dtype=np.int8)       # 0 stay, 1 from s-1, 2 from s-2
    dp[0, 0] = lp[0, 0]
    dp[0, 1] = lp[0, 1]
    neg = np.full(2, -np.inf, dtype=np.float32)
    for t in range(1, T):
        prev = dp[t - 1]
        adv = np.concatenate([neg[:1], prev[:-1]])
        skip = np.concatenate([neg, prev[:-2]])
        skip[~skip_ok] = -np.inf
        choices = np.stack([prev, adv, skip])
        bp[t] = choices.argmax(axis=0)
        dp[t] = choices.max(axis=0) + lp[t]
    end = S - 1 if dp[T - 1, S - 1] >= dp[T - 1, S - 2] else S - 2
    if not np.isfinite(dp[T - 1, end]):
        return None, 0.0
    states = np.zeros(T, dtype=np.int32)
    st = end
    for t in range(T - 1, -1, -1):
        states[t] = st
        st -= bp[t, st]
    if states[0] > 1:
        return None, 0.0
    token_frames = states % 2 == 1
    path = np.where(token_frames, (states - 1) // 2, -1)
    conf = float(np.exp(lp[np.arange(T), states][token_frames]).mean()) if token_frames.any() else 0.0
    return path, conf


def pieces_of(words):
    """Group words into short runs split at pauses, by Parakeet's times."""
    out, cur = [], []
    for i, w in enumerate(words):
        if cur:
            gap = (w["start"] - words[cur[-1]]["end"]) / 1000
            length = (w["end"] - words[cur[0]]["start"]) / 1000
            if gap >= PIECE_SPLIT_GAP_S or length >= PIECE_MAX_S:
                out.append(cur)
                cur = []
        cur.append(i)
    if cur:
        out.append(cur)
    return out


def main():
    audio_path = sys.argv[1]
    words = json.load(sys.stdin)
    vocab = json.load(open(os.path.join(MODEL_DIR, "vocab.json")))
    blank, sep = vocab["<pad>"], vocab["|"]
    session = ort.InferenceSession(os.path.join(MODEL_DIR, "model_quantized.onnx"), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    audio = load_audio(audio_path)
    total_s = len(audio) / RATE
    log(f"aligning {len(words)} words over {total_s:.0f}s")

    result = [{"start": w["start"], "end": w["end"], "ok": False} for w in words]
    pieces = pieces_of(words)
    fallbacks = 0
    for n, piece in enumerate(pieces):
        if n % 25 == 0:
            log(f"piece {n + 1}/{len(pieces)}")
        alignable = [i for i in piece if letters(words[i]["text"], vocab)]
        if not alignable:
            continue
        a = max(0.0, words[piece[0]]["start"] / 1000 - MARGIN_S)
        b = min(total_s, words[piece[-1]]["end"] / 1000 + MARGIN_S)
        chunk = audio[int(a * RATE):int(b * RATE)].astype(np.float32) / 32768.0
        if len(chunk) < RATE * 0.2:
            fallbacks += 1
            continue
        chunk = (chunk - chunk.mean()) / np.sqrt(chunk.var() + 1e-7)
        emission = log_softmax(session.run(None, {input_name: chunk[None, :]})[0][0])

        # Tokens: |W O R D|W O R D| ... with a note of which word each letter belongs to.
        tokens, owner = [sep], [-1]
        for i in alignable:
            for c in letters(words[i]["text"], vocab):
                tokens.append(vocab[c]); owner.append(i)
            tokens.append(sep); owner.append(-1)
        if len(tokens) > emission.shape[0]:
            fallbacks += 1
            continue
        path, confidence = viterbi(emission, tokens, blank)
        if path is None or confidence < MIN_TOKEN_PROB:
            fallbacks += 1
            continue

        spans = {}
        for t, j in enumerate(path):
            i = owner[j] if j >= 0 else -1
            if i >= 0:
                s, e = spans.get(i, (t, t))
                spans[i] = (min(s, t), max(e, t))
        moved_too_far = any(
            abs((a + spans[i][0] * FRAME_S) * 1000 - words[i]["start"]) > MAX_MOVE_S * 1000 for i in spans
        )
        if moved_too_far:
            fallbacks += 1
            continue
        # The model learned from read speech, so it is weak on fillers ("um", "uh").
        # If it put a word somewhere at most half as loud as Parakeet's spot — and the
        # word is a filler, or the spot is near-silent — keep Parakeet's time.
        piece_peak = float(np.abs(chunk).max()) or 1.0
        def peak(t0, t1):
            seg = chunk[max(0, int((t0 - a) * RATE)):max(0, int((t1 - a) * RATE))]
            return float(np.abs(seg).max()) / piece_peak if len(seg) else 0.0
        for i, (s, e) in spans.items():
            start, end = a + s * FRAME_S, a + (e + 1) * FRAME_S
            p_start, p_end = words[i]["start"] / 1000, words[i]["end"] / 1000
            here, there = peak(start, end), peak(p_start, p_end)
            filler = words[i]["text"].lower().strip(".,!?;:\"'") in FILLERS
            if here < there * 0.5 and (filler or here < QUIET_SHARE):
                continue
            result[i] = {"start": round(start * 1000), "end": round(end * 1000), "ok": True}

    # Words the model couldn't place (no letters, or a fallback piece) sit between aligned neighbours.
    for i, r in enumerate(result):
        if r["ok"]:
            continue
        prev_end = next((result[k]["end"] for k in range(i - 1, -1, -1) if result[k]["ok"]), 0)
        next_start = next((result[k]["start"] for k in range(i + 1, len(result)) if result[k]["ok"]), None)
        start = max(r["start"], prev_end)
        end = r["end"] if next_start is None else min(r["end"], next_start)
        r["start"], r["end"] = start, max(end, start + 40)

    aligned = sum(1 for r in result if r["ok"])
    log(f"aligned {aligned}/{len(words)} words; {fallbacks} of {len(pieces)} pieces kept Parakeet's times")
    json.dump({"words": [{"start": r["start"], "end": r["end"]} for r in result],
               "aligned": aligned, "pieces": len(pieces), "fallbacks": fallbacks}, sys.stdout)


if __name__ == "__main__":
    main()

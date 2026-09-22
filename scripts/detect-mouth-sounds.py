#!/usr/bin/env python3
"""Detect mouth sounds (coughs, sneezes, throat clearing, sniffs, snorts) in
media files using YAMNet (ONNX, CPU) and print skip regions as JSON.

Usage:
    detect-mouth-sounds.py <media-file> [--threshold 0.3] [--pad-ms 150]
        [--min-duration-ms 200] [--classes Cough,Sneeze]

Output (stdout): {"regions": [{"startMs":..,"endMs":..,"label":"cough","score":..}], ...}
Only the JSON document is printed to stdout; progress goes to stderr.
"""
import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "yamnet.onnx")
CLASS_MAP_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "yamnet_class_map.csv")

SAMPLE_RATE = 16000
DEFAULT_CLASSES = ["Cough", "Sneeze", "Throat clearing", "Sniff", "Snort"]


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def extract_mono_wav(media_path: str, tmp_path: str) -> None:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", media_path,
         "-ar", str(SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", tmp_path],
        check=True,
    )


def read_wav_mono_16k(wav_path: str) -> np.ndarray:
    from scipy.io import wavfile
    sr, data = wavfile.read(wav_path)
    if sr != SAMPLE_RATE:
        raise RuntimeError(f"expected {SAMPLE_RATE} Hz, got {sr} Hz")
    if data.ndim > 1:
        data = data.mean(axis=1)
    if data.dtype == np.int16:
        return (data.astype(np.float32) / 32768.0).astype(np.float32)
    if data.dtype == np.float32:
        return data.astype(np.float32)
    return data.astype(np.float32)


def load_class_names() -> list:
    names = []
    with open(CLASS_MAP_PATH, newline="") as f:
        for row in csv.DictReader(f):
            names.append(row["display_name"])
    return names


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("media", help="audio/video file to analyze")
    ap.add_argument("--threshold", type=float, default=0.3)
    ap.add_argument("--pad-ms", type=float, default=150.0)
    ap.add_argument("--min-duration-ms", type=float, default=200.0)
    ap.add_argument("--classes", default=",".join(DEFAULT_CLASSES))
    args = ap.parse_args()

    import onnxruntime as ort

    wanted = [c.strip() for c in args.classes.split(",") if c.strip()]
    names = load_class_names()
    name_to_idx = {n: i for i, n in enumerate(names)}
    missing = [c for c in wanted if c not in name_to_idx]
    if missing:
        log(f"unknown classes: {missing}")
        return 2
    target_idx = [name_to_idx[c] for c in wanted]

    with tempfile.TemporaryDirectory(prefix="cast-yamnet-") as tmp:
        wav_path = os.path.join(tmp, "audio.wav")
        log("extracting 16kHz mono audio…")
        extract_mono_wav(args.media, wav_path)
        waveform = read_wav_mono_16k(wav_path)

    duration_s = len(waveform) / SAMPLE_RATE
    log(f"audio: {duration_s:.1f}s, running YAMNet…")
    sess = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    scores = sess.run(["output_0"], {input_name: waveform})[0]  # (frames, 521)
    n_frames = scores.shape[0]
    hop_s = duration_s / n_frames
    log(f"frames: {n_frames} (~{hop_s * 1000:.0f}ms hop)")

    regions = []
    for cls_name, cls_idx in zip(wanted, target_idx):
        col = scores[:, cls_idx]
        active = np.nonzero(col >= args.threshold)[0]
        if len(active) == 0:
            continue
        # Group frames separated by at most one inactive frame.
        groups = []
        start = prev = active[0]
        for f in active[1:]:
            if f - prev <= 2:
                prev = f
            else:
                groups.append((start, prev))
                start = prev = f
        groups.append((start, prev))
        for (a, b) in groups:
            start_ms = max(0.0, a * hop_s * 1000 - args.pad_ms)
            end_ms = min(duration_s * 1000, (b + 1) * hop_s * 1000 + args.pad_ms)
            if end_ms - start_ms < args.min_duration_ms:
                continue
            regions.append({
                "startMs": round(start_ms),
                "endMs": round(end_ms),
                "label": cls_name.lower(),
                "score": round(float(col[a:b + 1].max()), 3),
            })

    regions.sort(key=lambda r: r["startMs"])
    print(json.dumps({
        "regions": regions,
        "meta": {
            "model": "yamnet-onnx",
            "threshold": args.threshold,
            "durationMs": round(duration_s * 1000),
            "frames": n_frames,
        },
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())

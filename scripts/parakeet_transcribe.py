"""Local speech-to-text via MLX Parakeet, emitting CAST's transcript shape.

Runs entirely on-device (Apple Silicon) so hesitations survive: Parakeet writes
"um" into the transcript, where a cloud formatter would silently delete it and
leave CAST nothing to cut.

Why the reassembly step
-----------------------
Parakeet emits SentencePiece *pieces*, not words ("Alright" arrives as
'Al'+'rig'+'ht'). The whitespace that marks a word boundary lives in the
leading space of each piece, so the pieces are re-joined here: a piece with a
leading space starts a new word, otherwise it extends the current one. Do not
strip pieces before this step — that whitespace is the only boundary signal.

Long audio
----------
Parakeet is a fixed-context model, so long recordings are split into
overlapping windows and transcribed one at a time. Each window's timestamps are
shifted back onto the global timeline, then words in the overlap region are
de-duplicated by text and time so a word straddling a boundary is not counted
twice. Progress goes to stderr; only the transcript JSON reaches stdout.

Usage:
    python parakeet_transcribe.py <audio-path> [--chunk-seconds N] [--no-chunk]

Prints the CAST transcript JSON to stdout.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

MODEL_ID = os.environ.get("CAST_PARAKEET_MODEL", "mlx-community/parakeet-tdt-0.6b-v3")
SAMPLE_RATE = 16000

# Window length and overlap. The overlap gives a straddling word a second chance
# to be transcribed cleanly inside the neighbouring window.
CHUNK_SECONDS = 300
CHUNK_OVERLAP_SECONDS = 5

# Below this, chunking costs more than it saves.
AUTO_CHUNK_THRESHOLD_SECONDS = 240

# How far apart two same-text words may sit and still count as one word seen
# twice across a window boundary. Comfortably wider than normal word spacing so
# a genuine stutter ("the the") survives de-duplication.
OVERLAP_TOLERANCE_MS = 400


def reassemble_words(tokens):
    """Join subword pieces into whole words using leading-space boundaries."""
    words = []
    current = None
    for token in tokens:
        text = token.text
        starts_word = text[:1].isspace() or current is None
        core = text.strip()
        if not core:
            continue
        if current is not None and not starts_word:
            current["text"] += core
            current["end"] = max(current["end"], token.end)
        else:
            if current is not None:
                words.append(current)
            # Key names must match CAST's parseTranscript, which reads
            # `start`/`end` and silently yields 0 for anything else.
            current = {
                "text": core,
                "start": int(round(token.start * 1000)),
                "end": int(round(token.end * 1000)),
            }
    if current is not None:
        words.append(current)
    return words


def collect_words(result):
    """Pull every piece out of the result's sentences, in order."""
    tokens = []
    for sentence in getattr(result, "sentences", []) or []:
        tokens.extend(getattr(sentence, "tokens", []) or [])
    return tokens


def to_transcript(words, text):
    """Shape into what CAST's parseTranscript loader expects."""
    if not words:
        return {"speakers": [], "text": "", "utterances": []}
    return {
        "speakers": [],
        "text": text,
        "utterances": [{
            "speaker": None,
            "start": words[0]["start"],
            "end": words[-1]["end"],
            "text": text,
            "words": words,
        }],
    }


def probe_duration_seconds(audio_path):
    """Container duration via ffprobe; falls back to wav header parsing."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
            capture_output=True, text=True, check=True,
        )
        return float(out.stdout.strip())
    except (subprocess.CalledProcessError, ValueError, FileNotFoundError):
        return None


def transcribe_window(model, audio_path, start_sec, duration_sec, workdir, index):
    """Transcribe one window, returning its words on the local timeline."""
    chunk_path = os.path.join(workdir, f"chunk_{index:04d}.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-ss", f"{start_sec:.3f}", "-t", f"{duration_sec:.3f}",
         "-i", audio_path, "-ar", str(SAMPLE_RATE), "-ac", "1",
         "-c:a", "pcm_s16le", chunk_path],
        check=True, capture_output=True,
    )
    try:
        result = model.generate(chunk_path)
    finally:
        try:
            os.unlink(chunk_path)
        except OSError:
            pass
    return reassemble_words(collect_words(result))


def normalize_for_match(text):
    """Comparable form of a word: case- and punctuation-insensitive.

    A word straddling a window edge is often transcribed twice, once with the
    punctuation attached and once without ("right" / "right?"). Comparing the
    raw text misses that pair, so strip to letters only before matching.
    """
    return "".join(ch for ch in text.lower() if ch.isalnum())


def dedupe_overlap(words):
    """Drop repeated words from the overlap between adjacent windows.

    Windows overlap, so the tail of one and the head of the next both contain
    the same few words. Two consecutive entries count as the same word seen
    twice when their normalized text matches and they start close together.
    """
    merged = []
    for word in words:
        prev = merged[-1] if merged else None
        if (
            prev is not None
            and normalize_for_match(prev["text"]) == normalize_for_match(word["text"])
            and normalize_for_match(word["text"]) != ""
            and abs(word["start"] - prev["start"]) < OVERLAP_TOLERANCE_MS
        ):
            # Keep the earlier placement but let the later one extend the span,
            # so a word clipped at a window edge still ends where it should.
            prev["end"] = max(prev["end"], word["end"])
            continue
        merged.append(word)
    return merged


def transcribe_chunked(model, audio_path, duration_sec, chunk_seconds, log):
    step = max(1, chunk_seconds - CHUNK_OVERLAP_SECONDS)
    windows = []
    offset = 0.0
    while offset < duration_sec:
        length = min(chunk_seconds, duration_sec - offset)
        windows.append((offset, length))
        if offset + length >= duration_sec:
            break
        offset += step

    log(f"chunking {duration_sec:.0f}s into {len(windows)} windows of {chunk_seconds}s")
    all_words = []
    with tempfile.TemporaryDirectory(prefix="cast-parakeet-") as workdir:
        for i, (start, length) in enumerate(windows):
            log(f"window {i + 1}/{len(windows)} @ {start:.0f}s")
            local = transcribe_window(model, audio_path, start, length, workdir, i)
            offset_ms = int(round(start * 1000))
            all_words.extend(
                {**w, "start": w["start"] + offset_ms, "end": w["end"] + offset_ms}
                for w in local
            )
    all_words.sort(key=lambda w: w["start"])
    deduped = dedupe_overlap(all_words)
    # Parakeet timestamps land on a ~40ms grid, so a word can end a hair after
    # the next begins. Nudge the earlier end back so spans never overlap.
    for i in range(len(deduped) - 1):
        if deduped[i]["end"] > deduped[i + 1]["start"]:
            deduped[i]["end"] = deduped[i + 1]["start"]
    return deduped


def transcribe_file(model, audio_path, chunk_seconds=None, force_chunk=False, force_single=False, log=None):
    log = log or (lambda _msg: None)
    if force_single:
        log("transcribing as a single window (chunking disabled)")
        return reassemble_words(collect_words(model.generate(audio_path)))
    duration = probe_duration_seconds(audio_path)
    seconds = chunk_seconds or CHUNK_SECONDS
    # Chunk automatically once the audio exceeds the model's comfortable window
    # — long files cannot be transcribed in one pass.
    should_chunk = force_chunk or (duration is not None and duration > AUTO_CHUNK_THRESHOLD_SECONDS)
    if not should_chunk:
        log("transcribing as a single window")
        return reassemble_words(collect_words(model.generate(audio_path)))
    return transcribe_chunked(model, audio_path, duration or seconds * 3, seconds, log)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio_path")
    parser.add_argument("--chunk-seconds", type=int, default=None,
                        help=f"window length (default {CHUNK_SECONDS})")
    parser.add_argument("--no-chunk", action="store_true",
                        help="force single-window transcription (long files may fail)")
    args = parser.parse_args()

    if not os.path.exists(args.audio_path):
        raise SystemExit(f"audio not found: {args.audio_path}")

    def log(message):
        print(message, file=sys.stderr, flush=True)

    from mlx_audio.stt.utils import load

    log(f"loading {MODEL_ID}")
    model = load(MODEL_ID)
    words = transcribe_file(
        model, args.audio_path,
        chunk_seconds=args.chunk_seconds,
        force_chunk=args.chunk_seconds is not None,
        force_single=args.no_chunk,
        log=log,
    )
    transcript = to_transcript(words, " ".join(w["text"] for w in words))
    print(json.dumps(transcript, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
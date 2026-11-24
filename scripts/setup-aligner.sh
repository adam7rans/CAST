#!/bin/zsh
# Download the word-timing (forced alignment) model CAST uses after Parakeet.
# wav2vec2-base-960h (Apache-2.0, originally facebook/wav2vec2-base-960h),
# ONNX int8 build from huggingface.co/Xenova/wav2vec2-base-960h — about 95 MB.
# Override the location with CAST_ALIGN_MODEL_DIR.
set -euo pipefail
DIR="${CAST_ALIGN_MODEL_DIR:-$HOME/.cache/cast/models/wav2vec2-base-960h}"
BASE="https://huggingface.co/Xenova/wav2vec2-base-960h/resolve/main"
mkdir -p "$DIR"
for f in config.json vocab.json preprocessor_config.json onnx/model_quantized.onnx; do
  out="$DIR/$(basename "$f")"
  if [[ -s "$out" ]]; then echo "have $(basename "$f")"; continue; fi
  echo "downloading $f"
  curl -fL --retry 3 -o "$out.part" "$BASE/$f"
  mv "$out.part" "$out"
done
echo "aligner model ready in $DIR"

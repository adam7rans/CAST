#!/bin/zsh
# Download the word-timing (forced alignment) model CAST uses after Parakeet.
# wav2vec2-base-960h (Apache-2.0, originally facebook/wav2vec2-base-960h),
# ONNX int8 build from huggingface.co/Xenova/wav2vec2-base-960h — about 95 MB.
# Override the location with CAST_ALIGN_MODEL_DIR.
#
# The download is pinned to one repository commit and every file is checked
# against a known SHA-256 before it is used, so a changed upstream file is
# refused instead of silently installed. (Hashes verified 2026-11-24 against
# Hugging Face's published LFS SHA-256 / git blob ids for this commit.)
set -euo pipefail
DIR="${CAST_ALIGN_MODEL_DIR:-$HOME/.cache/cast/models/wav2vec2-base-960h}"
COMMIT="a19f851b3d42865797e410752b4c570c871e4825"
BASE="https://huggingface.co/Xenova/wav2vec2-base-960h/resolve/$COMMIT"

typeset -A SHA256=(
  config.json               ceff8f92e6670ad3633779bd43b3559628c1a64b0868ef6046b23d62b85c69d5
  vocab.json                4178db26b3c7570f6a47f14ac6a1c7b32950b8c2800fb097287e53776934f1c5
  preprocessor_config.json  8cdfd65ff4115423185a1512bdae100e2e0cd744f5b322417429944aaafd0827
  model_quantized.onnx      cd5040c147381580ed73258143dd8e0c28e800a09e74ee42ee2b3e8cb4d760a3
)
typeset -A SOURCE=(
  config.json               config.json
  vocab.json                vocab.json
  preprocessor_config.json  preprocessor_config.json
  model_quantized.onnx      onnx/model_quantized.onnx
)

matches() { [[ "$(shasum -a 256 "$1" | cut -d' ' -f1)" == "$2" ]]; }

mkdir -p "$DIR"
for name in config.json vocab.json preprocessor_config.json model_quantized.onnx; do
  out="$DIR/$name"
  want="${SHA256[$name]}"
  if [[ -s "$out" ]] && matches "$out" "$want"; then echo "have $name (verified)"; continue; fi
  [[ -e "$out" ]] && echo "$name does not match the expected SHA-256; downloading it again"
  echo "downloading $name"
  curl -fL --retry 3 -o "$out.part" "$BASE/${SOURCE[$name]}"
  if ! matches "$out.part" "$want"; then
    rm -f "$out.part"
    echo "ERROR: $name failed its SHA-256 check; nothing was installed." >&2
    exit 1
  fi
  mv "$out.part" "$out"
  echo "verified $name"
done
echo "aligner model ready in $DIR"

#!/usr/bin/env bash
# Create CAST's private Python environment for local Parakeet transcription.
#
# CAST shells out to this interpreter (see server/transcribe.api.ts). It is kept
# separate from other projects' environments so rebuilding one never breaks the
# other. The model weights themselves live in the shared HuggingFace cache, so
# this does not duplicate ~4.7 GB of weights.
set -euo pipefail

cd "$(dirname "$0")/.."
VENV=".venv"

if [ ! -d "$VENV" ]; then
  echo "Creating $VENV…"
  python3 -m venv "$VENV"
fi

echo "Installing mlx-audio…"
"$VENV/bin/python3" -m pip install --quiet --upgrade pip
"$VENV/bin/python3" -m pip install --quiet "mlx-audio==0.4.5"

echo "Verifying…"
"$VENV/bin/python3" - <<'PY'
import mlx.core as mx
from mlx_audio.stt.utils import load  # noqa: F401
print(f"  mlx device: {mx.default_device()}")
PY

echo "Done. CAST will use $PWD/$VENV/bin/python3"
echo "First transcription downloads the Parakeet weights (~4.7 GB) into the HuggingFace cache."
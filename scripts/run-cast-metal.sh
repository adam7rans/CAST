#!/bin/bash
# Build (if needed) and launch cast-metal.
set -e
cd "$(dirname "$0")/../cast-metal"
swift build 2>/dev/null || swift build
exec .build/debug/castmetal "$@"

#!/bin/bash
# Builds the phone engine for this Mac: engine/build/engine-macos/mobile/turing_mobile_smoke,
# which the app's tests drive (test/support/engine.ts).
#
#   engine/build-macos.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

check_tools
fetch_sources
build_llvm_host

echo "== Engine for macOS"
configure_engine "$OUT/engine-macos" "$OUT/llvm-host" -DCMAKE_OSX_DEPLOYMENT_TARGET=$MACOS_MIN
make -C "$OUT/engine-macos" -j "$JOBS" turing_mobile_smoke

echo "Built $OUT/engine-macos/mobile/turing_mobile_smoke"

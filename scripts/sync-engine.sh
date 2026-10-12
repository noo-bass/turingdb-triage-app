#!/bin/bash
# Copies the prebuilt TuringDB engine into the native module.
#
#   scripts/sync-engine.sh
#
# Engine: built by engine/build-ios.sh (and, once it exists, engine/build-android.sh)
#         into engine/build (TURINGDB_MOBILE_BUILD overrides it). An engine not
#         built is skipped.
set -euo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="${TURINGDB_MOBILE_BUILD:-$APP/engine/build}"
MODULE="$APP/modules/turing-db"

if [[ ! -d "$ENGINE/dist-ios" && ! -d "$ENGINE/dist-android" ]]; then
    echo "No engine built in $ENGINE (run engine/build-ios.sh)" >&2
    exit 1
fi

if [[ -d "$ENGINE/dist-ios" ]]; then
    echo "iOS engine     <- $ENGINE/dist-ios/TuringMobile.xcframework"
    rm -rf "$MODULE/ios/Frameworks"
    mkdir -p "$MODULE/ios/Frameworks"
    cp -R "$ENGINE/dist-ios/TuringMobile.xcframework" "$MODULE/ios/Frameworks/"
else
    echo "iOS engine     -- not built, skipped"
fi

if [[ -d "$ENGINE/dist-android" ]]; then
    echo "Android engine <- $ENGINE/dist-android"
    rm -rf "$MODULE/android/engine"
    cp -R "$ENGINE/dist-android" "$MODULE/android/engine"
else
    echo "Android engine -- not built, skipped"
fi

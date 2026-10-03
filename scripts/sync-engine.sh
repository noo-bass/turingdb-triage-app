#!/bin/bash
# Copies the prebuilt TuringDB engine and the triage graph into the app.
#
#   scripts/sync-engine.sh
#
# Engine: built in turingdb-mobile by mobile/build-ios.sh and mobile/build-android.sh
#         (TURINGDB_MOBILE overrides its location).
# Graph:  exported from ../out/triage/graph.json by ../scripts/export_jsonl.py.
set -euo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$(cd "$APP/.." && pwd)"
ENGINE="${TURINGDB_MOBILE:-$(cd "$PROJECT/../.." && pwd)/turingdb-mobile}/build-mobile"
MODULE="$APP/modules/turing-db"

echo "iOS engine     <- $ENGINE/dist-ios/TuringMobile.xcframework"
rm -rf "$MODULE/ios/Frameworks"
mkdir -p "$MODULE/ios/Frameworks"
cp -R "$ENGINE/dist-ios/TuringMobile.xcframework" "$MODULE/ios/Frameworks/"

echo "Android engine <- $ENGINE/dist-android"
rm -rf "$MODULE/android/engine"
cp -R "$ENGINE/dist-android" "$MODULE/android/engine"

echo "Graph          <- $PROJECT/out/triage/graph.json"
(cd "$PROJECT" && uv run --project "$PROJECT/.." python scripts/export_jsonl.py \
    --input out/triage/graph.json --output "$APP/assets/graph/triage_v3.jsonl")

#!/bin/bash
# Builds the phone engine for iPhones: engine/build/dist-ios/TuringMobile.xcframework
# (ios-arm64, iOS 17+, no simulator slice), a static library whose only symbols
# are turing::mobile::TuringMobile's, with TuringMobile.h.
#
#   engine/build-ios.sh
#
# The app copies it in with scripts/sync-engine.sh.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

check_tools
fetch_sources
build_llvm_host
build_llvm_ios

echo "== Engine for iOS"
configure_engine "$OUT/engine-ios" "$OUT/llvm-ios" \
    -DCMAKE_SYSTEM_NAME=iOS \
    -DCMAKE_OSX_SYSROOT=iphoneos \
    -DCMAKE_OSX_ARCHITECTURES=arm64 \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=$IOS_MIN \
    -DCMAKE_MACOSX_BUNDLE=OFF
# The smoke binary is never run on iOS: its link tells combine-ios.py what to pack
make -C "$OUT/engine-ios" -j "$JOBS" turing_mobile_smoke

echo "== TuringMobile.xcframework"
STAGE="$OUT/stage-ios"
DIST="$OUT/dist-ios"
rm -rf "$STAGE" "$DIST/TuringMobile.xcframework"
mkdir -p "$STAGE/include" "$DIST"

python3 "$ENGINE/combine-ios.py" "$OUT/engine-ios" "$STAGE/libturingmobile.a"
cp "$ENGINE/TuringMobile.h" "$STAGE/include/"

xcodebuild -create-xcframework \
    -library "$STAGE/libturingmobile.a" \
    -headers "$STAGE/include" \
    -output "$DIST/TuringMobile.xcframework"

echo "Built $DIST/TuringMobile.xcframework"

# Triage app

A cross-platform triage app built for the EDTH platform that loads TuringDB onto a phone.

## How it fits together

```
assets/graph/triage_v3.jsonl     the doctrine graph (TuringDB JSONL)
        | LOAD JSONL on first launch (~25 ms), saved under Documents/turing
modules/turing-db                Expo native module: TuringDB in-process (iOS: ObjC++ over an
        |                        xcframework; Android: JNI over a static library)
src/graph                        open the engine and graph; parse its JSON answers into rows
src/triage/doctrine.ts           Cypher (DECISION-SPEC.md Q1-Q11) -> what the soldier flow needs
src/triage/assess.ts             one casualty: injuries, category, do now / needs a medic, next question
src/triage/order.ts              who goes first: category, then our tie-break rules; ties are named, never picked
src/triage/ties.ts               the tie-break questions worth asking (only those that could change the order)
src/triage/progress.ts           where a casualty is in the sieve, and why each question is asked
src/state/photos.ts              casualty photos under Documents, pruned when no casualty uses them
src/app                          screens (Expo Router)
```

The engine is TuringDB built for phones from source: the port in `engine/` (see `engine/README.md`).

## Build and run

```bash
npm ci

# 1. Build the engine (once, or after engine changes): fetches TuringDB, ~10 min the first time
engine/build-ios.sh          # -> engine/build/dist-ios/TuringMobile.xcframework
engine/build-macos.sh        # -> engine/build/engine-macos (for npm test)

# 2. Copy the engine into the native module
scripts/sync-engine.sh

# 3. Install on a connected phone (device only: the engine has no simulator build)
npx expo run:ios --device --configuration Release
```

Release builds embed the JavaScript, so the app runs with no laptop and no network.
iOS signing: `APPLE_TEAM_ID=<team> BUNDLE_ID=<your.bundle.id> npx expo run:ios --device` (app.config.js). Android: the native module is written (JNI) but the engine is not built for Android yet.

## Checks

```bash
npm test             # decision engine against the phone's engine built for macOS (53 tests)
npx tsc --noEmit
npx expo lint
```

Tests drive `turing_mobile_smoke` from the macOS build of the engine
(`engine/build/engine-macos`; override with `TURING_SMOKE`).

THIS IS A RESEARCH APP NOT A MEDICAL DEVICE. THE DOCTRINE IS A DRAFT DON'T USE IT FOR TRIAGE PLS.
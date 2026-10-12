# Triage app

Research prototype. Not a medical device. Draft doctrine, awaiting medic review.

An iPhone and Android app that walks a tired soldier through casualties one big question at a time:
say how many, sieve each one (stopping as soon as nothing could change their category), see everyone
by category, answer a few tie-break questions only where categories overlap, and get a final order
with the reason for each place. A photo of each casualty, kept only on the phone, tells them apart. The questions, injuries,
categories and steps come from the TCCC/MOD doctrine graph, queried with Cypher from a TuringDB
engine running inside the app: no network.

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
iOS signing: pick your team in Xcode, or add `ios.appleTeamId` to app.json. Android: the native module is written (JNI) but the engine is not built for Android yet.

## Checks

```bash
npm test             # decision engine against the phone's engine built for macOS (53 tests)
npx tsc --noEmit
npx expo lint
```

Tests drive `turing_mobile_smoke` from the macOS build of the engine
(`engine/build/engine-macos`; override with `TURING_SMOKE`).

## Rules that are ours, not doctrine (for medic review)

- The sieve stops once no remaining question could make the casualty more urgent. A second injury in
  the same or a lower category can go unasked, and questions that lead only to injuries doctrine
  does not rank (bleeding at groin or armpit, shock, hypothermia) are never asked.
- Order within a category: cannot be stabilised here first, then the longer tourniquet (an estimate is
  a bucket, so two in the same bucket stay tied), then signs of shock when checked again.
- Unranked casualties go after Minimal and before Expectant, and always read
  "Not ranked by triage doctrine: ask a medic", never "can wait".
- A step listing several kit items can be done with any one of them.
- Links between questions and injuries marked "our reading" are inferred, not doctrine.

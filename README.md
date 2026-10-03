# Triage app

Research prototype. Not a medical device. Draft doctrine, awaiting medic review.

An iPhone and Android app that walks a tired soldier through casualties one big question at a time,
tracks several casualties at once, and says who gets the seats and why. The questions, injuries,
categories and steps come from the TCCC/MOD doctrine graph, queried with Cypher from a TuringDB
engine running inside the app: no network.

## How it fits together

```
assets/graph/triage_v3.jsonl     the doctrine graph (exported from ../out/triage/graph.json)
        | LOAD JSONL on first launch (~25 ms), saved under Documents/turing
modules/turing-db                Expo native module: TuringDB in-process (iOS: ObjC++ over an
        |                        xcframework; Android: JNI over a static library)
src/graph                        open the engine and graph; parse its JSON answers into rows
src/triage/doctrine.ts           Cypher (DECISION-SPEC.md Q1-Q11) -> what the soldier flow needs
src/triage/assess.ts             one casualty: injuries, category, do now / needs a medic, next question
src/triage/seats.ts              who gets the seats: seated, contested (never silently picked), waits
src/app                          screens (Expo Router)
```

The engine is TuringDB built for phones from source: the port in `engine/` (see `engine/README.md`).

## Build and run

```bash
# 1. Build the engine (once, or after engine changes), in turingdb-mobile
./mobile/build-ios.sh        # -> build-mobile/dist-ios/TuringMobile.xcframework
./mobile/build-android.sh    # -> build-mobile/dist-android

# 2. Copy the engine into the module and re-export the graph
scripts/sync-engine.sh

# 3. Install on a connected phone (device only: the engine has no simulator build)
npx expo run:ios --device --configuration Release
npx expo run:android --device --variant release
```

Release builds embed the JavaScript, so the app runs with no laptop and no network.
iOS signing: pick your team in Xcode, or add `ios.appleTeamId` to app.json. Android release builds use the debug keystore.

## Checks

```bash
npm test             # decision engine against the phone's engine built for macOS (27 tests)
npx tsc --noEmit
npx expo lint
```

Tests drive `turing_mobile_smoke` from the macOS build of the engine
(`turingdb-mobile/build-mobile/engine-macos`; override with `TURING_SMOKE`).

## Rules that are ours, not doctrine (for medic review)

- Seat order within a category: cannot be stabilised here first, then the longer tourniquet first.
- Unranked casualties go after Minimal and before Expectant, and always read
  "Not ranked by triage doctrine: ask a medic", never "can wait".
- A step listing several kit items can be done with any one of them.
- Links between questions and injuries marked "our reading" are inferred, not doctrine.

# TuringDB for phones

The engine in-process inside an app, behind one header: `TuringMobile.h`
(`turing::mobile::TuringMobile`: open a data directory, `openGraph`, `query` →
the HTTP server's JSON envelope). The app's native module
(`modules/turing-db`) wraps it for React Native.

```bash
engine/build-ios.sh     # -> engine/build/dist-ios/TuringMobile.xcframework (ios-arm64, iOS 17+)
engine/build-macos.sh   # -> engine/build/engine-macos/mobile/turing_mobile_smoke (the app's tests)
```

Needs Xcode and `brew install cmake ninja bison flex`. The first run clones
upstream TuringDB at the commit in `lib.sh` into `engine/turingdb/`, applies
`turingdb.patch`, and builds LLVM/MLIR for the Mac and for iOS (~7 min on an
M-series Mac); then ~2 min per engine. `TURINGDB_ROOT` points at another checkout.

## What differs from the server build

`CMakeLists.txt` is its own project over the engine's sources:

- **Left out**: vector search (Faiss/OpenMP/OpenBLAS), Parquet (Arrow), S3
  (minio-cpp/curl/OpenSSL), the server, network stack, tools, Python bindings,
  and `common/`'s process/daemon helpers (no fork/exec in an app).
- **Stand-ins** (`stubs/`): the S3 and Parquet entry points throw "not
  available on mobile"; the vector database starts empty and creating a
  library fails. `stubs/include` shadows the two headers that would pull in
  Arrow or minio-cpp.
- **MLIR** is only interpreted (no JIT), so it runs on iOS. LLVM/MLIR are built
  with Apple clang against the system libc++, as the app is.
- **Packaging** (`combine-ios.py`): the ~1700 object files the engine really
  links become one object whose only global symbols are TuringMobile's, so
  nothing clashes with React Native's own fmt/folly. Local names are stripped.

`turingdb.patch` is the one engine source change: `storage/dump/PropertyContainerLoader.h`
needs `it.template get<T>()` under newer clang (Xcode 27).

## Not done

- Android (`build-android.sh`). The app's JNI side expects
  `dist-android/<abi>/libturingmobile.a` and `dist-android/include/TuringMobile.h`,
  built with NDK r28.
- No simulator slice.

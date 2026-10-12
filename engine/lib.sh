# Shared by build-ios.sh and build-macos.sh (sourced, not run).
#
# The engine's sources are upstream TuringDB at TURINGDB_COMMIT, cloned into
# engine/turingdb/ (TURINGDB_ROOT overrides it) with turingdb.patch applied.
#
# Everything lands in engine/build/:
#   llvm-host/     LLVM/MLIR for this Mac: tablegen tools + libraries for engine-macos
#   llvm-ios/      LLVM/MLIR libraries for iPhones
#   engine-macos/  the engine for this Mac, with mobile/turing_mobile_smoke (the app's tests)
#   engine-ios/    the engine for iPhones
#   dist-ios/      TuringMobile.xcframework

ENGINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${TURINGDB_ROOT:-$ENGINE/turingdb}"
OUT="$ENGINE/build"
TURINGDB_REPO=https://github.com/turing-db/turingdb.git
TURINGDB_COMMIT=c77ab5488e5538bfd650c4577f81b0789ef89277
JOBS="${JOBS:-$(sysctl -n hw.ncpu)}"
IOS_MIN=17.0
MACOS_MIN=14.0

# The MLIR libraries the engine links (query/ir) and nothing else of LLVM
MLIR_LIBS=(MLIRIR MLIRFuncDialect MLIRPass MLIRSupport MLIRTransformUtils MLIRInferTypeOpInterface MLIRBuiltinToLLVMIRTranslation)

LLVM_COMMON_ARGS=(
    -G Ninja
    -DCMAKE_BUILD_TYPE=Release
    -DLLVM_ENABLE_PROJECTS=mlir
    -DLLVM_TARGETS_TO_BUILD=AArch64
    -DLLVM_ENABLE_ASSERTIONS=OFF
    -DLLVM_ENABLE_LIBXML2=OFF
    -DLLVM_ENABLE_ZSTD=OFF
    -DLLVM_ENABLE_ZLIB=OFF
    -DLLVM_ENABLE_TERMINFO=OFF
    -DLLVM_ENABLE_LIBEDIT=OFF
    -DLLVM_INCLUDE_TESTS=OFF
    -DLLVM_INCLUDE_BENCHMARKS=OFF
    -DLLVM_INCLUDE_EXAMPLES=OFF
    -DLLVM_INCLUDE_DOCS=OFF
    -DMLIR_INCLUDE_TESTS=OFF
)

check_tools() {
    for tool in cmake ninja xcrun git; do
        command -v "$tool" >/dev/null || { echo "Missing $tool (brew install cmake ninja; Xcode)"; exit 1; }
    done
    for tool in /opt/homebrew/opt/bison/bin/bison /opt/homebrew/opt/flex/bin/flex; do
        [[ -x "$tool" ]] || { echo "Missing $tool (brew install bison flex)"; exit 1; }
    done
}

# Upstream TuringDB at the commit this port is built and tested against, and
# only the submodules the mobile engine needs (not the server's: curl, minio, OpenBLAS..)
fetch_sources() {
    if [[ ! -d "$ROOT/.git" ]]; then
        echo "== TuringDB $TURINGDB_COMMIT -> $ROOT"
        git init -q "$ROOT"
        git -C "$ROOT" remote add origin "$TURINGDB_REPO"
        git -C "$ROOT" fetch -q --depth 1 origin "$TURINGDB_COMMIT"
        git -C "$ROOT" checkout -q FETCH_HEAD
        git -C "$ROOT" apply "$ENGINE/turingdb.patch"
    fi
    git -C "$ROOT" submodule update --init --depth 1 \
        external/llvm-project external/nlohmann_json external/spdlog external/range-v3
}

# LLVM/MLIR for this Mac. Its tablegen tools generate code for every target.
build_llvm_host() {
    echo "== LLVM/MLIR for macOS"
    cmake -S "$ROOT/external/llvm-project/llvm" -B "$OUT/llvm-host" "${LLVM_COMMON_ARGS[@]}" \
        -DCMAKE_OSX_DEPLOYMENT_TARGET=$MACOS_MIN
    ninja -C "$OUT/llvm-host" -j "$JOBS" \
        mlir-tblgen llvm-tblgen mlir-linalg-ods-yaml-gen mlir-src-sharder "${MLIR_LIBS[@]}"
}

# LLVM/MLIR libraries for iPhones (arm64, no simulator), with the host tablegen
build_llvm_ios() {
    echo "== LLVM/MLIR for iOS"
    local host="$OUT/llvm-host/bin"
    cmake -S "$ROOT/external/llvm-project/llvm" -B "$OUT/llvm-ios" "${LLVM_COMMON_ARGS[@]}" \
        -DCMAKE_SYSTEM_NAME=iOS \
        -DCMAKE_OSX_SYSROOT=iphoneos \
        -DCMAKE_OSX_ARCHITECTURES=arm64 \
        -DCMAKE_OSX_DEPLOYMENT_TARGET=$IOS_MIN \
        -DCMAKE_MACOSX_BUNDLE=OFF \
        -DLLVM_TARGET_ARCH=AArch64 \
        -DLLVM_HOST_TRIPLE=arm64-apple-ios$IOS_MIN \
        -DLLVM_DEFAULT_TARGET_TRIPLE=arm64-apple-ios$IOS_MIN \
        -DLLVM_NATIVE_TOOL_DIR="$host" \
        -DLLVM_TABLEGEN="$host/llvm-tblgen" \
        -DMLIR_TABLEGEN="$host/mlir-tblgen" \
        -DMLIR_LINALG_ODS_YAML_GEN="$host/mlir-linalg-ods-yaml-gen" \
        -DMLIR_SRC_SHARDER_TABLEGEN="$host/mlir-src-sharder" \
        -DLLVM_BUILD_TOOLS=OFF \
        -DLLVM_BUILD_UTILS=OFF \
        -DLLVM_INCLUDE_UTILS=OFF \
        -DLLVM_ENABLE_LIBPFM=OFF \
        -DMLIR_ENABLE_EXECUTION_ENGINE=OFF
    ninja -C "$OUT/llvm-ios" -j "$JOBS" "${MLIR_LIBS[@]}"
}

# configure_engine <build dir> <llvm dir> [cmake args..]
configure_engine() {
    local build="$1" llvm="$2"
    shift 2
    cmake -S "$ENGINE" -B "$build" -Wno-dev \
        -DTURINGDB_ROOT="$ROOT" \
        -DCMAKE_BUILD_TYPE=Release \
        -DMLIR_DIR="$llvm/lib/cmake/mlir" \
        -DLLVM_DIR="$llvm/lib/cmake/llvm" \
        -DHOST_TOOLS_DIR="$OUT/llvm-host/bin" \
        "$@"
}

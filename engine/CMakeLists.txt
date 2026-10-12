# TuringDB for phones: the engine in-process, behind TuringMobile.h.
#
# A project of its own over the engine's sources, built by build-ios.sh,
# build-android.sh and build-macos.sh. The engine is what the server runs,
# minus what a phone app has no use for:
#   - vector search (Faiss, OpenMP, OpenBLAS): the faiss-backed files are left
#     out, and creating a vector library fails with an error
#   - Parquet import (Apache Arrow) and S3 (minio-cpp, curl, OpenSSL): stand-ins
#     in stubs/ throw a clear error
#   - the server, the network stack, the tools and the Python bindings
#
# Inputs:
#   MLIR_DIR, LLVM_DIR   LLVM/MLIR built for the target (lib/cmake/{mlir,llvm})
#   HOST_TOOLS_DIR       mlir-tblgen and llvm-tblgen built for this machine
#   BISON_EXECUTABLE, FLEX_EXECUTABLE, FLEX_INCLUDE_DIRS (default: Homebrew)
cmake_minimum_required(VERSION 3.22)

project(turing_mobile C CXX)

# The engine's sources: upstream TuringDB with turingdb.patch (lib.sh fetches it)
if (NOT TURINGDB_ROOT)
    set(TURINGDB_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/turingdb)
endif()
set(EXTERNAL_DIR ${TURINGDB_ROOT}/external)

set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if (NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# The engine's own flags (top-level CMakeLists.txt), without -Werror: newer
# compilers than the ones it is tested with warn about more
# Release, no profiler (the variables the top-level CMakeLists.txt sets)
set(DEBUG_BUILD FALSE)
set(TURING_PROFILE 0)
add_compile_definitions(NDEBUG DISABLE_STRING_INDEX)

# range-v3 forward-declares std containers under Apple clang with a libc++
# macro newer libc++ no longer has; the real headers are fine
add_compile_definitions(META_NO_STD_FORWARD_DECLARATIONS)
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wno-deprecated-declarations")
set(CMAKE_CXX_FLAGS_RELEASE "-O3")
set(CMAKE_C_FLAGS_RELEASE "-O3")

# The stand-ins shadow the real headers that would pull in Arrow or minio-cpp,
# so they come before every include directory the targets add
include_directories(BEFORE ${CMAKE_CURRENT_SOURCE_DIR}/stubs/include)

set(THREADS_PREFER_PTHREAD_FLAG ON)
find_package(Threads REQUIRED)

# ======== Parser generators (run on this machine) ========
set(HOMEBREW_PREFIX /opt/homebrew)
if (NOT BISON_EXECUTABLE)
    set(BISON_EXECUTABLE ${HOMEBREW_PREFIX}/opt/bison/bin/bison)
endif()
if (NOT FLEX_EXECUTABLE)
    set(FLEX_EXECUTABLE ${HOMEBREW_PREFIX}/opt/flex/bin/flex)
endif()
if (NOT FLEX_INCLUDE_DIRS)
    set(FLEX_INCLUDE_DIRS ${HOMEBREW_PREFIX}/opt/flex/include)
endif()
set(FLEX_INCLUDE_DIR ${FLEX_INCLUDE_DIRS} CACHE PATH "" FORCE)
find_package(BISON REQUIRED)
find_package(FLEX REQUIRED)

# ======== LLVM / MLIR (built for the target, tablegen from this machine) ========
find_package(MLIR REQUIRED CONFIG)
find_package(LLVM REQUIRED CONFIG)
message(STATUS "MLIR: ${MLIR_DIR}")
message(STATUS "LLVM: ${LLVM_DIR}")

if (NOT HOST_TOOLS_DIR)
    message(FATAL_ERROR "HOST_TOOLS_DIR must hold mlir-tblgen and llvm-tblgen built for this machine")
endif()
set(MLIR_TABLEGEN_EXE ${HOST_TOOLS_DIR}/mlir-tblgen CACHE FILEPATH "" FORCE)
set(LLVM_TABLEGEN_EXE ${HOST_TOOLS_DIR}/llvm-tblgen CACHE FILEPATH "" FORCE)

list(APPEND CMAKE_MODULE_PATH "${MLIR_CMAKE_DIR}" "${LLVM_CMAKE_DIR}")
include(TableGen)
include(AddLLVM)
include(AddMLIR)

# ======== Header-only and small libraries ========
add_subdirectory(${EXTERNAL_DIR}/argparse external/argparse)
add_subdirectory(${EXTERNAL_DIR}/expected external/expected)
add_subdirectory(${EXTERNAL_DIR}/range-v3 external/range-v3 EXCLUDE_FROM_ALL)

set(SPDLOG_BUILD_SHARED OFF CACHE BOOL "" FORCE)
add_subdirectory(${EXTERNAL_DIR}/spdlog external/spdlog EXCLUDE_FROM_ALL)

set(JSON_BuildTests OFF CACHE INTERNAL "")
set(JSON_Install OFF CACHE INTERNAL "")
add_subdirectory(${EXTERNAL_DIR}/nlohmann_json external/nlohmann_json EXCLUDE_FROM_ALL)

# ======== Build info (the dump format version is the commit timestamp) ========
execute_process(COMMAND git rev-parse HEAD
                OUTPUT_VARIABLE HEAD_COMMIT_HASH
                WORKING_DIRECTORY ${TURINGDB_ROOT})
execute_process(COMMAND git show --no-patch --format=%at
                OUTPUT_VARIABLE HEAD_COMMIT_TIMESTAMP
                WORKING_DIRECTORY ${TURINGDB_ROOT})
add_subdirectory(${TURINGDB_ROOT}/cmake engine/cmake)

# ======== The engine ========
macro(engine_module dir)
    add_subdirectory(${TURINGDB_ROOT}/${dir} engine/${dir})
endmacro()

engine_module(common)

# Process, daemon and command-line helpers serve the server's tools only, and
# fork/exec/libproc do not exist for an app
get_target_property(COMMON_SOURCES turing_common_s SOURCES)
list(REMOVE_ITEM COMMON_SOURCES
    Demonology.cpp
    ToolInit.cpp
    ToolCommand.cpp
    ToolCommandEngine.cpp
    Process.cpp
    ProcessUtils.cpp
    Command.cpp)
set_property(TARGET turing_common_s PROPERTY SOURCES ${COMMON_SOURCES})
engine_module(base)
engine_module(jobs)
engine_module(io/fs)
engine_module(io/cache)
engine_module(io/csv)
engine_module(memory)
engine_module(import/common)
engine_module(import/gml)
engine_module(import/jsonl)
engine_module(storage)
engine_module(procedures)
engine_module(query)
engine_module(system)
engine_module(net/tcp_common)
engine_module(net/turing_proto_common)
engine_module(net/encoders)
engine_module(db)

# Extensions: the manager, not the builtin shared library (an app cannot load one)
add_library(turing_extensions_s STATIC
    ${TURINGDB_ROOT}/extensions/ExtensionDescriptor.cpp
    ${TURINGDB_ROOT}/extensions/ExtensionManager.cpp)
target_include_directories(turing_extensions_s PUBLIC ${TURINGDB_ROOT}/extensions)
target_link_libraries(turing_extensions_s PUBLIC turing_db_procedures_s ${CMAKE_DL_LIBS})

# Vector search without Faiss: the files over faiss (VecLib, VecLibShard,
# ShardCache, VecLibShardAccessor, VectorStorageManager) give way to stubs/VectorMobile.cpp
add_library(turing_vector_s STATIC
    ${TURINGDB_ROOT}/vector/RandomGenerator.cpp
    ${TURINGDB_ROOT}/vector/VectorException.cpp
    ${TURINGDB_ROOT}/vector/LSHShardRouter.cpp
    ${TURINGDB_ROOT}/vector/VectorResult.cpp
    ${TURINGDB_ROOT}/vector/VectorDatabase.cpp
    ${TURINGDB_ROOT}/vector/VecLibMetadataLoader.cpp
    ${TURINGDB_ROOT}/vector/VecLibMetadataWriter.cpp
    ${TURINGDB_ROOT}/vector/LSHShardRouterLoader.cpp
    ${TURINGDB_ROOT}/vector/LSHShardRouterWriter.cpp
    ${TURINGDB_ROOT}/vector/VecLibAccessor.cpp
    ${TURINGDB_ROOT}/vector/VecLibWriteAccessor.cpp
    ${TURINGDB_ROOT}/vector/VectorCSVReader.cpp
    ${TURINGDB_ROOT}/vector/import/ImportResult.cpp
    ${TURINGDB_ROOT}/vector/import/ImportException.cpp
    ${TURINGDB_ROOT}/vector/import/JsonImporter.cpp
    stubs/VectorMobile.cpp)
target_include_directories(turing_vector_s PUBLIC ${TURINGDB_ROOT}/vector)
target_link_libraries(turing_vector_s PUBLIC
    turing_common_s
    Threads::Threads
    turing_db_io_fs_s
    turing_db_io_cache_s
    nlohmann_json::nlohmann_json)

# Parquet and S3 stand-ins, under the names the engine links against
add_library(turing_db_io_parquet_s STATIC stubs/ParquetMobile.cpp)
target_include_directories(turing_db_io_parquet_s PUBLIC ${TURINGDB_ROOT}/io/parquet)
target_link_libraries(turing_db_io_parquet_s PUBLIC turing_common_s turing_db_io_fs_s turing_db_storage_s turing_db_import_common_s)

add_library(turing_db_import_parquet_s INTERFACE)
target_link_libraries(turing_db_import_parquet_s INTERFACE turing_db_io_parquet_s)

add_library(turing_db_io_s3_s STATIC
    ${TURINGDB_ROOT}/io/s3/S3ClientResult.cpp
    stubs/S3Mobile.cpp)
target_include_directories(turing_db_io_s3_s PUBLIC ${TURINGDB_ROOT}/io/s3)
target_link_libraries(turing_db_io_s3_s PUBLIC turing_common_s)

# ======== TuringMobile ========
add_library(turing_mobile_s STATIC TuringMobile.cpp)
target_include_directories(turing_mobile_s PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(turing_mobile_s PUBLIC turing_db_s turing_db_memory_s)

add_executable(turing_mobile_smoke SmokeMain.cpp)
target_link_libraries(turing_mobile_smoke PRIVATE turing_mobile_s)
set_target_properties(turing_mobile_smoke PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/mobile)

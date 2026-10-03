cmake_minimum_required(VERSION 3.22)
project(turingdb_jni CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Built by turingdb-mobile/mobile/build-android.sh, copied in by
# app/scripts/sync-engine.sh (not committed: ~100 MB)
set(ENGINE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/engine)

add_library(turing_mobile STATIC IMPORTED)
set_target_properties(turing_mobile PROPERTIES
    IMPORTED_LOCATION ${ENGINE_DIR}/${ANDROID_ABI}/libturingmobile.a)

add_library(turingdb_jni SHARED src/main/cpp/turingdb_jni.cpp)
target_include_directories(turingdb_jni PRIVATE ${ENGINE_DIR}/include)

# -fexperimental-library: NDK r28's libc++ keeps std::jthread there
target_link_libraries(turingdb_jni PRIVATE turing_mobile log)
target_link_options(turingdb_jni PRIVATE -fexperimental-library "-Wl,--exclude-libs,ALL")

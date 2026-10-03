// JNI face of the C++ engine (turing::mobile::TuringMobile) for TuringNative.kt.
// The engine lives behind an opaque jlong handle owned by the Kotlin side.

#include <jni.h>

#include <exception>
#include <string>

#include "TuringMobile.h"

using turing::mobile::TuringMobile;

namespace {

std::string toString(JNIEnv* env, jstring s) {
    const char* chars = env->GetStringUTFChars(s, nullptr);
    std::string out(chars);
    env->ReleaseStringUTFChars(s, chars);
    return out;
}

void throwJava(JNIEnv* env, const std::exception& e) {
    jclass runtimeException = env->FindClass("java/lang/RuntimeException");
    env->ThrowNew(runtimeException, e.what());
}

TuringMobile* engine(jlong handle) {
    return reinterpret_cast<TuringMobile*>(handle);
}

}

extern "C" {

JNIEXPORT jlong JNICALL
Java_expo_modules_turingdb_TuringNative_open(JNIEnv* env, jobject, jstring dataDir) {
    try {
        return reinterpret_cast<jlong>(new TuringMobile(toString(env, dataDir)));
    } catch (const std::exception& e) {
        throwJava(env, e);
        return 0;
    }
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_turingdb_TuringNative_openGraph(JNIEnv* env, jobject, jlong handle, jstring graphName) {
    try {
        return engine(handle)->openGraph(toString(env, graphName)) ? JNI_TRUE : JNI_FALSE;
    } catch (const std::exception&) {
        return JNI_FALSE;
    }
}

JNIEXPORT jstring JNICALL
Java_expo_modules_turingdb_TuringNative_query(JNIEnv* env, jobject, jlong handle,
                                              jstring graphName, jstring cypher) {
    try {
        const std::string json = engine(handle)->query(toString(env, graphName), toString(env, cypher));
        return env->NewStringUTF(json.c_str());
    } catch (const std::exception& e) {
        throwJava(env, e);
        return nullptr;
    }
}

}

package expo.modules.turingdb

// The C++ engine behind JNI (src/main/cpp/turingdb_jni.cpp). A handle is a
// pointer to one engine; the module keeps one for the life of the app.
internal object TuringNative {
  init {
    System.loadLibrary("turingdb_jni")
  }

  external fun open(dataDir: String): Long

  external fun openGraph(handle: Long, graphName: String): Boolean

  external fun query(handle: Long, graphName: String, cypher: String): String
}

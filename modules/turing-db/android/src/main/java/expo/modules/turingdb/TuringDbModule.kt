package expo.modules.turingdb

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// In-process TuringDB. One engine per app; AsyncFunctions run off the JS thread
// and the engine serialises its own queries.
class TuringDbModule : Module() {
  private var handle: Long = 0

  override fun definition() = ModuleDefinition {
    Name("TuringDb")

    AsyncFunction("open") { dataDir: String ->
      synchronized(this@TuringDbModule) {
        if (handle == 0L) {
          handle = TuringNative.open(dataDir)
        }
      }
    }

    AsyncFunction("openGraph") { graphName: String ->
      TuringNative.openGraph(engine(), graphName)
    }

    AsyncFunction("query") { graphName: String, cypher: String ->
      TuringNative.query(engine(), graphName, cypher)
    }
  }

  private fun engine(): Long {
    if (handle == 0L) {
      throw EngineNotOpenException()
    }
    return handle
  }
}

internal class EngineNotOpenException :
  CodedException("TuringDb.open(dataDir) must be called first")

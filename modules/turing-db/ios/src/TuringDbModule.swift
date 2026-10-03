import ExpoModulesCore

// In-process TuringDB. One engine per app; AsyncFunctions run off the JS thread
// and the engine serialises its own queries.
public class TuringDbModule: Module {
  private var bridge: TuringBridge?

  public func definition() -> ModuleDefinition {
    Name("TuringDb")

    AsyncFunction("open") { (dataDir: String) in
      if self.bridge != nil {
        return
      }
      self.bridge = try TuringBridge(dataDir: dataDir)
    }

    AsyncFunction("openGraph") { (graphName: String) -> Bool in
      try self.engine().openGraph(graphName)
    }

    AsyncFunction("query") { (graphName: String, cypher: String) -> String in
      try self.engine().query(graphName, cypher: cypher)
    }
  }

  private func engine() throws -> TuringBridge {
    guard let bridge = bridge else {
      throw EngineNotOpenException()
    }
    return bridge
  }
}

internal final class EngineNotOpenException: Exception {
  override var reason: String {
    "TuringDb.open(dataDir) must be called first"
  }
}

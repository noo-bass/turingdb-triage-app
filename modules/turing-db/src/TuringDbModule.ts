import { NativeModule, requireNativeModule } from 'expo';

// In-process TuringDB (see ios/src and android/src/main/cpp).
declare class TuringDbModule extends NativeModule<{}> {
  // Starts the engine once; dataDir is a writable path (no file:// prefix)
  open(dataDir: string): Promise<void>;
  // true when the graph is (now) loaded; false when it is not on disk
  openGraph(graphName: string): Promise<boolean>;
  // The engine's JSON envelope; parse with src/graph/envelope.ts
  query(graphName: string, cypher: string): Promise<string>;
}

export default requireNativeModule<TuringDbModule>('TuringDb');

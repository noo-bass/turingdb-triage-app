import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

import TuringDb from '../../modules/turing-db';
import { parseEnvelope, type Row } from './envelope';

// Named after the bundled file, so a new graph version loads as a new graph
// instead of reusing the one an older app version left on the phone
export const GRAPH = 'triage_v3';
// require() is how React Native references a bundled asset
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GRAPH_ASSET = require('../../assets/graph/triage_v3.jsonl');

let opening: Promise<void> | null = null;

// Starts the on-device engine and makes the triage graph queryable. The first
// launch builds the graph from the bundled JSONL (~25 ms); later launches load
// the copy the engine saved.
export function openTriageGraph(): Promise<void> {
  opening ??= open().catch((e: unknown) => {
    opening = null; // let the next call retry
    throw e;
  });
  return opening;
}

export async function query(cypher: string): Promise<Row[]> {
  await openTriageGraph();
  return parseEnvelope(await TuringDb.query(GRAPH, cypher));
}

async function open(): Promise<void> {
  const root = new Directory(Paths.document, 'turing');
  if (!root.exists) {
    root.create({ intermediates: true });
  }
  await TuringDb.open(toPath(root.uri));

  if (await TuringDb.openGraph(GRAPH)) {
    return;
  }

  // LOAD JSONL reads files from the engine's data directory
  const data = new Directory(root, 'data');
  if (!data.exists) {
    data.create({ intermediates: true });
  }
  const source = new File(data, `${GRAPH}.jsonl`);
  if (source.exists) {
    source.delete();
  }
  const [asset] = await Asset.loadAsync(GRAPH_ASSET);
  if (!asset.localUri) {
    throw new Error(`Bundled graph ${GRAPH} could not be read`);
  }
  await new File(asset.localUri).copy(source);

  parseEnvelope(await TuringDb.query('default', `LOAD JSONL '${GRAPH}.jsonl' AS ${GRAPH}`));
  source.delete();
}

// The engine takes a plain filesystem path, not a file:// URI
function toPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/$/, '');
}

/// <reference types="node" />
// The phone's TuringDB engine, built for macOS, driven from tests.
//
// Runs turing_mobile_smoke in stdin mode (one Cypher statement per line in,
// one JSON envelope per line out) on a fresh data directory holding the graph
// the app bundles, so tests query exactly what the phone queries.
//
// TURING_SMOKE overrides the binary (default: the turingdb-mobile macOS build).

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { parseEnvelope, type Row } from '../../src/graph/envelope.ts';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GRAPH = 'triage_v3';
const SMOKE =
  process.env.TURING_SMOKE ??
  resolve(APP, '../../../turingdb-mobile/build-mobile/engine-macos/mobile/turing_mobile_smoke');

export type Engine = {
  query: (cypher: string) => Promise<Row[]>;
  close: () => void;
};

export function startEngine(): Engine {
  if (!existsSync(SMOKE)) {
    throw new Error(`TuringDB mobile engine not found at ${SMOKE} (build it or set TURING_SMOKE)`);
  }

  const dataDir = mkdtempSync(join(tmpdir(), 'triage-engine-'));
  mkdirSync(join(dataDir, 'data'));
  copyFileSync(join(APP, 'assets/graph', `${GRAPH}.jsonl`), join(dataDir, 'data', `${GRAPH}.jsonl`));
  const load = spawnSync(SMOKE, [dataDir, 'default', `LOAD JSONL '${GRAPH}.jsonl' AS ${GRAPH}`], {
    encoding: 'utf8',
  });
  const loaded = load.stdout.split('\n').find((l) => l.startsWith('{'));
  if (!loaded) {
    throw new Error(`Could not load ${GRAPH}: ${load.stderr}`);
  }
  parseEnvelope(loaded);

  const child: ChildProcessWithoutNullStreams = spawn(SMOKE, [dataDir, GRAPH, '-']);
  const waiting: { resolve: (rows: Row[]) => void; reject: (e: unknown) => void }[] = [];
  createInterface({ input: child.stdout }).on('line', (line) => {
    if (!line.startsWith('{')) {
      return; // engine log line
    }
    const next = waiting.shift();
    try {
      next?.resolve(parseEnvelope(line));
    } catch (e) {
      next?.reject(e);
    }
  });

  return {
    query: (cypher) =>
      new Promise((resolve, reject) => {
        waiting.push({ resolve, reject });
        child.stdin.write(cypher.replace(/\s+/g, ' ').trim() + '\n');
      }),
    close: () => {
      child.stdin.end();
      child.kill();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

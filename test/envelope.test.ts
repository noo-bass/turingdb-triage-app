/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseEnvelope, QueryError } from '../src/graph/envelope.ts';

test('columns of every chunk become row objects keyed by column name', () => {
  const json = JSON.stringify({
    header: { column_names: ['t.key', 't.rank'], column_types: ['String', 'Int64'] },
    data: [
      [['immediate', 'delayed'], [1, 2]],
      [['minimal'], [3]],
    ],
    time: 0.6,
  });

  assert.deepEqual(parseEnvelope(json), [
    { 't.key': 'immediate', 't.rank': 1 },
    { 't.key': 'delayed', 't.rank': 2 },
    { 't.key': 'minimal', 't.rank': 3 },
  ]);
});

test('a query with no rows gives an empty list', () => {
  const json = JSON.stringify({
    header: { column_names: ['i.key'], column_types: ['String'] },
    data: [],
    time: 0.1,
  });

  assert.deepEqual(parseEnvelope(json), []);
});

test('an engine error throws with the status and details', () => {
  const json = JSON.stringify({
    error: 'GRAPH_NOT_FOUND',
    error_details: 'No error message available.',
    time: 0,
  });

  assert.throws(
    () => parseEnvelope(json),
    (e: unknown) => e instanceof QueryError && e.status === 'GRAPH_NOT_FOUND',
  );
});

test('an error after a header still throws', () => {
  const json = JSON.stringify({
    header: { column_names: ['graphName'], column_types: ['String'] },
    data: [],
    error: 'EXEC_ERROR',
    error_details: 'Graph already loaded',
    time: 0.1,
  });

  assert.throws(() => parseEnvelope(json), QueryError);
});

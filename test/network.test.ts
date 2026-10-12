/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { answersQuery, focusNodes, inspectNode, loadNetwork, nodeStates, type Network } from '../src/graph/network.ts';
import { assess, newCasualty, nextPrompt, type Answer, type Casualty } from '../src/triage/assess.ts';
import { loadDoctrine, type Doctrine } from '../src/triage/doctrine.ts';
import { startEngine, type Engine } from './support/engine.ts';

let engine: Engine;
let d: Doctrine;
let net: Network;

before(async () => {
  engine = startEngine();
  d = await loadDoctrine(engine.query);
  net = await loadNetwork(engine.query, d);
});

after(() => engine.close());

function casualty(answers: Record<string, Answer> = {}): Casualty {
  return { ...newCasualty('c1', 'C1', 0), answers };
}

function states(c: Casualty) {
  return nodeStates(net, c, nextPrompt(d, c), assess(d, c));
}

test('the graph holds every question the app asks, and every injury an answer can find', () => {
  const asked = new Set(d.questions.map((q) => q.key));
  for (const q of d.questions) {
    assert.ok(net.byId.has(`finding:${q.key}`), q.key);
  }
  // a link from a finding the app never asks can never light up
  for (const link of d.links.filter((l) => asked.has(l.finding))) {
    assert.ok(net.byId.has(`injury:${link.injury}`), link.injury);
  }
  for (const e of net.edges) {
    assert.ok(net.byId.has(e.from) && net.byId.has(e.to), `${e.from} -> ${e.to}`);
  }
});

test('the layout places every node somewhere real', () => {
  for (const n of net.nodes) {
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), n.id);
  }
});

test('the focus view: the question being asked, where a yes leads, and its section', () => {
  const c = casualty();
  const focus = focusNodes(net, states(c));
  assert.ok(focus.has('finding:bleeding_severe'));
  for (const e of net.edges.filter((e) => e.from === 'finding:bleeding_severe')) {
    assert.ok(focus.has(e.to), e.to);
  }
  assert.ok([...focus].some((id) => id.startsWith('section:')));
  assert.ok(focus.size < 15, `${focus.size} nodes is too many for the panel`);
});

test('the focus view keeps the trail of a yes', () => {
  const c = casualty({ bleeding_severe: 'yes' });
  const focus = focusNodes(net, states(c));
  for (const { injury } of assess(d, c).injuries) {
    assert.ok(focus.has(`injury:${injury.key}`), injury.key);
  }
  assert.ok(focus.has(`category:${assess(d, c).category!.key}`));
});

test('the inspector reads a node live: properties and relationships', async () => {
  const found = await inspectNode(engine.query, net.byId.get('finding:torso_trauma')!);
  assert.ok(found.properties.some(([k, v]) => k === 'key' && v === 'torso_trauma'));
  assert.ok(found.relationships.some((r) => r.out && r.type === 'INDICATES' && r.key === 'torso_injury'));
  assert.ok(found.relationships.some((r) => r.out && r.type === 'IN_SECTION'));
});

test('a new casualty: only the first question rings, nothing is lit', () => {
  const s = states(casualty());
  assert.equal(s.get('finding:bleeding_severe'), 'current');
  assert.deepEqual(
    [...s].filter(([id, state]) => state !== 'idle' && !id.startsWith('section:')).map(([id]) => id),
    ['finding:bleeding_severe'],
  );
});

test('a yes lights what the app finds: its injury, the category, the steps', () => {
  const c = casualty({ bleeding_severe: 'yes' });
  const s = states(c);
  const a = assess(d, c);

  assert.equal(s.get('finding:bleeding_severe'), 'yes');
  for (const { injury } of a.injuries) {
    assert.equal(s.get(`injury:${injury.key}`), 'lit', injury.key);
  }
  assert.equal(s.get(`category:${a.category!.key}`), 'lit');
  for (const step of a.doNow) {
    assert.equal(s.get(`step:${step.key}`), 'lit', step.key);
  }
});

test('a no is shown as a no and lights nothing', () => {
  const s = states(casualty({ bleeding_severe: 'no' }));
  assert.equal(s.get('finding:bleeding_severe'), 'no');
  assert.equal([...s.values()].filter((v) => v === 'lit').length, 1); // its section
});

test('the live query runs on the engine and finds the injury behind a yes', async () => {
  assert.equal(answersQuery(casualty()), null);
  const rows = await engine.query(answersQuery(casualty({ torso_trauma: 'yes' }))!);
  assert.ok(rows.some((r) => r.injury === 'torso_injury'));
});

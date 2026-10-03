/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { loadDoctrine, type Doctrine } from '../src/triage/doctrine.ts';
import { startEngine, type Engine } from './support/engine.ts';

let engine: Engine;
let doctrine: Doctrine;

before(async () => {
  engine = startEngine();
  doctrine = await loadDoctrine(engine.query);
});

after(() => engine.close());

test('soldier questions come in MARCH then PAWS order', () => {
  const sections = doctrine.questions.map((q) => q.section);
  const order = ['m', 'a', 'r', 'c', 'h', 'paws_p', 'paws_a', 'paws_w', 'paws_s'];
  assert.deepEqual(
    sections,
    [...sections].sort((x, y) => order.indexOf(x) - order.indexOf(y)),
  );
  assert.equal(doctrine.questions[0].key, 'bleeding_severe');
  assert.equal(doctrine.questions.length, 27);
});

test('only TCCC-sourced questions reach the soldier', () => {
  for (const q of doctrine.questions) {
    assert.ok(
      q.sources.some((s) => s.doc === 'tccc-handbook'),
      q.key,
    );
  }
});

test('massive haemorrhage is Immediate (Q2)', () => {
  assert.deepEqual(doctrine.injuries.get('massive_haemorrhage')?.category, { key: 'immediate', rank: 1 });
});

test('an injury without a category stays unranked', () => {
  assert.equal(doctrine.injuries.get('hypothermia')?.category, null);
});

test('torso trauma and struggling to breathe together indicate tension pneumothorax (Q11)', () => {
  const rule = doctrine.conjunctions.find((c) => c.injury === 'tension_pneumothorax');
  assert.deepEqual(rule?.findings.sort(), ['breathing_distress', 'torso_trauma']);
});

test('the hasty tourniquet is a soldier step that needs a tourniquet (Q4, Q9)', () => {
  const step = doctrine.steps.get('massive_haemorrhage')?.find((s) => s.label === 'Apply hasty tourniquet');
  assert.equal(step?.tier, 'all_combatants');
  assert.deepEqual(step?.kit, ['tourniquet']);
  assert.equal(doctrine.kitQuestions.get('tourniquet')?.label, 'Do you have a tourniquet?');
});

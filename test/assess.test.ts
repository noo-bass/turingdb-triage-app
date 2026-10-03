/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { assess, newCasualty, nextPrompt, type Answer, type Casualty } from '../src/triage/assess.ts';
import { loadDoctrine, type Doctrine } from '../src/triage/doctrine.ts';
import { startEngine, type Engine } from './support/engine.ts';

let engine: Engine;
let d: Doctrine;

before(async () => {
  engine = startEngine();
  d = await loadDoctrine(engine.query);
});

after(() => engine.close());

function casualty(answers: Record<string, Answer> = {}, kit: Record<string, boolean> = {}): Casualty {
  return { ...newCasualty('c1', 'C1', 0), answers, kit };
}

const labels = (steps: { label: string }[]) => steps.map((s) => s.label);

test('a new casualty starts with the first MARCH question', () => {
  assert.deepEqual(nextPrompt(d, casualty()), {
    kind: 'question',
    question: d.questions.find((q) => q.key === 'bleeding_severe'),
  });
});

test('severe bleeding is massive haemorrhage, Immediate, with the doctrine behind it', () => {
  const a = assess(d, casualty({ bleeding_severe: 'yes' }));
  assert.deepEqual(
    a.injuries.map((f) => f.injury.key),
    ['massive_haemorrhage'],
  );
  assert.equal(a.category?.key, 'immediate');
  assert.ok(a.injuries[0].because[0].sources.some((s) => s.doc === 'tccc-handbook'));
});

test('kit is asked just in time, before its steps are shown', () => {
  const c = casualty({ bleeding_severe: 'yes' });
  const a = assess(d, c);
  assert.deepEqual(labels(a.doNow), []);
  assert.ok(a.askKit.some((q) => q.kit === 'tourniquet'));
  assert.equal(nextPrompt(d, c)?.kind, 'kit');
});

test('with a tourniquet the hasty tourniquet is a do-now step; medic steps stay with the medic', () => {
  const a = assess(d, casualty({ bleeding_severe: 'yes' }, { tourniquet: true }));
  assert.ok(labels(a.doNow).includes('Apply hasty tourniquet'));
  assert.ok(labels(a.needsMedic).includes('Transfuse blood components'));
  assert.ok(!labels(a.doNow).includes('Transfuse blood components'));
  assert.equal(a.stabilisable, true);
});

test('without the kit a soldier step becomes a medic step', () => {
  const kit = { tourniquet: false, wound_dressing: false, pressure_bandage: false, haemostatic_dressing: false };
  const a = assess(d, casualty({ bleeding_severe: 'yes' }, kit));
  assert.deepEqual(labels(a.doNow), []);
  assert.ok(labels(a.needsMedic).includes('Apply hasty tourniquet'));
  assert.equal(a.stabilisable, false);
});

test('no yes answers means not ranked by doctrine, not "can wait"', () => {
  const answers = Object.fromEntries(d.questions.map((q) => [q.key, 'no' as const]));
  const a = assess(d, casualty(answers));
  assert.equal(a.category, null);
  assert.equal(nextPrompt(d, casualty(answers)), null);
});

test('torso trauma alone is Delayed; with struggling to breathe it is a tension pneumothorax (Immediate)', () => {
  assert.equal(assess(d, casualty({ torso_trauma: 'yes' })).category?.key, 'delayed');
  const both = assess(d, casualty({ torso_trauma: 'yes', breathing_distress: 'yes' }));
  assert.equal(both.category?.key, 'immediate');
  assert.ok(both.injuries.some((f) => f.injury.key === 'tension_pneumothorax'));
});

test('questions that could reveal something more urgent come before plain MARCH order', () => {
  // All bleeding questions and the airway question answered no: MARCH order would
  // ask "Are they awake?" next, but torso trauma can still reveal a category
  const answers: Record<string, Answer> = {
    bleeding_severe: 'no',
    untreated_limb_haemorrhage: 'no',
    untreated_junctional_haemorrhage: 'no',
    untreated_abdominal_or_pelvic_haemorrhage: 'no',
    airway_obstruction: 'no',
  };
  const next = nextPrompt(d, casualty(answers));
  assert.equal(next?.kind === 'question' && next.question.key, 'torso_trauma');
});

test('"unsure" counts as asked but indicates nothing', () => {
  const c = casualty({ bleeding_severe: 'unsure' });
  assert.deepEqual(assess(d, c).injuries, []);
  const next = nextPrompt(d, c);
  assert.notEqual(next?.kind === 'question' && next.question.key, 'bleeding_severe');
});

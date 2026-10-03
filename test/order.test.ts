/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { newCasualty, type Answer, type Casualty, type TourniquetWindow } from '../src/triage/assess.ts';
import { loadDoctrine, type Doctrine } from '../src/triage/doctrine.ts';
import { planOrder } from '../src/triage/order.ts';
import { nextTieQuestion, tieQuestionsLeft } from '../src/triage/ties.ts';
import { startEngine, type Engine } from './support/engine.ts';

let engine: Engine;
let d: Doctrine;

before(async () => {
  engine = startEngine();
  d = await loadDoctrine(engine.query);
});

after(() => engine.close());

const NOW = 10 * 3600_000;
const HOUR = 3600_000;

// IFAK in the worked example: tourniquet, bandage kit, gauze, NPA, combat gauze
const IFAK = {
  tourniquet: true,
  pressure_bandage: true,
  wound_dressing: true,
  npa: true,
  haemostatic_dressing: true,
  chest_seal: false,
  eye_shield: false,
};

function casualty(
  n: number,
  answers: Record<string, Answer>,
  extra: Partial<Pick<Casualty, 'tourniquetAt' | 'tourniquetWindow' | 'recheck'>> = {},
): Casualty {
  return { ...newCasualty(`c${n}`, `C${n}`, n), answers, kit: IFAK, ...extra };
}

const names = (cs: { casualty: Casualty }[]) => cs.map((p) => p.casualty.name);
const find = (order: ReturnType<typeof planOrder>, name: string) =>
  order.find((p) => p.casualty.name === name)!;

// DECISION-SPEC.md section 6, without the seats
function workedExample(): Casualty[] {
  return [
    casualty(1, { bleeding_severe: 'yes' }, { tourniquetAt: NOW - 4 * HOUR }),
    casualty(2, { bleeding_severe: 'yes' }, { tourniquetAt: NOW - 0.5 * HOUR }),
    casualty(3, { breathing_distress: 'yes' }),
    casualty(4, { airway_obstruction: 'yes' }),
    casualty(5, { eye_injury: 'yes' }),
    casualty(6, {}),
  ];
}

// "Is a tourniquet on? How long?" answered as a window of when it went on
const between = (fromHoursAgo: number | null, toHoursAgo: number): TourniquetWindow => ({
  from: fromHoursAgo === null ? null : NOW - fromHoursAgo * HOUR,
  to: NOW - toHoursAgo * HOUR,
});

test('worked example: the order follows category, then the tie-break factors', () => {
  assert.deepEqual(names(planOrder(d, workedExample(), NOW)), ['C3', 'C1', 'C2', 'C4', 'C5', 'C6']);
});

test('worked example: C4 has no tourniquet, so nothing yet separates it from C1 and C2', () => {
  const order = planOrder(d, workedExample(), NOW);
  assert.deepEqual(find(order, 'C4').tiedWith, ['C1', 'C2']);
  assert.deepEqual(find(order, 'C1').tiedWith, ['C4']);
  assert.deepEqual(find(order, 'C3').tiedWith, []);
  assert.deepEqual(find(order, 'C5').tiedWith, []);
});

test('every casualty is in the order: nobody is dropped', () => {
  const cs = workedExample();
  assert.equal(planOrder(d, cs, NOW).length, cs.length);
});

test('every reason says whether it is doctrine or our rule', () => {
  const order = planOrder(d, workedExample(), NOW);
  const c3 = order[0];
  assert.ok(c3.reasons.some((r) => r.basis === 'doctrine' && r.text.includes('Immediate')));
  assert.ok(c3.reasons.some((r) => r.basis === 'product_rule' && r.text.includes('medic')));
  const c1 = order[1];
  assert.ok(c1.reasons.some((r) => r.basis === 'product_rule' && r.text.includes('Tourniquet')));
});

test('unranked is never shown as "can wait"', () => {
  const c6 = find(planOrder(d, workedExample(), NOW), 'C6');
  assert.ok(c6.reasons.some((r) => r.text.includes('Not ranked by triage doctrine')));
  assert.ok(!c6.reasons.some((r) => /can wait/i.test(r.text)));
});

test('a longer tourniquet goes first, all else equal (the user rule)', () => {
  const order = planOrder(
    d,
    [
      casualty(1, { bleeding_severe: 'yes' }, { tourniquetAt: NOW - HOUR }),
      casualty(2, { bleeding_severe: 'yes' }, { tourniquetAt: NOW - 3 * HOUR }),
    ],
    NOW,
  );
  assert.deepEqual(names(order), ['C2', 'C1']);
  assert.deepEqual(order[0].tiedWith, []);
});

test('estimated tourniquet times: different buckets order, the same bucket stays tied', () => {
  const a = casualty(1, { airway_obstruction: 'yes' }, { tourniquetWindow: between(1, 0.5) });
  const b = casualty(2, { airway_obstruction: 'yes' }, { tourniquetWindow: between(null, 2) });
  assert.deepEqual(names(planOrder(d, [a, b], NOW)), ['C2', 'C1']);
  const c = casualty(3, { airway_obstruction: 'yes' }, { tourniquetWindow: between(1, 0.5) });
  assert.deepEqual(find(planOrder(d, [a, c], NOW), 'C1').tiedWith, ['C3']);
});

test('shock signs at re-check go first among casualties still tied', () => {
  const order = planOrder(
    d,
    [
      casualty(1, { airway_obstruction: 'yes' }, { recheck: 'no' }),
      casualty(2, { airway_obstruction: 'yes' }, { recheck: 'yes' }),
    ],
    NOW,
  );
  assert.deepEqual(names(order), ['C2', 'C1']);
  assert.ok(order[0].reasons.some((r) => r.basis === 'product_rule' && /shock/i.test(r.text)));
});

test('two identical casualties are tied, never silently picked', () => {
  const order = planOrder(
    d,
    [casualty(1, { airway_obstruction: 'yes' }), casualty(2, { airway_obstruction: 'yes' })],
    NOW,
  );
  assert.deepEqual(find(order, 'C1').tiedWith, ['C2']);
  assert.deepEqual(find(order, 'C2').tiedWith, ['C1']);
});

test('ties: every casualty in a different category means no tie questions', () => {
  const cs = [
    casualty(1, { airway_obstruction: 'yes' }),
    casualty(2, { eye_injury: 'yes' }),
    casualty(3, {}),
  ];
  assert.equal(nextTieQuestion(d, cs, NOW), null);
  assert.equal(tieQuestionsLeft(d, cs, NOW), 0);
});

test('ties: worked example asks C4 about a tourniquet first; C1 and C2 have timers so are never asked', () => {
  const q = nextTieQuestion(d, workedExample(), NOW);
  assert.deepEqual(q && [q.casualty.name, q.kind], ['C4', 'tourniquet']);
});

test('ties: with no tourniquet on C4, the shock re-check goes to the still-tied casualties', () => {
  const cs = workedExample().map((c) => (c.name === 'C4' ? { ...c, tourniquetWindow: 'none' as const } : c));
  const q = nextTieQuestion(d, cs, NOW);
  assert.deepEqual(q && [q.casualty.name, q.kind], ['C1', 'recheck']);
  assert.equal(tieQuestionsLeft(d, cs, NOW), 3);
});

test('ties: once a re-check separates them, no more questions', () => {
  const cs = workedExample().map((c) =>
    c.name === 'C4' ? { ...c, tourniquetWindow: 'none' as const, recheck: 'yes' as const } : c,
  );
  assert.equal(nextTieQuestion(d, cs, NOW), null);
  assert.deepEqual(names(planOrder(d, cs, NOW)), ['C3', 'C4', 'C1', 'C2', 'C5', 'C6']);
});

test('ties: a tourniquet question is skipped when no tied partner could have one', () => {
  const cs = [
    casualty(1, { airway_obstruction: 'yes' }, { tourniquetWindow: 'none' }),
    casualty(2, { airway_obstruction: 'yes' }),
  ];
  const q = nextTieQuestion(d, cs, NOW);
  assert.deepEqual(q && [q.casualty.name, q.kind], ['C1', 'recheck']);
});

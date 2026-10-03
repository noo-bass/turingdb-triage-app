/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { newCasualty, type Answer, type Casualty } from '../src/triage/assess.ts';
import { loadDoctrine, type Doctrine } from '../src/triage/doctrine.ts';
import { planSeats } from '../src/triage/seats.ts';
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
  tourniquetAt: number | null = null,
): Casualty {
  return { ...newCasualty(`c${n}`, `C${n}`, n), answers, kit: IFAK, tourniquetAt };
}

const names = (cs: { casualty: Casualty }[]) => cs.map((p) => p.casualty.name);

// DECISION-SPEC.md section 6: 6 casualties, 3 seats
function workedExample(): Casualty[] {
  return [
    casualty(1, { bleeding_severe: 'yes' }, NOW - 4 * HOUR),
    casualty(2, { bleeding_severe: 'yes' }, NOW - 0.5 * HOUR),
    casualty(3, { breathing_distress: 'yes' }),
    casualty(4, { airway_obstruction: 'yes' }),
    casualty(5, { eye_injury: 'yes' }),
    casualty(6, {}),
  ];
}

test('worked example: C3 and C1 are seated, C2 and C4 contest the last seat, C5 and C6 wait', () => {
  const plan = planSeats(d, workedExample(), 3, NOW);

  assert.deepEqual(names(plan.order.filter((p) => p.seat === 'yes')), ['C3', 'C1']);
  assert.deepEqual(names(plan.order.filter((p) => p.seat === 'contested')), ['C2', 'C4']);
  assert.deepEqual(names(plan.order.filter((p) => p.seat === 'no')), ['C5', 'C6']);
  assert.equal(plan.contestedSeats, 1);
});

test('worked example: the order shown follows category, then the tie-break factors', () => {
  const plan = planSeats(d, workedExample(), 3, NOW);
  assert.deepEqual(names(plan.order), ['C3', 'C1', 'C2', 'C4', 'C5', 'C6']);
});

test('every reason says whether it is doctrine or our rule', () => {
  const plan = planSeats(d, workedExample(), 3, NOW);
  const c3 = plan.order[0];
  assert.ok(c3.reasons.some((r) => r.basis === 'doctrine' && r.text.includes('Immediate')));
  assert.ok(c3.reasons.some((r) => r.basis === 'product_rule' && r.text.includes('medic')));
  const c1 = plan.order[1];
  assert.ok(c1.reasons.some((r) => r.basis === 'product_rule' && r.text.includes('Tourniquet')));
});

test('unranked is never shown as "can wait"', () => {
  const plan = planSeats(d, workedExample(), 3, NOW);
  const c6 = plan.order.find((p) => p.casualty.name === 'C6')!;
  assert.ok(c6.reasons.some((r) => r.text.includes('Not ranked by triage doctrine')));
  assert.ok(!c6.reasons.some((r) => /can wait/i.test(r.text)));
});

test('enough seats for everyone: everyone is seated, nothing contested', () => {
  const plan = planSeats(d, workedExample(), 6, NOW);
  assert.ok(plan.order.every((p) => p.seat === 'yes'));
  assert.equal(plan.contestedSeats, 0);
});

test('a longer tourniquet goes first, all else equal (the user rule)', () => {
  const plan = planSeats(
    d,
    [casualty(1, { bleeding_severe: 'yes' }, NOW - HOUR), casualty(2, { bleeding_severe: 'yes' }, NOW - 3 * HOUR)],
    1,
    NOW,
  );
  assert.deepEqual(names(plan.order), ['C2', 'C1']);
  assert.equal(plan.order[0].seat, 'yes');
});

test('two identical casualties for one seat are contested, never silently picked', () => {
  const plan = planSeats(d, [casualty(1, { airway_obstruction: 'yes' }), casualty(2, { airway_obstruction: 'yes' })], 1, NOW);
  assert.ok(plan.order.every((p) => p.seat === 'contested'));
  assert.equal(plan.contestedSeats, 1);
});

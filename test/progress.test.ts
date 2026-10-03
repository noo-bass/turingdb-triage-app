/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import {
  answer,
  newCasualty,
  nextPrompt,
  stillToAsk,
  undo,
  type Answer,
  type Casualty,
} from '../src/triage/assess.ts';
import { loadDoctrine, type Doctrine } from '../src/triage/doctrine.ts';
import { progress, whyAsked } from '../src/triage/progress.ts';
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

const yesNo = () => d.questions.filter((q) => q.answerType === 'yes_no');

const NO_BLEEDING: Record<string, Answer> = {
  bleeding_severe: 'no',
  untreated_limb_haemorrhage: 'no',
  untreated_junctional_haemorrhage: 'no',
  untreated_abdominal_or_pelvic_haemorrhage: 'no',
};

test('a new casualty: nothing answered, total is only the questions that could give a category', () => {
  const c = casualty();
  const p = progress(d, c, nextPrompt(d, c));
  assert.equal(p.answered, 0);
  assert.equal(p.total, stillToAsk(d, c).length);
  assert.ok(p.total < yesNo().length);
  assert.deepEqual(
    p.groups.map((g) => g.letter),
    ['M', 'A', 'R', 'C', 'H', 'P'],
  );
  assert.deepEqual(
    p.groups.map((g) => g.state),
    // nothing in C or H can change a category, so the sieve will not go there
    ['current', 'todo', 'todo', 'skipped', 'skipped', 'todo'],
  );
});

test('a finished section is done, and "not sure" counts as answered', () => {
  const c = casualty({ ...NO_BLEEDING, bleeding_severe: 'unsure' });
  const p = progress(d, c, nextPrompt(d, c));
  assert.equal(p.answered, 4);
  assert.equal(p.groups[0].state, 'done');
  assert.equal(p.groups.find((g) => g.state === 'current')?.letter, p.current?.letter);
});

test('undo takes progress back', () => {
  const c = answer(casualty(), 'bleeding_severe', 'no');
  assert.equal(progress(d, c, nextPrompt(d, c)).answered, 1);
  const back = undo(c);
  assert.equal(progress(d, back, nextPrompt(d, back)).answered, 0);
});

test('a kit prompt has no current section but keeps the count', () => {
  const c = casualty({ bleeding_severe: 'yes' });
  const prompt = nextPrompt(d, c);
  assert.equal(prompt?.kind, 'kit');
  const p = progress(d, c, prompt);
  assert.equal(p.current, null);
  assert.equal(p.answered, 1);
});

test('everything answered: no prompt, every section done', () => {
  const all = Object.fromEntries(yesNo().map((q) => [q.key, 'no' as Answer]));
  const c = casualty(all);
  const p = progress(d, c, nextPrompt(d, c));
  assert.equal(p.answered, p.total);
  assert.ok(p.groups.every((g) => g.state === 'done'));
});

test('once Immediate, the total shrinks to what was asked: nothing more can change it', () => {
  const c = casualty(
    { bleeding_severe: 'yes' },
    { tourniquet: true, pressure_bandage: true, wound_dressing: true, haemostatic_dressing: true },
  );
  const p = progress(d, c, nextPrompt(d, c));
  assert.equal(p.total, 1);
  assert.deepEqual(
    p.groups.map((g) => g.state),
    ['done', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped'],
  );
});

test('why: the first question could make them Immediate, by pointing to massive bleeding', () => {
  const c = casualty();
  const why = whyAsked(d, c, nextPrompt(d, c)!);
  assert.equal(why.kind, 'question');
  assert.equal(why.kind === 'question' && why.couldMake, 'immediate');
  assert.ok(why.points.some((p) => p.injury === 'Massive bleeding' && p.category === 'immediate'));
  assert.ok(why.sources.some((s) => s.doc === 'tccc-handbook'));
});

test('why: for a Delayed casualty, it names Immediate as what a yes could make them', () => {
  const c = casualty({ ...NO_BLEEDING, airway_obstruction: 'no', torso_trauma: 'yes' });
  const prompt = nextPrompt(d, c)!;
  const why = whyAsked(d, c, prompt);
  assert.equal(why.kind === 'question' && why.couldMake, 'immediate');
});

test('why: a question that only counts with another names the other one', () => {
  const c = casualty({ ...NO_BLEEDING, airway_obstruction: 'no' });
  const why = whyAsked(d, c, nextPrompt(d, c)!);
  assert.ok(
    why.kind === 'question' &&
      why.points.some(
        (p) => p.injury === 'Tension pneumothorax' && p.with.includes('Struggling to breathe?'),
      ),
  );
});

test('why: a question with no injury link says so (no points)', () => {
  const conscious = d.questions.find((q) => q.key === 'conscious')!;
  const why = whyAsked(d, casualty(), { kind: 'question', question: conscious });
  assert.deepEqual(why.kind === 'question' && why.points, []);
});

test('why: flowchart box titles are not shown as quotes, sentences are', () => {
  const first = whyAsked(d, casualty(), {
    kind: 'question',
    question: d.questions.find((q) => q.key === 'bleeding_severe')!,
  });
  assert.equal(first.quote, null); // the handbook box reads "Tourniquet?"
  const chest = whyAsked(d, casualty(), {
    kind: 'question',
    question: d.questions.find((q) => q.key === 'chest_wound')!,
  });
  assert.match(chest.quote ?? '', /sucking chest wounds/);
});

test('why: a kit prompt names the step it unlocks and the injury behind it', () => {
  const c = casualty({ bleeding_severe: 'yes' });
  const prompt = nextPrompt(d, c)!;
  const why = whyAsked(d, c, prompt);
  assert.equal(why.kind, 'kit');
  assert.ok(why.kind === 'kit' && why.steps.length > 0);
  assert.ok(why.kind === 'kit' && why.steps.every((s) => s.injuries.includes('Massive bleeding')));
});

test('why: an injury a yes points to on its own is not repeated as an "A and B" rule', () => {
  const q = d.questions.find((x) => x.key === 'breathing_distress')!;
  const why = whyAsked(d, casualty(), { kind: 'question', question: q });
  assert.deepEqual(why.kind === 'question' && why.points.map((p) => [p.injury, p.with]), [
    ['Tension pneumothorax', []],
  ]);
});

test('why: quotes cut from mid-sentence read as excerpts', () => {
  const face = d.questions.find((x) => x.key === 'facial_trauma_evidence')!;
  assert.match(
    whyAsked(d, casualty(), { kind: 'question', question: face }).quote ?? '',
    /^\.\.\.resistance/,
  );
  const chest = d.questions.find((x) => x.key === 'chest_wound')!;
  assert.match(
    whyAsked(d, casualty(), { kind: 'question', question: chest }).quote ?? '',
    /treated by\.\.\.$/,
  );
});

// Tie-break questions: asked only of casualties no rule yet separates, and
// only when the answer could change their order (the factor order is in
// order.ts). Stabilisable needs no question: its kit was asked in the sieve.

import { assess, type Casualty, type TourniquetWindow } from './assess.ts';
import type { Doctrine } from './doctrine';
import { before, level, tourniquetRange } from './order.ts';

export type TieQuestion = { casualty: Casualty; kind: 'tourniquet' | 'recheck'; tiedWith: Casualty[] };

const MINUTE = 60_000;

// The tourniquet answers, longest last. Each is a window of when it went on
export const TOURNIQUET_BUCKETS: { label: string; window: (now: number) => TourniquetWindow }[] = [
  { label: 'Under 30 min', window: (now) => ({ from: now - 30 * MINUTE, to: now }) },
  { label: '30 min to 1 hour', window: (now) => ({ from: now - 60 * MINUTE, to: now - 30 * MINUTE }) },
  { label: '1 to 2 hours', window: (now) => ({ from: now - 120 * MINUTE, to: now - 60 * MINUTE }) },
  { label: 'Over 2 hours', window: (now) => ({ from: null, to: now - 120 * MINUTE }) },
];

export function nextTieQuestion(d: Doctrine, casualties: Casualty[], now: number): TieQuestion | null {
  return pending(d, casualties, now)[0] ?? null;
}

// Questions that could still be asked: a ceiling, as an answer can settle a tie
export function tieQuestionsLeft(d: Doctrine, casualties: Casualty[], now: number): number {
  return pending(d, casualties, now).length;
}

function pending(d: Doctrine, casualties: Casualty[], now: number): TieQuestion[] {
  const people = casualties.map((casualty) => ({ casualty, assessment: assess(d, casualty) }));
  const partners = people.map((p) =>
    people.filter(
      (q) =>
        q !== p &&
        // Expectant come last whatever their order among themselves
        p.assessment.category?.key !== 'expectant' &&
        !before(p, q, now) &&
        !before(q, p, now) &&
        level(p.assessment) === level(q.assessment),
    ),
  );
  const unknown = (c: Casualty) => c.tourniquetAt === null && (c.tourniquetWindow ?? null) === null;
  const couldHaveOne = (c: Casualty) => unknown(c) || tourniquetRange(c, now) !== null;

  // Factor order: every tourniquet question before any re-check
  const tourniquet: TieQuestion[] = [];
  const recheck: TieQuestion[] = [];
  people.forEach((p, i) => {
    const tied = partners[i];
    if (tied.length === 0) {
      return;
    }
    const tiedWith = tied.map((q) => q.casualty);
    if (unknown(p.casualty) && tiedWith.some(couldHaveOne)) {
      tourniquet.push({ casualty: p.casualty, kind: 'tourniquet', tiedWith });
    }
    if ((p.casualty.recheck ?? null) === null) {
      recheck.push({ casualty: p.casualty, kind: 'recheck', tiedWith });
    }
  });
  return [...tourniquet, ...recheck];
}

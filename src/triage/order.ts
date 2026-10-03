// Who goes first (DECISION-SPEC.md section 3, step 5). Plain code: the graph
// supplies each casualty's category and sources; doctrine does not order
// casualties within a category, so everything after the category is our rule,
// for medic sign-off:
//   1. cannot be stabilised here goes first;
//   2. longest tourniquet goes first (only when both are known not to overlap);
//   3. signs of shock at the re-check go first.
//
// The rules only order some pairs, so this never sorts and cuts: casualties no
// rule separates are reported as tied, for a medic or commander to decide.

import { assess, type Assessment, type Casualty } from './assess.ts';
import type { Doctrine, Source } from './doctrine';
import { formatDuration } from './format.ts';

export type Reason = {
  text: string;
  basis: 'doctrine' | 'product_rule'; // product_rule: ours, for medic sign-off
  sources?: Source[];
};

export type Placement = {
  casualty: Casualty;
  assessment: Assessment;
  reasons: Reason[];
  tiedWith: string[]; // names of casualties no rule separates from this one
};

// Category order: Immediate, Delayed, Minimal, then unranked, Expectant last.
// Unranked after Minimal is our placement (product_rule), not doctrine.
const UNRANKED = 3.5;

export function level(a: Assessment): number {
  return a.category?.rank ?? UNRANKED;
}

// How long a tourniquet has been on, as a range: exact from the timer, a
// bucket from the tie-break question. null: none, or not known
export function tourniquetRange(c: Casualty, now: number): { min: number; max: number } | null {
  if (c.tourniquetAt !== null) {
    return { min: now - c.tourniquetAt, max: now - c.tourniquetAt };
  }
  const w = c.tourniquetWindow ?? null;
  if (w === null || w === 'none') {
    return null;
  }
  return { min: now - w.to, max: w.from === null ? Infinity : now - w.from };
}

type Person = { casualty: Casualty; assessment: Assessment };

// x must go before y. Each factor decides only when it separates them;
// otherwise the next factor is tried.
export function before(x: Person, y: Person, now: number): boolean {
  if (level(x.assessment) !== level(y.assessment)) {
    return level(x.assessment) < level(y.assessment);
  }
  if (x.assessment.stabilisable !== y.assessment.stabilisable) {
    return !x.assessment.stabilisable;
  }
  const tx = tourniquetRange(x.casualty, now);
  const ty = tourniquetRange(y.casualty, now);
  if (tx && ty && (tx.min > ty.max || ty.min > tx.max)) {
    return tx.min > ty.max;
  }
  const sx = x.casualty.recheck === 'yes';
  const sy = y.casualty.recheck === 'yes';
  return sx && !sy;
}

export function planOrder(d: Doctrine, casualties: Casualty[], now: number): Placement[] {
  const people: Person[] = casualties.map((casualty) => ({ casualty, assessment: assess(d, casualty) }));
  const tied = (p: Person, q: Person) => !before(p, q, now) && !before(q, p, now);

  const placements: Placement[] = people.map((p) => ({
    ...p,
    reasons: reasonsFor(p.casualty, p.assessment, now),
    tiedWith: people.filter((q) => q !== p && tied(p, q)).map((q) => q.casualty.name),
  }));

  // Default order: repeatedly take whoever nobody remaining must precede,
  // earliest-added first among them
  const order: Placement[] = [];
  const remaining = [...placements].sort((a, b) => a.casualty.createdAt - b.casualty.createdAt);
  while (remaining.length > 0) {
    const i = remaining.findIndex((p) => !remaining.some((q) => q !== p && before(q, p, now)));
    // a cycle cannot drop anyone: fall back to the earliest added
    order.push(...remaining.splice(Math.max(0, i), 1));
  }
  return order;
}

function reasonsFor(c: Casualty, a: Assessment, now: number): Reason[] {
  const reasons: Reason[] = [];

  if (a.category) {
    const ranked = a.injuries.find((f) => f.injury.category?.key === a.category?.key)!;
    reasons.push({
      text: `${title(a.category.key)}: ${ranked.injury.name}`,
      basis: 'doctrine',
      sources: ranked.injury.categorySources,
    });
  } else {
    reasons.push({
      text: 'Not ranked by triage doctrine: ask a medic',
      basis: 'product_rule',
    });
  }

  if (a.injuries.length > 0 && !a.stabilisable) {
    reasons.push({
      text: 'Cannot be stabilised here: needs a medic or kit you do not have',
      basis: 'product_rule',
    });
  }

  const t = tourniquetRange(c, now);
  if (t) {
    const text =
      t.min === t.max
        ? `Tourniquet on for ${formatDuration(t.min)}`
        : t.max === Infinity
          ? `Tourniquet on for over ${formatDuration(t.min)} (your estimate)`
          : `Tourniquet on for ${formatDuration(t.min)} to ${formatDuration(t.max)} (your estimate)`;
    reasons.push({ text, basis: 'product_rule' });
  }

  if (c.recheck === 'yes') {
    reasons.push({ text: 'Signs of shock when checked again', basis: 'product_rule' });
  }

  return reasons;
}

function title(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

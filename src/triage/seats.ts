// Who gets the seats (DECISION-SPEC.md section 3, step 5). Plain code: the
// graph supplies each casualty's features and sources, it does not rank.
//
// The rules only order some pairs (a longer tourniquet first says nothing
// about a casualty without one), so this never sorts and cuts. A casualty is
// seated only if every order the rules allow seats them, waits only if none
// does, and otherwise is contested: shown side by side for a medic or
// commander to decide.

import { assess, type Assessment, type Casualty } from './assess.ts';
import type { Doctrine, Source } from './doctrine';

export type Reason = {
  text: string;
  basis: 'doctrine' | 'product_rule'; // product_rule: ours, for medic sign-off
  sources?: Source[];
};

export type Placement = {
  casualty: Casualty;
  assessment: Assessment;
  seat: 'yes' | 'no' | 'contested';
  reasons: Reason[];
};

export type SeatPlan = {
  order: Placement[]; // a default order consistent with every rule
  contestedSeats: number; // seats left for the contested casualties
};

// Category order: Immediate, Delayed, Minimal, then unranked, Expectant last.
// Unranked after Minimal is our placement (product_rule), not doctrine.
const UNRANKED = 3.5;

export function planSeats(d: Doctrine, casualties: Casualty[], seats: number, now: number): SeatPlan {
  const people = casualties.map((casualty) => ({ casualty, assessment: assess(d, casualty) }));
  type Person = (typeof people)[number];

  const level = (p: Person) => p.assessment.category?.rank ?? UNRANKED;
  const tourniquetFor = (p: Person) =>
    p.casualty.tourniquetAt === null ? null : now - p.casualty.tourniquetAt;

  // x must go before y. The rules are lexicographic, so this is already transitive.
  const before = (x: Person, y: Person): boolean => {
    if (level(x) !== level(y)) {
      return level(x) < level(y);
    }
    if (x.assessment.stabilisable !== y.assessment.stabilisable) {
      return !x.assessment.stabilisable;
    }
    const tx = tourniquetFor(x);
    const ty = tourniquetFor(y);
    return tx !== null && ty !== null && tx > ty;
  };

  const placements: Placement[] = people.map((p) => {
    const ahead = people.filter((q) => q !== p && before(q, p)).length;
    const notBehind = people.filter((q) => q !== p && !before(p, q)).length;
    const best = ahead + 1;
    const worst = notBehind + 1;
    const seat = worst <= seats ? 'yes' : best > seats ? 'no' : 'contested';
    return { ...p, seat, reasons: reasonsFor(p.assessment, tourniquetFor(p)) };
  });

  // Default order: repeatedly take whoever nobody remaining must precede,
  // earliest-added first among them
  const order: Placement[] = [];
  const remaining = [...placements].sort((a, b) => a.casualty.createdAt - b.casualty.createdAt);
  while (remaining.length > 0) {
    const i = remaining.findIndex((p) => !remaining.some((q) => q !== p && before(q, p)));
    order.push(...remaining.splice(i, 1));
  }

  const seated = placements.filter((p) => p.seat === 'yes').length;
  const contested = placements.some((p) => p.seat === 'contested');
  return { order, contestedSeats: contested ? Math.max(0, seats - seated) : 0 };
}

function reasonsFor(a: Assessment, tourniquetMs: number | null): Reason[] {
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

  if (tourniquetMs !== null) {
    reasons.push({ text: `Tourniquet on for ${duration(tourniquetMs)}`, basis: 'product_rule' });
  }

  return reasons;
}

function title(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// Where the soldier is in the questions for one casualty, and why the current
// one is being asked. Pure functions over the doctrine, like assess.ts; the
// screens turn these into words.

import { assess, stillToAsk, type Casualty, type Prompt } from './assess.ts';
import type { Category, Doctrine, Source } from './doctrine';

export const SECTION_NAMES: Record<string, string> = {
  m: 'Massive bleeding',
  a: 'Airway',
  r: 'Breathing',
  c: 'Circulation',
  h: 'Head and hypothermia',
  paws_p: 'Pain',
  paws_a: 'Antibiotics',
  paws_w: 'Wounds',
  paws_s: 'Splints and eyes',
};

// MARCH, then the four PAWS sections as one (each holds a single question).
// Names are short: they finish the line "then <name>" on a phone width
const GROUPS = [
  { letter: 'M', name: 'Massive bleeding', sections: ['m'] },
  { letter: 'A', name: 'Airway', sections: ['a'] },
  { letter: 'R', name: 'Breathing', sections: ['r'] },
  { letter: 'C', name: 'Circulation', sections: ['c'] },
  { letter: 'H', name: 'Head and cold', sections: ['h'] },
  { letter: 'P', name: 'PAWS', sections: ['paws_p', 'paws_a', 'paws_w', 'paws_s'] },
];

// skipped: nothing asked there and nothing there could change the category
export type Group = { letter: string; name: string; state: 'done' | 'current' | 'todo' | 'skipped' };

export type Progress = {
  answered: number; // yes/no questions answered ("not sure" counts)
  // answered plus those that could still change the category: the sieve exits
  // early, so this shrinks as answers come in. Kit questions are extra
  total: number;
  groups: Group[];
  current: Group | null; // null on a kit prompt or when finished
};

export function progress(d: Doctrine, c: Casualty, prompt: Prompt | null): Progress {
  const questions = d.questions.filter((q) => q.answerType === 'yes_no');
  const toAsk = new Set(stillToAsk(d, c).map((q) => q.key));
  const answered = questions.filter((q) => c.answers[q.key] !== undefined).length;
  const asking = prompt?.kind === 'question' ? prompt.question.key : null;

  const groups: Group[] = [];
  let current: Group | null = null;
  for (const { letter, name, sections } of GROUPS) {
    const qs = questions.filter((q) => sections.includes(q.section));
    if (qs.length === 0) {
      continue;
    }
    const here = asking !== null && qs.some((q) => q.key === asking);
    const open = qs.some((q) => toAsk.has(q.key));
    const asked = qs.some((q) => c.answers[q.key] !== undefined);
    const group: Group = {
      letter,
      name,
      state: here ? 'current' : open ? 'todo' : asked ? 'done' : 'skipped',
    };
    if (here) {
      current = group;
    }
    groups.push(group);
  }

  return { answered, total: answered + toAsk.size, groups, current };
}

// A yes to the question points to `injury`; `with` lists the other questions
// that must also be yes (TCCC's "A and B" rules)
export type Pointer = { injury: string; category: string | null; with: string[]; inferred: boolean };

export type Why =
  | {
      kind: 'question';
      // the most urgent category a yes could make them, above where they are now
      couldMake: string | null;
      points: Pointer[]; // empty: a yes does not change the category on its own
      sources: Source[];
      quote: string | null;
    }
  | {
      kind: 'kit';
      steps: { label: string; injuries: string[] }[]; // what having it lets the soldier do
      sources: Source[];
      quote: string | null;
    };

export function whyAsked(d: Doctrine, c: Casualty, prompt: Prompt): Why {
  if (prompt.kind === 'kit') {
    const steps = new Map<string, string[]>();
    for (const { injury } of assess(d, c).injuries) {
      for (const step of d.steps.get(injury.key) ?? []) {
        if (step.tier === 'all_combatants' && step.kit.includes(prompt.question.kit)) {
          steps.set(step.label, [...(steps.get(step.label) ?? []), injury.name]);
        }
      }
    }
    return {
      kind: 'kit',
      steps: [...steps].map(([label, injuries]) => ({ label, injuries })),
      sources: [],
      quote: null,
    };
  }

  const q = prompt.question;
  const label = (key: string) => d.questions.find((x) => x.key === key)?.label ?? key;
  const points: Pointer[] = [];
  let mostUrgent: Category | null = null;
  const add = (injuryKey: string, others: string[], inferred: boolean) => {
    const injury = d.injuries.get(injuryKey);
    if (injury?.category && (!mostUrgent || injury.category.rank < mostUrgent.rank)) {
      mostUrgent = injury.category;
    }
    const pointer = {
      injury: injury?.name ?? injuryKey,
      category: injury?.category?.key ?? null,
      with: others.map(label),
      inferred,
    };
    // a rule needing another yes adds nothing when a yes alone already points there
    if (
      !points.some(
        (p) => p.injury === pointer.injury && (p.with.length === 0 || p.with.join() === pointer.with.join()),
      )
    ) {
      points.push(pointer);
    }
  };
  for (const link of d.links) {
    if (link.finding === q.key) {
      add(link.injury, [], link.basis === 'inferred');
    }
  }
  for (const rule of d.conjunctions) {
    // only rules still possible: none of the other questions already answered no
    if (rule.findings.includes(q.key) && rule.findings.every((f) => f === q.key || c.answers[f] !== 'no')) {
      add(
        rule.injury,
        rule.findings.filter((f) => f !== q.key),
        false,
      );
    }
  }

  // the sieve only asks a question that could make them more urgent than now
  const top = mostUrgent as Category | null;
  const current = assess(d, c).category?.rank ?? Infinity;
  const couldMake = top && top.rank < current ? top.key : null;

  const quoted =
    q.sources.find((s) => s.doc === 'tccc-handbook' && s.quote) ?? q.sources.find((s) => s.quote);
  return { kind: 'question', couldMake, points, sources: q.sources, quote: sentence(quoted?.quote ?? null) };
}

// Handbook flowchart boxes ("Tourniquet?") are titles, not explanations:
// next to the question they read as nonsense, so only sentences are shown.
// A quote cut mid-sentence is marked as an excerpt at that end.
function sentence(quote: string | null): string | null {
  let text = quote?.replace(/\s+/g, ' ').trim() ?? '';
  if (text.length === 0 || text.endsWith('?')) {
    return null;
  }
  if (/^[a-z]/.test(text)) {
    text = `...${text}`;
  }
  if (/[:;,]$/.test(text)) {
    text = `${text.slice(0, -1)}...`;
  }
  return text;
}

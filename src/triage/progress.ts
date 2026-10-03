// Where the soldier is in the questions for one casualty, and why the current
// one is being asked. Pure functions over the doctrine, like assess.ts; the
// screens turn these into words.

import { assess, type Casualty, type Prompt } from './assess.ts';
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

export type Group = { letter: string; name: string; state: 'done' | 'current' | 'todo' };

export type Progress = {
  answered: number; // yes/no questions answered ("not sure" counts)
  total: number; // every yes/no question: the flow asks them all. Kit questions are extra, just in time
  groups: Group[];
  current: Group | null; // null on a kit prompt or when finished
  leftInGroup: number; // open questions in the current group after this one
  // the first later group with questions left, else one skipped over earlier
  nextGroup: Group | null;
};

export function progress(d: Doctrine, c: Casualty, prompt: Prompt | null): Progress {
  const questions = d.questions.filter((q) => q.answerType === 'yes_no');
  const isOpen = (key: string) => c.answers[key] === undefined;
  const asking = prompt?.kind === 'question' ? prompt.question.key : null;

  const members = GROUPS.map((g) => questions.filter((q) => g.sections.includes(q.section))).filter(
    (qs) => qs.length > 0,
  );
  const groups: Group[] = [];
  let current: Group | null = null;
  let leftInGroup = 0;
  let nextGroup: Group | null = null;
  let skipped: Group | null = null;
  for (const qs of members) {
    const { letter, name } = GROUPS.find((g) => g.sections.includes(qs[0].section))!;
    const open = qs.filter((q) => isOpen(q.key));
    const here = asking !== null && qs.some((q) => q.key === asking);
    const group: Group = { letter, name, state: here ? 'current' : open.length === 0 ? 'done' : 'todo' };
    if (here) {
      current = group;
      leftInGroup = open.length - 1;
    } else if (open.length > 0) {
      if (current && !nextGroup) {
        nextGroup = group;
      } else if (!current && !skipped) {
        skipped = group;
      }
    }
    groups.push(group);
  }

  return {
    answered: questions.filter((q) => !isOpen(q.key)).length,
    total: questions.length,
    groups,
    current,
    leftInGroup,
    nextGroup: nextGroup ?? (current ? skipped : null),
  };
}

// A yes to the question points to `injury`; `with` lists the other questions
// that must also be yes (TCCC's "A and B" rules)
export type Pointer = { injury: string; category: string | null; with: string[]; inferred: boolean };

export type Why =
  | {
      kind: 'question';
      // set when the question was asked ahead of MARCH order because a yes
      // could make them this category; null when it is simply next in order
      early: string | null;
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

  // nextPrompt asks MARCH order unless a question can reveal something more
  // urgent; a question that is not the first open one was picked for that
  const first = d.questions.find((x) => x.answerType === 'yes_no' && c.answers[x.key] === undefined);
  const early = first && first.key !== q.key ? ((mostUrgent as Category | null)?.key ?? null) : null;

  const quoted =
    q.sources.find((s) => s.doc === 'tccc-handbook' && s.quote) ?? q.sources.find((s) => s.quote);
  return { kind: 'question', early, points, sources: q.sources, quote: sentence(quoted?.quote ?? null) };
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

// One casualty: what the answers so far say, what to do, and what to ask next
// (DECISION-SPEC.md section 3, steps 1-4). Pure functions over the doctrine.

import type { Category, Doctrine, Injury, KitQuestion, Question, Source, Step } from './doctrine';

export type Answer = 'yes' | 'no' | 'unsure';

// A casualty is the soldier's answers, never part of the graph (decision 2)
export type Casualty = {
  id: string;
  name: string;
  createdAt: number;
  answers: Record<string, Answer>; // by question key
  kit: Record<string, boolean>; // by kit key: does the soldier have it
  tourniquetAt: number | null; // when a tourniquet went on (never removed: decision 7)
};

export type FoundInjury = {
  injury: Injury;
  // the yes answers behind it, with the doctrine that links them
  because: { questions: string[]; basis: string; sources: Source[] }[];
};

export type StepView = Step & { injuries: string[] };

export type Assessment = {
  injuries: FoundInjury[];
  // most urgent category among the injuries; null = not ranked by triage
  // doctrine (which is NOT "can wait": section 5)
  category: Category | null;
  doNow: StepView[]; // all-combatant steps with the kit confirmed
  askKit: KitQuestion[]; // kit to ask about before more steps can be shown
  needsMedic: StepView[]; // medic-only steps, and soldier steps without the kit
  // every injury has a step the soldier can do now (a seat-ranking factor)
  stabilisable: boolean;
};

export type Prompt = { kind: 'kit'; question: KitQuestion } | { kind: 'question'; question: Question };

export function newCasualty(id: string, name: string, now: number): Casualty {
  return { id, name, createdAt: now, answers: {}, kit: {}, tourniquetAt: null };
}

export function assess(d: Doctrine, c: Casualty): Assessment {
  const injuries = findInjuries(d, c);

  let category: Category | null = null;
  for (const { injury } of injuries) {
    if (injury.category && (!category || injury.category.rank < category.rank)) {
      category = injury.category;
    }
  }

  const steps = new Map<string, StepView>(); // one row per step label
  for (const { injury } of injuries) {
    for (const step of d.steps.get(injury.key) ?? []) {
      const known = steps.get(step.label);
      if (known) {
        known.injuries.push(injury.key);
      } else {
        steps.set(step.label, { ...step, injuries: [injury.key] });
      }
    }
  }

  const doNow: StepView[] = [];
  const needsMedic: StepView[] = [];
  const askKit = new Map<string, KitQuestion>();
  for (const step of steps.values()) {
    if (step.tier !== 'all_combatants') {
      needsMedic.push(step);
      continue;
    }
    const kit = kitStatus(c, step);
    if (kit === 'have') {
      doNow.push(step);
    } else if (kit === 'none') {
      needsMedic.push(step);
    } else {
      const askable = step.kit.filter((item) => c.kit[item] === undefined && d.kitQuestions.has(item));
      if (askable.length === 0) {
        // the kit it needs is not something the soldier can be asked about
        needsMedic.push(step);
      }
      for (const item of askable) {
        askKit.set(item, d.kitQuestions.get(item)!);
      }
    }
  }

  const stabilisable = injuries.every(({ injury }) => doNow.some((s) => s.injuries.includes(injury.key)));

  return { injuries, category, doNow, askKit: [...askKit.values()], needsMedic, stabilisable };
}

// Kit first (just in time: decision 8), then the question most likely to change
// the outcome, else MARCH order. null when nothing is left to ask.
export function nextPrompt(d: Doctrine, c: Casualty): Prompt | null {
  const kit = assess(d, c).askKit[0];
  if (kit) {
    return { kind: 'kit', question: kit };
  }

  const current = assess(d, c).category?.rank ?? Infinity;
  const open = d.questions.filter((q) => q.answerType === 'yes_no' && c.answers[q.key] === undefined);
  const sharper = open.find((q) => revealRank(d, c, q.key) < current);
  const question = sharper ?? open[0];
  return question ? { kind: 'question', question } : null;
}

function findInjuries(d: Doctrine, c: Casualty): FoundInjury[] {
  const yes = (key: string) => c.answers[key] === 'yes';
  const found = new Map<string, FoundInjury>();
  const add = (injuryKey: string, questions: string[], basis: string, sources: Source[]) => {
    const injury = d.injuries.get(injuryKey);
    if (!injury) {
      return;
    }
    const entry = found.get(injuryKey) ?? { injury, because: [] };
    entry.because.push({ questions, basis, sources });
    found.set(injuryKey, entry);
  };

  for (const link of d.links) {
    if (yes(link.finding)) {
      add(link.injury, [link.finding], link.basis, link.sources);
    }
  }
  for (const rule of d.conjunctions) {
    if (rule.findings.every(yes)) {
      add(rule.injury, rule.findings, 'explicit', rule.sources);
    }
  }
  return [...found.values()];
}

// The most urgent rank a yes to this question could still reveal
function revealRank(d: Doctrine, c: Casualty, questionKey: string): number {
  const ranks: number[] = [];
  for (const link of d.links) {
    if (link.finding === questionKey) {
      ranks.push(d.injuries.get(link.injury)?.category?.rank ?? Infinity);
    }
  }
  for (const rule of d.conjunctions) {
    const othersStillPossible = rule.findings.every((f) => f === questionKey || c.answers[f] !== 'no');
    if (rule.findings.includes(questionKey) && othersStillPossible) {
      ranks.push(d.injuries.get(rule.injury)?.category?.rank ?? Infinity);
    }
  }
  return Math.min(Infinity, ...ranks);
}

// A step listing several kit items can be done with any of them (product_rule:
// e.g. "Apply direct pressure dressings" lists a gauze bandage and a pressure
// bandage). To confirm with a medic.
function kitStatus(c: Casualty, step: Step): 'have' | 'unknown' | 'none' {
  if (step.kit.length === 0 || step.kit.some((k) => c.kit[k] === true)) {
    return 'have';
  }
  return step.kit.every((k) => c.kit[k] === false) ? 'none' : 'unknown';
}

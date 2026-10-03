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
  // From the tie-break question when there is no timer: 'none', or when it went
  // on as a window (a bucket, never a made-up exact time). null: not asked
  tourniquetWindow: TourniquetWindow | 'none' | null;
  recheck: Answer | null; // the shock question asked again at tie-break time
  photo: string | null; // file name of their photo on this phone (state/photos.ts)
  history: string[]; // answered keys in order ('kit:<key>', 'tie:<factor>'), for undo
};

// It went on between `from` (null: longer ago than any bucket) and `to`
export type TourniquetWindow = { from: number | null; to: number };

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
  // every injury has a step the soldier can do now (a tie-break factor)
  stabilisable: boolean;
};

export type Prompt = { kind: 'kit'; question: KitQuestion } | { kind: 'question'; question: Question };

export function newCasualty(id: string, name: string, now: number): Casualty {
  return {
    id,
    name,
    createdAt: now,
    answers: {},
    kit: {},
    tourniquetAt: null,
    tourniquetWindow: null,
    recheck: null,
    photo: null,
    history: [],
  };
}

export function answer(c: Casualty, questionKey: string, value: Answer): Casualty {
  return { ...c, answers: { ...c.answers, [questionKey]: value }, history: [...c.history, questionKey] };
}

export function answerKit(c: Casualty, kitKey: string, has: boolean): Casualty {
  return { ...c, kit: { ...c.kit, [kitKey]: has }, history: [...c.history, `kit:${kitKey}`] };
}

// Tie-break answers ('tie:...' in the history, so undo takes them back too)
export function answerTourniquet(c: Casualty, window: TourniquetWindow | 'none'): Casualty {
  return { ...c, tourniquetWindow: window, history: [...c.history, 'tie:tourniquet'] };
}

export function answerRecheck(c: Casualty, value: Answer): Casualty {
  return { ...c, recheck: value, history: [...c.history, 'tie:recheck'] };
}

// Takes back the last answer (question, kit or tie-break)
export function undo(c: Casualty): Casualty {
  const last = c.history.at(-1);
  if (last === undefined) {
    return c;
  }
  const history = c.history.slice(0, -1);
  if (last === 'tie:tourniquet') {
    return { ...c, tourniquetWindow: null, history };
  }
  if (last === 'tie:recheck') {
    return { ...c, recheck: null, history };
  }
  if (last.startsWith('kit:')) {
    const { [last.slice(4)]: _, ...kit } = c.kit;
    return { ...c, kit, history };
  }
  const { [last]: _, ...answers } = c.answers;
  return { ...c, answers, history };
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

// Kit first (just in time: decision 8), then, in MARCH order, the next question
// that could still make them more urgent. null when none can: the sieve exits
// early, so a second injury in the same or a lower category can go unasked
// (chosen with the user: speed over completeness at the point of injury).
export function nextPrompt(d: Doctrine, c: Casualty): Prompt | null {
  const kit = assess(d, c).askKit[0];
  if (kit) {
    return { kind: 'kit', question: kit };
  }
  const question = stillToAsk(d, c)[0];
  return question ? { kind: 'question', question } : null;
}

// The open questions that could still change the category, in MARCH order
export function stillToAsk(d: Doctrine, c: Casualty): Question[] {
  const current = assess(d, c).category?.rank ?? Infinity;
  return d.questions.filter(
    (q) => q.answerType === 'yes_no' && c.answers[q.key] === undefined && revealRank(d, c, q.key) < current,
  );
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

// The next casualty the sieve still has questions for, in the order they were
// added, other than `except` (the one just finished). null: everyone is done
export function nextToSieve(d: Doctrine, casualties: Casualty[], except?: string): Casualty | null {
  return casualties.find((c) => c.id !== except && nextPrompt(d, c) !== null) ?? null;
}

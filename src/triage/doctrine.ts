// What the soldier flow needs from the doctrine graph, read with Cypher from
// the on-device TuringDB (queries follow DECISION-SPEC.md section 7).
//
// Policy applied here, not in the rules:
// - only soldier-askable questions whose evidence is TCCC (decision 5), and not
//   labels withheld for review;
// - a question -> injury link counts only if the link itself cites TCCC.

import type { Row } from '../graph/envelope';

export type Query = (cypher: string) => Promise<Row[]>;

export type Source = { doc: string; page: number | null; quote: string | null };

export type Question = {
  key: string;
  label: string;
  cue: string | null;
  section: string; // m, a, r, c, h, paws_p, paws_a, paws_w, paws_s
  answerType: 'yes_no' | 'time_bucket';
  sources: Source[];
};

// A yes to `finding` indicates `injury`
export type Link = { finding: string; injury: string; basis: string; sources: Source[] };

// Yes to every finding together indicates `injury` (TCCC's "A and B" rules)
export type Conjunction = { findings: string[]; injury: string; sources: Source[] };

export type Category = { key: string; rank: number }; // rank 1 = most urgent

export type Injury = {
  key: string;
  name: string;
  category: Category | null; // null: triage doctrine does not rank it
  categorySources: Source[];
};

export type Tier = 'all_combatants' | 'medic' | 'officer_sof';

export type Step = { key: string; label: string; tier: Tier; kit: string[]; sources: Source[] };

export type KitQuestion = { kit: string; key: string; label: string };

export type Doctrine = {
  questions: Question[]; // in MARCH then PAWS order
  links: Link[];
  conjunctions: Conjunction[];
  injuries: Map<string, Injury>;
  steps: Map<string, Step[]>; // by injury key
  kitQuestions: Map<string, KitQuestion>; // by kit key
};

const TCCC = 'tccc-handbook';

export async function loadDoctrine(query: Query): Promise<Doctrine> {
  // Q10 (MARCH order) with the soldier-question policy
  const questions = (
    await query(`
      MATCH (q:Finding)-[:IN_SECTION]->(s:Section)
      WHERE q.askable = true AND q.symptomSource CONTAINS 'tccc' AND q.labelStatus <> 'needs_review'
      RETURN q.key AS key, q.label AS label, q.cue AS cue, s.key AS section,
             q.answer_type AS answerType, q.sources_json AS sources
      ORDER BY s.order, q.flowOrder`)
  ).map((r) => ({
    key: str(r.key),
    label: str(r.label),
    cue: r.cue === null ? null : str(r.cue),
    section: str(r.section),
    answerType: r.answerType === 'time_bucket' ? 'time_bucket' : 'yes_no',
    sources: sources(r.sources),
  })) satisfies Question[];

  // Q1, restricted to links that cite TCCC
  const links = (
    await query(`
      MATCH (f:Finding)-[r:INDICATES]->(i:Injury)
      WHERE r.sources_json CONTAINS '${TCCC}'
      RETURN f.key AS finding, i.key AS injury, r.basis AS basis, r.sources_json AS sources`)
  ).map((r) => ({
    finding: str(r.finding),
    injury: str(r.injury),
    basis: str(r.basis),
    sources: sources(r.sources),
  })) satisfies Link[];

  // Q11 (conjunctions), one row per member
  const members = await query(`
    MATCH (f:Finding)-[:PART_OF]->(c:Condition)-[r:INDICATES]->(i:Injury)
    WHERE r.sources_json CONTAINS '${TCCC}'
    RETURN c.nid AS condition, f.key AS finding, i.key AS injury, r.sources_json AS sources`);
  const byCondition = new Map<string, Conjunction>();
  for (const r of members) {
    const id = str(r.condition);
    const c = byCondition.get(id) ?? { findings: [], injury: str(r.injury), sources: sources(r.sources) };
    c.findings.push(str(r.finding));
    byCondition.set(id, c);
  }

  // Q2 for every injury
  const injuries = new Map<string, Injury>();
  for (const r of await query(`
    MATCH (i:Injury)
    OPTIONAL MATCH (i)-[r:TRIAGES_TO]->(t:TriageCategory)
    RETURN i.key AS key, i.name AS name, t.key AS category, t.rank AS rank, r.sources_json AS sources`)) {
    const key = str(r.key);
    const category = r.category === null ? null : { key: str(r.category), rank: Number(r.rank) };
    const known = injuries.get(key);
    // An injury with two categories keeps the most urgent
    if (known?.category && (!category || known.category.rank <= category.rank)) {
      continue;
    }
    injuries.set(key, {
      key,
      name: r.name === null ? key : str(r.name),
      category,
      categorySources: sources(r.sources),
    });
  }

  // Q4 with the kit each step consumes (Q7)
  const steps = new Map<string, Step[]>();
  for (const r of await query(`
    MATCH (i:Injury)-[r:TREATED_BY]->(s:Intervention)
    OPTIONAL MATCH (s)-[:CONSUMES]->(k:KitItem)
    RETURN i.key AS injury, s.key AS key, s.label AS label, s.tier AS tier,
           collect(k.key) AS kit, r.sources_json AS sources`)) {
    const injury = str(r.injury);
    const list = steps.get(injury) ?? [];
    list.push({
      key: str(r.key),
      label: str(r.label),
      tier: str(r.tier) as Tier,
      kit: (r.kit as (string | null)[]).filter((k): k is string => k !== null),
      sources: sources(r.sources),
    });
    steps.set(injury, list);
  }

  // Q9: the just-in-time question for each kit item
  const kitQuestions = new Map<string, KitQuestion>();
  for (const r of await query(`
    MATCH (q:Finding)-[:ASKS_ABOUT]->(k:KitItem)
    RETURN k.key AS kit, q.key AS key, q.label AS label`)) {
    kitQuestions.set(str(r.kit), { kit: str(r.kit), key: str(r.key), label: str(r.label) });
  }

  return { questions, links, conjunctions: [...byCondition.values()], injuries, steps, kitQuestions };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : String(v);
}

function sources(json: unknown): Source[] {
  if (typeof json !== 'string') {
    return [];
  }
  return (JSON.parse(json) as { doc: string; page?: number | null; quote?: string | null }[]).map((s) => ({
    doc: s.doc,
    page: s.page ?? null,
    quote: s.quote ?? null,
  }));
}

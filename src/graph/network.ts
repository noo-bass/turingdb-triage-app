// The doctrine network behind the questions, read from the on-device TuringDB
// for the graph view (Settings > TuringDB graph): section -> question ->
// (condition ->) injury -> category, and injury -> treatment step. The same
// edges and policy as triage/doctrine.ts, so what lights up is what the app uses.

import type { Row, Value } from './envelope';
import type { Assessment, Casualty, Prompt } from '../triage/assess';
import type { Doctrine } from '../triage/doctrine';
import { SECTION_NAMES } from '../triage/progress.ts';

type Query = (cypher: string) => Promise<Row[]>;

export type NodeKind = 'section' | 'finding' | 'condition' | 'injury' | 'category' | 'step';

// The node label each kind has in the graph
export const NODE_LABEL: Record<NodeKind, string> = {
  section: 'Section',
  finding: 'Finding',
  condition: 'Condition',
  injury: 'Injury',
  category: 'TriageCategory',
  step: 'Intervention',
};

export type GraphNode = {
  id: string; // `${kind}:${key}`
  kind: NodeKind;
  key: string;
  label: string;
  x: number; // layout units, centred on 0
  y: number;
};

export type GraphEdge = { from: string; to: string; type: string };

export type Network = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  byId: Map<string, GraphNode>;
  queries: { cypher: string; ms: number; rows: number }[]; // how it was read
};

const TCCC = 'tccc-handbook';

export async function loadNetwork(query: Query, d: Doctrine): Promise<Network> {
  const nodes = new Map<string, Omit<GraphNode, 'x' | 'y'>>();
  const edges: GraphEdge[] = [];
  const queries: Network['queries'] = [];

  const run = async (cypher: string) => {
    const t0 = Date.now();
    const rows = await query(cypher);
    queries.push({ cypher: oneLine(cypher), ms: Date.now() - t0, rows: rows.length });
    return rows;
  };
  const node = (kind: NodeKind, key: string, label: string) => {
    const id = `${kind}:${key}`;
    if (!nodes.has(id)) {
      nodes.set(id, { id, kind, key, label });
    }
    return id;
  };
  const edge = (from: string, to: string, type: string) => {
    if (!edges.some((e) => e.from === from && e.to === to)) {
      edges.push({ from, to, type });
    }
  };

  // The questions the app asks (doctrine.ts's policy), under their sections
  const asked = new Map(d.questions.map((q) => [q.key, q]));
  for (const r of await run(`
    MATCH (q:Finding)-[:IN_SECTION]->(s:Section)
    WHERE q.askable = true
    RETURN q.key AS finding, s.key AS section`)) {
    const q = asked.get(String(r.finding));
    if (q) {
      edge(node('section', q.section, SECTION_NAMES[q.section] ?? q.section), node('finding', q.key, q.label), 'IN_SECTION');
    }
  }

  // Question -> injury, citing TCCC
  for (const r of await run(`
    MATCH (f:Finding)-[r:INDICATES]->(i:Injury)
    WHERE r.sources_json CONTAINS '${TCCC}'
    RETURN f.key AS finding, i.key AS injury, i.name AS name`)) {
    const from = `finding:${String(r.finding)}`;
    if (nodes.has(from)) {
      edge(from, node('injury', String(r.injury), String(r.name ?? r.injury)), 'INDICATES');
    }
  }

  // Questions that only count together ("A and B") -> injury
  for (const r of await run(`
    MATCH (f:Finding)-[:PART_OF]->(c:Condition)-[r:INDICATES]->(i:Injury)
    WHERE r.sources_json CONTAINS '${TCCC}'
    RETURN c.nid AS condition, f.key AS finding, i.key AS injury, i.name AS name`)) {
    const from = `finding:${String(r.finding)}`;
    if (nodes.has(from)) {
      const condition = node('condition', String(r.condition), 'both');
      edge(from, condition, 'PART_OF');
      edge(condition, node('injury', String(r.injury), String(r.name ?? r.injury)), 'INDICATES');
    }
  }

  const injuries = [...nodes.values()].filter((n) => n.kind === 'injury').map((n) => `'${n.key}'`);
  if (injuries.length > 0) {
    for (const r of await run(`
      MATCH (i:Injury)-[:TRIAGES_TO]->(t:TriageCategory)
      WHERE i.key IN [${injuries.join(', ')}]
      RETURN i.key AS injury, t.key AS category`)) {
      edge(`injury:${String(r.injury)}`, node('category', String(r.category), String(r.category)), 'TRIAGES_TO');
    }

    for (const r of await run(`
      MATCH (i:Injury)-[:TREATED_BY]->(s:Intervention)
      WHERE i.key IN [${injuries.join(', ')}]
      RETURN i.key AS injury, s.key AS step, s.label AS label`)) {
      edge(`injury:${String(r.injury)}`, node('step', String(r.step), String(r.label ?? r.step)), 'TREATED_BY');
    }
  }

  const raw = [...nodes.values()];
  const placed = forceLayout(raw.map((n) => n.id), edges, seedPositions(raw), 300);
  const laid = raw.map((n) => ({ ...n, ...placed.get(n.id)! }));
  return { nodes: laid, edges, byId: new Map(laid.map((n) => [n.id, n])), queries };
}

function oneLine(cypher: string): string {
  return cypher.replace(/\s+/g, ' ').trim();
}

// ======== Layout: a force simulation, as TuringDB's own viewer uses ========

export type Point = { x: number; y: number };

// Where an answer travels, left to right: a gentle pull, so the picture reads
// as a flow without being a grid
const FLOW: Record<NodeKind, number> = { section: -3, finding: -1.6, condition: -0.4, injury: 0, category: 1.8, step: 2.6 };

function seedPositions(raw: Omit<GraphNode, 'x' | 'y'>[]): Map<string, Point> {
  const seen = new Map<NodeKind, number>();
  const seeds = new Map<string, Point>();
  for (const n of raw) {
    const i = seen.get(n.kind) ?? 0;
    seen.set(n.kind, i + 1);
    // golden-angle spread, deterministic: the same picture every launch
    seeds.set(n.id, { x: FLOW[n.kind] * 3 + Math.cos(i * 2.4) * 0.5, y: (i % 2 ? 1 : -1) * Math.sqrt(i) * 0.6 });
  }
  return seeds;
}

// Springs along edges (TuringDB: link distance 2.5), many-body repulsion,
// a weak pull to the centre and to the flow column. Deterministic.
export function forceLayout(ids: string[], edges: GraphEdge[], seeds: Map<string, Point>, iterations: number): Map<string, Point> {
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const flow = new Float64Array(n);
  ids.forEach((id, i) => {
    const s = seeds.get(id) ?? { x: 0, y: 0 };
    x[i] = s.x;
    y[i] = s.y;
    flow[i] = FLOW[id.slice(0, id.indexOf(':')) as NodeKind] * 3;
  });
  const links = edges
    .map((e) => [index.get(e.from), index.get(e.to)])
    .filter((l): l is [number, number] => l[0] !== undefined && l[1] !== undefined);

  const linkDistance = 2.5;
  const charge = 3;
  for (let step = 0; step < iterations; step++) {
    const alpha = 1 - step / iterations;
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = x[i] - x[j];
        const dy = y[i] - y[j];
        const d2 = Math.max(dx * dx + dy * dy, 0.01);
        const f = charge / d2;
        fx[i] += dx * f;
        fy[i] += dy * f;
        fx[j] -= dx * f;
        fy[j] -= dy * f;
      }
    }
    for (const [a, b] of links) {
      const dx = x[b] - x[a];
      const dy = y[b] - y[a];
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const f = ((d - linkDistance) / d) * 0.3;
      fx[a] += dx * f;
      fy[a] += dy * f;
      fx[b] -= dx * f;
      fy[b] -= dy * f;
    }
    for (let i = 0; i < n; i++) {
      fx[i] += (flow[i] - x[i]) * 0.08;
      fy[i] += -y[i] * 0.04;
      x[i] += Math.max(-1, Math.min(1, fx[i] * 0.1)) * alpha;
      y[i] += Math.max(-1, Math.min(1, fy[i] * 0.1)) * alpha;
    }
  }

  return new Map(ids.map((id, i) => [id, { x: x[i], y: y[i] }]));
}

// ======== What lights up for one casualty ========

export type NodeState = 'current' | 'yes' | 'no' | 'unsure' | 'lit' | 'idle';

export function nodeStates(
  network: Network,
  casualty: Casualty,
  prompt: Prompt | null,
  assessment: Assessment,
): Map<string, NodeState> {
  const states = new Map<string, NodeState>();
  const current = prompt?.kind === 'question' ? `finding:${prompt.question.key}` : null;

  const lit = new Set<string>([
    ...assessment.injuries.map((f) => `injury:${f.injury.key}`),
    ...(assessment.category ? [`category:${assessment.category.key}`] : []),
    ...[...assessment.doNow, ...assessment.needsMedic].map((s) => `step:${s.key}`),
  ]);

  for (const node of network.nodes) {
    let state: NodeState = 'idle';
    if (node.id === current) {
      state = 'current';
    } else if (node.kind === 'finding') {
      state = casualty.answers[node.key] ?? 'idle';
    } else if (lit.has(node.id)) {
      state = 'lit';
    }
    states.set(node.id, state);
  }

  // A section is lit once any of its questions is answered or asked; a
  // condition once every question in it is a yes
  for (const e of network.edges) {
    const from = network.byId.get(e.from);
    const to = network.byId.get(e.to);
    if (from?.kind === 'section' && states.get(e.to) !== 'idle' && states.get(e.from) === 'idle') {
      states.set(e.from, 'lit');
    }
    if (to?.kind === 'condition') {
      const members = network.edges.filter((m) => m.to === e.to).map((m) => states.get(m.from));
      states.set(e.to, members.every((s) => s === 'yes') ? 'lit' : 'idle');
    }
  }

  return states;
}

export function isActive(state: NodeState | undefined): boolean {
  return state === 'yes' || state === 'lit' || state === 'current';
}

// ======== The focus view: what matters for this question ========

const MAX_FOCUS_STEPS = 3;

// The question being asked and where a yes would lead (its injuries and their
// categories), the trail the yes answers so far have lit, and their sections.
// Treatment steps only for what is lit, a few at most: the panel is small.
export function focusNodes(network: Network, states: Map<string, NodeState>): Set<string> {
  const out = (id: string) => network.edges.filter((e) => e.from === id).map((e) => e.to);
  const focus = new Set<string>();

  for (const [id, state] of states) {
    if (state === 'current' || state === 'yes' || (state === 'lit' && !id.startsWith('step:') && !id.startsWith('section:'))) {
      focus.add(id);
    }
  }

  // Where the current question leads, two hops: injury (or condition), then category
  const current = [...states].find(([, s]) => s === 'current')?.[0];
  if (current) {
    for (const a of out(current)) {
      focus.add(a);
      for (const b of out(a)) {
        if (!b.startsWith('step:')) {
          focus.add(b);
          out(b).filter((c) => c.startsWith('category:')).forEach((c) => focus.add(c));
        }
      }
    }
  }

  // Categories of every injury shown, and a few steps of the lit ones
  for (const id of [...focus]) {
    if (id.startsWith('injury:')) {
      out(id).filter((c) => c.startsWith('category:')).forEach((c) => focus.add(c));
      if (states.get(id) === 'lit') {
        out(id)
          .filter((c) => c.startsWith('step:'))
          .slice(0, MAX_FOCUS_STEPS)
          .forEach((c) => focus.add(c));
      }
    }
  }

  // The section of every question shown
  for (const e of network.edges) {
    if (e.from.startsWith('section:') && focus.has(e.to) && states.get(e.to) === 'current') {
      focus.add(e.from);
    }
  }

  return focus;
}

// ======== Live queries ========

// The query the graph view runs on every answer, to show TuringDB at work:
// what the yes answers so far point to
export function answersQuery(casualty: Casualty): string | null {
  const yes = Object.entries(casualty.answers)
    .filter(([, a]) => a === 'yes')
    .map(([k]) => `'${k}'`);
  if (yes.length === 0) {
    return null;
  }
  return `MATCH (f:Finding)-[:INDICATES]->(i:Injury)-[:TRIAGES_TO]->(t:TriageCategory) WHERE f.key IN [${yes.join(', ')}] RETURN i.key AS injury, t.key AS category`;
}

export type Inspection = {
  properties: [string, Value][];
  relationships: { type: string; out: boolean; label: string; key: string }[];
  cypher: string[];
  ms: number;
};

// Everything the graph holds about one node (the inspector), read live:
// its properties and every relationship, including those the triage flow
// does not use. Conditions are keyed by nid.
export async function inspectNode(query: Query, node: GraphNode): Promise<Inspection> {
  const label = NODE_LABEL[node.kind];
  const where = node.kind === 'condition' ? `n.nid = '${node.key}'` : `n.key = '${node.key}'`;
  const cypher = [
    `MATCH (n:${label}) WHERE ${where} RETURN properties(n) AS p`,
    `MATCH (n:${label})-[r]->(m) WHERE ${where} RETURN type(r) AS t, labels(m) AS l, m.key AS k`,
    `MATCH (m)-[r]->(n:${label}) WHERE ${where} RETURN type(r) AS t, labels(m) AS l, m.key AS k`,
  ];
  const t0 = performance.now();
  const [props, outgoing, incoming] = await Promise.all(cypher.map((c) => query(c)));
  const ms = performance.now() - t0;

  const map = (props[0]?.p ?? {}) as unknown as Record<string, Value>;
  const rel = (out: boolean) => (r: Row) => ({
    type: String(r.t),
    out,
    label: Array.isArray(r.l) ? String(r.l[0]) : String(r.l),
    key: String(r.k),
  });
  return {
    // long JSON blobs (sources_json) are for machines: shown last
    properties: Object.entries(map).sort(([a], [b]) => Number(a.endsWith('_json')) - Number(b.endsWith('_json')) || a.localeCompare(b)),
    relationships: [...outgoing.map(rel(true)), ...incoming.map(rel(false))],
    cypher,
    ms,
  };
}

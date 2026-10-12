// The doctrine network drawn from the on-device TuringDB, in the style of
// TuringDB's own viewer: dark canvas, green edges with arrows, a colour per
// node label, octagons (or labelled rounded rects up close), and focus +
// context: what matters is full size and colour, the rest steps back.
//
//   FocusGraph   above the questions: the question being asked, where a yes
//                leads, and the trail the answers have lit; animates as you go
//   WholeGraph   the full graph (/graph/[id]): tap a node to inspect it
//   Inspector    one node, read live: its properties and every relationship

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Marker, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import {
  answersQuery,
  focusNodes,
  forceLayout,
  inspectNode,
  isActive,
  loadNetwork,
  NODE_LABEL,
  nodeStates,
  type GraphNode,
  type Inspection,
  type Network,
  type NodeKind,
  type NodeState,
  type Point,
} from '../graph/network.ts';
import { query } from '../graph/triageGraph.ts';
import { useStore } from '../state/store.tsx';
import type { Assessment, Casualty, Prompt } from '../triage/assess.ts';
import type { Doctrine } from '../triage/doctrine.ts';
import { categoryWord, useTheme } from './components.tsx';

// ======== Colours (TuringDB's viewer palette; all red in night mode) ========

type GraphPalette = {
  canvas: string;
  edge: string;
  edgeIdle: string;
  selected: string;
  text: string;
  textMuted: string;
  yes: string;
  no: string;
  unsure: string;
  kind: Record<NodeKind, string>;
  category: Record<string, string>;
};

const TURING: GraphPalette = {
  canvas: '#030712',
  edge: '#2af597',
  edgeIdle: '#27302d',
  selected: '#0385ff',
  text: '#f3f4f6',
  textMuted: '#6b7280',
  yes: '#29a634',
  no: '#d33d17',
  unsure: '#d1980b',
  kind: {
    section: '#7961db',
    finding: '#d1980b',
    condition: '#9d3f9d',
    injury: '#db2c6f',
    category: '#aaaaaa',
    step: '#00a396',
  },
  category: { immediate: '#ff453a', delayed: '#ffd60a', minimal: '#32d74b', expectant: '#8e8e93' },
};

const NIGHT: GraphPalette = {
  canvas: '#000000',
  edge: '#ff3b30',
  edgeIdle: '#3a0000',
  selected: '#ff3b30',
  text: '#ff3b30',
  textMuted: '#7a1a14',
  yes: '#ff3b30',
  no: '#7a1a14',
  unsure: '#a32019',
  kind: { section: '#a32019', finding: '#ff3b30', condition: '#a32019', injury: '#ff3b30', category: '#ff3b30', step: '#a32019' },
  category: { immediate: '#ff3b30', delayed: '#ff3b30', minimal: '#ff3b30', expectant: '#a32019' },
};

function useGraphPalette(): GraphPalette {
  return useStore().state.mode === 'red' ? NIGHT : TURING;
}

function fill(p: GraphPalette, node: GraphNode): string {
  return node.kind === 'category' ? (p.category[node.key] ?? p.kind.category) : p.kind[node.kind];
}

// The ring that carries an answer (fill carries the label, as in TuringDB)
function ring(p: GraphPalette, state: NodeState): string | null {
  switch (state) {
    case 'current':
      return p.selected;
    case 'yes':
      return p.yes;
    case 'no':
      return p.no;
    case 'unsure':
      return p.unsure;
    default:
      return null;
  }
}

function title(node: GraphNode): string {
  return node.kind === 'category' ? categoryWord(node.key) : node.label;
}

// ======== Data ========

let loading: Promise<Network> | null = null;

// Read once per launch (five queries, a few ms), then shared by every view
export function useNetwork(doctrine: Doctrine): { network: Network | null; error: string | null } {
  const [network, setNetwork] = useState<Network | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loading ??= loadNetwork(query, doctrine).catch((e: unknown) => {
      loading = null;
      throw e;
    });
    loading.then(setNetwork).catch((e: unknown) => setError(String(e)));
  }, [doctrine]);

  return { network, error };
}

export type LiveQuery = { cypher: string; ms: number; rows: number } | null;

// Re-asks TuringDB what the yes answers point to whenever they change. A
// result shows only while it answers the current query (none before any yes)
export function useLiveQuery(casualty: Casualty): LiveQuery {
  const cypher = answersQuery(casualty);
  const [live, setLive] = useState<LiveQuery>(null);

  useEffect(() => {
    if (!cypher) {
      return;
    }
    let current = true;
    const t0 = performance.now();
    query(cypher)
      .then((rows) => current && setLive({ cypher, ms: performance.now() - t0, rows: rows.length }))
      .catch(() => current && setLive(null));
    return () => {
      current = false;
    };
  }, [cypher]);

  return live && live.cypher === cypher ? live : null;
}

// Positions that glide to new targets instead of jumping (~350 ms)
function useTween(targets: Map<string, Point>): Map<string, Point> {
  const [shown, setShown] = useState(targets);
  const from = useRef(targets);

  useEffect(() => {
    const start = from.current;
    const t0 = performance.now();
    let frame = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 350);
      const e = 1 - Math.pow(1 - k, 3);
      const next = new Map<string, Point>();
      for (const [id, to] of targets) {
        const a = start.get(id) ?? to;
        next.set(id, { x: a.x + (to.x - a.x) * e, y: a.y + (to.y - a.y) * e });
      }
      from.current = next;
      setShown(next);
      if (k < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [targets]);

  return shown;
}

// A breathing ring for the question being asked
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function usePulse(): Animated.Value {
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

// Fits layout points into a box, keeping the aspect; small graphs are not blown up
function fit(points: Point[], width: number, height: number, pad: number, maxScale: number) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(Math.max(...xs) - minX, 0.001);
  const h = Math.max(Math.max(...ys) - minY, 0.001);
  const s = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h, maxScale);
  const ox = (width - w * s) / 2 - minX * s;
  const oy = (height - h * s) / 2 - minY * s;
  return (p: Point) => ({ x: p.x * s + ox, y: p.y * s + oy });
}

function ArrowMarkers({ p }: { p: GraphPalette }) {
  return (
    <Defs>
      {(['on', 'off'] as const).map((k) => (
        <Marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <Path d="M0 0L10 5L0 10z" fill={k === 'on' ? p.edge : p.edgeIdle} />
        </Marker>
      ))}
    </Defs>
  );
}

// ======== FocusGraph: above the questions ========

const RECT_H = 22;
const CHAR_W = 5.6;
const MAX_CHARS = 22;

function rectWidth(text: string): number {
  return Math.min(text.length, MAX_CHARS) * CHAR_W + 16;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// Where a line from the centre along (dx, dy) leaves a w x h rect
function exitDistance(w: number, h: number, dx: number, dy: number): number {
  return Math.min(w / 2 / Math.max(Math.abs(dx), 1e-4), h / 2 / Math.max(Math.abs(dy), 1e-4));
}

export function FocusGraph({
  network,
  states,
  width,
  height,
}: {
  network: Network;
  states: Map<string, NodeState>;
  width: number;
  height: number;
}) {
  const p = useGraphPalette();
  const pulse = usePulse();

  const focus = focusNodes(network, states);
  const key = [...focus].sort().join('|');
  const ids = useMemo(() => key.split('|').filter(Boolean), [key]);
  const edges = useMemo(() => {
    const shown = new Set(ids);
    return network.edges.filter((e) => shown.has(e.from) && shown.has(e.to));
  }, [network, ids]);

  // A small layout of just these nodes, seeded from the whole graph's so it stays recognisable
  const targets = useMemo(() => {
    const seeds = new Map(ids.map((id) => [id, network.byId.get(id)!]));
    const laid = forceLayout(ids, edges, seeds, 160);
    const place = fit([...laid.values()], width, height, 26, 60);
    return new Map([...laid].map(([id, pt]) => [id, place(pt)]));
  }, [ids, edges, network, width, height]);
  const pos = useTween(targets);

  return (
    <Svg width={width} height={height}>
      <ArrowMarkers p={p} />
      <Rect width={width} height={height} fill={p.canvas} />

      {edges.map((e) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) {
          return null;
        }
        const on = isActive(states.get(e.from)) && isActive(states.get(e.to));
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(Math.hypot(dx, dy), 1);
        const bw = rectWidth(title(network.byId.get(e.to)!));
        const aw = rectWidth(title(network.byId.get(e.from)!));
        const start = exitDistance(aw, RECT_H, dx / d, dy / d);
        const end = exitDistance(bw, RECT_H, dx / d, dy / d) + 2;
        if (start + end >= d) {
          return null;
        }
        const x1 = a.x + (dx / d) * start;
        const y1 = a.y + (dy / d) * start;
        const x2 = b.x - (dx / d) * end;
        const y2 = b.y - (dy / d) * end;
        return (
          <G key={`${e.from}>${e.to}`}>
            <Line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={on ? p.edge : p.edgeIdle}
              strokeOpacity={on ? 0.85 : 1}
              strokeWidth={on ? 1.6 : 1}
              markerEnd={`url(#arrow-${on ? 'on' : 'off'})`}
            />
            {d > 90 && (
              <SvgText
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 3}
                fontSize={7}
                letterSpacing={0.4}
                fill={on ? p.edge : p.textMuted}
                textAnchor="middle">
                {e.type}
              </SvgText>
            )}
          </G>
        );
      })}

      {ids.map((id) => {
        const node = network.byId.get(id)!;
        const at = pos.get(id);
        if (!at) {
          return null;
        }
        const state = states.get(id) ?? 'idle';
        const text = clip(title(node), MAX_CHARS);
        const w = rectWidth(title(node));
        const active = isActive(state);
        const edge = ring(p, state);
        return (
          <G key={id} opacity={active || state === 'no' || state === 'unsure' ? 1 : 0.55}>
            {state === 'current' && (
              <AnimatedCircle
                cx={at.x}
                cy={at.y}
                r={pulse.interpolate({ inputRange: [0, 1], outputRange: [w / 2, w / 2 + 14] })}
                stroke={p.selected}
                strokeWidth={2}
                strokeOpacity={pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] })}
                fill="none"
              />
            )}
            <Rect
              x={at.x - w / 2}
              y={at.y - RECT_H / 2}
              width={w}
              height={RECT_H}
              rx={RECT_H / 2}
              fill={fill(p, node)}
              fillOpacity={active ? 1 : 0.35}
              stroke={edge ?? 'none'}
              strokeWidth={edge ? 2.5 : 0}
            />
            <SvgText
              x={at.x}
              y={at.y + 3.5}
              fontSize={10}
              fontWeight="700"
              fill={active ? '#0b0b0f' : p.text}
              textAnchor="middle">
              {text}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ======== WholeGraph: every node, octagons, tap to inspect ========

function octagon(cx: number, cy: number, r: number): string {
  return Array.from({ length: 8 }, (_, i) => {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
}

const OCTAGON_R: Record<NodeKind, number> = { section: 7, finding: 6, condition: 5, injury: 7, category: 10, step: 4.5 };

export function WholeGraph({
  network,
  states,
  width,
  height,
  selected,
  onSelect,
}: {
  network: Network;
  states: Map<string, NodeState>;
  width: number;
  height: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const p = useGraphPalette();
  const place = useMemo(() => fit(network.nodes, width, height, 18, Infinity), [network, width, height]);

  // Selecting a node puts it and its neighbours forward (TuringDB's primary /
  // secondary); otherwise the casualty's trail is forward
  const neighbours = useMemo(() => {
    if (!selected) {
      return null;
    }
    const near = new Set([selected]);
    for (const e of network.edges) {
      if (e.from === selected) {
        near.add(e.to);
      }
      if (e.to === selected) {
        near.add(e.from);
      }
    }
    return near;
  }, [network, selected]);
  const forward = (id: string) => (neighbours ? neighbours.has(id) : isActive(states.get(id)) || states.get(id) === 'no');

  const order = [...network.nodes].sort((a, b) => Number(forward(a.id)) - Number(forward(b.id)));

  return (
    <Svg width={width} height={height}>
      <ArrowMarkers p={p} />
      <Rect width={width} height={height} fill={p.canvas} onPress={() => onSelect(null)} />

      {network.edges.map((e) => {
        const a = place(network.byId.get(e.from)!);
        const b = place(network.byId.get(e.to)!);
        const on = neighbours
          ? e.from === selected || e.to === selected
          : isActive(states.get(e.from)) && isActive(states.get(e.to));
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(Math.hypot(dx, dy), 1);
        const r = OCTAGON_R[network.byId.get(e.to)!.kind] + 2;
        return (
          <G key={`${e.from}>${e.to}`}>
            <Line
              x1={a.x}
              y1={a.y}
              x2={b.x - (dx / d) * r}
              y2={b.y - (dy / d) * r}
              stroke={on ? p.edge : p.edgeIdle}
              strokeWidth={on ? 1.4 : 0.7}
              markerEnd={on ? 'url(#arrow-on)' : undefined}
            />
            {on && neighbours && (
              <SvgText x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3} fontSize={6} fill={p.edge} textAnchor="middle">
                {e.type}
              </SvgText>
            )}
          </G>
        );
      })}

      {order.map((node) => {
        const at = place(node);
        const state = states.get(node.id) ?? 'idle';
        const front = forward(node.id);
        const r = OCTAGON_R[node.kind] * (front ? 1 : 0.8);
        const edge = node.id === selected ? p.selected : ring(p, state);
        const showLabel = front || node.kind === 'section' || node.kind === 'category';
        return (
          <G key={node.id} onPress={() => onSelect(node.id)}>
            {/* a target big enough for a finger, drawn invisible */}
            <Circle cx={at.x} cy={at.y} r={14} fill="transparent" />
            <Polygon
              points={octagon(at.x, at.y, r)}
              fill={fill(p, node)}
              fillOpacity={front ? 1 : 0.3}
              stroke={edge ?? 'none'}
              strokeWidth={edge ? 2 : 0}
            />
            {showLabel && (
              <SvgText
                x={at.x}
                y={at.y - r - 3}
                fontSize={node.kind === 'category' ? 9 : 7}
                fontWeight={front ? '700' : '400'}
                fill={front ? p.text : p.textMuted}
                textAnchor="middle">
                {clip(title(node), 26)}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}

// ======== Inspector: one node, read live ========

export function Inspector({ network, id, onClose }: { network: Network; id: string; onClose: () => void }) {
  const t = useTheme();
  const p = useGraphPalette();
  const node = network.byId.get(id)!;
  const [found, setFound] = useState<{ id: string; inspection: Inspection | null; error: string | null } | null>(null);

  useEffect(() => {
    let current = true;
    inspectNode(query, node)
      .then((inspection) => current && setFound({ id, inspection, error: null }))
      .catch((e: unknown) => current && setFound({ id, inspection: null, error: String(e) }));
    return () => {
      current = false;
    };
  }, [id, node]);

  const inspection = found?.id === id ? found.inspection : null;
  const error = found?.id === id ? found.error : null;

  return (
    <View style={[styles.inspector, { borderColor: t.border, backgroundColor: t.surface }]}>
      <View style={styles.inspectorHead}>
        <View style={[styles.labelChip, { backgroundColor: fill(p, node) }]}>
          <Text style={styles.labelChipText}>{NODE_LABEL[node.kind]}</Text>
        </View>
        <Text style={[styles.inspectorTitle, { color: t.text }]} numberOfLines={2}>
          {title(node)}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={16} onPress={onClose}>
          <Text style={[styles.close, { color: t.textMuted }]}>✕</Text>
        </Pressable>
      </View>

      {error && <Text style={{ color: t.warning }}>{error}</Text>}
      {!inspection && !error && <Text style={{ color: t.textMuted }}>Reading from TuringDB…</Text>}
      {inspection && (
        <>
          <Text style={[styles.meta, { color: p.selected }]}>
            {inspection.properties.length} properties · {inspection.relationships.length} relationships ·{' '}
            {inspection.ms.toFixed(1)} ms
          </Text>

          {inspection.relationships.map((r, i) => (
            <Text key={i} style={[styles.row, { color: t.text }]} numberOfLines={1}>
              <Text style={{ color: p.edge }}>{r.out ? `-[:${r.type}]->` : `<-[:${r.type}]-`}</Text>{' '}
              <Text style={{ color: t.textMuted }}>({r.label})</Text> {r.key}
            </Text>
          ))}

          <View style={styles.props}>
            {inspection.properties.map(([k, v]) => (
              <Text key={k} style={[styles.row, { color: t.text }]} numberOfLines={3}>
                <Text style={{ color: t.textMuted }}>{k}: </Text>
                {typeof v === 'string' ? v : JSON.stringify(v)}
              </Text>
            ))}
          </View>

          {inspection.cypher.map((c) => (
            <Text key={c} style={[styles.cypher, { color: t.textMuted }]}>
              {c}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

// ======== Legend and the query line ========

export function Legend() {
  const t = useTheme();
  const p = useGraphPalette();
  const kinds: NodeKind[] = ['section', 'finding', 'condition', 'injury', 'category', 'step'];
  const rings: [string, string][] = [
    [p.selected, 'asking now'],
    [p.yes, 'yes'],
    [p.no, 'no'],
    [p.unsure, 'not sure'],
  ];
  return (
    <View style={styles.legend}>
      <View style={styles.chips}>
        {kinds.map((k) => (
          <View key={k} style={[styles.labelChip, { backgroundColor: p.kind[k] }]}>
            <Text style={styles.labelChipText}>{NODE_LABEL[k]}</Text>
          </View>
        ))}
      </View>
      <View style={styles.chips}>
        {rings.map(([color, text]) => (
          <View key={text} style={styles.ringItem}>
            <View style={[styles.ring, { borderColor: color }]} />
            <Text style={[styles.ringText, { color: t.text }]}>{text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// One line under the graph: the query TuringDB just answered on this phone
export function QueryLine({ live, network, compact }: { live: LiveQuery; network: Network; compact?: boolean }) {
  const t = useTheme();
  const p = useGraphPalette();
  const loadMs = network.queries.reduce((sum, q) => sum + q.ms, 0);
  return (
    <View style={styles.queryLine}>
      <Text style={[styles.engine, { color: p.edge }]}>
        TuringDB on this phone ·{' '}
        {live
          ? `${live.ms.toFixed(1)} ms · ${live.rows} rows`
          : `${network.nodes.length} nodes · ${network.edges.length} edges · ${loadMs} ms`}
      </Text>
      <Text numberOfLines={compact ? 1 : undefined} style={[styles.query, { color: t.textMuted }]}>
        {live ? live.cypher : `${network.queries.length} queries read this graph. Answer yes to see the next one.`}
      </Text>
    </View>
  );
}

// ======== The panel above the questions ========

export function GraphPanel({
  doctrine,
  casualty,
  prompt,
  assessment,
  width,
  onOpen,
}: {
  doctrine: Doctrine;
  casualty: Casualty;
  prompt: Prompt | null;
  assessment: Assessment;
  width: number;
  onOpen: () => void;
}) {
  const t = useTheme();
  const p = useGraphPalette();
  const { network, error } = useNetwork(doctrine);
  const live = useLiveQuery(casualty);
  const height = Math.round(width * 0.5);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="TuringDB graph"
      accessibilityHint="Opens the full doctrine graph"
      onPress={onOpen}
      style={[styles.panel, { borderColor: t.border, backgroundColor: p.canvas }]}>
      {network ? (
        <>
          <FocusGraph
            network={network}
            states={nodeStates(network, casualty, prompt, assessment)}
            width={width - 2}
            height={height}
          />
          <View style={styles.caption}>
            <QueryLine live={live} network={network} compact />
          </View>
          <Text style={[styles.expand, { color: t.textMuted }]}>⤢</Text>
        </>
      ) : (
        <Text style={[styles.status, { color: t.textMuted, height }]}>{error ?? 'Reading the graph from TuringDB…'}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  caption: { paddingHorizontal: 10, paddingBottom: 8 },
  expand: { position: 'absolute', top: 6, right: 10, fontSize: 16 },
  status: { padding: 12, fontSize: 14 },
  queryLine: { gap: 2 },
  engine: { fontSize: 12, fontWeight: '700' },
  query: { fontSize: 11, fontFamily: 'Menlo' },
  legend: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  labelChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  labelChipText: { color: '#0b0b0f', fontSize: 12, fontWeight: '700' },
  ringItem: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 },
  ring: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5 },
  ringText: { fontSize: 13 },
  inspector: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  inspectorHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inspectorTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  close: { fontSize: 20, paddingHorizontal: 4 },
  meta: { fontSize: 12, fontWeight: '700' },
  row: { fontSize: 13, fontFamily: 'Menlo' },
  props: { gap: 2, marginTop: 6 },
  cypher: { fontSize: 10, fontFamily: 'Menlo', marginTop: 4 },
});

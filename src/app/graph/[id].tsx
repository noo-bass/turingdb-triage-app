// The whole TuringDB graph for one casualty, from the graph above their
// questions: their trail lit, pinch to zoom, tap a node to inspect it live.

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nodeStates } from '../../graph/network.ts';
import { GRAPH } from '../../graph/triageGraph.ts';
import { useDoctrine } from '../../state/doctrine.tsx';
import { useCasualty } from '../../state/store.tsx';
import { assess, nextPrompt, type Casualty } from '../../triage/assess.ts';
import type { Doctrine } from '../../triage/doctrine.ts';
import { Label, Screen, ScreenHeader, useTheme } from '../../ui/components.tsx';
import { Inspector, Legend, QueryLine, useLiveQuery, useNetwork, WholeGraph } from '../../ui/GraphView.tsx';
import { size } from '../../ui/theme.ts';

export default function CasualtyGraph() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const casualty = useCasualty(id);
  const doctrine = useDoctrine().doctrine!;

  if (!casualty) {
    return <Redirect href="/" />;
  }
  return <FullGraph doctrine={doctrine} casualty={casualty} />;
}

function FullGraph({ doctrine, casualty }: { doctrine: Doctrine; casualty: Casualty }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { network, error } = useNetwork(doctrine);
  const live = useLiveQuery(casualty);
  const [selected, setSelected] = useState<string | null>(null);

  const graphWidth = width - 2 * size.gutter - 2;
  const graphHeight = Math.round(graphWidth * 1.15);

  return (
    <Screen>
      <ScreenHeader title={`${casualty.name}: graph`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Label muted style={styles.subtitle}>
          Graph {GRAPH} in the TuringDB engine on this phone. Pinch to zoom, tap a node to inspect it.
        </Label>

        {network ? (
          <>
            {/* iOS zooms a ScrollView's content natively */}
            <ScrollView
              maximumZoomScale={5}
              minimumZoomScale={1}
              bouncesZoom
              centerContent
              style={[styles.zoom, { borderColor: t.border, height: graphHeight + 2 }]}>
              <WholeGraph
                network={network}
                states={nodeStates(network, casualty, nextPrompt(doctrine, casualty), assess(doctrine, casualty))}
                width={graphWidth}
                height={graphHeight}
                selected={selected}
                onSelect={setSelected}
              />
            </ScrollView>

            {selected && <Inspector network={network} id={selected} onClose={() => setSelected(null)} />}

            <Legend />
            <QueryLine live={live} network={network} />

            <Text style={[styles.heading, { color: t.text }]}>How this graph was read</Text>
            {network.queries.map((q, i) => (
              <View key={i} style={[styles.query, { borderColor: t.border, backgroundColor: t.surface }]}>
                <Text style={[styles.queryMeta, { color: t.accent }]}>
                  {q.ms} ms · {q.rows} rows
                </Text>
                <Text style={[styles.cypher, { color: t.textMuted }]}>{q.cypher}</Text>
              </View>
            ))}
          </>
        ) : (
          <Label muted>{error ?? 'Reading the graph from TuringDB…'}</Label>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: size.gutter, gap: 14 },
  subtitle: { fontSize: 15 },
  zoom: { borderWidth: 1, borderRadius: 14 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  query: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  queryMeta: { fontSize: 12, fontWeight: '700' },
  cypher: { fontSize: 11, fontFamily: 'Menlo' },
});

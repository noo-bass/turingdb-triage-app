import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { GRAPH, query } from '../graph/triageGraph.ts';

// Engine check: the on-device TuringDB answers four spec queries from the
// triage graph, with timings. Reached from the home screen's menu.
type Check = { label: string; cypher: string; result?: string; ms?: number; error?: string };

const CHECKS: Check[] = [
  { label: 'Injuries', cypher: 'MATCH (n:Injury) RETURN count(n) AS n' },
  {
    label: 'Categories',
    cypher: 'MATCH (t:TriageCategory) RETURN t.key AS key ORDER BY t.rank',
  },
  {
    label: 'Massive haemorrhage',
    cypher:
      "MATCH (i:Injury)-[:TRIAGES_TO]->(t:TriageCategory) WHERE i.key = 'massive_haemorrhage' RETURN t.key AS key",
  },
  {
    label: 'Torso trauma + struggling to breathe',
    cypher:
      "MATCH (f:Finding)-[:PART_OF]->(c:Condition)-[:INDICATES]->(i:Injury) WHERE f.key = 'torso_trauma' OR f.key = 'breathing_distress' WITH c, i, count(f) AS answered WHERE answered = c.size RETURN DISTINCT i.key AS key",
  },
];

export default function EngineCheck() {
  const [checks, setChecks] = useState<Check[]>(CHECKS);

  useEffect(() => {
    (async () => {
      const done: Check[] = [];
      for (const check of CHECKS) {
        const t0 = Date.now();
        try {
          const rows = await query(check.cypher);
          const result = rows.map((r) => Object.values(r).join(' ')).join(', ') || '(none)';
          done.push({ ...check, result, ms: Date.now() - t0 });
        } catch (e) {
          done.push({ ...check, error: String(e) });
        }
        setChecks([...done, ...CHECKS.slice(done.length)]);
      }
    })();
  }, []);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>TuringDB on this phone</Text>
        <Text style={styles.subtitle}>graph {GRAPH}</Text>
        {checks.map((c) => (
          <View key={c.label} style={styles.card}>
            <Text style={styles.label}>{c.label}</Text>
            {c.error ? (
              <Text style={styles.error}>{c.error}</Text>
            ) : (
              <Text style={styles.value}>{c.result ?? '...'}</Text>
            )}
            {c.ms !== undefined && <Text style={styles.ms}>{c.ms} ms</Text>}
          </View>
        ))}
      </ScrollView>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingTop: 80, gap: 16 },
  title: { color: '#fff', fontSize: 30, fontWeight: '700' },
  subtitle: { color: '#8a8a8a', fontSize: 18, marginBottom: 8 },
  card: { backgroundColor: '#141414', borderRadius: 16, padding: 20, gap: 6 },
  label: { color: '#8a8a8a', fontSize: 18 },
  value: { color: '#fff', fontSize: 28, fontWeight: '600' },
  error: { color: '#ff6b6b', fontSize: 18 },
  ms: { color: '#5a5a5a', fontSize: 16 },
});

// Who goes in the seats, and why. Ties are shown side by side, never picked.

import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoctrine } from '../state/doctrine.tsx';
import { useStore } from '../state/store.tsx';
import { planSeats, type Placement } from '../triage/seats.ts';
import {
  BigButton,
  CategoryBadge,
  DraftBanner,
  IconButton,
  Label,
  Screen,
  sourceLine,
  useTheme,
} from '../ui/components.tsx';
import { size } from '../ui/theme.ts';
import { useNow } from '../ui/useNow.ts';

export default function Seats() {
  const { state, dispatch } = useStore();
  const doctrine = useDoctrine().doctrine!;
  const insets = useSafeAreaInsets();
  const now = useNow();
  const t = useTheme();

  const plan = planSeats(doctrine, state.casualties, state.seats, now);
  const group = (seat: Placement['seat']) => plan.order.filter((p) => p.seat === seat);
  const contested = group('contested');

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="back" label="All casualties" onPress={() => router.navigate('/')} />
        <Text style={[styles.title, { color: t.text }]}>Seats</Text>
      </View>

      <View style={styles.stepper}>
        <BigButton
          label="-"
          onPress={() => dispatch({ type: 'seats', seats: state.seats - 1 })}
          style={styles.stepButton}
        />
        <Text style={[styles.count, { color: t.text }]} accessibilityLabel={`${state.seats} seats`}>
          {state.seats}
        </Text>
        <BigButton
          label="+"
          onPress={() => dispatch({ type: 'seats', seats: state.seats + 1 })}
          style={styles.stepButton}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Group title="Seated" people={group('yes')} />
        {contested.length > 0 && (
          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: t.warning }]}>
              Contested: {plan.contestedSeats} {plan.contestedSeats === 1 ? 'seat' : 'seats'} for{' '}
              {contested.length}
            </Text>
            <Label style={{ color: t.warning }}>
              No rule separates these. Medic or commander call. Default order shown.
            </Label>
            <View style={styles.sideBySide}>
              {contested.map((p) => (
                <Card key={p.casualty.id} placement={p} compact />
              ))}
            </View>
          </View>
        )}
        <Group title="Waits" people={group('no')} />
        <DraftBanner />
      </ScrollView>
    </Screen>
  );
}

function Group({ title, people }: { title: string; people: Placement[] }) {
  const t = useTheme();
  if (people.length === 0) {
    return null;
  }
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: t.text }]}>{title}</Text>
      {people.map((p) => (
        <Card key={p.casualty.id} placement={p} />
      ))}
    </View>
  );
}

function Card({ placement, compact }: { placement: Placement; compact?: boolean }) {
  const t = useTheme();
  const { casualty, assessment, reasons } = placement;
  return (
    <View
      style={[styles.card, compact && styles.compact, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.name, { color: t.text }]}>{casualty.name}</Text>
        <CategoryBadge category={assessment.category} />
      </View>
      {reasons.map((r, i) => {
        const source = r.sources ? sourceLine(r.sources) : null;
        return (
          <Label key={i} muted={r.basis === 'product_rule'} style={styles.reason}>
            {r.text}
            {r.basis === 'doctrine' ? ` (Doctrine${source ? `, ${source}` : ''})` : ' (Our rule)'}
          </Label>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: size.gutter },
  title: { fontSize: 34, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: size.gutter },
  stepButton: { width: 96, height: 96 },
  count: { flex: 1, textAlign: 'center', fontSize: 64, fontWeight: '800' },
  body: { padding: size.gutter, gap: 20 },
  group: { gap: 10 },
  groupTitle: { fontSize: size.textLarge, fontWeight: '800' },
  sideBySide: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { borderRadius: size.radius, borderWidth: 1, padding: 16, gap: 8 },
  compact: { flexBasis: '47%', flexGrow: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 32, fontWeight: '800' },
  reason: { fontSize: 17 },
});

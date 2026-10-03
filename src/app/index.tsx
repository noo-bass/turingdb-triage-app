// Home: every casualty, in seat order, with what matters at a glance.

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoctrine } from '../state/doctrine.tsx';
import { useStore } from '../state/store.tsx';
import { nextPrompt } from '../triage/assess.ts';
import { planSeats, type Placement } from '../triage/seats.ts';
import {
  BigButton,
  CategoryBadge,
  DraftBanner,
  IconButton,
  Label,
  Screen,
  ScreenHeader,
  useTheme,
} from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { formatDuration } from '../triage/format.ts';
import { size } from '../ui/theme.ts';
import { useNow } from '../ui/useNow.ts';

export default function Home() {
  const { state, dispatch } = useStore();
  const { doctrine } = useDoctrine();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const t = useTheme();

  const plan = planSeats(doctrine!, state.casualties, state.seats, now);
  const tooFewSeats = state.casualties.length > state.seats;

  const add = () => {
    const created = Date.now();
    const id = `c${created}`;
    dispatch({ type: 'add', id, now: created });
    router.push(`/casualty/${id}`);
  };

  return (
    <Screen>
      <ScreenHeader
        title="Casualties"
        big
        right={
          <>
            <IconButton
              icon={state.mode === 'red' ? 'sun' : 'moon'}
              label={state.mode === 'red' ? 'Normal colours' : 'Red night mode'}
              onPress={() => dispatch({ type: 'mode', mode: state.mode === 'red' ? 'dark' : 'red' })}
            />
            <IconButton icon="list" label="Engine check" onPress={() => router.push('/engine-check')} />
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.list}>
        <DraftBanner />
        {plan.order.length === 0 && (
          <Label muted style={styles.empty}>
            No casualties yet. Add each one, then answer the questions for them. You can switch between them
            at any time.
          </Label>
        )}
        {plan.order.map((p) => (
          <CasualtyCard key={p.casualty.id} placement={p} now={now} showSeat={tooFewSeats} />
        ))}
        {plan.contestedSeats > 0 && (
          <Label style={{ color: t.warning }}>
            {plan.contestedSeats === 1 ? 'The last seat is' : `${plan.contestedSeats} seats are`} a medic or
            commander call. Open Seats to compare.
          </Label>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderColor: t.border }]}>
        {state.casualties.length > 0 && (
          <BigButton label={`Seats: ${state.seats}`} icon="seat" onPress={() => router.push('/seats')} />
        )}
        {/* Add sits lowest, under the thumb: it is the first thing done here */}
        <BigButton label="Add casualty" icon="plus" onPress={add} />
      </View>
    </Screen>
  );
}

function CasualtyCard({
  placement,
  now,
  showSeat,
}: {
  placement: Placement;
  now: number;
  showSeat: boolean;
}) {
  const t = useTheme();
  const doctrine = useDoctrine().doctrine!;
  const { casualty, assessment, seat } = placement;
  const next = nextPrompt(doctrine, casualty);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${casualty.name}, open`}
      onPress={() => router.push(`/casualty/${casualty.id}`)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? t.surfacePressed : t.surface, borderColor: t.border },
      ]}>
      <View style={styles.cardTop}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={size.maxTextScale}
          style={[styles.name, { color: t.text }]}>
          {casualty.name}
        </Text>
        <CategoryBadge category={assessment.category} />
      </View>
      {showSeat && (
        <Label style={[styles.seat, { color: seat === 'contested' ? t.warning : t.text }]}>
          {seat === 'yes' ? 'Seat' : seat === 'no' ? 'Waits' : 'Contested seat'}
        </Label>
      )}
      {casualty.tourniquetAt !== null && (
        <View style={styles.row}>
          <Icon name="clock" color={t.warning} size={22} />
          <Label style={{ color: t.warning }}>Tourniquet {formatDuration(now - casualty.tourniquetAt)}</Label>
        </View>
      )}
      <View style={styles.row}>
        <Label muted style={styles.next}>
          {next ? `Next: ${next.question.label}` : 'All questions answered'}
        </Label>
        <Icon name="chevron" color={t.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: size.gutter, gap: 14 },
  empty: { marginTop: 24, lineHeight: 28 },
  card: { borderRadius: size.radius, borderWidth: 1, padding: 18, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 40, fontWeight: '800', flexShrink: 1 },
  seat: { fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  next: { flex: 1 },
  footer: {
    gap: 12,
    paddingHorizontal: size.gutter,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});

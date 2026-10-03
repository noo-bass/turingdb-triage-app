// Everyone, grouped by category in priority order: the sieve's answer before
// any tie-break. Expectant and not-ranked casualties are always listed.

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoctrine } from '../state/doctrine.tsx';
import { useStore } from '../state/store.tsx';
import { nextToSieve } from '../triage/assess.ts';
import { planOrder, type Placement } from '../triage/order.ts';
import { tieQuestionsLeft } from '../triage/ties.ts';
import {
  BigButton,
  CasualtyPhoto,
  CategoryBadge,
  DraftBanner,
  Label,
  ReasonLines,
  Screen,
  ScreenHeader,
  useTheme,
} from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { size } from '../ui/theme.ts';
import { useNow } from '../ui/useNow.ts';

// The category order of planOrder; null is "not ranked by triage doctrine"
const GROUPS: (string | null)[] = ['immediate', 'delayed', 'minimal', null, 'expectant'];

export default function Categories() {
  const { state, dispatch } = useStore();
  const doctrine = useDoctrine().doctrine!;
  const insets = useSafeAreaInsets();
  const now = useNow();
  const t = useTheme();

  const order = planOrder(doctrine, state.casualties, now);
  const unfinished = nextToSieve(doctrine, state.casualties);
  const ties = tieQuestionsLeft(doctrine, state.casualties, now);

  const add = () => {
    const created = Date.now();
    const id = `c${created}`;
    dispatch({ type: 'add', id, now: created });
    router.push(`/casualty/${id}`);
  };

  return (
    <Screen>
      <ScreenHeader title="By category" onBack={() => router.navigate('/')} />

      <ScrollView contentContainerStyle={styles.body}>
        {GROUPS.map((key) => {
          const people = order.filter((p) => (p.assessment.category?.key ?? null) === key);
          return people.length === 0 ? null : (
            <View key={key ?? 'unranked'} style={styles.group}>
              <View style={styles.groupTop}>
                <CategoryBadge category={people[0].assessment.category} />
                <Text
                  maxFontSizeMultiplier={size.maxTextScale}
                  style={[styles.groupCount, { color: t.text }]}>
                  {people.length}
                </Text>
              </View>
              {people.map((p) => (
                <Row key={p.casualty.id} placement={p} />
              ))}
            </View>
          );
        })}
        {ties > 0 && (
          <Label style={{ color: t.warning }}>
            Some casualties share a category. A few more questions about them can put them in order.
          </Label>
        )}
        <DraftBanner />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderColor: t.border }]}>
        {unfinished ? (
          <BigButton
            label={`Continue: ${unfinished.name}`}
            icon="chevron"
            onPress={() => router.push(`/casualty/${unfinished.id}`)}
          />
        ) : ties > 0 ? (
          <BigButton
            label={`Order the ties (up to ${ties})`}
            icon="chevron"
            color={t.yes}
            textColor={t.onAnswer}
            onPress={() => router.push('/ties')}
          />
        ) : (
          <BigButton
            label="Final order"
            icon="chevron"
            color={t.yes}
            textColor={t.onAnswer}
            onPress={() => router.push('/order')}
          />
        )}
        <BigButton label="Add casualty" icon="plus" onPress={add} />
      </View>
    </Screen>
  );
}

function Row({ placement }: { placement: Placement }) {
  const t = useTheme();
  const { casualty, reasons } = placement;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${casualty.name}, what to do`}
      onPress={() => router.push(`/summary/${casualty.id}`)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? t.surfacePressed : t.surface, borderColor: t.border },
      ]}>
      <CasualtyPhoto casualty={casualty} size={48} />
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={size.maxTextScale} style={[styles.name, { color: t.text }]}>
          {casualty.name}
        </Text>
        <ReasonLines reasons={reasons.slice(0, 1)} />
      </View>
      <Icon name="chevron" color={t.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: size.gutter, gap: 20 },
  group: { gap: 10 },
  groupTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupCount: { fontSize: size.textLarge, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: size.radius,
    borderWidth: 1,
    padding: 16,
    minHeight: size.minTarget,
  },
  rowText: { flex: 1, gap: 4 },
  name: { fontSize: 30, fontWeight: '800' },
  footer: { gap: 12, paddingHorizontal: size.gutter, paddingTop: 12, borderTopWidth: 1 },
});

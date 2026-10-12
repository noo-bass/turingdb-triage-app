// Home. No casualties: "How many?" and Start. Otherwise every casualty in
// priority order, Continue to whoever still has questions, Add, and Reset.

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoctrine } from '../state/doctrine.tsx';
import { useStore } from '../state/store.tsx';
import { nextPrompt, nextToSieve } from '../triage/assess.ts';
import { formatDuration } from '../triage/format.ts';
import { planOrder, type Placement } from '../triage/order.ts';
import { progress } from '../triage/progress.ts';
import {
  BigButton,
  CasualtyPhoto,
  CategoryBadge,
  DraftBanner,
  IconButton,
  Label,
  Screen,
  ScreenHeader,
  useTheme,
} from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { size } from '../ui/theme.ts';
import { useNow } from '../ui/useNow.ts';

const MAX_START = 20;

export default function Home() {
  const { state, dispatch } = useStore();
  const { doctrine } = useDoctrine();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const t = useTheme();
  const [count, setCount] = useState(1);
  const [confirmReset, setConfirmReset] = useState(false);

  const order = planOrder(doctrine!, state.casualties, now);
  const next = nextToSieve(doctrine!, state.casualties);

  const start = () => {
    const at = Date.now();
    dispatch({ type: 'start', count, now: at });
    router.push(`/casualty/c${at}-0`);
  };

  const add = () => {
    const created = Date.now();
    const id = `c${created}`;
    dispatch({ type: 'add', id, now: created });
    router.push(`/casualty/${id}`);
  };

  const header = (
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
          <IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />
        </>
      }
    />
  );

  if (state.casualties.length === 0) {
    return (
      <Screen>
        {header}
        <View style={styles.picker}>
          <Text maxFontSizeMultiplier={size.maxTextScale} style={[styles.ask, { color: t.text }]}>
            How many casualties?
          </Text>
          <View style={styles.stepper}>
            <BigButton
              label="-"
              onPress={() => setCount((n) => Math.max(1, n - 1))}
              style={styles.stepButton}
              accessibilityHint="One fewer casualty"
            />
            <Text
              maxFontSizeMultiplier={size.maxTextScale}
              style={[styles.count, { color: t.text }]}
              accessibilityLabel={`${count} casualties`}>
              {count}
            </Text>
            <BigButton
              label="+"
              onPress={() => setCount((n) => Math.min(MAX_START, n + 1))}
              style={styles.stepButton}
              accessibilityHint="One more casualty"
            />
          </View>
          <Label muted style={styles.hint}>
            A guess is fine: you can add more later.
          </Label>
        </View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderColor: t.border }]}>
          <BigButton big label="Start" icon="chevron" onPress={start} color={t.yes} textColor={t.onAnswer} />
          <DraftBanner />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {header}

      <ScrollView contentContainerStyle={styles.list}>
        <DraftBanner />
        {order.map((p) => (
          <CasualtyCard key={p.casualty.id} placement={p} now={now} />
        ))}
        {/* Down here, away from the thumb, and two taps: it clears everyone */}
        <BigButton
          label={confirmReset ? 'Tap again: clear all' : 'Reset'}
          icon="undo"
          color={confirmReset ? t.no : t.background}
          onPress={() => {
            if (!confirmReset) {
              setConfirmReset(true);
              return;
            }
            setConfirmReset(false);
            dispatch({ type: 'reset' });
          }}
          accessibilityHint="Clears every casualty and starts again"
          style={styles.reset}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderColor: t.border }]}>
        {next ? (
          <BigButton
            label={`Continue: ${next.name}`}
            icon="chevron"
            onPress={() => router.push(`/casualty/${next.id}`)}
          />
        ) : (
          <BigButton label="See everyone" icon="list" onPress={() => router.push('/categories')} />
        )}
        <BigButton label="Add casualty" icon="plus" onPress={add} />
      </View>
    </Screen>
  );
}

function CasualtyCard({ placement, now }: { placement: Placement; now: number }) {
  const t = useTheme();
  const doctrine = useDoctrine().doctrine!;
  const { casualty, assessment } = placement;
  const next = nextPrompt(doctrine, casualty);
  const { answered, total } = progress(doctrine, casualty, next);
  const more = total - answered;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${casualty.name}, open`}
      onPress={() => router.push(next ? `/casualty/${casualty.id}` : `/summary/${casualty.id}`)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? t.surfacePressed : t.surface, borderColor: t.border },
      ]}>
      <View style={styles.cardTop}>
        <CasualtyPhoto casualty={casualty} />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={size.maxTextScale}
          style={[styles.name, { color: t.text }]}>
          {casualty.name}
        </Text>
        <CategoryBadge category={assessment.category} />
      </View>
      {casualty.tourniquetAt !== null && (
        <View style={styles.row}>
          <Icon name="clock" color={t.warning} size={22} />
          <Label style={{ color: t.warning }}>Tourniquet {formatDuration(now - casualty.tourniquetAt)}</Label>
        </View>
      )}
      <View style={styles.row}>
        <Label muted style={styles.next}>
          {!next
            ? 'Sieve done: what to do'
            : next.kind === 'kit'
              ? 'Kit check next'
              : `Question ${answered + 1}${more > 1 ? `, up to ${more - 1} more` : ''}`}
        </Label>
        <Icon name="chevron" color={t.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  picker: { flex: 1, justifyContent: 'center', padding: size.gutter, gap: 24 },
  ask: { fontSize: size.question, fontWeight: '800', textAlign: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepButton: { width: 96, height: 96 },
  count: { flex: 1, textAlign: 'center', fontSize: 96, fontWeight: '800' },
  hint: { textAlign: 'center' },
  list: { padding: size.gutter, gap: 14 },
  reset: { marginTop: 24 },
  card: { borderRadius: size.radius, borderWidth: 1, padding: 18, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // the name keeps its width; the badge shrinks (a cut-off name could be misread)
  name: { fontSize: 40, fontWeight: '800', flexGrow: 1, flexShrink: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  next: { flex: 1 },
  footer: {
    gap: 12,
    paddingHorizontal: size.gutter,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});

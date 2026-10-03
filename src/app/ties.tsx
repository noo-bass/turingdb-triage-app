// Tie-break: one question at a time, only about casualties that share a
// category with nothing yet separating them, and only when the answer could
// change their order. When none is left, on to the final order.

import { Redirect, router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoctrine } from '../state/doctrine.tsx';
import { useStore } from '../state/store.tsx';
import { assess, type Answer } from '../triage/assess.ts';
import { nextTieQuestion, tieQuestionsLeft, TOURNIQUET_BUCKETS } from '../triage/ties.ts';
import {
  BigButton,
  CasualtyPhoto,
  categoryWord,
  Label,
  Screen,
  ScreenHeader,
  useTheme,
} from '../ui/components.tsx';
import { size } from '../ui/theme.ts';
import { useNow } from '../ui/useNow.ts';

export default function Ties() {
  const { state, dispatch } = useStore();
  const doctrine = useDoctrine().doctrine!;
  const insets = useSafeAreaInsets();
  const now = useNow();
  const t = useTheme();

  const q = nextTieQuestion(doctrine, state.casualties, now);
  if (!q) {
    return <Redirect href="/order" />;
  }
  const left = tieQuestionsLeft(doctrine, state.casualties, now);
  const { id, name } = q.casualty;
  const category = categoryWord(assess(doctrine, q.casualty).category?.key ?? null);
  const others = q.tiedWith.map((c) => c.name).join(', ');
  // the shock question exactly as the sieve words it
  const shock = doctrine.questions.find((x) => x.key === 'haemorrhagic_shock');

  const recheck = (value: Answer) => dispatch({ type: 'tieRecheck', id, value });

  return (
    <Screen>
      <ScreenHeader title="Order the ties" onBack={() => router.navigate('/categories')} />

      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        maxFontSizeMultiplier={size.maxTextScale}
        style={[styles.progress, { color: t.textMuted }]}>
        Tie question {state.tieHistory.length + 1} ·{' '}
        {left > 1 ? `up to ${left - 1} more` : 'could be the last'}
      </Text>

      <ScrollView style={styles.flex} contentContainerStyle={styles.question}>
        <CasualtyPhoto casualty={q.casualty} size={96} />
        <Label muted style={styles.context}>
          {name} · {category} · TIED WITH {others}
        </Label>
        <Text
          maxFontSizeMultiplier={size.maxTextScale}
          style={[styles.questionText, { color: t.text }]}
          accessibilityRole="header">
          {q.kind === 'tourniquet'
            ? `Does ${name} have a tourniquet on? For how long?`
            : `Check ${name} again. ${shock?.label ?? 'Confused, bleeding, or weak wrist pulse?'}`}
        </Text>
        {q.kind === 'recheck' && shock?.cue && (
          <Label muted style={styles.cue}>
            {shock.cue}
          </Label>
        )}
        <Label muted style={styles.why}>
          {q.kind === 'tourniquet'
            ? `Asked because nothing yet separates them from ${others}. Longest tourniquet goes first. Our rule, for medic review.`
            : `Asked because nothing yet separates them from ${others}. Signs of shock go first. Our rule, for medic review.`}
        </Label>
      </ScrollView>

      <View style={[styles.answers, { paddingBottom: insets.bottom + 12 }]}>
        {q.kind === 'tourniquet' ? (
          <>
            <BigButton
              label="No tourniquet"
              icon="cross"
              onPress={() => dispatch({ type: 'tieTourniquet', id, window: 'none' })}
            />
            {TOURNIQUET_BUCKETS.map((b) => (
              <BigButton
                key={b.label}
                label={b.label}
                icon="clock"
                onPress={() => dispatch({ type: 'tieTourniquet', id, window: b.window(Date.now()) })}
              />
            ))}
          </>
        ) : (
          <>
            <View style={styles.yesNo}>
              <BigButton
                big
                label="YES"
                icon="check"
                color={t.yes}
                textColor={t.onAnswer}
                onPress={() => recheck('yes')}
                style={styles.answer}
              />
              <BigButton
                big
                label="NO"
                icon="cross"
                color={t.no}
                textColor={t.onAnswer}
                onPress={() => recheck('no')}
                style={styles.answer}
              />
            </View>
            <BigButton label="Not sure" icon="help" onPress={() => recheck('unsure')} />
          </>
        )}
        {state.tieHistory.length > 0 && (
          <BigButton label="Undo" icon="undo" onPress={() => dispatch({ type: 'tieUndo' })} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progress: { paddingHorizontal: size.gutter, fontSize: 17, fontWeight: '600' },
  question: { flexGrow: 1, justifyContent: 'center', padding: size.gutter, gap: 12 },
  context: { fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  questionText: { fontSize: 30, fontWeight: '800', lineHeight: 36 },
  cue: { fontSize: 22, lineHeight: 30 },
  why: { fontSize: 17, lineHeight: 23 },
  answers: { paddingHorizontal: size.gutter, gap: 10 },
  yesNo: { flexDirection: 'row', gap: 12, height: 160 },
  answer: { flex: 1, flexDirection: 'column' },
});

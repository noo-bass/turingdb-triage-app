// One casualty, one question at a time. YES and NO fill the bottom half of the
// screen so they can be hit with a gloved thumb without looking twice.

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoctrine } from '../../state/doctrine.tsx';
import { useCasualty, useStore } from '../../state/store.tsx';
import { assess, nextPrompt } from '../../triage/assess.ts';
import {
  BigButton,
  CategoryBadge,
  IconButton,
  Label,
  Screen,
  sourceLine,
  useTheme,
} from '../../ui/components.tsx';
import { formatDuration } from '../../triage/format.ts';
import { size } from '../../ui/theme.ts';
import { useNow } from '../../ui/useNow.ts';

const SECTION_NAMES: Record<string, string> = {
  m: 'Massive bleeding',
  a: 'Airway',
  r: 'Breathing',
  c: 'Circulation',
  h: 'Head and hypothermia',
  paws_p: 'Pain',
  paws_a: 'Antibiotics',
  paws_w: 'Wounds',
  paws_s: 'Splints and eyes',
};

export default function CasualtyQuestions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const casualty = useCasualty(id);
  const doctrine = useDoctrine().doctrine!;
  const { dispatch } = useStore();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const t = useTheme();

  if (!casualty) {
    return <Redirect href="/" />;
  }

  const prompt = nextPrompt(doctrine, casualty);
  if (!prompt) {
    return <Redirect href={`/summary/${casualty.id}`} />;
  }
  const { category } = assess(doctrine, casualty);

  const reply = (value: 'yes' | 'no' | 'unsure') => {
    if (prompt.kind === 'kit') {
      dispatch({ type: 'kit', id: casualty.id, kit: prompt.question.kit, has: value === 'yes' });
    } else {
      dispatch({ type: 'answer', id: casualty.id, question: prompt.question.key, value });
    }
  };

  const question = prompt.question;
  const context = prompt.kind === 'kit' ? 'Kit' : (SECTION_NAMES[prompt.question.section] ?? '');
  const cue = prompt.kind === 'question' ? prompt.question.cue : null;
  const source = prompt.kind === 'question' ? sourceLine(prompt.question.sources) : null;

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="back" label="All casualties" onPress={() => router.navigate('/')} />
        <Text style={[styles.name, { color: t.text }]}>{casualty.name}</Text>
        <CategoryBadge category={category} />
        <View style={styles.spacer} />
        <IconButton icon="medic" label="What to do" onPress={() => router.push(`/summary/${casualty.id}`)} />
      </View>

      <View style={styles.question}>
        <Label muted style={styles.context}>
          {context.toUpperCase()}
        </Label>
        <Text style={[styles.questionText, { color: t.text }]} accessibilityRole="header">
          {question.label}
        </Text>
        {cue && (
          <Label muted style={styles.cue}>
            {cue}
          </Label>
        )}
        {source && (
          <Label muted style={styles.source}>
            {source}
          </Label>
        )}
      </View>

      <View style={[styles.answers, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.yesNo}>
          <BigButton
            big
            label="YES"
            icon="check"
            color={t.yes}
            textColor={t.onAnswer}
            onPress={() => reply('yes')}
            style={styles.answer}
          />
          <BigButton
            big
            label="NO"
            icon="cross"
            color={t.no}
            textColor={t.onAnswer}
            onPress={() => reply('no')}
            style={styles.answer}
          />
        </View>
        <View style={styles.secondary}>
          {prompt.kind === 'question' && (
            <BigButton label="Not sure" icon="help" onPress={() => reply('unsure')} style={styles.flex} />
          )}
          <BigButton
            label="Undo"
            icon="undo"
            onPress={() => dispatch({ type: 'undo', id: casualty.id })}
            style={styles.flex}
          />
        </View>
        {casualty.tourniquetAt === null ? (
          <BigButton
            label="Tourniquet applied"
            icon="clock"
            onPress={() => dispatch({ type: 'tourniquet', id: casualty.id, now: Date.now() })}
            accessibilityHint="Starts the tourniquet timer. Never remove a tourniquet."
          />
        ) : (
          <Label style={[styles.tourniquet, { color: t.warning }]}>
            Tourniquet on {formatDuration(now - casualty.tourniquetAt)}. Do not remove.
          </Label>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: size.gutter },
  name: { fontSize: 30, fontWeight: '800' },
  spacer: { flex: 1 },
  question: { flex: 1, justifyContent: 'center', paddingHorizontal: size.gutter, gap: 12 },
  context: { fontSize: 16, fontWeight: '700', letterSpacing: 1.5 },
  questionText: { fontSize: size.question, fontWeight: '800', lineHeight: size.question * 1.2 },
  cue: { fontSize: 22, lineHeight: 30 },
  source: { fontSize: 15 },
  answers: { paddingHorizontal: size.gutter, gap: 12 },
  yesNo: { flexDirection: 'row', gap: 12, height: 200 },
  answer: { flex: 1, flexDirection: 'column' },
  secondary: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  tourniquet: { fontWeight: '700', textAlign: 'center', paddingVertical: 12 },
});

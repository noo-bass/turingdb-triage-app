// One casualty, one question at a time. YES and NO fill the bottom of the
// screen so they can be hit with a gloved thumb without looking twice. Above
// them: how far through the questions this casualty is, and why this one.

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoctrine } from '../../state/doctrine.tsx';
import { useCasualty, useStore } from '../../state/store.tsx';
import { assess, nextPrompt } from '../../triage/assess.ts';
import { formatDuration } from '../../triage/format.ts';
import { progress, SECTION_NAMES, whyAsked, type Progress, type Why } from '../../triage/progress.ts';
import {
  BigButton,
  CasualtyPhoto,
  CategoryBadge,
  categoryWord,
  IconButton,
  Label,
  Screen,
  ScreenHeader,
  sourceLine,
  useTheme,
} from '../../ui/components.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { size } from '../../ui/theme.ts';
import { useNow } from '../../ui/useNow.ts';

export default function CasualtyQuestions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const casualty = useCasualty(id);
  const doctrine = useDoctrine().doctrine!;
  const { state, dispatch } = useStore();
  const { casualties } = state;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const now = useNow();
  const t = useTheme();
  // which prompt the "why" panel is open for: a new question starts closed
  const [whyFor, setWhyFor] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  if (!casualty) {
    return <Redirect href="/" />;
  }

  const prompt = nextPrompt(doctrine, casualty);
  if (!prompt) {
    return <Redirect href={`/summary/${casualty.id}`} />;
  }
  const { category } = assess(doctrine, casualty);
  const where = progress(doctrine, casualty, prompt);
  const who = `Casualty ${casualties.indexOf(casualty) + 1} of ${casualties.length}`;

  const reply = (value: 'yes' | 'no' | 'unsure') => {
    if (prompt.kind === 'kit') {
      dispatch({ type: 'kit', id: casualty.id, kit: prompt.question.kit, has: value === 'yes' });
    } else {
      dispatch({ type: 'answer', id: casualty.id, question: prompt.question.key, value });
    }
  };

  const question = prompt.question;
  const promptKey = `${prompt.kind}:${question.key}`;
  const whyOpen = whyFor === promptKey;
  const context = prompt.kind === 'kit' ? 'Kit' : (SECTION_NAMES[prompt.question.section] ?? '');
  const cue = prompt.kind === 'question' ? prompt.question.cue : null;
  // big enough for a gloved thumb, small enough to leave the question room
  const yesNoHeight = Math.max(140, Math.min(200, Math.round(height * 0.2)));

  return (
    <Screen>
      <ScreenHeader
        title={casualty.name}
        onBack={() => router.navigate('/')}
        badge={<CategoryBadge category={category} compact />}
        right={
          <IconButton
            icon="medic"
            label="What to do"
            onPress={() => router.push(`/summary/${casualty.id}`)}
          />
        }
      />

      {/* their photo beside where we are: tap it to take one */}
      <View style={styles.idRow}>
        <CasualtyPhoto casualty={casualty} editable />
        <View style={styles.flex}>
          <ProgressStrip progress={where} kit={prompt.kind === 'kit'} who={who} />
        </View>
      </View>

      {/* Scrolls rather than clips when a long question, cue and the why
          panel together outgrow the space above the answers */}
      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.question}
        onContentSizeChange={() => whyOpen && scroll.current?.scrollToEnd()}>
        <Label muted style={styles.context}>
          {context.toUpperCase()}
        </Label>
        <Text
          maxFontSizeMultiplier={size.maxTextScale}
          style={[styles.questionText, { color: t.text }]}
          accessibilityRole="header">
          {question.label}
        </Text>
        {cue && (
          <Label muted style={styles.cue}>
            {cue}
          </Label>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: whyOpen }}
          hitSlop={12}
          onPress={() => setWhyFor(whyOpen ? null : promptKey)}
          style={({ pressed }) => [
            styles.whyButton,
            { borderColor: t.border, backgroundColor: pressed ? t.surfacePressed : t.surface },
          ]}>
          <Icon name="info" color={t.text} size={22} />
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            maxFontSizeMultiplier={size.maxTextScale}
            style={[styles.whyButtonText, { color: t.text }]}>
            {whyOpen ? 'Hide why' : 'Why are we asking this?'}
          </Text>
        </Pressable>
        {whyOpen && <WhyPanel why={whyAsked(doctrine, casualty, prompt)} />}
      </ScrollView>

      <View style={[styles.answers, { paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.yesNo, { height: yesNoHeight }]}>
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

// M A R C H P, each a box with its letter (so it reads in red night mode
// without colour): filled when done, outlined when current, dim to do,
// dashed when the sieve will not go there
function ProgressStrip({ progress: p, kit, who }: { progress: Progress; kit: boolean; who: string }) {
  const t = useTheme();
  // "up to": a yes ends the sieve early, so it is a ceiling, never a promise
  const more = p.total - p.answered - 1;
  const line = kit
    ? `${who} · Kit check`
    : `${who} · Question ${p.answered + 1} · ${more > 0 ? `up to ${more} more` : 'could be the last'}`;
  return (
    <View style={styles.progress}>
      <View
        style={styles.strip}
        accessible
        accessibilityLabel={p.groups
          .map(
            (g) =>
              `${g.name} ${g.state === 'todo' ? 'to do' : g.state === 'skipped' ? 'not needed' : g.state}`,
          )
          .join(', ')}>
        {p.groups.map((g) => (
          <View
            key={g.letter}
            style={[
              styles.segment,
              g.state === 'done' && { backgroundColor: t.text, borderColor: t.text },
              g.state === 'current' && { borderColor: t.accent, borderWidth: 2 },
              g.state === 'todo' && { borderColor: t.border },
              g.state === 'skipped' && { borderColor: t.border, borderStyle: 'dashed' },
            ]}>
            <Text
              maxFontSizeMultiplier={1}
              style={[
                styles.segmentText,
                {
                  color: g.state === 'done' ? t.background : g.state === 'current' ? t.accent : t.textMuted,
                },
              ]}>
              {g.letter}
            </Text>
          </View>
        ))}
      </View>
      {/* one line, so the question below never jumps as this changes */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        maxFontSizeMultiplier={size.maxTextScale}
        style={[styles.progressLine, { color: t.textMuted }]}>
        {line}
      </Text>
    </View>
  );
}

function WhyPanel({ why }: { why: Why }) {
  const t = useTheme();
  const source = why.sources.length > 0 ? sourceLine(why.sources) : null;
  return (
    <View style={[styles.why, { borderColor: t.border, backgroundColor: t.surface }]}>
      {why.kind === 'kit' ? (
        <>
          <Label style={styles.whyLead}>With it, you can do this now instead of waiting for a medic:</Label>
          {why.steps.map((s) => (
            <Label key={s.label} style={styles.whyItem}>
              {s.label} (for {s.injuries.join(', ')})
            </Label>
          ))}
          <Label muted style={styles.whyItem}>
            Without it, we ask about other kit that does the same job, or the step goes on the medic list.
          </Label>
        </>
      ) : (
        <>
          <Label style={styles.whyLead}>
            {why.couldMake
              ? `Asked because a yes could make them ${categoryWord(why.couldMake)}.`
              : 'Next in the handbook order: MARCH, then PAWS.'}
          </Label>
          {why.points.length === 0 ? (
            <Label style={styles.whyItem}>On its own, a yes here does not change their category.</Label>
          ) : (
            why.points.map((p) => (
              <Label key={`${p.injury}:${p.with.join()}`} style={styles.whyItem}>
                {p.with.length > 0 ? `With a yes to "${p.with.join('" and "')}", a yes` : 'A yes'} points to{' '}
                {p.injury}:{' '}
                {p.category ? categoryWord(p.category) : 'not ranked by triage doctrine, ask a medic'}.
                {p.inferred ? ' (Our reading, for medic review.)' : ''}
              </Label>
            ))
          )}
          {why.quote && (
            <Label muted style={styles.quote}>
              {`"${why.quote}"`}
            </Label>
          )}
          {source && (
            <Label muted style={styles.whySource}>
              {source}
            </Label>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: size.gutter,
    paddingTop: 4,
  },
  progress: { gap: 6 },
  strip: { flexDirection: 'row', gap: 6 },
  segment: {
    flex: 1,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 15, fontWeight: '800' },
  progressLine: { fontSize: 17, fontWeight: '600' },
  question: { flexGrow: 1, justifyContent: 'center', padding: size.gutter, gap: 12 },
  context: { fontSize: 16, fontWeight: '700', letterSpacing: 1.5 },
  questionText: { fontSize: size.question, fontWeight: '800', lineHeight: size.question * 1.2 },
  cue: { fontSize: 22, lineHeight: 30 },
  whyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 1,
  },
  whyButtonText: { fontSize: 18, fontWeight: '700', flexShrink: 1 },
  why: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  whyLead: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  whyItem: { fontSize: 18, lineHeight: 24 },
  quote: { fontSize: 16, lineHeight: 22, fontStyle: 'italic' },
  whySource: { fontSize: 15 },
  answers: { paddingHorizontal: size.gutter, gap: 12 },
  yesNo: { flexDirection: 'row', gap: 12 },
  answer: { flex: 1, flexDirection: 'column' },
  secondary: { flexDirection: 'row', gap: 12 },
  tourniquet: { fontWeight: '700', textAlign: 'center', paddingVertical: 12 },
});

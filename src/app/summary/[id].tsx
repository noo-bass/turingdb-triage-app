// Where the sieve exits: their category, the do-now steps, the medic stop,
// and why, with the doctrine source on every line. Then on to the next casualty.

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoctrine } from '../../state/doctrine.tsx';
import { useCasualty, useStore } from '../../state/store.tsx';
import { assess, nextPrompt, nextToSieve, type StepView } from '../../triage/assess.ts';
import { progress } from '../../triage/progress.ts';
import {
  BigButton,
  CasualtyPhoto,
  CategoryBadge,
  DraftBanner,
  Label,
  Screen,
  ScreenHeader,
  sourceLine,
  useTheme,
} from '../../ui/components.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { formatDuration } from '../../triage/format.ts';
import { size } from '../../ui/theme.ts';
import { useNow } from '../../ui/useNow.ts';

export default function Summary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const casualty = useCasualty(id);
  const doctrine = useDoctrine().doctrine!;
  const { state, dispatch } = useStore();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const t = useTheme();
  const [confirmEvacuated, setConfirmEvacuated] = useState(false);

  if (!casualty) {
    return <Redirect href="/" />;
  }

  const a = assess(doctrine, casualty);
  const next = nextPrompt(doctrine, casualty);
  const moreToAsk = next !== null;
  const { answered, total } = progress(doctrine, casualty, next);
  const nextCasualty = nextToSieve(doctrine, state.casualties, casualty.id);
  const questionLabel = (key: string) => doctrine.questions.find((q) => q.key === key)?.label ?? key;

  return (
    <Screen>
      <ScreenHeader
        title={casualty.name}
        onBack={() => router.navigate('/')}
        badge={<CategoryBadge category={a.category} compact />}
      />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.row}>
          <CasualtyPhoto casualty={casualty} editable size={72} />
          <CategoryBadge category={a.category} />
        </View>
        {a.category === null && (
          <Label style={[styles.callout, { color: t.warning }]}>
            {a.injuries.length === 0
              ? 'Nothing found yet. Not ranked by triage doctrine: this does not mean they can wait.'
              : 'Not ranked by triage doctrine: ask a medic. This does not mean they can wait.'}
          </Label>
        )}

        {casualty.tourniquetAt !== null && (
          <Label style={[styles.callout, { color: t.warning }]}>
            Tourniquet on {formatDuration(now - casualty.tourniquetAt)}. Never remove it. Write the time on
            it.
          </Label>
        )}

        <Section title="Do now" icon="check">
          {a.doNow.length === 0 ? (
            <Label muted>
              {a.askKit.length > 0 ? 'Answer the kit questions first.' : 'Nothing you can do here.'}
            </Label>
          ) : (
            a.doNow.map((s) => <StepRow key={s.label} step={s} />)
          )}
        </Section>

        {a.needsMedic.length > 0 && (
          <Section title="Needs a medic" icon="medic">
            <Label style={styles.medicStop}>Get a medic. They will need to:</Label>
            {a.needsMedic.map((s) => (
              <StepRow key={s.label} step={s} muted />
            ))}
          </Section>
        )}

        {a.injuries.length > 0 && (
          <Section title="Why" icon="help">
            {a.injuries.map((f) => (
              <View key={f.injury.key} style={styles.why}>
                <Label style={styles.injury}>{f.injury.name}</Label>
                {f.because.map((b, i) => (
                  <Label key={i} muted>
                    {b.questions.map(questionLabel).join(' and ')} ({sourceLine(b.sources) ?? 'no source'})
                    {b.basis === 'inferred' ? ' (our reading, for medic review)' : ''}
                  </Label>
                ))}
              </View>
            ))}
          </Section>
        )}

        <DraftBanner />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderColor: t.border }]}>
        {moreToAsk ? (
          <BigButton
            label={answered < total ? `Keep asking (up to ${total - answered})` : 'Keep asking'}
            icon="chevron"
            onPress={() => router.replace(`/casualty/${casualty.id}`)}
          />
        ) : nextCasualty ? (
          <BigButton
            big
            label={`Next: ${nextCasualty.name}`}
            icon="chevron"
            color={t.yes}
            textColor={t.onAnswer}
            onPress={() => router.replace(`/casualty/${nextCasualty.id}`)}
          />
        ) : (
          <BigButton
            big
            label="See everyone"
            icon="list"
            color={t.yes}
            textColor={t.onAnswer}
            onPress={() => router.replace('/categories')}
          />
        )}
        <View style={styles.row}>
          <BigButton label="Casualties" onPress={() => router.navigate('/')} style={styles.flex} />
          <BigButton
            label={confirmEvacuated ? 'Confirm' : 'Evacuated'}
            onPress={() => {
              if (!confirmEvacuated) {
                setConfirmEvacuated(true);
                return;
              }
              dispatch({ type: 'evacuated', id: casualty.id });
              router.navigate('/');
            }}
            color={confirmEvacuated ? t.no : undefined}
            style={styles.flex}
          />
        </View>
      </View>
    </Screen>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: 'check' | 'medic' | 'help';
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.row}>
        <Icon name={icon} color={t.text} />
        <Text maxFontSizeMultiplier={size.maxTextScale} style={[styles.sectionTitle, { color: t.text }]}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function StepRow({ step, muted }: { step: StepView; muted?: boolean }) {
  const source = sourceLine(step.sources);
  return (
    <View style={styles.step}>
      <Label muted={muted} style={styles.stepText}>
        {step.label}
      </Label>
      {source && (
        <Label muted style={styles.stepSource}>
          {source}
        </Label>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: size.gutter, gap: 14 },
  callout: { fontWeight: '700', fontSize: 20, lineHeight: 28 },
  section: { borderRadius: size.radius, borderWidth: 1, padding: 16, gap: 12 },
  sectionTitle: { fontSize: size.textLarge, fontWeight: '800' },
  medicStop: { fontWeight: '700' },
  step: { gap: 2 },
  stepText: { fontSize: 22, fontWeight: '600' },
  stepSource: { fontSize: 14 },
  why: { gap: 4 },
  injury: { fontWeight: '700' },
  footer: { gap: 12, paddingHorizontal: size.gutter, paddingTop: 12, borderTopWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
});

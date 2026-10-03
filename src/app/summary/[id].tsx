// What this casualty needs: do-now steps, the medic stop, and why, with the
// doctrine source on every line.

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoctrine } from '../../state/doctrine.tsx';
import { useCasualty, useStore } from '../../state/store.tsx';
import { assess, nextPrompt, type StepView } from '../../triage/assess.ts';
import {
  BigButton,
  CategoryBadge,
  DraftBanner,
  formatDuration,
  IconButton,
  Label,
  Screen,
  sourceLine,
  useTheme,
} from '../../ui/components.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { size } from '../../ui/theme.ts';
import { useNow } from '../../ui/useNow.ts';

export default function Summary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const casualty = useCasualty(id);
  const doctrine = useDoctrine().doctrine!;
  const { dispatch } = useStore();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const t = useTheme();
  const [confirmEvacuated, setConfirmEvacuated] = useState(false);

  if (!casualty) {
    return <Redirect href="/" />;
  }

  const a = assess(doctrine, casualty);
  const moreToAsk = nextPrompt(doctrine, casualty) !== null;
  const questionLabel = (key: string) => doctrine.questions.find((q) => q.key === key)?.label ?? key;

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="back" label="All casualties" onPress={() => router.navigate('/')} />
        <Text style={[styles.name, { color: t.text }]}>{casualty.name}</Text>
        <CategoryBadge category={a.category} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
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
        {moreToAsk && (
          <BigButton
            label="Keep asking"
            icon="chevron"
            onPress={() => router.replace(`/casualty/${casualty.id}`)}
          />
        )}
        <View style={styles.row}>
          <BigButton
            label="All casualties"
            icon="list"
            onPress={() => router.navigate('/')}
            style={styles.flex}
          />
          <BigButton
            label={confirmEvacuated ? 'Tap to confirm' : 'Evacuated'}
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
        <Text style={[styles.sectionTitle, { color: t.text }]}>{title}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: size.gutter,
    paddingBottom: 8,
  },
  name: { fontSize: 30, fontWeight: '800' },
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

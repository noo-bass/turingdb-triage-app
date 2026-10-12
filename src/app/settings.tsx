// Settings, from the home screen: display options and the engine check.

import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { useStore } from '../state/store.tsx';
import { BigButton, Label, Screen, ScreenHeader, useTheme } from '../ui/components.tsx';
import { size } from '../ui/theme.ts';

export default function Settings() {
  const { state, dispatch } = useStore();
  const t = useTheme();

  return (
    <Screen>
      <ScreenHeader title="Settings" onBack={() => router.navigate('/')} />
      <ScrollView contentContainerStyle={styles.content}>
        <BigButton
          label={state.showGraph ? 'TuringDB graph: on' : 'TuringDB graph: off'}
          icon="graph"
          color={state.showGraph ? t.yes : undefined}
          textColor={state.showGraph ? t.onAnswer : undefined}
          onPress={() => dispatch({ type: 'showGraph', show: !state.showGraph })}
          accessibilityHint="Shows the doctrine graph above the questions, lighting up as you answer"
        />
        <Label muted style={styles.hint}>
          The doctrine graph behind the questions, read live from the TuringDB engine on this phone. It lights up
          with each answer: the question being asked, the injuries the answers point to, the category and the steps.
          Tap it for the full graph.
        </Label>

        <BigButton
          label={state.mode === 'red' ? 'Red night mode: on' : 'Red night mode: off'}
          icon={state.mode === 'red' ? 'sun' : 'moon'}
          onPress={() => dispatch({ type: 'mode', mode: state.mode === 'red' ? 'dark' : 'red' })}
        />

        <BigButton label="Engine check" icon="list" onPress={() => router.push('/engine-check')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: size.gutter, gap: 16 },
  hint: { fontSize: 16, marginBottom: 8 },
});

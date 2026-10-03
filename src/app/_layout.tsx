import { useKeepAwake } from 'expo-keep-awake';
import Stack from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DoctrineProvider, useDoctrine } from '../state/doctrine.tsx';
import { StoreProvider } from '../state/store.tsx';
import { BigButton, Label, useTheme } from '../ui/components.tsx';
import { size } from '../ui/theme.ts';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <DoctrineProvider>
          <App />
        </DoctrineProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

function App() {
  // A screen that sleeps mid-triage costs time and light; keep it on while open
  useKeepAwake();
  const t = useTheme();
  const { doctrine, error, retry } = useDoctrine();

  if (!doctrine) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        {error ? (
          <>
            <Label style={styles.message}>Could not open the doctrine graph.</Label>
            <Label muted style={styles.detail}>
              {error}
            </Label>
            <BigButton label="Try again" icon="undo" onPress={retry} />
          </>
        ) : (
          <ActivityIndicator size="large" color={t.text} />
        )}
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.background },
          animation: 'fade',
        }}
      />
      <StatusBar style="light" />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: size.gutter, gap: 16 },
  message: { fontSize: size.textLarge, fontWeight: '700' },
  detail: { fontSize: 16 },
});

// The final order: who goes first, with the reason in plain words. Casualties
// no rule separates say so, for a medic or commander: never silently picked.

import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoctrine } from '../state/doctrine.tsx';
import { useStore } from '../state/store.tsx';
import { planOrder } from '../triage/order.ts';
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
import { size } from '../ui/theme.ts';
import { useNow } from '../ui/useNow.ts';

export default function Order() {
  const { state } = useStore();
  const doctrine = useDoctrine().doctrine!;
  const insets = useSafeAreaInsets();
  const now = useNow();
  const t = useTheme();

  const order = planOrder(doctrine, state.casualties, now);

  return (
    <Screen>
      <ScreenHeader title="Who goes first" onBack={() => router.navigate('/categories')} />

      <ScrollView contentContainerStyle={styles.body}>
        {order.map((p, i) => (
          <View
            key={p.casualty.id}
            style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
            accessible
            accessibilityLabel={`Number ${i + 1}, ${p.casualty.name}`}>
            <View style={styles.cardTop}>
              <Text maxFontSizeMultiplier={size.maxTextScale} style={[styles.place, { color: t.text }]}>
                {i + 1}
              </Text>
              <CasualtyPhoto casualty={p.casualty} size={44} />
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={size.maxTextScale}
                style={[styles.name, { color: t.text }]}>
                {p.casualty.name}
              </Text>
              <CategoryBadge category={p.assessment.category} compact />
            </View>
            <ReasonLines reasons={p.reasons} />
            {p.tiedWith.length > 0 && (
              <Label style={[styles.tied, { color: t.warning }]}>
                Tied with {p.tiedWith.join(', ')}: nothing separates them. Medic or commander call.
              </Label>
            )}
          </View>
        ))}
        <DraftBanner />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderColor: t.border }]}>
        <BigButton label="Casualties" icon="list" onPress={() => router.navigate('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: size.gutter, gap: 14 },
  card: { borderRadius: size.radius, borderWidth: 1, padding: 16, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  place: { fontSize: 40, fontWeight: '800', minWidth: 36 },
  name: { fontSize: 32, fontWeight: '800', flex: 1 },
  tied: { fontWeight: '700' },
  footer: { gap: 12, paddingHorizontal: size.gutter, paddingTop: 12, borderTopWidth: 1 },
});

import * as Haptics from 'expo-haptics';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useStore } from '../state/store.tsx';
import type { Category } from '../triage/doctrine.ts';
import { Icon, type IconName } from './Icon.tsx';
import { palettes, size, type Palette } from './theme.ts';

export function useTheme(): Palette {
  return palettes[useStore().state.mode];
}

// A big, forgiving button: full-width by default, haptic tick on press
export function BigButton({
  label,
  onPress,
  icon,
  color,
  textColor,
  style,
  big = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  color?: string;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const fg = textColor ?? t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? t.surfacePressed : (color ?? t.surface), borderColor: t.border },
        style,
      ]}>
      {icon && <Icon name={icon} color={fg} size={big ? 40 : 26} />}
      {/* One line always: a label that wraps mid-button reads as two buttons */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        maxFontSizeMultiplier={size.maxTextScale}
        style={[styles.buttonText, { color: fg, fontSize: big ? size.answer : size.button }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// Small round icon button for headers (still >= 56 pt to hit with a glove)
export function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: pressed ? t.surfacePressed : t.surface, borderColor: t.border },
      ]}>
      <Icon name={icon} color={t.text} />
    </Pressable>
  );
}

// The top bar every screen shares: optional back, a title that gives way
// (never the buttons), optional badge, then the right-hand buttons
export function ScreenHeader({
  title,
  big = false,
  onBack,
  badge,
  right,
}: {
  title: string;
  big?: boolean;
  onBack?: () => void;
  badge?: ReactNode;
  right?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      {onBack && <IconButton icon="back" label="All casualties" onPress={onBack} />}
      <View style={styles.headerTitle}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={size.maxTextScale}
          style={[styles.title, { color: t.text, fontSize: big ? 34 : 30 }]}>
          {title}
        </Text>
        {badge}
      </View>
      {right}
    </View>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.screen, { backgroundColor: t.background }]}>{children}</View>;
}

export function Label({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const t = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={size.maxTextScale}
      style={[{ color: muted ? t.textMuted : t.text, fontSize: size.text }, style]}>
      {children}
    </Text>
  );
}

export function DraftBanner() {
  const t = useTheme();
  return (
    <View style={[styles.banner, { borderColor: t.warning }]}>
      <Icon name="alert" color={t.warning} size={22} />
      <Text maxFontSizeMultiplier={size.maxTextScale} style={[styles.bannerText, { color: t.warning }]}>
        Not a medical device. Draft doctrine, awaiting medic review.
      </Text>
    </View>
  );
}

type CategoryKey = 'immediate' | 'delayed' | 'minimal' | 'expectant' | 'unranked';

const WORD: Record<CategoryKey, string> = {
  immediate: 'IMMEDIATE',
  delayed: 'DELAYED',
  minimal: 'MINIMAL',
  expectant: 'EXPECTANT',
  unranked: 'NOT RANKED',
};

export function categoryWord(key: string | null): string {
  return WORD[(key ?? 'unranked') as CategoryKey] ?? WORD.unranked;
}

// Word plus shape, so it reads without colour (red night mode, colour blindness)
function CategoryShape({ category, color, s }: { category: CategoryKey; color: string; s: number }) {
  return (
    <Svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill={category === 'unranked' ? 'none' : color}
      stroke={color}
      strokeWidth={2}>
      {category === 'immediate' && <Path d="M12 2L22 21H2z" />}
      {category === 'delayed' && <Rect x={3} y={3} width={18} height={18} rx={2} />}
      {category === 'minimal' && <Circle cx={12} cy={12} r={10} />}
      {category === 'expectant' && <Path d="M12 2l10 10-10 10L2 12z" />}
      {category === 'unranked' && <Circle cx={12} cy={12} r={9} strokeDasharray="4 3" />}
    </Svg>
  );
}

// compact: the header size, so a badge beside a name never pushes buttons off-screen
export function CategoryBadge({
  category,
  compact = false,
}: {
  category: Category | null;
  compact?: boolean;
}) {
  const t = useTheme();
  const key = (category?.key ?? 'unranked') as CategoryKey;
  const color = t.category[key];
  return (
    <View
      style={[styles.badge, compact && styles.badgeCompact, { borderColor: color }]}
      accessibilityLabel={WORD[key]}>
      <CategoryShape category={key} color={color} s={compact ? 16 : 22} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        maxFontSizeMultiplier={size.maxTextScale}
        style={[styles.badgeText, compact && styles.badgeTextCompact, { color }]}>
        {WORD[key]}
      </Text>
    </View>
  );
}

export function sourceLine(sources: { doc: string; page: number | null }[]): string | null {
  const s = sources.find((x) => x.doc === 'tccc-handbook') ?? sources[0];
  if (!s) {
    return null;
  }
  const doc = s.doc === 'tccc-handbook' ? 'TCCC Handbook' : s.doc.toUpperCase();
  return s.page ? `${doc} p.${s.page}` : doc;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  button: {
    minHeight: size.minTarget,
    borderRadius: size.radius,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  buttonText: { fontWeight: '700', flexShrink: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: size.gutter,
    paddingBottom: 8,
  },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  title: { fontWeight: '800', flexShrink: 1 },
  iconButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  bannerText: { flex: 1, fontSize: 15, fontWeight: '600' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    flexShrink: 1,
  },
  badgeCompact: { gap: 6, paddingHorizontal: 7, paddingVertical: 4, alignSelf: 'center' },
  badgeText: { fontSize: 18, fontWeight: '800', letterSpacing: 1, flexShrink: 1 },
  badgeTextCompact: { fontSize: 14, letterSpacing: 0.5 },
});

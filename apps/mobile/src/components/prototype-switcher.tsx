import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { ChevronLeft, ChevronRight } from './icons';

// Shared bottom bar for `prototype`-skill UI prototypes (see
// .claude/skills/prototype/UI.md). Never rendered outside __DEV__, so a
// stray prototype route left on main can't ship this to a real build.
export type PrototypeVariant = { key: string; name: string };

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: PrototypeVariant[];
  current: string;
  onChange: (key: string) => void;
}) {
  const theme = useTheme();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  useEffect(() => {
    // Web only — RN native has no keydown on `document`.
    if (typeof document === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'ArrowLeft') onChange(variants[(index - 1 + variants.length) % variants.length].key);
      if (e.key === 'ArrowRight') onChange(variants[(index + 1) % variants.length].key);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [index, variants, onChange]);

  if (!__DEV__) return null;

  const variant = variants[index];
  const cycle = (delta: number) => onChange(variants[(index + delta + variants.length) % variants.length].key);

  return (
    <View style={[styles.bar, { backgroundColor: theme.text }]}>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={() => cycle(-1)}>
        <ChevronLeft size={16} color={theme.background} />
      </Pressable>
      <ThemedText type="small" style={{ color: theme.background }}>
        {variant.key} · {variant.name}
      </ThemedText>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={() => cycle(1)}>
        <ChevronRight size={16} color={theme.background} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});

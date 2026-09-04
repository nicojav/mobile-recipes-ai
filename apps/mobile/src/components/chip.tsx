import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { Plus } from './icons';

type ChipProps = {
  label: string;
  active: boolean;
  onPress?: () => void;
  // Delete affordance for the bottom-sheet's chips — see index.tsx's
  // pendingDelete. Not used by the bento card's non-interactive preview chips.
  onLongPress?: () => void;
  delayLongPress?: number;
  compact?: boolean;
  // Non-interactive: used for a bento card's chip preview (tapping the card,
  // not an individual chip, opens the sheet) and the "+N más" tag.
  disabled?: boolean;
  // The "+N más" tag only — a dashed border regardless of active state.
  dashed?: boolean;
  // The "Agregar" affordance only — dashed + accent-colored (vs. the neutral
  // dashed "+N más" tag) so it reads as actionable, at the exact same size
  // as every other chip in the row rather than a separate, heavier block.
  accent?: boolean;
};

export function Chip({ label, active, onPress, onLongPress, delayLongPress = 500, compact, disabled, dashed, accent }: ChipProps) {
  const theme = useTheme();
  const borderStyle: 'dashed' | 'solid' = dashed ? 'dashed' : 'solid';
  const fillStyle = active
    ? { backgroundColor: theme.accent, borderColor: theme.accent }
    : { backgroundColor: 'transparent', borderColor: accent ? theme.accent : theme.border, borderStyle };
  const textColor = accent ? theme.accentText : undefined;

  // Driven by a manual JS timer rather than Pressable's built-in
  // onLongPress/delayLongPress — that combo was unreliable on iOS at the 2s
  // delay this needs (see index.tsx's delete confirm): it either never fired
  // or fired onPress as well on release. onPressIn/onPressOut sidesteps
  // Pressability's internal long-press state machine entirely.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  useEffect(() => () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handlePressIn = useCallback(() => {
    if (!onLongPress) return;
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onLongPress();
    }, delayLongPress);
  }, [onLongPress, delayLongPress]);

  const handlePressOut = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePress = useCallback(() => {
    // A long press that already fired shouldn't also register as a tap once
    // the finger lifts.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onPress?.();
  }, [onPress]);

  return (
    <Pressable
      accessibilityRole={disabled ? undefined : 'button'}
      accessibilityState={disabled ? undefined : { selected: active }}
      onPress={disabled ? undefined : handlePress}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.compact : styles.full,
        fillStyle,
        accent ? styles.withIcon : null,
        pressed ? styles.pressed : null,
      ]}
    >
      {accent && <Plus size={compact ? 11 : 13} color={theme.accentText} />}
      <ThemedText
        type={active ? 'smallBold' : 'small'}
        themeColor={active ? undefined : 'textSecondary'}
        style={[compact ? styles.compactLabel : null, active ? styles.activeLabel : null, textColor ? { color: textColor } : null]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  full: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  compact: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.half + 1,
  },
  withIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half + 1,
  },
  compactLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  activeLabel: {
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.6,
  },
});

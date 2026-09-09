import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { Minus, Plus } from './icons';

type ServingsStepperProps = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
};

// Sits in Detalle's badge row in place of the old static "porciones" Badge —
// same pill silhouette (Radius.pill, 1px border, `small`/`textSecondary`
// label) so it still reads as part of that row, with a decrease/increase
// button flanking the count.
export function ServingsStepper({ value, min, max, onChange, label, decreaseLabel, increaseLabel }: ServingsStepperProps) {
  const theme = useTheme();
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View style={[styles.stepper, { borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        accessibilityState={{ disabled: atMin }}
        disabled={atMin}
        hitSlop={12}
        onPress={() => onChange(Math.max(min, value - 1))}
        style={({ pressed }) => [styles.button, pressed && !atMin ? styles.pressed : null]}
      >
        <Minus size={12} color={atMin ? theme.border : theme.textSecondary} />
      </Pressable>

      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        accessibilityState={{ disabled: atMax }}
        disabled={atMax}
        hitSlop={12}
        onPress={() => onChange(Math.min(max, value + 1))}
        style={({ pressed }) => [styles.button, pressed && !atMax ? styles.pressed : null]}
      >
        <Plus size={12} color={atMax ? theme.border : theme.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
    gap: Spacing.one,
  },
  button: {
    // Matches Badge/CalorieBadge's text line-height (20px, see themed-text's
    // `small` type) so this pill is exactly as tall as its siblings in the
    // badge row — hitSlop makes up the difference to a 44px touch target
    // without inflating the pill itself.
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    minWidth: 64,
    textAlign: 'center',
  },
});

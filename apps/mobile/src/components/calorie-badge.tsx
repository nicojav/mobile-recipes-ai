import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { interpolateColor } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { CalorieRamp, CalorieRange, Radius, Spacing } from '@/constants/theme';
import { ThemedText } from './themed-text';

// The one gradient in the app — see Design.md "Components". Position on the
// ramp is a straight linear map of calories/serving onto [min, max], clamped
// at both ends; the chip renders a short slice of the ramp starting at that
// position, so the gradient reads as a scale rather than decoration.
const SLICE_WIDTH = 0.18;

export function CalorieBadge({ calories }: { calories?: number }) {
  const { t } = useTranslation();

  if (calories == null || !Number.isFinite(calories)) return null;

  const t0 = clamp((calories - CalorieRange.min) / (CalorieRange.max - CalorieRange.min), 0, 1);
  const t1 = Math.min(t0 + SLICE_WIDTH, 1);
  const colors = [
    interpolateColor(t0, [0, 0.5, 1], CalorieRamp),
    interpolateColor(t1, [0, 0.5, 1], CalorieRamp),
  ] as const;

  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badge}>
      <ThemedText type="smallBold" style={styles.label}>
        {t('deck.calories', { count: Math.round(calories) })}
      </ThemedText>
    </LinearGradient>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  label: {
    color: '#FFFFFF',
  },
});

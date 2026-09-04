import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

// Text-on-inverted-fill: dark button + light label in light mode, flips in
// dark mode. Replaces the `backgroundColor: theme.text` + scheme-flipped
// label pattern that was copy-pasted per screen.
export function PrimaryButton({
  label,
  onPress,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: theme.text }, disabled ? styles.disabled : null, style]}
    >
      <ThemedText type="button" style={{ color: theme.background }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
    paddingVertical: Spacing.three,
  },
  disabled: {
    opacity: 0.5,
  },
});

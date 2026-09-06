import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

// Same shape as PrimaryButton (radius, padding, `button` type label) so the
// two read as equally weighted choices — border + surface fill instead of
// inverted fill, matching Chip's inactive treatment.
export function SecondaryButton({
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
      style={[
        styles.button,
        { backgroundColor: theme.surface, borderColor: theme.border },
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <ThemedText type="button" themeColor="text">
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
    borderWidth: 1,
    paddingVertical: Spacing.three,
  },
  disabled: {
    opacity: 0.5,
  },
});

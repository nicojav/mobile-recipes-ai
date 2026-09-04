import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { ChevronLeft } from './icons';

export function BackButton({ onPress, accessibilityLabel }: { onPress: () => void; accessibilityLabel: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={[styles.button, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <ChevronLeft size={16} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

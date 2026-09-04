import { Pressable, StyleSheet } from 'react-native';

import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { Search } from './icons';

export function FloatingCTA({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.cta, { backgroundColor: theme.accent }]}>
      <Search size={16} color="#FFFFFF" />
      <ThemedText type="button" style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cta: {
    position: 'absolute',
    bottom: BottomTabInset + Spacing.two,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three - 1,
    paddingHorizontal: Spacing.four + 2,
    borderRadius: Radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  label: {
    color: '#FFFFFF',
  },
});

import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { ChevronLeft } from './icons';

// Goes back safely rather than always calling router.back() — a screen
// entered with no navigation history above it (a deep link straight into
// /deck, /saved, or /detail/[id]; an OS-restored session) has nothing to go
// back to, and router.back() throws "GO_BACK was not handled by any
// navigator" in that case. Falls back to Mi cocina, the app's one home
// screen, so every "back" tap is a no-crash action regardless of how the
// screen was reached.
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function BackButton({ accessibilityLabel }: { accessibilityLabel: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={goBack}
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

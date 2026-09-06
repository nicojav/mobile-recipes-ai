import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from './themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const VISIBLE_MS = 1800;
const FADE_MS = 200;

// Auto-dismissing snackbar, not a native Alert — this is feedback, not a
// decision, so it never asks for a tap to dismiss (principle 2: no
// confirmation prompts). Anchored above FloatingCTA regardless of screen,
// so it doesn't depend on measuring header height.
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const theme = useTheme();
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: FADE_MS, easing: Easing.out(Easing.quad) });
    const hideTimer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: FADE_MS, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(onDone)();
      });
    }, VISIBLE_MS);
    return () => clearTimeout(hideTimer);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { backgroundColor: theme.accent }, animatedStyle]}
    >
      <ThemedText type="small" style={styles.label} numberOfLines={2}>
        {message}
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: BottomTabInset + Spacing.two + 56,
    left: Spacing.four,
    right: Spacing.four,
    alignItems: 'center',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    alignSelf: 'center',
  },
  label: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

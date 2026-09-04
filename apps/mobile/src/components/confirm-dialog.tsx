import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

// A plain absolutely-positioned overlay, not its own <Modal> — meant to be
// passed as BottomSheet's `overlay` prop so it shares that sheet's native
// Modal window. iOS does not reliably present a second stacked <Modal>
// while one is already up (this used to be a self-contained Modal and the
// long-press-to-delete flow silently did nothing on device because of it).
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();

  if (!visible) return null;

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onCancel} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <ThemedText type="sheetTitle">{title}</ThemedText>
        {body && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            {body}
          </ThemedText>
        )}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={[styles.button, { borderColor: theme.border }]}
          >
            <ThemedText type="button">{cancelLabel}</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onConfirm}
            style={[styles.button, { backgroundColor: theme.danger, borderColor: theme.danger }]}
          >
            <ThemedText type="button" style={styles.confirmLabel}>
              {confirmLabel}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Absolute rather than flex: 1 — this now renders as a sibling of
  // BottomSheet's own sheet View (see the `overlay` prop), not as its own
  // Modal root, so it needs to claim the full area itself to sit over
  // everything else in that Modal.
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,20,20,0.35)',
    paddingHorizontal: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.card,
    padding: Spacing.four,
  },
  body: {
    paddingTop: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
    borderWidth: 1,
    paddingVertical: Spacing.three,
  },
  confirmLabel: {
    color: '#FFFFFF',
  },
});

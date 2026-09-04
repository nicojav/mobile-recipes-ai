import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Item } from '@mobile-recipes/shared';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Chip } from './chip';
import { ThemedText } from './themed-text';

const PREVIEW_COUNT = 3;

export function LocationCard({
  label,
  items,
  wide,
  onPress,
  onToggleItem,
  onAdd,
}: {
  label: string;
  items: Item[];
  wide?: boolean;
  // Tapping the card anywhere that isn't a chip — opens the full location
  // in browse mode.
  onPress: () => void;
  // Tapping one of the preview chips directly — toggles it in place, no
  // sheet needed for the ones already visible.
  onToggleItem: (item: Item) => void;
  // The trailing "Agregar" chip — opens the location straight into add mode.
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const activeCount = items.filter((item) => item.active).length;
  const preview = items.slice(0, PREVIEW_COUNT);
  const remaining = items.length - preview.length;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, wide ? styles.wide : styles.half]}
    >
      <View style={styles.header}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <View style={[styles.countBadge, { backgroundColor: theme.accentTint }]}>
          <ThemedText type="small" style={[styles.countText, { color: theme.accentText }]}>
            {activeCount}/{items.length}
          </ThemedText>
        </View>
      </View>
      <View style={styles.chips}>
        {preview.map((item) => (
          <Chip key={item.id} label={item.name} active={item.active} compact onPress={() => onToggleItem(item)} />
        ))}
        {remaining > 0 && <Chip label={t('kitchen.more', { count: remaining })} active={false} compact disabled dashed />}
        <Chip label={t('kitchen.add')} active={false} compact accent dashed onPress={onAdd} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  half: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  wide: {
    flexBasis: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 11,
    lineHeight: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one + 2,
  },
});

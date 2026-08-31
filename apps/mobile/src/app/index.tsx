import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { asc, eq } from 'drizzle-orm';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Location, type Item } from '@mobile-recipes/shared';

import { db, initDb } from '@db/client';
import { items as itemsTable } from '@db/schema';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const LOCATION_ORDER: Location[] = ['freezer', 'heladera', 'alacena', 'condimentos', 'cajon'];
const COLLAPSED_BY_DEFAULT = new Set<Location>(['condimentos', 'cajon']);

function loadItems(): Item[] {
  return db.select().from(itemsTable).orderBy(asc(itemsTable.name)).all() as Item[];
}

export default function KitchenScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();

  const [items, setItems] = useState<Item[]>([]);
  const [collapsed, setCollapsed] = useState<Set<Location>>(() => new Set(COLLAPSED_BY_DEFAULT));
  // Free text for things noticed but not in the list yet (e.g. "compré cherry y
  // un morrón") — sent verbatim as `notes` on the next request, not turned into
  // a persisted Item. Items need a location and this box deliberately doesn't
  // ask the user to pick one.
  const [notes, setNotes] = useState('');

  useEffect(() => {
    initDb();
    setItems(loadItems());
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<Location, Item[]>();
    for (const location of LOCATION_ORDER) map.set(location, []);
    for (const item of items) map.get(item.location)?.push(item);
    return map;
  }, [items]);

  function toggleItem(item: Item) {
    const nextActive = !item.active;
    db.update(itemsTable).set({ active: nextActive }).where(eq(itemsTable.id, item.id)).run();
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: nextActive } : i)));
  }

  function toggleGroup(location: Location) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(location)) next.delete(location);
      else next.add(location);
      return next;
    });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            {t('kitchen.title')}
          </ThemedText>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t('kitchen.notesPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.notes,
              { backgroundColor: theme.backgroundElement, color: theme.text },
            ]}
          />
        </View>

        <View style={styles.groups}>
          {LOCATION_ORDER.map((location) => (
            <LocationGroup
              key={location}
              location={location}
              items={grouped.get(location) ?? []}
              collapsed={collapsed.has(location)}
              onToggleCollapse={() => toggleGroup(location)}
              onToggleItem={toggleItem}
            />
          ))}
        </View>

        <Pressable
          style={[styles.cta, { backgroundColor: theme.text }]}
          onPress={() => router.push({ pathname: '/deck', params: { notes } })}
        >
          <ThemedText style={{ color: scheme === 'dark' ? Colors.dark.background : Colors.light.background }} type="smallBold">
            {t('kitchen.findIdeas')}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

function LocationGroup({
  location,
  items,
  collapsed,
  onToggleCollapse,
  onToggleItem,
}: {
  location: Location;
  items: Item[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggleItem: (item: Item) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.group}>
      <Pressable onPress={onToggleCollapse} style={styles.groupHeader}>
        <ThemedText type="smallBold">{t(`location.${location}`)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {collapsed ? t('group.show') : t('group.hide')}
        </ThemedText>
      </Pressable>
      {!collapsed && (
        <View style={styles.chipRow}>
          {items.map((item) => (
            <Chip key={item.id} item={item} onPress={() => onToggleItem(item)} />
          ))}
        </View>
      )}
    </View>
  );
}

function Chip({ item, onPress }: { item: Item; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: item.active ? theme.backgroundSelected : theme.backgroundElement },
      ]}
    >
      <ThemedText type="small" themeColor={item.active ? 'text' : 'textSecondary'}>
        {item.name}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  header: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  notes: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  groups: {
    flex: 1,
    gap: Spacing.three,
  },
  group: {
    gap: Spacing.two,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 999,
  },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    marginVertical: Spacing.three,
    marginBottom: BottomTabInset,
  },
});

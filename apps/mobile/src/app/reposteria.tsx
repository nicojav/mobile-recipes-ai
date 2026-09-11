import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { eq } from 'drizzle-orm';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { Item } from '@mobile-recipes/shared';

import { db, initDb } from '@db/client';
import { items as itemsTable } from '@db/schema';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackButton } from '@/components/back-button';
import { FloatingCTA } from '@/components/floating-cta';
import { CheckCircle, OpenCircle, Pencil, Plus } from '@/components/icons';
import { ingredientPhotos, type IngredientPhotoKey } from '@/constants/ingredient-photos';
import { Radius, Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Theme = ReturnType<typeof useTheme>;

// Category-level, not per-item — both flours share flour-bag, matching the
// seed list's own reclassification. Quick-added items are always free text,
// so they never have curated art (see ItemAvatar's letter-monogram
// fallback below); bicarbonato de sodio has no curated photo either, for
// the same reason a catalog only covers what was actually generated.
const ITEM_PHOTO: Record<string, IngredientPhotoKey> = {
  'harina 0000': 'flour-bag',
  'harina leudante': 'flour-bag',
  'azúcar': 'sugar',
  'azúcar impalpable': 'powdered-sugar',
  manteca: 'butter',
  huevos: 'egg',
  'levadura seca': 'yeast',
  'polvo de hornear': 'baking-powder',
  'esencia de vainilla': 'vanilla',
  leche: 'milk',
  'dulce de leche': 'dulce-de-leche',
  'chocolate cobertura': 'chocolate',
  'cacao amargo': 'cacao',
  'coco rallado': 'coconut',
  'ralladura de limón': 'lemon',
  canela: 'cinnamon',
  'nuez moscada': 'nutmeg',
  'pasas de uva': 'raisins',
  nueces: 'walnut',
};

// Repostería's own pantry is flat, no location grouping (see ticket
// "Repostería pantry page UI/UX prototype") — but `location` stays required
// on every Item (ticket "Baking pantry data model"). A quick-added item here
// has nowhere in the UI to pick one, so it lands in alacena, where most
// baking dry goods already live in the seed data. Which pantry(s) a
// quick-add defaults into is still an open fog item on the destination map;
// this is the interim default until that's ticketed.
const QUICK_ADD_LOCATION = 'alacena' as const;

function loadItems(): Item[] {
  return db.select().from(itemsTable).where(eq(itemsTable.inReposteria, true)).all() as Item[];
}

// Matches index.tsx's own generateId — internal, never shown, plenty unique
// for a single-device app.
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Leading per-row visual: the real photo when the item has one, otherwise a
// letter monogram. Dimmed when inactive so the row's selected state reads at
// a glance without relying on text color alone.
function ItemAvatar({ item, theme }: { item: Item; theme: Theme }) {
  const photoKey = ITEM_PHOTO[item.name];
  const monogramColor = item.active ? theme.accentText : theme.textSecondary;
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: item.active ? theme.accentTint : theme.background, borderColor: item.active ? theme.accent : theme.border },
        !item.active && styles.avatarDim,
      ]}
    >
      {photoKey ? (
        <Image source={ingredientPhotos[photoKey]} style={styles.avatarPhoto} resizeMode="cover" />
      ) : (
        <ThemedText type="smallBold" style={[styles.avatarMonogram, { color: monogramColor }]}>
          {item.name[0]?.toUpperCase()}
        </ThemedText>
      )}
    </View>
  );
}

export default function ReposteriaScreen() {
  const { t } = useTranslation();
  const theme = useTheme();

  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    initDb();
    setItems(loadItems());
  }, []);

  const activeCount = useMemo(() => items.filter((item) => item.active).length, [items]);

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items;
  const exactMatch = q ? items.some((item) => item.name.toLowerCase() === q) : true;

  function toggleItem(item: Item) {
    const nextActive = !item.active;
    db.update(itemsTable).set({ active: nextActive }).where(eq(itemsTable.id, item.id)).run();
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: nextActive } : i)));
    Haptics.selectionAsync().catch(() => {});
  }

  // Active by default, same reasoning as Mi cocina's own addItem: you're
  // adding it because you have it.
  function addFromQuery() {
    if (!q || exactMatch) return;
    const trimmed = query.trim();
    const newItem: Item = {
      id: generateId(),
      name: trimmed,
      location: QUICK_ADD_LOCATION,
      active: true,
      inCocina: false,
      inReposteria: true,
    };
    db.insert(itemsTable).values(newItem).run();
    setItems((prev) => [...prev, newItem]);
    setQuery('');
    Haptics.selectionAsync().catch(() => {});
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <BackButton accessibilityLabel={t('reposteria.navLink')} />
        </View>
        <ThemedText type="title" style={styles.title}>
          {t('reposteria.title')}
        </ThemedText>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: query.trim() ? theme.accent : theme.border }]}>
            <Pencil size={15} color={theme.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('reposteria.searchPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
              onSubmitEditing={addFromQuery}
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>

          <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {!exactMatch && q.length > 0 && (
              <Pressable
                style={[styles.row, filtered.length > 0 && styles.rowDivider, { borderBottomColor: theme.border }]}
                onPress={addFromQuery}
              >
                <Plus size={18} color={theme.accent} />
                <ThemedText style={{ color: theme.accent }}>{t('reposteria.addPrefix', { text: query.trim() })}</ThemedText>
              </Pressable>
            )}
            {filtered.map((item, i) => (
              <Pressable
                key={item.id}
                style={[styles.row, i < filtered.length - 1 && styles.rowDivider, { borderBottomColor: theme.border }]}
                onPress={() => toggleItem(item)}
              >
                <ItemAvatar item={item} theme={theme} />
                <ThemedText themeColor={item.active ? 'text' : 'textSecondary'} style={styles.rowGrow}>
                  {item.name}
                </ThemedText>
                {item.active ? <CheckCircle size={22} color={theme.accent} /> : <OpenCircle size={22} color={theme.border} />}
              </Pressable>
            ))}
            {filtered.length === 0 && exactMatch && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                {t('reposteria.empty')}
              </ThemedText>
            )}
          </View>
        </ScrollView>

        <FloatingCTA
          label={t('reposteria.findIdeas', { count: activeCount })}
          onPress={() => router.push({ pathname: '/deck', params: { category: 'reposteria' } })}
        />
      </SafeAreaView>
    </ThemedView>
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
    flexDirection: 'row',
    paddingTop: Spacing.two,
  },
  title: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  scroll: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  listCard: {
    borderRadius: Radius.small,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  rowDivider: {
    borderBottomWidth: 1,
  },
  rowGrow: {
    flex: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPhoto: {
    width: '100%',
    height: '100%',
  },
  avatarMonogram: {
    fontSize: 20,
    lineHeight: 24,
  },
  avatarDim: {
    opacity: 0.55,
  },
  emptyText: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
});

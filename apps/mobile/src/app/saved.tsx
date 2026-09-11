import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { desc } from 'drizzle-orm';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import type { StoredCard as Card } from '@mobile-recipes/shared';

import { db, initDb } from '@db/client';
import { savedRecipes as savedRecipesTable } from '@db/schema';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackButton } from '@/components/back-button';
import { Badge } from '@/components/badge';
import { CalorieBadge } from '@/components/calorie-badge';
import { Chip } from '@/components/chip';
import { Bowl } from '@/components/icons';
import { Radius, Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Category = NonNullable<Card['category']>;

type SavedRow = {
  id: string;
  title: string;
  card: Card;
  minutes: number;
  effort: Card['effort'];
  calories?: number;
  imageUrl: string;
  // Absent on any row saved before this field existed ⇒ "comida" — same
  // tolerance StoredCard's own type documents for `calories`.
  category: Category;
};

function loadSaved(): SavedRow[] {
  const rows = db.select().from(savedRecipesTable).orderBy(desc(savedRecipesTable.savedAt)).all();
  return rows.map((row) => {
    const card = JSON.parse(row.card) as Card;
    return {
      id: row.id,
      title: row.title,
      card,
      minutes: card.minutes,
      effort: card.effort,
      calories: card.calories,
      imageUrl: card.imageUrl,
      category: card.category ?? 'comida',
    };
  });
}

export default function SavedScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [rows, setRows] = useState<SavedRow[]>([]);
  // Always opens on Comidas — not persisted across visits, mirrors
  // Calendario's "the week is deliberately not persisted" precedent.
  const [tab, setTab] = useState<Category>('comida');

  useEffect(() => {
    initDb();
    setRows(loadSaved());
  }, []);

  const visibleRows = rows.filter((row) => row.category === tab);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <BackButton accessibilityLabel={t('saved.back')} />
        </View>
        <ThemedText type="title" style={styles.title}>
          {t('saved.title')}
        </ThemedText>

        <View style={styles.tabs}>
          <Chip label={t('saved.tabComida')} active={tab === 'comida'} onPress={() => setTab('comida')} />
          <Chip label={t('saved.tabReposteria')} active={tab === 'reposteria'} onPress={() => setTab('reposteria')} />
        </View>

        {visibleRows.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
            {t(tab === 'reposteria' ? 'saved.emptyReposteria' : 'saved.empty')}
          </ThemedText>
        ) : (
          <FlatList
            data={visibleRows}
            keyExtractor={(row) => row.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/detail/[id]', params: { id: item.id } })}
                style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <View style={[styles.thumbnail, { backgroundColor: theme.accentTint }]}>
                  <Bowl size={24} color={theme.accentText} />
                  <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
                </View>
                <View style={styles.rowBody}>
                  <ThemedText type="default">{item.title}</ThemedText>
                  <View style={styles.badgeRow}>
                    <Badge label={t('deck.minutes', { count: item.minutes })} />
                    <Badge label={t(`effort.${item.effort}`)} />
                    <CalorieBadge calories={item.calories} />
                  </View>
                </View>
              </Pressable>
            )}
          />
        )}
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
  tabs: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  empty: {
    paddingTop: Spacing.four,
    textAlign: 'center',
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  thumbnail: {
    width: 84,
    height: 84,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowBody: {
    flex: 1,
    gap: Spacing.two,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});

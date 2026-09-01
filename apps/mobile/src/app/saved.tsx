import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { desc } from 'drizzle-orm';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import type { CardWithImage as Card } from '@mobile-recipes/shared';

import { db, initDb } from '@db/client';
import { savedRecipes as savedRecipesTable } from '@db/schema';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SavedRow = { id: string; title: string; card: Card; minutes: number; effort: Card['effort'] };

function loadSaved(): SavedRow[] {
  const rows = db.select().from(savedRecipesTable).orderBy(desc(savedRecipesTable.savedAt)).all();
  return rows.map((row) => {
    const card = JSON.parse(row.card) as Card;
    return { id: row.id, title: row.title, card, minutes: card.minutes, effort: card.effort };
  });
}

export default function SavedScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [rows, setRows] = useState<SavedRow[]>([]);

  useEffect(() => {
    initDb();
    setRows(loadSaved());
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          {t('saved.title')}
        </ThemedText>

        {rows.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
            {t('saved.empty')}
          </ThemedText>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row) => row.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push({ pathname: '/detail/[id]', params: { id: item.id } })}
                style={[styles.row, { backgroundColor: theme.backgroundElement }]}
              >
                <ThemedText type="default" style={styles.rowTitle}>
                  {item.title}
                </ThemedText>
                <View style={styles.badgeRow}>
                  <Badge label={t('deck.minutes', { count: item.minutes })} />
                  <Badge label={t(`effort.${item.effort}`)} />
                </View>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function Badge({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
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
  title: {
    fontSize: 28,
    lineHeight: 34,
    paddingTop: Spacing.two,
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
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  rowTitle: {
    fontSize: 17,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
});

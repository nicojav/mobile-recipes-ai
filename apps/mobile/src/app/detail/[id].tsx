import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { eq } from 'drizzle-orm';
import type { CardWithImage as Card } from '@mobile-recipes/shared';

import { db, initDb } from '@db/client';
import { savedRecipes as savedRecipesTable } from '@db/schema';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// No uuid dependency in the app yet — this is unique enough for a
// single-device, single-user recipe list.
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function DetailScreen() {
  const { id, card: cardParam } = useLocalSearchParams<{ id: string; card?: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();

  const [card, setCard] = useState<Card | null>(null);
  // null = not yet in saved_recipes. Set once "Guardar" or "La cociné" (which
  // implicitly saves first) writes a row.
  const [savedId, setSavedId] = useState<string | null>(null);
  const [cookedCount, setCookedCount] = useState(0);

  useEffect(() => {
    initDb();
    if (cardParam) {
      // Arrived from the deck — a suggestion the user hasn't saved yet.
      setCard(JSON.parse(cardParam) as Card);
      setSavedId(null);
      setCookedCount(0);
      return;
    }
    // Arrived from the saved list — id is a real saved_recipes row.
    const row = db.select().from(savedRecipesTable).where(eq(savedRecipesTable.id, id)).get();
    if (row) {
      setCard(JSON.parse(row.card) as Card);
      setSavedId(row.id);
      setCookedCount(row.cookedCount);
    }
  }, [id, cardParam]);

  function handleSave() {
    if (!card || savedId) return;
    const newId = generateId();
    db.insert(savedRecipesTable)
      .values({ id: newId, title: card.title, card: JSON.stringify(card), savedAt: Date.now(), cookedCount: 0, lastCookedAt: null })
      .run();
    setSavedId(newId);
  }

  function handleCooked() {
    if (!card) return;
    const now = Date.now();
    if (savedId) {
      db.update(savedRecipesTable)
        .set({ cookedCount: cookedCount + 1, lastCookedAt: now })
        .where(eq(savedRecipesTable.id, savedId))
        .run();
    } else {
      // Marking something cooked implies wanting to keep it — save it first,
      // same row, rather than tracking a cook tap with nothing to attach it
      // to. Still one local write, still no network call.
      const newId = generateId();
      db.insert(savedRecipesTable)
        .values({ id: newId, title: card.title, card: JSON.stringify(card), savedAt: now, cookedCount: 1, lastCookedAt: now })
        .run();
      setSavedId(newId);
    }
    setCookedCount((c) => c + 1);
  }

  if (!card) {
    return <ThemedView style={styles.container} />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.imageArea, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText style={styles.imagePlaceholderGlyph}>🍳</ThemedText>
            <Image source={{ uri: card.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          </View>

          <ThemedText type="subtitle" style={styles.title}>
            {card.title}
          </ThemedText>

          <View style={styles.badgeRow}>
            <Badge label={t('deck.minutes', { count: card.minutes })} />
            <Badge label={t(`effort.${card.effort}`)} />
            <Badge label={t('detail.servings', { count: card.servings })} />
          </View>

          <ThemedText type="default" themeColor="textSecondary">
            {card.description}
          </ThemedText>

          <View style={styles.section}>
            <ThemedText type="smallBold" style={styles.sectionTitle}>
              {t('detail.ingredients')}
            </ThemedText>
            {card.ingredients.map((ingredient) => (
              <View key={ingredient.name} style={styles.ingredientRow}>
                <ThemedText type="default" style={ingredient.have ? undefined : styles.missingMark}>
                  {ingredient.have ? '✓' : '–'}
                </ThemedText>
                <ThemedText type="default" themeColor={ingredient.have ? 'text' : 'textSecondary'} style={styles.ingredientName}>
                  {ingredient.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {ingredient.quantity}
                </ThemedText>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" style={styles.sectionTitle}>
              {t('detail.steps')}
            </ThemedText>
            {card.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.stepNumber}>
                  {i + 1}
                </ThemedText>
                <ThemedText type="default" style={styles.stepText}>
                  {step}
                </ThemedText>
              </View>
            ))}
          </View>

          {cookedCount > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('detail.cookedCount', { count: cookedCount })}
            </ThemedText>
          )}
        </ScrollView>

        <View style={styles.actions}>
          <Pressable
            disabled={!!savedId}
            onPress={handleSave}
            style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
          >
            <ThemedText type="smallBold">{savedId ? t('detail.saved') : t('detail.save')}</ThemedText>
          </Pressable>
          <Pressable onPress={handleCooked} style={[styles.actionButton, { backgroundColor: theme.text }]}>
            <ThemedText type="smallBold" style={{ color: scheme === 'dark' ? Colors.dark.background : Colors.light.background }}>
              {t('detail.cooked')}
            </ThemedText>
          </Pressable>
        </View>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  imageArea: {
    height: 220,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderGlyph: {
    fontSize: 56,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    textTransform: 'uppercase',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  ingredientName: {
    flex: 1,
  },
  // Amber, not red — a missing ingredient is informational, never an error.
  // Matches the deck's `Te falta:` line (see CLAUDE.md Principles #3).
  missingMark: {
    color: '#b8860b',
  },
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stepNumber: {
    width: 20,
  },
  stepText: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
  },
});

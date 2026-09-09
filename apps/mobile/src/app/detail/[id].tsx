import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { eq } from 'drizzle-orm';
import type { StoredCard as Card } from '@mobile-recipes/shared';

import { db, initDb } from '@db/client';
import { savedRecipes as savedRecipesTable } from '@db/schema';
import { scaleQuantity, scaleStepText } from '@lib/scale-quantity';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackButton } from '@/components/back-button';
import { PrimaryButton } from '@/components/primary-button';
import { Badge } from '@/components/badge';
import { CalorieBadge } from '@/components/calorie-badge';
import { ServingsStepper } from '@/components/servings-stepper';
import { Bowl, CheckCircle, OpenCircle } from '@/components/icons';
import { Radius, Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// No uuid dependency in the app yet — this is unique enough for a
// single-device, single-user recipe list.
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function DetailScreen() {
  const { id, card: cardParam } = useLocalSearchParams<{ id: string; card?: string }>();
  const { t } = useTranslation();
  const theme = useTheme();

  const [card, setCard] = useState<Card | null>(null);
  // null = not yet in saved_recipes. Set once "Guardar" or "La cociné" (which
  // implicitly saves first) writes a row.
  const [savedId, setSavedId] = useState<string | null>(null);
  const [cookedCount, setCookedCount] = useState(0);
  // People counter — always starts at 1, never the card's own `servings`.
  // Deliberately not persisted: every visit reopens at 1 (see CLAUDE.md
  // principle 2 — re-tapping "+" is cheap, a second source of truth for a
  // number the card already carries isn't worth it).
  const [servings, setServings] = useState(1);

  useEffect(() => {
    initDb();
    setServings(1);
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

  // Defensive: saved JSON is parsed without validation (see StoredCard), so a
  // malformed or missing `servings` shouldn't produce an infinite factor.
  const baseServings = card && card.servings > 0 ? card.servings : 1;
  const servingsFactor = servings / baseServings;

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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <BackButton accessibilityLabel={t('detail.back')} />
        </View>
        {!card ? null : (
          <>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <View style={[styles.imageArea, { backgroundColor: theme.accentTint }]}>
                <Bowl size={48} color={theme.accentText} />
                <Image source={{ uri: card.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
              </View>

              <ThemedText type="cardTitle">{card.title}</ThemedText>

              <View style={styles.badgeRow}>
                <Badge label={t('deck.minutes', { count: card.minutes })} />
                <Badge label={t(`effort.${card.effort}`)} />
                <ServingsStepper
                  value={servings}
                  min={1}
                  max={baseServings * 2}
                  onChange={setServings}
                  label={t('detail.servings', { count: servings })}
                  decreaseLabel={t('detail.servingsDecrease')}
                  increaseLabel={t('detail.servingsIncrease')}
                />
                <CalorieBadge calories={card.calories} />
              </View>

              <ThemedText type="default" themeColor="textSecondary">
                {card.description}
              </ThemedText>

              <View style={styles.section}>
                <ThemedText type="micro" themeColor="textSecondary">
                  {t('detail.ingredients')}
                </ThemedText>
                {card.ingredients.map((ingredient, i) => (
                  <View key={i} style={styles.ingredientRow}>
                    {ingredient.have ? (
                      <CheckCircle size={16} color={theme.text} />
                    ) : (
                      <OpenCircle size={16} color={theme.missing} />
                    )}
                    <ThemedText type="default" themeColor={ingredient.have ? 'text' : 'textSecondary'} style={styles.ingredientName}>
                      {ingredient.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {scaleQuantity(ingredient.quantity, servingsFactor)}
                    </ThemedText>
                  </View>
                ))}
              </View>

              <View style={styles.section}>
                <ThemedText type="micro" themeColor="textSecondary">
                  {t('detail.steps')}
                </ThemedText>
                {card.steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.stepNumber}>
                      {i + 1}
                    </ThemedText>
                    <ThemedText type="default" style={styles.stepText}>
                      {scaleStepText(step, servingsFactor)}
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
                accessibilityRole="button"
                disabled={!!savedId}
                onPress={handleSave}
                style={[styles.saveButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <ThemedText type="smallBold">{savedId ? t('detail.saved') : t('detail.save')}</ThemedText>
              </Pressable>
              <PrimaryButton label={t('detail.cooked')} onPress={handleCooked} style={styles.cookedButton} />
            </View>
          </>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  header: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  imageArea: {
    height: 220,
    borderRadius: Radius.card,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  ingredientName: {
    flex: 1,
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
  saveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
    borderWidth: 1,
    paddingVertical: Spacing.three,
  },
  cookedButton: {
    flex: 1,
  },
});

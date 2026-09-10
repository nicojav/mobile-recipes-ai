import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Image } from 'expo-image';

import { Radius, Spacing, MaxContentWidth } from '@/constants/theme';
import { type MealSlot, weekDays } from '@/constants/calendar';
import { useTheme } from '@/hooks/use-theme';
import { useCalendarPlan } from '@/hooks/use-calendar-plan';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackButton } from '@/components/back-button';
import { Badge } from '@/components/badge';
import { CalorieBadge } from '@/components/calorie-badge';
import { Bowl } from '@/components/icons';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const days = weekDays();
  const [selectedDay, setSelectedDay] = useState(days[0].key);
  const { recipeFor, isLoading, hasError, generate } = useCalendarPlan();

  const slots: { slot: MealSlot; label: string }[] = [
    { slot: 'almuerzo', label: t('calendar.slotAlmuerzo') },
    { slot: 'cena', label: t('calendar.slotCena') },
  ];

  function openDetail(recipe: NonNullable<ReturnType<typeof recipeFor>>) {
    router.push({ pathname: '/detail/[id]', params: { id: 'new', card: JSON.stringify(recipe) } });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <BackButton accessibilityLabel={t('calendar.back')} />
        </View>
        <ThemedText type="title" style={styles.title}>
          {t('calendar.title')}
        </ThemedText>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayStripScroll}
          contentContainerStyle={styles.dayStrip}
        >
          {days.map((day) => {
            const active = day.key === selectedDay;
            return (
              <Pressable
                key={day.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSelectedDay(day.key)}
                style={[
                  styles.dayPill,
                  { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accent : theme.surface },
                ]}
              >
                <ThemedText type="micro" style={{ color: active ? '#FFFFFF' : theme.textSecondary }}>
                  {day.weekday}
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: active ? '#FFFFFF' : theme.text }}>
                  {day.dayNumber}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView style={styles.slotsScroll} contentContainerStyle={styles.slots} showsVerticalScrollIndicator={false}>
          {slots.map(({ slot, label }) => {
            const recipe = recipeFor(selectedDay, slot);
            const loading = isLoading(selectedDay, slot);
            const failed = hasError(selectedDay, slot);
            return (
              <View key={slot} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {recipe && !loading && (
                  <View style={[styles.imageWell, { backgroundColor: theme.accentTint }]}>
                    <Bowl size={40} color={theme.accentText} />
                    {/* Absolute over the placeholder icon — same cross-dissolve
                        treatment as deck.tsx's SwipeCard image well. */}
                    <Image source={{ uri: recipe.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
                  </View>
                )}

                <View style={styles.cardBody}>
                  <ThemedText type="micro" themeColor="textSecondary">
                    {label}
                  </ThemedText>

                  {loading ? (
                    <View style={styles.centerFill}>
                      <ActivityIndicator color={theme.accent} />
                      <ThemedText type="small" themeColor="textSecondary" style={styles.loadingText}>
                        {t('calendar.loading')}
                      </ThemedText>
                    </View>
                  ) : recipe ? (
                    <>
                      <Pressable onPress={() => openDetail(recipe)}>
                        <ThemedText type="cardTitle">{recipe.title}</ThemedText>
                        <ThemedText type="default" themeColor="textSecondary">
                          {recipe.description}
                        </ThemedText>
                        <View style={styles.badgeRow}>
                          <Badge label={t('deck.minutes', { count: recipe.minutes })} />
                          <Badge label={t(`effort.${recipe.effort}`)} />
                          <CalorieBadge calories={recipe.calories} />
                        </View>
                      </Pressable>
                      <Pressable onPress={() => generate(selectedDay, slot)} hitSlop={8}>
                        <ThemedText type="link" themeColor="accentText">
                          {t('calendar.regenerate')}
                        </ThemedText>
                      </Pressable>
                    </>
                  ) : failed ? (
                    <View style={styles.centerFill}>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.loadingText}>
                        {t('calendar.error')}
                      </ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => generate(selectedDay, slot)}
                        style={[styles.generateButton, { backgroundColor: theme.accent }]}
                      >
                        <ThemedText type="button" style={{ color: '#FFFFFF' }}>
                          {t('calendar.retry')}
                        </ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.centerFill}>
                      <Bowl size={28} color={theme.textSecondary} />
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => generate(selectedDay, slot)}
                        style={[styles.generateButton, { backgroundColor: theme.accent }]}
                      >
                        <ThemedText type="button" style={{ color: '#FFFFFF' }}>
                          {t('calendar.generate')}
                        </ThemedText>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
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
  dayStripScroll: {
    // RN's ScrollView base style is flexGrow/flexShrink: 1. Left as-is, this
    // strip shrinks alongside the slots list once generated cards overflow the
    // column, and the day numbers get clipped off the pills.
    flexGrow: 0,
    flexShrink: 0,
    // Cancel safeArea's inset so chips scroll off the true screen edge rather
    // than being sliced 16px in; the inset moves onto dayStrip below.
    marginHorizontal: -Spacing.three,
  },
  dayStrip: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  slotsScroll: {
    flex: 1,
  },
  dayPill: {
    alignItems: 'center',
    gap: Spacing.half,
    borderWidth: 1,
    borderRadius: Radius.card,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    minWidth: 52,
  },
  slots: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    overflow: 'hidden', // clips the full-bleed image to the card's radius
  },
  imageWell: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  centerFill: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  loadingText: {
    textAlign: 'center',
  },
  generateButton: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
});

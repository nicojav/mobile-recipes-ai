import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Card } from '@cocina/shared';

import { fetchSuggestions } from '@lib/api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const SWIPE_THRESHOLD = 120;
const SCREEN_WIDTH = Dimensions.get('window').width;
// Once this many cards remain in the current batch, quietly fetch the next
// one so it's ready before the user runs out — see CLAUDE.md Prefetching.
const PREFETCH_AT_REMAINING = 2;

type Status = 'loading' | 'ready' | 'waiting' | 'error';
type SwipeCardHandle = { dismiss: (direction: 1 | -1) => void };

export default function DeckScreen() {
  const { notes: notesParam } = useLocalSearchParams<{ notes?: string }>();
  const notes = notesParam ?? '';
  const { t } = useTranslation();

  const [status, setStatus] = useState<Status>('loading');
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);

  // Titles shown so far this session, sent as `exclude` on every follow-up
  // batch so a batch-2 request never repeats a batch-1 dish.
  const shownTitles = useRef<string[]>([]);
  const pendingBatch = useRef<Card[] | null>(null);
  const isFetchingNext = useRef(false);
  const cardRef = useRef<SwipeCardHandle>(null);

  const fetchBatch = useCallback(async (): Promise<Card[] | null> => {
    try {
      const next = await fetchSuggestions(notes, shownTitles.current);
      shownTitles.current = [...shownTitles.current, ...next.map((c) => c.title)];
      return next;
    } catch {
      return null;
    }
  }, [notes]);

  const load = useCallback(() => {
    setStatus('loading');
    fetchBatch().then((next) => {
      if (!next) {
        setStatus('error');
        return;
      }
      setCards(next);
      setIndex(0);
      setStatus('ready');
    });
  }, [fetchBatch]);

  useEffect(() => {
    load();
    // Only on mount — `notes` is captured once, when the user tapped "Buscar
    // ideas"; it shouldn't re-trigger a fresh batch on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maybePrefetch = useCallback(() => {
    if (isFetchingNext.current || pendingBatch.current) return;
    isFetchingNext.current = true;
    fetchBatch().then((next) => {
      isFetchingNext.current = false;
      setStatus((current) => {
        if (!next) {
          // A background prefetch-ahead failure (still `ready`, cards left
          // to show) stays silent — advance() retries once the batch runs
          // out. But if the user is already on `waiting` (out of cards,
          // this fetch was their only way forward), silently doing nothing
          // here left them stuck on the loading spinner forever — surface
          // the error state instead so the existing retry button can fire.
          return current === 'waiting' ? 'error' : current;
        }
        if (current === 'waiting') {
          setCards(next);
          setIndex(0);
          return 'ready';
        }
        pendingBatch.current = next;
        return current;
      });
    });
  }, [fetchBatch]);

  useEffect(() => {
    if (status !== 'ready') return;
    if (index >= cards.length) {
      if (pendingBatch.current) {
        const next = pendingBatch.current;
        pendingBatch.current = null;
        setCards(next);
        setIndex(0);
      } else {
        setStatus('waiting');
        maybePrefetch();
      }
      return;
    }
    if (cards.length - index === PREFETCH_AT_REMAINING) {
      maybePrefetch();
    }
  }, [index, cards, status, maybePrefetch]);

  const advance = useCallback(() => setIndex((i) => i + 1), []);

  const current = cards[index];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {(status === 'loading' || status === 'waiting') && <LoadingView />}
        {status === 'error' && <ErrorView onRetry={load} />}
        {status === 'ready' && current && (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.counter}>
              {t('deck.counter', { current: index + 1, total: cards.length })}
            </ThemedText>
            <View style={styles.cardArea}>
              <SwipeCard key={`${current.title}-${index}`} ref={cardRef} card={current} onSwipe={advance} />
            </View>
            <Actions cardRef={cardRef} />
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function Actions({ cardRef }: { cardRef: React.RefObject<SwipeCardHandle | null> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityLabel={t('deck.discard')}
        onPress={() => cardRef.current?.dismiss(-1)}
        style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
      >
        <ThemedText type="title" style={styles.actionGlyph}>
          ✕
        </ThemedText>
      </Pressable>
      <Pressable
        accessibilityLabel={t('deck.like')}
        onPress={() => cardRef.current?.dismiss(1)}
        style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
      >
        <ThemedText type="title" style={styles.actionGlyph}>
          ♥
        </ThemedText>
      </Pressable>
    </View>
  );
}

const SwipeCard = forwardRef<SwipeCardHandle, { card: Card; onSwipe: () => void }>(function SwipeCard(
  { card, onSwipe },
  ref,
) {
  const { t } = useTranslation();
  const theme = useTheme();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const fling = useCallback(
    (direction: 1 | -1) => {
      translateX.value = withTiming(direction * SCREEN_WIDTH * 1.5, { duration: 220, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onSwipe)();
      });
    },
    [onSwipe, translateX],
  );

  useImperativeHandle(ref, () => ({ dismiss: fling }), [fling]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.2;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const direction = e.translationX > 0 ? 1 : -1;
        translateX.value = withTiming(direction * SCREEN_WIDTH * 1.5, { duration: 220, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(onSwipe)();
        });
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      {
        rotate: `${interpolate(translateX.value, [-SCREEN_WIDTH, SCREEN_WIDTH], [-12, 12], Extrapolation.CLAMP)}deg`,
      },
    ],
  }));

  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [20, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));
  const discardStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, -20], [1, 0], Extrapolation.CLAMP),
  }));

  const missing = card.ingredients.filter((ingredient) => !ingredient.have);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, { backgroundColor: theme.backgroundElement }, cardStyle]}>
        <View style={[styles.imagePlaceholder, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText style={styles.imagePlaceholderGlyph}>🍳</ThemedText>
        </View>

        <Animated.View style={[styles.stamp, styles.likeStamp, likeStampStyle]}>
          <ThemedText type="title" style={styles.likeStampText}>
            ♥
          </ThemedText>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.discardStamp, discardStampStyle]}>
          <ThemedText type="title" style={styles.discardStampText}>
            ✕
          </ThemedText>
        </Animated.View>

        <View style={styles.cardBody}>
          <ThemedText type="subtitle" style={styles.cardTitle}>
            {card.title}
          </ThemedText>
          <View style={styles.badgeRow}>
            <Badge label={t('deck.minutes', { count: card.minutes })} />
            <Badge label={t(`effort.${card.effort}`)} />
          </View>
          <ThemedText type="default" themeColor="textSecondary">
            {card.description}
          </ThemedText>
          {missing.length > 0 && (
            <ThemedText type="small" style={styles.missing}>
              {t('deck.missing')} {missing.map((ingredient) => ingredient.name).join(', ')}
            </ThemedText>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

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

// The 2-4s wait for a suggestion batch is the moment most likely to make the
// app feel cheap (see CLAUDE.md "Not yet designed") — a plain spinner isn't
// enough, so this pulses a glyph and cycles a few voseo lines instead.
function LoadingView() {
  const { t } = useTranslation();
  const pulse = useSharedValue(0);
  const [lineIndex, setLineIndex] = useState(0);
  const lines = t('deck.loadingLines', { returnObjects: true }) as unknown as string[];

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  useEffect(() => {
    const id = setInterval(() => setLineIndex((i) => (i + 1) % lines.length), 1800);
    return () => clearInterval(id);
  }, [lines.length]);

  const glyphStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.9, 1.08]) }],
    opacity: interpolate(pulse.value, [0, 1], [0.6, 1]),
  }));

  return (
    <View style={styles.centerFill}>
      <Animated.Text style={[styles.loadingGlyph, glyphStyle]}>🍳</Animated.Text>
      <ThemedText type="default" themeColor="textSecondary" style={styles.loadingLine}>
        {lines[lineIndex]}
      </ThemedText>
    </View>
  );
}

function ErrorView({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <View style={styles.centerFill}>
      <ThemedText type="default" themeColor="textSecondary" style={styles.loadingLine}>
        {t('deck.error')}
      </ThemedText>
      <Pressable style={[styles.retryButton, { backgroundColor: theme.text }]} onPress={onRetry}>
        <ThemedText style={{ color: scheme === 'dark' ? Colors.dark.background : Colors.light.background }} type="smallBold">
          {t('deck.retry')}
        </ThemedText>
      </Pressable>
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
  counter: {
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
  cardArea: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  imagePlaceholder: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderGlyph: {
    fontSize: 56,
  },
  stamp: {
    position: 'absolute',
    top: Spacing.four,
    borderWidth: 3,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  likeStamp: {
    right: Spacing.three,
    borderColor: '#3fae5c',
    transform: [{ rotate: '12deg' }],
  },
  likeStampText: {
    color: '#3fae5c',
  },
  discardStamp: {
    left: Spacing.three,
    borderColor: '#d15c4f',
    transform: [{ rotate: '-12deg' }],
  },
  discardStampText: {
    color: '#d15c4f',
  },
  cardBody: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardTitle: {
    fontSize: 24,
    lineHeight: 30,
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
  missing: {
    color: '#b8860b',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.three,
    marginBottom: BottomTabInset,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGlyph: {
    fontSize: 24,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  loadingGlyph: {
    fontSize: 64,
  },
  loadingLine: {
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
});

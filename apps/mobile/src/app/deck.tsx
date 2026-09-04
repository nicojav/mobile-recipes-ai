import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
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
import { Image } from 'expo-image';
import { CARD_COUNT, FIRST_PAINT_COUNT, type CardWithImage as Card } from '@mobile-recipes/shared';

import { fetchSuggestions } from '@lib/api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DevImageQuotaBar } from '@/components/dev-image-quota-bar';
import { BackButton } from '@/components/back-button';
import { PrimaryButton } from '@/components/primary-button';
import { Badge } from '@/components/badge';
import { CalorieBadge } from '@/components/calorie-badge';
import { Bowl, ChevronLeft, ChevronRight } from '@/components/icons';
import { Spacing, BottomTabInset, MaxContentWidth, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SWIPE_THRESHOLD = 120;
const SCREEN_WIDTH = Dimensions.get('window').width;
// Once this many cards remain in the current batch, quietly fetch the next
// one so it's ready before the user runs out — see CLAUDE.md Prefetching.
const PREFETCH_AT_REMAINING = 2;

type Status = 'loading' | 'ready' | 'waiting' | 'error';
type DeckAction = 'back' | 'next';
type SwipeCardHandle = { dismiss: (action: DeckAction) => void };

export default function DeckScreen() {
  const { notes: notesParam } = useLocalSearchParams<{ notes?: string }>();
  const notes = notesParam ?? '';
  const { t } = useTranslation();

  const [status, setStatus] = useState<Status>('loading');
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  // True from the moment the first FIRST_PAINT_COUNT cards land until the
  // rest of that same batch arrives (or fails) — see firstBatchTail below.
  // Only affects the counter: while true, show the full CARD_COUNT as the
  // total instead of the still-partial cards.length, so "1 de 5" doesn't
  // briefly read "1 de 2" and then jump.
  const [awaitingFirstBatchTail, setAwaitingFirstBatchTail] = useState(false);

  // Titles shown so far this session, sent as `exclude` on every follow-up
  // batch so a batch-2 request never repeats a batch-1 dish.
  const shownTitles = useRef<string[]>([]);
  const pendingBatch = useRef<Card[] | null>(null);
  const isFetchingNext = useRef(false);
  const cardRef = useRef<SwipeCardHandle>(null);

  // Non-null while the first batch's second call (the remaining
  // CARD_COUNT - FIRST_PAINT_COUNT cards) is in flight — only ever checked
  // for truthiness, never awaited, so it's typed as the settled `void` that
  // handleTailSettled itself produces. This is a Groq streaming workaround —
  // see CLAUDE.md "Decisions already made" for why the first batch is split
  // into two calls instead of one, and delete this along with the rest of
  // the split if that ever stops being true.
  const firstBatchTail = useRef<Promise<void> | null>(null);
  // Set if the user swipes past the FIRST_PAINT_COUNT cards before the tail
  // above lands — tells handleTailSettled it needs to resume the deck
  // itself, not just append quietly in the background.
  const caughtUpDuringTail = useRef(false);

  const fetchBatch = useCallback(
    async (count?: number): Promise<Card[] | null> => {
      try {
        const next = await fetchSuggestions(notes, shownTitles.current, count);
        shownTitles.current = [...shownTitles.current, ...next.map((c) => c.title)];
        // Fire all image requests concurrently as soon as the batch is
        // known — whether it's shown immediately or held as a
        // prefetched-ahead batch, the Worker should already be
        // generating/caching by the time any card needs its image. Never
        // awaited: a failed prefetch just means the <Image> in SwipeCard
        // loads it lazily instead — see CLAUDE.md's Image pipeline section
        // ("never block the card on the image").
        Image.prefetch(next.map((card) => card.imageUrl)).catch(() => {});
        return next;
      } catch {
        return null;
      }
    },
    [notes],
  );

  const maybePrefetch = useCallback(() => {
    if (isFetchingNext.current || pendingBatch.current) return;
    isFetchingNext.current = true;
    // Prefetch-ahead batches are always a full CARD_COUNT — only the first
    // batch of a session is split. See CLAUDE.md "Prefetching".
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

  // Runs once phase 2 of the first batch (the remaining
  // CARD_COUNT - FIRST_PAINT_COUNT cards) settles, success or failure.
  const handleTailSettled = useCallback(
    (rest: Card[] | null) => {
      firstBatchTail.current = null;
      setAwaitingFirstBatchTail(false);
      const caughtUp = caughtUpDuringTail.current;
      caughtUpDuringTail.current = false;

      if (rest && rest.length > 0) {
        setCards((prev) => [...prev, ...rest]);
      }
      // If the user hadn't reached the end of the first FIRST_PAINT_COUNT
      // cards yet, there's nothing to resume — the effect below will pick
      // the appended cards up naturally once they get there.
      if (!caughtUp) return;

      if (rest && rest.length > 0) {
        setStatus('ready');
      } else {
        // Non-fatal: the deck stays at FIRST_PAINT_COUNT cards for this
        // batch. Same recovery as any other exhausted batch.
        setStatus('waiting');
        maybePrefetch();
      }
    },
    [maybePrefetch],
  );

  const load = useCallback(() => {
    setStatus('loading');
    fetchBatch(FIRST_PAINT_COUNT).then((first) => {
      if (!first) {
        setStatus('error');
        return;
      }
      setCards(first);
      setIndex(0);
      setStatus('ready');
      setAwaitingFirstBatchTail(true);
      // Immediately go get the rest of the batch in the background — see
      // CLAUDE.md "Decisions already made" for why this is split instead of
      // one call for all of CARD_COUNT.
      firstBatchTail.current = fetchBatch(CARD_COUNT - FIRST_PAINT_COUNT).then(handleTailSettled);
    });
  }, [fetchBatch, handleTailSettled]);

  useEffect(() => {
    load();
    // Only on mount — `notes` is captured once, when the user tapped "Buscar
    // ideas"; it shouldn't re-trigger a fresh batch on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    if (index >= cards.length) {
      if (pendingBatch.current) {
        const next = pendingBatch.current;
        pendingBatch.current = null;
        setCards(next);
        setIndex(0);
      } else if (firstBatchTail.current) {
        // Ran out of the first FIRST_PAINT_COUNT cards before the rest of
        // the batch landed — hold here; handleTailSettled resumes the deck
        // once it does.
        caughtUpDuringTail.current = true;
        setStatus('loading');
      } else {
        setStatus('waiting');
        maybePrefetch();
      }
      return;
    }
    // While the first batch's tail is still in flight, cards.length sits at
    // FIRST_PAINT_COUNT, which happens to equal PREFETCH_AT_REMAINING —
    // without this guard the check below would misfire and kick off a
    // redundant third call on top of the two the first batch already makes.
    if (firstBatchTail.current) return;
    if (cards.length - index === PREFETCH_AT_REMAINING) {
      maybePrefetch();
    }
  }, [index, cards, status, maybePrefetch]);

  const advance = useCallback(() => setIndex((i) => i + 1), []);

  // Cards already swiped stay in `cards` — advance() only ever increments
  // `index`, nothing ever removes or overwrites an earlier entry within the
  // current batch — so going back one card needs no re-fetch, just showing
  // the same array at a lower index. No-ops at the start of the batch;
  // rewinding into a previous, already-replaced batch isn't supported.
  const rewind = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Full card is serialized into the route param rather than looked up by
  // id — a suggestion isn't persisted (and has no stable id) until the user
  // taps "Guardar" on the detail screen itself.
  const openDetail = useCallback((card: Card) => {
    router.push({ pathname: '/detail/[id]', params: { id: 'new', card: JSON.stringify(card) } });
  }, []);

  // Swiping is pure back/next navigation, book-style — there's no
  // like/discard concept in this deck (nothing was ever persisted by a
  // swipe; only Detail's Guardar saves a recipe).
  const handleSwipe = useCallback((action: DeckAction) => (action === 'back' ? rewind() : advance()), [rewind, advance]);

  const current = cards[index];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <BackButton accessibilityLabel={t('deck.back')} onPress={() => router.back()} />
        </View>
        {__DEV__ && <DevImageQuotaBar />}
        {(status === 'loading' || status === 'waiting') && <LoadingView />}
        {status === 'error' && <ErrorView onRetry={load} />}
        {status === 'ready' && current && (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.counter}>
              {t('deck.counter', { current: index + 1, total: awaitingFirstBatchTail ? CARD_COUNT : cards.length })}
            </ThemedText>
            <View style={styles.cardArea}>
              <SwipeCard
                key={`${current.title}-${index}`}
                ref={cardRef}
                card={current}
                onSwipe={handleSwipe}
                onOpenDetail={openDetail}
                canGoBack={index > 0}
              />
            </View>
            <Actions cardRef={cardRef} canGoBack={index > 0} />
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

// Both buttons dispatch through the same animated dismiss() as a real
// swipe, rather than jumping the index directly, so tap and swipe feel
// identical. Back is disabled at the start of a batch — see canGoBack on
// SwipeCard for why that boundary needs guarding at the gesture level too.
function Actions({ cardRef, canGoBack }: { cardRef: React.RefObject<SwipeCardHandle | null>; canGoBack: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('deck.previous')}
        onPress={() => cardRef.current?.dismiss('back')}
        disabled={!canGoBack}
        style={[
          styles.actionButton,
          { backgroundColor: theme.surface, borderColor: theme.border },
          !canGoBack && styles.actionButtonDisabled,
        ]}
      >
        <ChevronLeft size={22} color={theme.text} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('deck.next')}
        onPress={() => cardRef.current?.dismiss('next')}
        style={[styles.actionButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <ChevronRight size={22} color={theme.text} />
      </Pressable>
    </View>
  );
}

// A button tap has no drag to honor, so it flies in its own arrow's
// direction: back (‹) exits left, next (›) exits right.
const ACTION_FLY_DIRECTION: Record<DeckAction, 1 | -1> = { back: -1, next: 1 };

const SwipeCard = forwardRef<
  SwipeCardHandle,
  { card: Card; onSwipe: (action: DeckAction) => void; onOpenDetail: (card: Card) => void; canGoBack: boolean }
>(function SwipeCard({ card, onSwipe, onOpenDetail, canGoBack }, ref) {
  const { t } = useTranslation();
  const theme = useTheme();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // flyDirection defaults to the action's own arrow direction (button taps),
  // but a real drag overrides it with wherever the user actually dragged —
  // the card should always visually exit the way your finger moved, even
  // though (per the muscle-memory convention below) that's the *opposite*
  // sign from the button that triggers the same action.
  const fling = useCallback(
    (action: DeckAction, flyDirection: 1 | -1 = ACTION_FLY_DIRECTION[action]) => {
      // A "back" with nowhere to go back to (start of the batch). Spring
      // back to center instead of flying the card off-screen — since index
      // wouldn't actually change, the key on this SwipeCard stays the same,
      // so React reuses this instance rather than remounting it, and
      // translateX would otherwise be left off-screen with nothing to
      // reset it.
      if (action === 'back' && !canGoBack) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        return;
      }
      translateX.value = withTiming(flyDirection * SCREEN_WIDTH * 1.5, { duration: 220, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onSwipe)(action);
      });
    },
    [onSwipe, translateX, translateY, canGoBack],
  );

  useImperativeHandle(ref, () => ({ dismiss: (action: DeckAction) => fling(action) }), [fling]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.2;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const dragDirection = e.translationX > 0 ? 1 : -1;
        // Muscle-memory convention from horizontal paging UIs (Photos,
        // Instagram stories, most carousels): dragging LEFT reveals the
        // NEXT card, dragging RIGHT goes BACK — the reverse of Tinder's
        // discard/like left/right, which this deck doesn't use anymore.
        // See CLAUDE.md "Decisions already made". The card still flies the
        // way you physically dragged it (dragDirection); only which
        // *action* that triggers is inverted.
        const action: DeckAction = dragDirection === 1 ? 'back' : 'next';
        runOnJS(fling)(action, dragDirection);
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  // A real tap gesture, not "pan that barely moved" — Pan only starts
  // sending events once it activates (crosses its own distance threshold),
  // so a genuine tap with ~0 movement never reaches Pan's onEnd at all.
  // Exclusive gives Pan first claim (so drags still swipe); Tap only gets a
  // chance when Pan fails to activate, which is exactly a tap.
  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onOpenDetail)(card);
  });
  const gesture = Gesture.Exclusive(pan, tap);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      {
        rotate: `${interpolate(translateX.value, [-SCREEN_WIDTH, SCREEN_WIDTH], [-12, 12], Extrapolation.CLAMP)}deg`,
      },
    ],
  }));

  const missing = card.ingredients.filter((ingredient) => !ingredient.have);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }, cardStyle]}>
        <View style={[styles.imagePlaceholder, { backgroundColor: theme.accentTint }]}>
          <Bowl size={48} color={theme.accentText} />
          {/* Absolute over the placeholder icon — it stays visible underneath
              (and thus unblocking) until this cross-dissolves in. */}
          <Image source={{ uri: card.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
        </View>

        <View style={styles.cardBody}>
          <ThemedText type="cardTitle">{card.title}</ThemedText>
          <View style={styles.badgeRow}>
            <Badge label={t('deck.minutes', { count: card.minutes })} />
            <Badge label={t(`effort.${card.effort}`)} />
            <CalorieBadge calories={card.calories} />
          </View>
          <ThemedText type="default" themeColor="textSecondary">
            {card.description}
          </ThemedText>
          {missing.length > 0 && (
            <ThemedText type="small" style={{ color: theme.missing }}>
              {t('deck.missing')} {missing.map((ingredient) => ingredient.name).join(', ')}
            </ThemedText>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

// The 2-4s wait for a suggestion batch is the moment most likely to make the
// app feel cheap (see CLAUDE.md "Not yet designed") — a plain spinner isn't
// enough, so this pulses a glyph and cycles a few voseo lines instead.
function LoadingView() {
  const { t } = useTranslation();
  const theme = useTheme();
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
      <Animated.View style={glyphStyle}>
        <Bowl size={56} color={theme.textSecondary} />
      </Animated.View>
      <ThemedText type="default" themeColor="textSecondary" style={styles.loadingLine}>
        {lines[lineIndex]}
      </ThemedText>
    </View>
  );
}

function ErrorView({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.centerFill}>
      <ThemedText type="default" themeColor="textSecondary" style={styles.loadingLine}>
        {t('deck.error')}
      </ThemedText>
      <PrimaryButton label={t('deck.retry')} onPress={onRetry} style={styles.retryButton} />
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
  header: {
    flexDirection: 'row',
    paddingTop: Spacing.two,
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
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  imagePlaceholder: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.35,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  loadingLine: {
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: Spacing.four,
  },
});

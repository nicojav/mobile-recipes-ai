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
import { CARD_COUNT, FIRST_PAINT_COUNT, type CardWithImage, type SuggestRequest } from '@mobile-recipes/shared';

// The Worker never returns `category` on a card (it's a request-only field —
// see ticket "Worker prompt & Card semantics for Repostería"), so the screen
// that requested it stamps the value on in memory, immediately after the
// response is parsed. It then rides along through router params and into
// whatever gets saved, with no further plumbing (StoredCard already types
// this field as optional).
type Card = CardWithImage & { category: SuggestRequest['category'] };

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
// The post-batch "want another country's cuisine?" interstitial — see
// CLAUDE.md's "Decisions already made" for why this is a deliberate, opt-in
// exception to principle 4 (Argentine authenticity).
import { CuisineInterstitial, type Country } from '@/components/cuisine-interstitial';

const SWIPE_THRESHOLD = 120;
const SCREEN_WIDTH = Dimensions.get('window').width;

type Status = 'loading' | 'ready' | 'choosing' | 'error';
type DeckAction = 'back' | 'next';
type SwipeCardHandle = { dismiss: (action: DeckAction) => void };

export default function DeckScreen() {
  const { notes: notesParam, category: categoryParam } = useLocalSearchParams<{ notes?: string; category?: string }>();
  const notes = notesParam ?? '';
  // Captured once at mount, same as `notes` — which pantry this deck instance
  // is feeding never changes mid-screen.
  const category = useRef<SuggestRequest['category']>(categoryParam === 'reposteria' ? 'reposteria' : 'comida').current;
  const { t } = useTranslation();

  const [status, setStatus] = useState<Status>('loading');
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  // True from the moment the first FIRST_PAINT_COUNT cards of a batch land
  // until the rest of that same batch arrives (or fails) — see batchTail
  // below. Only affects the counter: while true, show the full CARD_COUNT as
  // the total instead of the still-partial cards.length, so "1 de 5" doesn't
  // briefly read "1 de 2" and then jump.
  const [awaitingBatchTail, setAwaitingBatchTail] = useState(false);
  // True while a request is being retried after a rate-limit response (see
  // fetchBatch's onThrottled below) — lets LoadingView swap its cycling
  // lines for an honest "estamos al límite" message instead of leaving the
  // user staring at ordinary loading copy for tens of seconds.
  const [throttled, setThrottled] = useState(false);

  // Titles shown so far this session, sent as `exclude` on every follow-up
  // batch so a batch-2 request never repeats a batch-1 dish.
  const shownTitles = useRef<string[]>([]);
  const isFetchingNext = useRef(false);
  const cardRef = useRef<SwipeCardHandle>(null);
  // Bumped every time the deck enters 'choosing' — passed as CuisineInterstitial's
  // `key` below so React always mounts a fresh instance (same reasoning as
  // SwipeCard's own key further down: a reused instance could otherwise let
  // its internal `shown`/`landed` state leak from one appearance to the
  // next). Today the conditional render already unmounts it on its own; this
  // makes that a guarantee instead of an accident of the current JSX shape.
  // State, not a ref — it feeds a `key` prop, and a ref's `.current` can't
  // be read during render under this project's React Compiler lint rules.
  const [interstitialKey, setInterstitialKey] = useState(0);

  // Non-null while a batch's second call (the remaining CARD_COUNT -
  // FIRST_PAINT_COUNT cards) is in flight — only ever checked for
  // truthiness, never awaited, so it's typed as the settled `void` that
  // handleTailSettled itself produces. This is a Groq streaming workaround —
  // see CLAUDE.md "Decisions already made" for why every batch is split into
  // two calls instead of one, and delete this along with the rest of the
  // split if that ever stops being true.
  const batchTail = useRef<Promise<void> | null>(null);
  // Set if the user swipes past the FIRST_PAINT_COUNT cards before the tail
  // above lands — tells handleTailSettled it needs to resume the deck
  // itself, not just append quietly in the background.
  const caughtUpDuringTail = useRef(false);
  // The notes override (country hint) the in-flight/most recent batch was
  // fetched with, if any. Only read by retry() below — resumeSameCuisine and
  // chooseLuckyCuisine already know explicitly which override they want
  // (none, or a fresh country pick); a retry after a failure has no such
  // context of its own, and without this it would silently drop a country
  // batch back to the Argentine default.
  const activeNotesOverride = useRef<string | undefined>(undefined);

  const fetchBatch = useCallback(
    // notesOverride: escape hatch for the cuisine interstitial below — lets
    // a "probá suerte" pick stuff a country hint into the same free-text
    // `notes` channel without touching the request schema.
    async (count?: number, notesOverride?: string): Promise<Card[] | null> => {
      try {
        const next = await fetchSuggestions(notesOverride ?? notes, shownTitles.current, count, () => setThrottled(true), category);
        setThrottled(false);
        shownTitles.current = [...shownTitles.current, ...next.map((c) => c.title)];
        // Fire all image requests concurrently as soon as the batch is
        // known, so the Worker is already generating/caching by the time any
        // card needs its image. Never awaited: a failed prefetch just means
        // the <Image> in SwipeCard loads it lazily instead — see CLAUDE.md's
        // Image pipeline section ("never block the card on the image").
        Image.prefetch(next.map((card) => card.imageUrl)).catch(() => {});
        return next.map((card) => ({ ...card, category }));
      } catch {
        setThrottled(false);
        return null;
      }
    },
    [notes, category],
  );

  // Runs once phase 2 of a batch (the remaining CARD_COUNT -
  // FIRST_PAINT_COUNT cards) settles, success or failure.
  const handleTailSettled = useCallback((rest: Card[] | null) => {
    batchTail.current = null;
    setAwaitingBatchTail(false);
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
      // The batch ends early at FIRST_PAINT_COUNT cards — same recovery as
      // any other exhausted batch: let the user pick how to continue via
      // the interstitial. Starting a fresh batch straight from here (as an
      // earlier version did) would silently drop this batch's own
      // notesOverride — e.g. reverting a country pick back to Argentine mid-
      // cuisine.
      setInterstitialKey((k) => k + 1);
      setStatus('choosing');
    }
  }, []);

  // The single way any batch begins — the initial load, "Seguí en
  // Argentina", and a country pick all call this. Always fetches
  // FIRST_PAINT_COUNT cards first so the deck can render before the rest of
  // the batch exists, then immediately fetches the remaining CARD_COUNT -
  // FIRST_PAINT_COUNT in the background — see CLAUDE.md "Decisions already
  // made" for why this split exists (Groq can't stream structured output)
  // and delete it in favor of one streamed call if that ever changes.
  // notesOverride is captured by both calls' closures, so phase 2 of a
  // country batch stays in the same cuisine as phase 1 automatically.
  const startBatch = useCallback(
    (notesOverride?: string) => {
      if (isFetchingNext.current || batchTail.current) return;
      activeNotesOverride.current = notesOverride;
      isFetchingNext.current = true;
      setStatus('loading');
      fetchBatch(FIRST_PAINT_COUNT, notesOverride).then((first) => {
        isFetchingNext.current = false;
        if (!first) {
          setStatus('error');
          return;
        }
        setCards(first);
        setIndex(0);
        setStatus('ready');
        setAwaitingBatchTail(true);
        batchTail.current = fetchBatch(CARD_COUNT - FIRST_PAINT_COUNT, notesOverride).then(handleTailSettled);
      });
    },
    [fetchBatch, handleTailSettled],
  );

  useEffect(() => {
    startBatch();
    // Only on mount — `notes` is captured once, when the user tapped "Buscar
    // ideas"; it shouldn't re-trigger a fresh batch on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retries whatever batch just failed, in the same cuisine it failed in —
  // see activeNotesOverride's own comment above for why that ref exists.
  const retry = useCallback(() => startBatch(activeNotesOverride.current), [startBatch]);

  // Batch end stops at 'choosing' instead of resolving straight through —
  // see the cuisine interstitial below. "Seguí en Argentina" always means
  // the plain Argentine default (CuisineInterstitial's CURRENT), regardless
  // of what cuisine the batch that just ended was in — so this never reuses
  // activeNotesOverride.
  const resumeSameCuisine = useCallback(() => {
    if (batchTail.current) {
      // Ran out of the first FIRST_PAINT_COUNT cards before the rest of
      // the batch landed — hold here; handleTailSettled resumes the deck
      // once it does.
      caughtUpDuringTail.current = true;
      setStatus('loading');
    } else {
      startBatch();
    }
  }, [startBatch]);

  // Fetches fresh with a country hint stuffed into the existing free-text
  // `notes` field.
  const chooseLuckyCuisine = useCallback(
    (country: Country) => {
      const hint = `${notes} Che, tirame algo de cocina ${country.name} para variar hoy.`.trim();
      startBatch(hint);
    },
    [notes, startBatch],
  );

  useEffect(() => {
    if (status !== 'ready') return;
    if (index >= cards.length) {
      if (batchTail.current) {
        // Mid the batch's two-call split (see CLAUDE.md "Prefetching") —
        // this isn't a real batch end, just the seam between phase 1 and
        // phase 2 of the same 5-card batch. Don't ask; hold for
        // handleTailSettled the same way resumeSameCuisine does.
        caughtUpDuringTail.current = true;
        setStatus('loading');
        return;
      }
      setInterstitialKey((k) => k + 1);
      setStatus('choosing');
    }
  }, [index, cards, status]);

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
          <BackButton accessibilityLabel={t('deck.back')} />
        </View>
        {__DEV__ && <DevImageQuotaBar />}
        {/* Dev-only visibility into the background batch-tail fetch (see
            startBatch/handleTailSettled) — with no indicator here, phase 2
            fetching quietly while status stays 'ready' looks indistinguishable
            from not happening at all, including a silent rate-limit retry
            that only ever surfaced once the user swiped far enough to block
            on it via LoadingView below. */}
        {__DEV__ && awaitingBatchTail && (
          <View style={styles.tailDebugBar}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.tailDebugText}>
              {throttled
                ? '🧪 resto de la tanda: límite de Groq alcanzado, reintentando…'
                : '🧪 cargando el resto de la tanda en segundo plano…'}
            </ThemedText>
          </View>
        )}
        {status === 'loading' && <LoadingView throttled={throttled} />}
        {status === 'error' && <ErrorView onRetry={retry} />}
        {status === 'choosing' && (
          <View style={styles.cardArea}>
            <CuisineInterstitial key={interstitialKey} onContinue={resumeSameCuisine} onLucky={chooseLuckyCuisine} />
          </View>
        )}
        {status === 'ready' && current && (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.counter}>
              {t('deck.counter', { current: index + 1, total: awaitingBatchTail ? CARD_COUNT : cards.length })}
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
function LoadingView({ throttled }: { throttled?: boolean }) {
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
        {throttled ? t('deck.throttled') : lines[lineIndex]}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  tailDebugBar: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    marginBottom: Spacing.two,
    backgroundColor: '#6b728033',
  },
  tailDebugText: {
    textAlign: 'center',
    color: '#4b5563',
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

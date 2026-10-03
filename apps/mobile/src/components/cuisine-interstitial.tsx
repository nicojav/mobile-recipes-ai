import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Circle, Svg } from 'react-native-svg';

import { ThemedText } from './themed-text';
import { PrimaryButton } from './primary-button';
import { SecondaryButton } from './secondary-button';
import { CountryFlag } from './country-flag';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Shown once a 5-card batch runs out, before the next one loads — lets the
// user roll for a batch from another country's cuisine instead of another
// Argentine one. Deliberate, opt-in exception to CLAUDE.md principle 4
// (Argentine authenticity) — see CLAUDE.md's "Decisions already made" for
// why this doesn't change the app's default repertoire.
//
// Design settled through a `/prototype` UI session (see
// plans/prototype/cuisine-interstitial-redesign for the full record): a
// chrome-light "medallion" layout with the wait-to-unlock drawn as a ring
// around it, real vector flags (CountryFlag) instead of the system emoji
// font, and a manual country picker that only appears after a time-gated
// wait instead of being available immediately — keeping the roulette as the
// primary affordance rather than one option among many.

export type Country = { name: string };

const CURRENT: Country = { name: 'Argentina' };

// Picked for having a distinct, recognizable dish repertoire and an easy
// English imagePrompt story — see CLAUDE.md's image pipeline section.
const COUNTRIES: Country[] = [
  { name: 'México' },
  { name: 'Perú' },
  { name: 'Italia' },
  { name: 'España' },
  { name: 'Japón' },
  { name: 'Marruecos' },
  { name: 'Grecia' },
  { name: 'Francia' },
  { name: 'Corea' },
  { name: 'Estados Unidos' },
  { name: 'Bulgaria' },
  { name: 'Alemania' },
  { name: 'Inglaterra' },
  { name: 'Ucrania' },
];

// Filtered rather than trusted-by-convention — COUNTRIES is a plain list
// meant to be edited freely (countries get added/removed), so nothing there
// should have to remember "don't add Argentina, it's the default." This
// guarantees it unconditionally: whatever ends up in COUNTRIES, Argentina
// can never be a spin result.
const SPIN_POOL = COUNTRIES.filter((c) => c.name !== CURRENT.name);

function pickRandomCountry(): Country {
  return SPIN_POOL[Math.floor(Math.random() * SPIN_POOL.length)];
}

// The just-landed country becomes ~1/7th as likely as any other single
// country on the very next spin, not impossible — filtering it out entirely
// would read as broken once you've toured a few countries in a row (the pool
// visibly shrinks, and eventually a country becomes "unspinnable" until some
// other one comes up first). Down-weighting keeps the full pool honest while
// still avoiding the annoying "spun Perú, landed Perú again" case. Only
// applies to the roulette's own random pick — never to a country tapped
// directly in the unlocked picker below, since that's a deliberate choice,
// not a spin.
const REPEAT_WEIGHT = 0.15;

function pickWeightedCountry(lastLanded: Country | null): Country {
  const weights = SPIN_POOL.map((c) => (lastLanded && c.name === lastLanded.name ? REPEAT_WEIGHT : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < SPIN_POOL.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return SPIN_POOL[i];
  }
  return SPIN_POOL[SPIN_POOL.length - 1];
}

// No real strip/translateX math — cycles the displayed country on a timer
// that slows down toward the end, which reads as a spin without needing to
// measure layout.
const SPIN_TICK_DELAYS = [55, 55, 65, 75, 90, 110, 140, 180, 230, 300];

// How long the roulette sits idle before the manual picker earns itself in.
// Not reset by spinning again — the clock is about how long the user has
// been looking at this screen at all, not how long since their last spin.
const UNLOCK_MS = 6000;

const RING_SIZE = 156;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const MEDALLION_SIZE = RING_SIZE - RING_STROKE * 4;
const AVATAR_SIZE = 56;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function CuisineInterstitial({
  onContinue,
  onLucky,
  lastCountry,
}: {
  onContinue: () => void;
  onLucky: (country: Country) => void;
  // The country the previous spin actually landed on and got picked, kept by
  // the caller (not this component's own state) — deck.tsx remounts this
  // component fresh every time a batch runs out, so the repeat-weighting
  // above needs its memory to live one level up to carry across appearances.
  lastCountry: Country | null;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [spinning, setSpinning] = useState(false);
  const [shown, setShown] = useState<Country>(CURRENT);
  const [landed, setLanded] = useState<Country | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(0);
  const pulse = useSharedValue(0);
  const reveal = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: UNLOCK_MS });
    const unlockTimer = setTimeout(() => setUnlocked(true), UNLOCK_MS);
    return () => clearTimeout(unlockTimer);
    // Once per mount — this component is remounted fresh every time the deck
    // re-enters 'choosing' (see deck.tsx's interstitialKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!spinning) {
      pulse.value = withTiming(0, { duration: 150 });
      return;
    }
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 260 }), withTiming(0, { duration: 260 })), -1, false);
  }, [spinning, pulse]);

  useEffect(() => {
    if (unlocked) reveal.value = withTiming(1, { duration: 420 });
  }, [unlocked, reveal]);

  const medallionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.05 }],
  }));

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.value),
  }));

  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: 14 * (1 - reveal.value) }],
  }));

  const spin = () => {
    setLanded(null);
    setSpinning(true);
    const target = pickWeightedCountry(lastCountry);
    let i = 0;
    const tick = () => {
      setShown(pickRandomCountry());
      if (i < SPIN_TICK_DELAYS.length - 1) {
        i += 1;
        timeoutRef.current = setTimeout(tick, SPIN_TICK_DELAYS[i]);
      } else {
        setShown(target);
        setSpinning(false);
        setLanded(target);
      }
    };
    tick();
  };

  return (
    <View style={styles.stage}>
      <ThemedText type="micro" themeColor="textSecondary" style={styles.eyebrow}>
        {t('deck.cuisine.eyebrow')}
      </ThemedText>

      <View style={styles.ringWrap}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={theme.border}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={theme.accent}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            animatedProps={ringProps}
            fill="none"
            // Starts at 12 o'clock instead of svg's default 3 o'clock.
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </Svg>
        <Animated.View style={[styles.medallionShadow, { backgroundColor: theme.surface }, medallionStyle]}>
          <CountryFlag name={shown.name} size={MEDALLION_SIZE} />
        </Animated.View>
      </View>

      <ThemedText type="title" style={styles.countryName}>
        {shown.name}
      </ThemedText>

      <View style={styles.actions}>
        <PrimaryButton
          label={spinning ? t('deck.cuisine.spinning') : landed ? t('deck.cuisine.confirm', { country: landed.name }) : t('deck.cuisine.spin')}
          onPress={landed ? () => onLucky(landed) : spin}
          disabled={spinning}
          style={styles.primary}
        />
        <SecondaryButton
          label={t('deck.cuisine.keepCurrent', { country: CURRENT.name })}
          onPress={onContinue}
          disabled={spinning}
          style={styles.secondary}
        />
      </View>

      {unlocked && (
        <Animated.View style={[styles.unlockedArea, revealStyle]}>
          <ThemedText type="micro" themeColor="textSecondary" style={styles.unlockedLabel}>
            {t('deck.cuisine.chooseDirectly')}
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
            {SPIN_POOL.map((country) => (
              <Pressable
                key={country.name}
                onPress={() => onLucky(country)}
                style={({ pressed }) => [styles.avatarWrap, pressed ? styles.avatarPressed : null]}
              >
                <View style={[styles.avatarShadow, { backgroundColor: theme.surface }]}>
                  <CountryFlag name={country.name} size={AVATAR_SIZE} />
                </View>
                <ThemedText type="micro" themeColor="textSecondary" style={styles.avatarLabel} numberOfLines={1}>
                  {country.name}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  eyebrow: {
    letterSpacing: 2,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallionShadow: {
    borderRadius: MEDALLION_SIZE / 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  countryName: {
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  primary: {
    alignSelf: 'stretch',
  },
  secondary: {
    alignSelf: 'stretch',
  },
  unlockedArea: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  unlockedLabel: {
    textAlign: 'center',
    letterSpacing: 1.5,
  },
  avatarRow: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
  },
  avatarWrap: {
    alignItems: 'center',
    gap: Spacing.half,
    width: 68,
  },
  avatarPressed: {
    opacity: 0.6,
  },
  avatarShadow: {
    borderRadius: AVATAR_SIZE / 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  avatarLabel: {
    textAlign: 'center',
    textTransform: 'none',
    letterSpacing: 0,
  },
});

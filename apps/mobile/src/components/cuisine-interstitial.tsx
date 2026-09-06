import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from './themed-text';
import { PrimaryButton } from './primary-button';
import { SecondaryButton } from './secondary-button';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Shown once a 5-card batch runs out, before the next one loads — lets the
// user roll for a batch from another country's cuisine instead of another
// Argentine one. Deliberate, opt-in exception to CLAUDE.md principle 4
// (Argentine authenticity) — see CLAUDE.md's "Decisions already made" for
// why this doesn't change the app's default repertoire.

export type Country = { name: string; flag: string };

const CURRENT: Country = { name: 'Argentina', flag: '🇦🇷' };

// Picked for having a distinct, recognizable dish repertoire and an easy
// English imagePrompt story — see CLAUDE.md's image pipeline section.
// Earlier this session the flag glyph looked "cut" and got swapped for a
// generic globe on the assumption flag emoji themselves were the problem —
// that was wrong. The actual bug was reelGlyph's missing `lineHeight` (see
// below), which clips ANY oversized glyph, flags included. Fixed at the
// style level, so real per-country flags are back.
const COUNTRIES: Country[] = [
  { name: 'México', flag: '🇲🇽' },
  { name: 'Perú', flag: '🇵🇪' },
  { name: 'Italia', flag: '🇮🇹' },
  { name: 'España', flag: '🇪🇸' },
  { name: 'Japón', flag: '🇯🇵' },
  { name: 'Marruecos', flag: '🇲🇦' },
  { name: 'Grecia', flag: '🇬🇷' },
  { name: 'Francia', flag: '🇫🇷' },
  { name: 'Corea', flag: '🇰🇷' },
  { name: 'Estados Unidos', flag: '🇺🇸' },
  { name: 'Bulgaria', flag: '🇧🇬' },
  { name: 'Alemania', flag: '🇩🇪' },
  // No standalone Unicode flag for England exists as a reliable 2-letter
  // country-code emoji — the real one is a tag-sequence subdivision flag
  // with even worse cross-platform support than the bug just fixed above.
  // United Kingdom's flag stands in.
  { name: 'Inglaterra', flag: '🇬🇧' },
];

// Filtered rather than trusted-by-convention — COUNTRIES is a plain list
// meant to be edited freely (countries get added/removed), so nothing there
// should have to remember "don't add Argentina, it's the default." This
// guarantees it unconditionally: whatever ends up in COUNTRIES, Argentina
// can never be a spin result.
const SPIN_POOL = COUNTRIES.filter((c) => c.name !== CURRENT.name);

export function pickRandomCountry(): Country {
  return SPIN_POOL[Math.floor(Math.random() * SPIN_POOL.length)];
}

// No real strip/translateX math — cycles the displayed country (flag and
// name together, they're one unit) on a timer that slows down toward the
// end, which reads as a spin without needing to measure layout.
const SPIN_TICK_DELAYS = [60, 60, 70, 80, 90, 110, 140, 180, 230, 300];

export function CuisineInterstitial({
  onContinue,
  onLucky,
}: {
  onContinue: () => void;
  onLucky: (country: Country) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [spinning, setSpinning] = useState(false);
  const [shown, setShown] = useState<Country>(CURRENT);
  const [landed, setLanded] = useState<Country | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const spin = () => {
    setLanded(null);
    setSpinning(true);
    const target = pickRandomCountry();
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
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ThemedText type="cardTitle" style={styles.headline}>
        {t('deck.cuisine.headline')}
      </ThemedText>
      <View style={[styles.reel, { borderColor: theme.border, backgroundColor: theme.accentTint }]}>
        <ThemedText style={styles.reelGlyph}>{shown.flag}</ThemedText>
        <ThemedText type="sheetTitle">{shown.name}</ThemedText>
      </View>

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
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  headline: {
    textAlign: 'center',
  },
  reel: {
    width: '100%',
    borderRadius: Radius.small,
    borderWidth: 1,
    paddingVertical: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
  },
  reelGlyph: {
    // Must set lineHeight explicitly — ThemedText's default type carries a
    // lineHeight of 24, which clips a 40px glyph's top/bottom edges if left
    // unset (this, not the flag emoji itself, was the earlier "cut" icon).
    fontSize: 40,
    lineHeight: 48,
  },
  primary: {
    alignSelf: 'stretch',
  },
  secondary: {
    alignSelf: 'stretch',
  },
});

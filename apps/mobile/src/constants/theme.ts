/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// "Mercado" — see Design.md at the repo root for the full spec (palette
// rationale, contrast ratios, type scale, icon set, component list). This
// file is just the tokens it defines, transcribed.
export const Colors = {
  light: {
    background: '#FAFAF8', // page
    surface: '#FFFFFF', // cards, sheets
    border: '#E9EAE5',
    text: '#17181A',
    textSecondary: '#6E7168', // 4.97:1 on surface
    accent: '#4B6B4F', // sage — white label 5.97:1
    accentText: '#4B6B4F', // accent used as text/outline — light bg needs no separate shade
    accentTint: '#EAF0EA', // count-badge / selected-zone fill
    missing: '#8A5A06', // "Te falta:" — 5.92:1 on surface
    danger: '#B3261E', // delete-confirm button
  },
  dark: {
    background: '#17181A',
    surface: '#1E1F21',
    border: '#2E3032',
    text: '#F4F5F2', // 16.23:1 on background
    textSecondary: '#9CA097', // 6.20:1 on surface
    accent: '#4B6B4F', // same value — white label 5.97:1 regardless of page bg
    accentText: '#6B8F70', // accent as text/outline on dark bg — 4.90:1 (base accent only ~3:1 here)
    accentTint: '#233026',
    missing: '#E3A039', // 7.91:1 on background
    danger: '#E5695F', // delete-confirm button, lightened for dark bg
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Calorie-chip ramp — light → hearty, deliberately not good → bad (see Design.md).
// Each stop is ≥4.5:1 against a white label; interpolated values sit between
// adjacent stops, so the whole ramp passes. Scheme-independent, same reasoning
// as `accent` above: contrast is measured against the white label, not the page.
export const CalorieRamp = ['#4B6B4F', '#8A5A06', '#A24B2A'] as const;

// kcal per serving mapped onto the ramp; values outside are clamped.
export const CalorieRange = { min: 250, max: 900 } as const;

// Google Fonts loaded via useFonts in _layout.tsx (@expo-google-fonts/sora,
// @expo-google-fonts/work-sans) — these are the exact family names those
// packages register, not arbitrary strings.
export const FontFamily = {
  heading: 'Sora_700Bold',
  headingSemiBold: 'Sora_600SemiBold',
  body: 'WorkSans_500Medium',
  bodyRegular: 'WorkSans_400Regular',
  bodySemiBold: 'WorkSans_600SemiBold',
  bodyBold: 'WorkSans_700Bold',
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    mono: 'monospace',
  },
  web: {
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8, // inputs, small buttons
  card: 18, // bento cards
  sheet: 24, // bottom-sheet top corners
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

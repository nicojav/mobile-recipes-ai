# Design.md — visual system

This file is the spec for the app's visual design: tokens, type, icons, and the
core components. It's loaded alongside `CLAUDE.md`, which stays the source of
truth for product scope and decisions — this file only covers how things look
and are structured on screen.

**Direction: "Mercado."** Chosen from a canvas that explored three ingredient-chip
layouts and three whole-app style systems side by side (design-canvas session,
2026-09-03). Clean, off-white, sage green, generous whitespace — closest to
principle 5 ("a knowledgeable friend looking in your fridge, not a chef, not an
app"): confident without performing.

This supersedes the smaller "keep the neutral base, add one paprika accent"
plan from earlier in that session. Mercado replaces the base palette, adds two
new fonts, replaces the emoji-glyph icons with a real icon set, and replaces
Mi cocina's stacked-accordion layout with a bento grid + bottom sheet. Treat
every value below as the new ground truth for `apps/mobile/src/constants/theme.ts`
and the screens, not an addition to what's there today.

## Color tokens

Extends `Colors` in `constants/theme.ts`. Every text-on-fill pair below is
verified ≥ 4.5:1 (WCAG AA, body text); ratios noted inline.

```ts
export const Colors = {
  light: {
    background:         '#FAFAF8',  // page
    surface:            '#FFFFFF',  // cards, sheets
    border:             '#E9EAE5',
    text:                '#17181A',
    textSecondary:       '#6E7168',  // 4.97:1 on surface
    accent:              '#4B6B4F',  // sage — white label 5.97:1
    accentText:          '#4B6B4F',  // accent used as text/outline (light bg needs no separate shade)
    accentTint:          '#EAF0EA',  // count-badge / selected-zone fill
    missing:             '#8A5A06',  // "Te falta:" — 5.92:1 on surface (was #b8860b, 3.25:1, fails AA — fixed here)
  },
  dark: {
    background:          '#17181A',
    surface:              '#1E1F21',
    border:               '#2E3032',
    text:                 '#F4F5F2',  // 16.23:1 on background
    textSecondary:        '#9CA097',  // 6.20:1 on surface
    accent:               '#4B6B4F',  // same value — white label 5.97:1 regardless of page bg
    accentText:           '#6B8F70',  // for accent used AS text/outline on dark bg — 4.90:1 (accent itself only reaches ~3:1 here)
    accentTint:           '#233026',  // dark equivalent of accentTint
    missing:              '#E3A039',  // 7.91:1 on dark background
  },
} as const;
```

Notes:
- `accent` is one value in both schemes when used as a **fill** (chip fill, card
  border-highlight, CTA fill) — contrast is between the fill and its white
  label, not the fill and the page background, so it doesn't need a dark
  variant there. Only reach for `accentText` when the sage color itself is the
  thing being read as text/outline against a page background (light mode
  passes at the base `accent` value; dark mode needs the lighter shade above,
  since that combination drops to ~3:1 with the base value).
- Delete the dead `linkPrimary` blue (`#3c87f7`) in `themed-text.tsx` — unused
  today, and outside this palette.
- No `like` / `discard` tokens — the swipe-stamp UI they belonged to is gone
  from `deck.tsx` (it's book-style back/next navigation now, no
  swipe-to-like/discard). Nothing in the current app needs them.

## Type scale

Two Google Fonts, loaded via `expo-font` / `useFonts` (the app currently loads
no custom fonts anywhere — this is new setup, not a swap):

- **Sora** — headings, card titles, primary buttons, section labels. Weights
  600/700.
- **Work Sans** — everything else (body, chip labels, captions). Weights
  400/500/600.

```
title      Sora     27/33  700   — screen titles ("Mi cocina")
cardTitle  Sora     22/28  700   — recipe title on the deck card
sheetTitle Sora     18/24  700   — bottom-sheet header ("Heladera · 7 de 12")
button     Sora     14/20  600   — primary button / FAB label
body       WorkSans 16/24  500   — default body text
small      WorkSans 14/20  500   — chip labels, secondary link text
smallBold  WorkSans 14/20  700   — active chip labels
micro      WorkSans 11/14  700   — uppercase card/section micro-labels, 0.08em tracking
```

Replaces the current `ThemedText` scale's `title` (48/52, always overridden
per call site anyway) and `subtitle` (32/44, same problem) — the sizes above
are what screens actually render, not a nominal scale nobody uses.

## Icon set

Thin-line SVG, `stroke-width: 1.5`, `stroke-linecap: round`, 24×24 viewBox,
rendered at 14–16px. Replaces every emoji/glyph icon in the app today (`‹ › ✓
– 🍳`) — those were always a placeholder for "no icon library," not a style
choice. (Checked against the current `deck.tsx`: it's book-style back/next
navigation now, not swipe-to-like/discard, so there's no heart or x-as-action
anywhere in the app — dropped both from this set. `x` survives only as the
bottom sheet's close control.)

Needs `react-native-svg` (`npx expo install react-native-svg`) — not currently
a dependency. Six core icons cover the whole app:

| Icon | Used for | Replaces |
|---|---|---|
| chevron-left | back button, deck "previous" | `‹` |
| chevron-right | deck "next" | `›` |
| x | bottom-sheet close | — (new) |
| bookmark | "Guardadas" link | — (new) |
| search | quick-add field, floating CTA | — (new) |
| check-circle / circle (outline) | ingredient have/missing rows | `✓ / –` |

Plus one illustrative placeholder — a bowl-with-steam line mark — for the
recipe-image well before the real image loads, replacing the `🍳` emoji.

Build these as a small local SVG icon set (`apps/mobile/src/components/icons/`),
not a third-party icon font — five bespoke icons don't justify pulling in a
whole set, and it keeps the exact stroke weight/style controlled.

## Radius, spacing, motion

Radius: `8` inputs/small buttons unchanged, `18` bento cards (was 16 for the
old card style — slightly larger to read as softer/more modern), `24`
bottom-sheet top corners, `999` pills unchanged.

Spacing: unchanged (`Spacing` scale in `theme.ts` — 4/8/16/24/32/64 already
fits this layout without new values).

Motion: extends `deck.tsx`'s existing constants, doesn't replace them —

```
sheet open/close   withSpring (damping ~18, matches deck's snap-back feel)
card press         scale 0.97, withTiming 100ms
chip toggle        scale 0.96 tap feedback, withSpring on release
backdrop fade      withTiming 180ms
```

## Layout pattern — bento + sheet, not accordion

Mi cocina's structure changes from a single scrolling list of collapsible
groups to:

1. **A 2-column bento grid** of `LocationCard`s, one per `Location`. Each card
   shows the location name, an `active/total` count badge, and 3–4 real chips
   as a preview (not an abstraction — actual chip components at a smaller
   size), with a `+N más` tag chip if more exist. Cajón (smallest group)
   spans both columns as a single wide card rather than sitting alone.
2. **Tapping a card opens a bottom sheet** — drag handle, `sheetTitle` header
   with a close `x`, the location's full chip list, a `Listo` button. This
   replaces the accordion's inline expand/collapse; it's the same "see
   everything, toggle anything" capability, just off the main scroll.
3. **A floating pill CTA** ("Buscar ideas · {count}") replaces the fixed
   full-width footer bar — anchored bottom-center over the grid, not a
   docked bar.

This pattern only applies to Mi cocina. Deck, Detalle, and Guardadas keep
their current information architecture — they're restyled with these tokens,
not restructured. (Detalle and Guardadas weren't separately mocked on the
canvas; extrapolate directly from these tokens plus the existing component
specs below — nothing about their structure is changing.)

## Components

Every state (default / pressed / active / disabled) uses the tokens above,
not one-off hex values. Extract these as real components in
`apps/mobile/src/components/` — today `Badge`, the back button, and the
inverted-fill primary button are copy-pasted per screen; this pass fixes that
at the same time as the restyle.

- **`Chip`** — pill, `radius: 999`. Active: `accent` fill, white label,
  `smallBold`. Inactive: transparent fill, `1px border`, `textSecondary`
  label, `small`. Same component at two sizes: full (Mi cocina's bottom
  sheet, `padding: 6/16`) and compact (bento card preview, `padding: 4/10`,
  `font-size: 12`).
- **`LocationCard`** — `surface` fill, `1px border`, `radius: 18`. Selected/
  open state: `1.5px accent border` + subtle shadow lift, no fill change.
- **`BottomSheet`** — generic, takes a title and children; used for the
  location chip list now, reusable later if another screen needs one. Handle
  bar `4px` tall, `2px radius`, `border` color.
- **`FloatingCTA`** — pill, `accent` fill, icon + label, fixed position,
  shadow. Replaces the old full-width footer `Pressable` pattern.
- **`BackButton`** — 40×40 circle, `surface` fill, `border`, `chevron-left`
  icon (replaces the `‹` glyph + inline styles in deck/detail/saved).
- **`PrimaryButton`** — replaces the `backgroundColor: theme.text` +
  scheme-flipped-label pattern (index CTA, deck retry, detail "La cociné")
  with one component: `text`-on-`surface`-inverted fill (dark button, light
  label in light mode; flips in dark mode), `button` type.
- **`Badge`** — small pill, `border`, `textSecondary` label, `small` type.
  Unifies the count badge (bento card), the time/effort badges (deck card),
  and the servings badge (detail).
- **`IngredientRow`** (detail screen) — check/x replaced by the filled/open
  circle icon pair described above; missing items use the `missing` color
  token, not a hardcoded hex.
- **`EmptyState`** — not designed on the canvas yet (still open per
  `CLAUDE.md`'s "Not yet designed" list); use `Screen`'s tokens (surface,
  textSecondary, a simple icon) when it's built, don't hold up this pass for it.

## Accessibility

- `accessibilityRole="button"` + `accessibilityState={{ selected }}` on every
  `Chip` — absent today.
- 44×44 minimum hit target on every tappable control, including compact
  chips (pad the touchable area past the visual chip if needed — don't
  shrink the tap target to match the smaller visual size).
- State is never color-only: active chips differ in fill **and** weight
  (`smallBold` vs `small`); the open `LocationCard` differs in border
  **and** shadow, not just border color.
- Bottom sheet: focus moves to the sheet header on open; the backdrop is
  tappable to dismiss, in addition to the explicit close `x`.

## What's still open

- Detalle and Guardadas restyle (tokens apply directly; no structural canvas
  mock exists for them — see Layout pattern above).
- The empty state (Mi cocina before any items exist) — still undesigned.
- The loading state during the 2–4s suggestion wait — still undesigned,
  `CLAUDE.md` flags this as the one to design first when it's tackled.

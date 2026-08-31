# Milestone 1 — Foundation

**Covers spec build order steps 0–1.**
**Done when:** all 30 seed items render as chips on a real Android phone via Expo
Go, toggles persist across an app restart, and `condimentos`/`cajón` are collapsed
by default. No network code exists yet.

> **Item count correction:** `CLAUDE.md`'s prose said "~35 items" but its own
> Seed data block lists 30 (freezer 3, heladera 12, alacena 5, condimentos 7,
> cajón 3). Both this plan and `CLAUDE.md` now use 30, the literal list, as
> ground truth — corrected in `CLAUDE.md` directly.

> **Naming pass:** code identifiers were reworked to be all-English — `Ubicacion`
> → `Location`, `Item.nombre`/`ubicacion`/`activo` → `name`/`location`/`active`,
> the `guardadas` table → `saved_recipes`, `suelto` → `notes`. `Location`'s enum
> *values* (`freezer`, `heladera`, ...) stay Spanish — that's user content, not a
> code identifier. UI copy was also pulled out of components into an
> `i18next`/`react-i18next` resource bundle (`apps/mobile/src/i18n`), `es-AR`
> only for now. See `CLAUDE.md` → Decisions already made for the reasoning.
> Code samples below reflect the new names.

> **Expo SDK pinned to 54, not latest.** `create-expo-app` originally scaffolded
> against SDK 57, but the author's phone can only get Expo Go 54.0.8 from Play
> Store (recent Expo Go releases are pinned 1:1 to a single SDK, and the phone's
> Android version is below the cutoff for anything newer) — SDK 57 wouldn't open
> at all. Downgraded `apps/mobile` to `expo@~54.0.37` and every `expo-*`/RN/React
> package to its SDK 54-matched version via `npx expo install --fix`. This also
> broke the default template's tab-bar/Explore-tab/animated-splash scaffolding
> (SDK 57-only APIs) — deleted rather than patched, since none of it was used by
> the actual app; `_layout.tsx` is now a plain `Stack` with a standard splash
> hide, no tabs. If a future SDK bump is needed, re-check Expo Go's SDK support
> on the target device first — this is a recurring constraint, not a one-time fix.
>
> **Status: done.** Verified end-to-end in Expo Go on the author's Android
> phone: chips render and toggle, state survives a full app restart. `Buscar
> ideas` doing nothing on tap is expected, not a bug — it gets wired up in
> milestone 2.

## Why this grouping

Steps 0 and 1 are both "make the workspace and the first screen exist" — there's no
meaningful checkpoint between "npm workspaces resolve" and "the chip UI works,"
since the chip UI is the first thing that proves the workspace actually works.
Splitting them would just add a status-table row with nothing to verify.

## Step 0 — Workspace skeleton

### Goal
A monorepo where `apps/mobile`, `apps/worker`, and `packages/shared` all exist, both
apps start, and both can import from shared.

### Files to create
```
package.json                 ← root, workspaces
apps/mobile/                 ← via create-expo-app
apps/worker/                 ← via npm create cloudflare
packages/shared/package.json
packages/shared/tsconfig.json
packages/shared/src/index.ts
```

### Key shapes
Root `package.json`:
```json
{
  "name": "mobile-recipes-ai",
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}
```

`packages/shared/package.json` — name it `@mobile-recipes/shared`; `main`/`types` point at
`src/index.ts` (or a build output if the tooling needs one — prefer no build step,
consumed as TS source, since both Metro and Wrangler can do that).

### Commands
```
npx create-expo-app apps/mobile
npm create cloudflare apps/worker -- --type=hello-world
mkdir -p packages/shared/src
npx expo start        # from apps/mobile
npx wrangler dev       # from apps/worker
```

> **Deviation:** `npm create cloudflare` (and `wrangler init`) use an
> interactive `@clack/prompts` wizard that requires a real TTY — it doesn't
> complete under `--accept-defaults`/`-y` piped through a non-interactive
> shell (it renders the first menu, then exits). `apps/worker` was hand-written
> instead: `package.json`, `wrangler.toml`, `tsconfig.json`, `src/index.ts`,
> matching what the hello-world TS template produces. End state is identical —
> verified with `wrangler dev` + `curl` (see acceptance below).

### Known friction
Metro (React Native's bundler) has friction with symlinked workspace packages under
some configs — that's *why* the spec picked npm workspaces over pnpm, but npm
workspaces still symlink into `node_modules`. `apps/mobile/metro.config.js` needs
`watchFolders` including the monorepo root, and resolution needs to reach
`packages/shared`. Confirm this works before writing any real code in shared —
don't discover it in milestone 2.

### Acceptance criteria
- [x] `npm install` at repo root succeeds and links `packages/shared` into both apps
- [x] A throwaway `export const ping = "pong"` in `packages/shared/src/index.ts`
      imported cleanly in `apps/mobile` (rendered on screen, confirmed via
      `expo start --web` bundle output) and in `apps/worker` (`wrangler dev` +
      curl returned it). Removed once step 1 added the real schema exports.
- [x] `npx expo start` boots and Expo Go on a real device loads the default
      screen — confirmed on the author's phone
- [x] `npx wrangler dev` boots and responds to a local curl (`Hello World! shared
      says: pong`)

### Spec references
`CLAUDE.md` → Repo layout, "Why this is a monorepo," npm workspaces decision.

---

## Step 1 — Shared schemas, Drizzle, Mi cocina

### Goal
The Item/Location schema and seed data live in `packages/shared`; local SQLite
persistence works; the Mi cocina screen renders all 30 seed items as toggleable
chips grouped by location, with `condimentos`/`cajon` collapsed by default and a
free-text quick-add. No network yet — `Buscar ideas` is present but inert.

### Files to create
```
packages/shared/src/schema.ts        ← Location, Item (Zod)
packages/shared/src/seed.ts          ← 30 seed items
packages/shared/src/index.ts         ← re-exports
apps/mobile/db/schema.ts             ← Drizzle: items, saved_recipes
apps/mobile/db/client.ts             ← expo-sqlite open + migrate + seed-on-first-run
apps/mobile/src/app/index.tsx        ← Mi cocina screen
apps/mobile/src/i18n/index.ts        ← i18next init, es-AR only
apps/mobile/src/i18n/locales/es-AR.ts ← translation resource bundle
```

### Key shapes
`packages/shared/src/schema.ts` — copy verbatim from `CLAUDE.md` → Data model:
```ts
export const Location = z.enum([
  "freezer", "heladera", "alacena", "condimentos", "cajon",
]);
export const Item = z.object({
  id: z.string(),
  name: z.string(),
  location: Location,
  active: z.boolean().default(true),
});
export type Item = z.infer<typeof Item>;
```
Property keys are English; `Location`'s enum *values* stay Spanish (the user's
own words, sent to the model as-is).

`packages/shared/src/seed.ts` — the exact 30 items from `CLAUDE.md` → Seed data,
one object per item matching `Item`, with stable string ids (`<location>-<slug
of name>`, e.g. `heladera-reggianito`). Once this file exists, `CLAUDE.md`'s
seed data block is redundant — flag that for the README's "keep CLAUDE.md
current" step when this milestone finishes.

`apps/mobile/db/schema.ts` — Drizzle tables:
- `items`: mirrors `Item` (id, name, location, active)
- `saved_recipes`: id, title, card JSON as text (full card, since detail/`Guardar`
  needs the whole thing later), saved-at timestamp

Seed-on-first-run: on first launch, if `items` is empty, insert all rows from
`packages/shared/src/seed.ts`.

`apps/mobile/src/app/index.tsx` — layout order top to bottom: free-text quick-add,
chip groups per location (freezer, heladera, alacena expanded; condimentos, cajon
collapsed under a disclosure), `Buscar ideas` CTA pinned at bottom. Chips toggle
`active` on tap, no confirmation. All visible strings come from `useTranslation()`
— no string literals in JSX (see i18n setup below).

> **Quick-add decision:** the spec doesn't pin down what free-text quick-add
> does, and `Item` has no "unclassified" `Location` — every item needs a real
> location. Rather than inventing a 6th enum value or forcing a location picker
> into a "quick" add, the box on Mi cocina is wired to `notes` (the API
> contract's free-text field, e.g. *"compré cherry y un morrón"*) — sent
> verbatim on the next `/suggest` request in milestone 2, not persisted as an
> `Item`. It lives in component state only (resets on app restart), matching
> its "something I just noticed" nature. Documented inline in
> `apps/mobile/src/app/index.tsx`.

`apps/mobile/src/i18n/` — `i18next` + `initReactI18next`, initialized once as a
side-effect import at the top of `src/app/_layout.tsx` (must run before any
`useTranslation()` call). `es-AR` is the only resource bundle for Phase 1
(`lng`/`fallbackLng` both `"es-AR"`); adding a locale later means adding a
sibling file under `locales/`, not restructuring components. Location display
labels (`Freezer`, `Heladera`, ...) live in the resource bundle too, looked up
as `t(\`location.${location}\`)` — not a hardcoded `Record` in the component.

### Acceptance criteria
- [x] `packages/shared` exports `Location`, `Item`, and the 30-item seed array
- [x] Fresh app install seeds SQLite with all 30 items on first launch only
      (`initDb()` checks for an existing row before inserting)
- [x] All 30 chips render, grouped correctly by the 5 locations — confirmed on
      device
- [x] `condimentos` and `cajon` groups start collapsed; freezer/heladera/alacena
      start expanded (`COLLAPSED_BY_DEFAULT` in `index.tsx`) — confirmed on device
- [x] Tapping a chip toggles active state instantly, no dialog (direct
      `db.update` + local state update, no confirmation) — confirmed on device
- [x] Toggled state survives a full app restart — confirmed on device
- [x] Quick-add free text — implemented as the `notes` composer described
      above, not a new persisted Item (decision documented above)
- [x] All code identifiers (types, variables, DB columns) are English; only
      `Location` enum values and translated UI content are Spanish
- [x] UI strings are sourced from the `es-AR` i18next bundle, not hardcoded in
      components
- [x] Tested on a real Android device via Expo Go, not the simulator —
      confirmed working (chips render and toggle correctly)

### Spec references
`CLAUDE.md` → Data model, Seed data, Screens (§1 Mi cocina), Principles #2 (no
confirmation), Decisions already made (flat locations, condimentos as prose later —
not yet relevant here since this step stores the array, not the prose string).

## Risks / known friction

- Metro/workspace resolution (see step 0) — if it wasn't fully verified there,
  it will surface here as soon as `packages/shared/src/schema.ts` grows real Zod
  imports.
- Chip UI density: the spec bets that chips fit ~30 items on one screen where
  checkbox rows would take four. If it doesn't feel right on a real device, that's
  a design problem to solve in this milestone, not to defer — the spec calls this
  out as something to verify with real items on a real phone.

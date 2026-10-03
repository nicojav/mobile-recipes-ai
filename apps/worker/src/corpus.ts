import { CARD_COUNT, Card, type Effort, type SuggestRequest } from "@mobile-recipes/shared";
import { dishSlug } from "./images";

// A fallback-only library of every card the LLM has actually generated,
// recorded as a byproduct of normal /suggest traffic (no extra generation
// cost) and read back ONLY when live generation is degraded — Groq 429/5xx,
// see index.ts. Normal-day batches stay fully fresh; this never replaces
// them. Design decisions live in the closed wayfinder ticket "Design and
// implement a D1-backed recipe corpus as Groq-exhaustion fallback".

// A stored card needs at least this share of its (non-staple) ingredients in
// the current kitchen to be worth suggesting — below that it isn't a
// plausible dinner, it's noise. Missing ingredients under the floor are still
// flagged `have: false` (amber on the card), never filtered out.
const MATCH_FLOOR = 0.5;

// Scores within this distance of the best remaining candidate count as a
// tie, so effort variety can break it. Best-effort only: a small pool may
// simply not have the spread CLAUDE.md wants, and that's an accepted
// degraded-mode tradeoff.
const EFFORT_TIE_TOLERANCE = 0.1;

// Cap on rows read per request, so the read stays bounded if the corpus ever
// grows far past prototype scale. Random order, so the cap isn't biased
// toward the oldest rows.
const MAX_CANDIDATES = 500;

// Ingredients nearly every kitchen has but the item list rarely names. The
// system prompt tells the model to assume them too, so counting them would
// penalize every card equally for nothing. Matched on the ingredient's first
// word ("sal gruesa", "aceite de oliva", "pimienta negra").
// Built through normalize() because ingredient names are compared in stemmed
// form ("aceite" → "aceit").
const STAPLE_FIRST_WORDS = new Set(["sal", "agua", "aceite", "pimienta"].map(normalize));

// Crude Spanish singular/plural collapse: drop a trailing "s", then a trailing
// "e", so papa/papas, tomate/tomates and morrón/morrones ("morrone" → "morron")
// all land on one stem. Stems aren't words ("tomat") and don't need to be —
// they're only ever compared with each other.
function stem(word: string): string {
  const singular = word.length > 3 ? word.replace(/s$/, "") : word;
  return singular.length > 3 ? singular.replace(/e$/, "") : singular;
}

// Lowercase, accent-stripped, punctuation-free, with the plural collapse
// above, so "papa" in the kitchen matches "papas" in a card. Deliberately not
// fuzzy or semantic — see principle 3 vs. the cost of maintaining a real
// matcher for a fallback path.
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(stem)
    .join(" ");
}

function containsWholeWords(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

// The kitchen as a flat list of normalized phrases. `condimentos` arrives as
// prose ("los habituales (ají molido, comino) y harina 000"), so it's split
// on commas, parentheses and " y " into phrases the same way a list would be.
export function kitchenPhrases(request: SuggestRequest): string[] {
  const listed = [...request.freezer, ...request.heladera, ...request.alacena, ...request.cajon];
  const condimentos = request.condimentos.split(/[,;()]|\sy\s/);
  return [...listed, ...condimentos].map(normalize).filter((phrase) => phrase.length >= 3);
}

function isStaple(normalizedName: string): boolean {
  return STAPLE_FIRST_WORDS.has(normalizedName.split(" ")[0]);
}

function isPresent(normalizedName: string, kitchen: string[]): boolean {
  return kitchen.some((phrase) => containsWholeWords(normalizedName, phrase) || containsWholeWords(phrase, normalizedName));
}

// Share of the card's non-staple ingredients present in the kitchen. A card
// that is only staples scores 1 — nothing it needs is missing.
export function matchScore(ingredientNames: string[], kitchen: string[]): number {
  const considered = ingredientNames.filter((name) => !isStaple(name));
  if (considered.length === 0) return 1;
  return considered.filter((name) => isPresent(name, kitchen)).length / considered.length;
}

export interface CorpusRow {
  title: string;
  effort: Effort;
  seenCount: number;
  ingredientNames: string[];
  cardJson: string;
}

interface Candidate {
  row: CorpusRow;
  score: number;
  tieBreak: number;
}

// Picks up to `count` rows: best match first, ties broken by seen_count then
// randomly (so repeated degraded calls don't return an identical list), with
// effort variety as a best-effort preference among near-equal scores.
// `random` is injectable only so this stays testable; the shuffle isn't
// security-relevant.
export function selectRows(rows: CorpusRow[], request: SuggestRequest, count: number, random: () => number = Math.random): CorpusRow[] {
  const kitchen = kitchenPhrases(request);
  const excluded = new Set((request.exclude ?? []).map(normalize));

  const remaining: Candidate[] = rows
    .filter((row) => !excluded.has(normalize(row.title)))
    .map((row) => ({ row, score: matchScore(row.ingredientNames, kitchen), tieBreak: random() }))
    .filter((candidate) => candidate.score >= MATCH_FLOOR)
    .sort((a, b) => b.score - a.score || b.row.seenCount - a.row.seenCount || a.tieBreak - b.tieBreak);

  const picked: Candidate[] = [];
  const pickedEfforts = new Set<Effort>();
  while (picked.length < count && remaining.length > 0) {
    const bestScore = remaining[0].score;
    const nearBest = remaining.filter((candidate) => bestScore - candidate.score <= EFFORT_TIE_TOLERANCE);
    const next = nearBest.find((candidate) => !pickedEfforts.has(candidate.row.effort)) ?? remaining[0];
    picked.push(next);
    pickedEfforts.add(next.row.effort);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return picked.map((candidate) => candidate.row);
}

// The stored card's own `have` flags describe whoever's kitchen generated it,
// so they're recomputed against this request's kitchen. Staples keep whatever
// the model said — the prompt tells it to assume them.
function withCurrentHave(card: Card, kitchen: string[]): Card {
  return {
    ...card,
    ingredients: card.ingredients.map((ingredient) => {
      const name = normalize(ingredient.name);
      return { ...ingredient, have: isStaple(name) ? true : isPresent(name, kitchen) };
    }),
  };
}

// Never throws on a bad row (older schema, hand-edited JSON): it's skipped,
// since a fallback that crashes is worse than one that returns fewer cards.
export async function cardsFromCorpus(env: Env, request: SuggestRequest): Promise<Card[]> {
  const { results } = await env.CORPUS_DB.prepare(
    "SELECT title, effort, seen_count, ingredient_names, card_json FROM corpus_cards WHERE category = ? ORDER BY RANDOM() LIMIT ?",
  )
    .bind(request.category, MAX_CANDIDATES)
    .all<{ title: string; effort: Effort; seen_count: number; ingredient_names: string; card_json: string }>();

  const rows: CorpusRow[] = [];
  for (const row of results) {
    try {
      rows.push({
        title: row.title,
        effort: row.effort,
        seenCount: row.seen_count,
        ingredientNames: JSON.parse(row.ingredient_names) as string[],
        cardJson: row.card_json,
      });
    } catch {
      continue;
    }
  }

  const kitchen = kitchenPhrases(request);
  const cards: Card[] = [];
  for (const row of selectRows(rows, request, request.count ?? CARD_COUNT)) {
    const parsed = Card.safeParse(JSON.parse(row.cardJson));
    if (parsed.success) cards.push(withCurrentHave(parsed.data, kitchen));
  }
  return cards;
}

// First stored version wins; a repeat only bumps seen_count (a free
// popularity signal for tie-breaking). No kitchen context is stored.
export async function saveToCorpus(env: Env, cards: Card[], category: SuggestRequest["category"]): Promise<void> {
  const now = Date.now();
  const statements = cards
    .filter((card) => dishSlug(card.dishKey) !== "")
    .map((card) =>
    env.CORPUS_DB.prepare(
      `INSERT INTO corpus_cards (dish_key, category, effort, title, card_json, ingredient_names, first_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (dish_key, category) DO UPDATE SET seen_count = seen_count + 1`,
    ).bind(
      dishSlug(card.dishKey),
      category,
      card.effort,
      card.title,
      JSON.stringify(card),
      JSON.stringify(card.ingredients.map((ingredient) => normalize(ingredient.name))),
      now,
    ),
  );
  if (statements.length > 0) await env.CORPUS_DB.batch(statements);
}

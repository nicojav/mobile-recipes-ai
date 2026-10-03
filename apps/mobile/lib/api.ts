import { and, eq } from 'drizzle-orm';
import { SuggestRequest, SuggestResponse, parseRetryDelayMs, type CardWithImage, type Item, type Location } from '@mobile-recipes/shared';

import { db } from '@db/client';
import { items as itemsTable } from '@db/schema';

// wrangler dev only listens on the dev machine's own network interfaces — a
// phone on the same wifi can't reach "localhost". Override with the dev
// machine's LAN IP via EXPO_PUBLIC_WORKER_URL in apps/mobile/.env for
// on-device testing; localhost only works in the web/simulator target.
const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? 'http://localhost:8787';
// Deters casual scraping of the metered endpoint, not real auth — this app
// has none by design (CLAUDE.md "Explicitly out"). Ships inside the APK like
// any client-side secret; see the Worker's own comment on the check.
const APP_SECRET = process.env.EXPO_PUBLIC_APP_SECRET ?? '';

function namesFor(items: Item[], location: Location): string[] {
  return items.filter((item) => item.location === location).map((item) => item.name);
}

// "los habituales (ají molido, ...) y harina 000" reads better than a flat
// comma join — a natural Spanish list joiner generalizes to whatever
// condimentos happen to be active instead of hardcoding today's seed list.
function joinSpanish(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

const MAX_SUGGEST_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Groq's free tier (30 req/min, but 8,000 tokens/min is the tighter real
// limit — see CLAUDE.md → Free tier ceilings, "the current binding
// constraint") means a 429 here is a normal transient condition during real
// use, not just under test load. parseRetryDelayMs (packages/shared) prefers
// the Worker's forwarded Retry-After header and falls back to regexing
// Groq's own "try again in Ns" hint out of the error body.
//
// onThrottled fires before each retry sleep so the caller (the deck) can
// show something other than the generic loading copy while it waits.
async function postSuggest(body: SuggestRequest, onThrottled?: (delayMs: number) => void): Promise<unknown> {
  for (let attempt = 1; attempt <= MAX_SUGGEST_ATTEMPTS; attempt++) {
    const res = await fetch(`${WORKER_URL}/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-App-Secret': APP_SECRET },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();

    const text = await res.text();
    const isRetryable = res.status === 429 || res.status === 502;
    if (!isRetryable || attempt === MAX_SUGGEST_ATTEMPTS) {
      throw new Error(`suggest request failed: ${res.status}`);
    }
    const delay = parseRetryDelayMs(res.headers.get('retry-after'), text);
    onThrottled?.(delay);
    await sleep(delay);
  }
  // Unreachable — the loop above always returns or throws by the last attempt.
  throw new Error('suggest request failed: exhausted retries');
}

// `count` defaults to a full batch server-side when omitted — the caller
// that passes it is the deck's two-phase batch split (2 cards, then 3, for
// every batch), a Groq streaming workaround. See CLAUDE.md "Decisions
// already made".
//
// `category` picks which pantry feeds the request — Mi cocina and
// Repostería are two views over the same `items` table (see ticket "Baking
// pantry data model"), filtered by `inCocina`/`inReposteria` rather than two
// independent lists.
export async function fetchSuggestions(
  notes: string,
  exclude: string[],
  count?: number,
  onThrottled?: (delayMs: number) => void,
  category: SuggestRequest['category'] = 'comida',
  // Set only by a cuisine-interstitial country pick, alongside the hint
  // already in `notes`. It tells the Worker not to answer with its stored-
  // recipe fallback (which has no cuisine tag) if live generation is down.
  cuisine?: string,
): Promise<CardWithImage[]> {
  const pantryColumn = category === 'reposteria' ? itemsTable.inReposteria : itemsTable.inCocina;
  const active = db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.active, true), eq(pantryColumn, true)))
    .all() as Item[];

  const body = SuggestRequest.parse({
    v: 1,
    freezer: namesFor(active, 'freezer'),
    heladera: namesFor(active, 'heladera'),
    alacena: namesFor(active, 'alacena'),
    cajon: namesFor(active, 'cajon'),
    condimentos: joinSpanish(namesFor(active, 'condimentos')),
    notes: notes.trim() || undefined,
    exclude: exclude.length > 0 ? exclude : undefined,
    count,
    category,
    cuisine,
  });

  const json = await postSuggest(body, onThrottled);
  return SuggestResponse.parse(json).cards;
}

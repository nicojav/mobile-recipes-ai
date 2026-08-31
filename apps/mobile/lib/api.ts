import { eq } from 'drizzle-orm';
import { SuggestRequest, SuggestResponse, type Card, type Item, type Location } from '@cocina/shared';

import { db } from '@db/client';
import { items as itemsTable } from '@db/schema';

// wrangler dev only listens on the dev machine's own network interfaces — a
// phone on the same wifi can't reach "localhost". Override with the dev
// machine's LAN IP via EXPO_PUBLIC_WORKER_URL in apps/mobile/.env for
// on-device testing; localhost only works in the web/simulator target.
const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? 'http://localhost:8787';

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

export async function fetchSuggestions(notes: string, exclude: string[]): Promise<Card[]> {
  const active = db.select().from(itemsTable).where(eq(itemsTable.active, true)).all() as Item[];

  const body = SuggestRequest.parse({
    v: 1,
    freezer: namesFor(active, 'freezer'),
    heladera: namesFor(active, 'heladera'),
    alacena: namesFor(active, 'alacena'),
    cajon: namesFor(active, 'cajon'),
    condimentos: joinSpanish(namesFor(active, 'condimentos')),
    notes: notes.trim() || undefined,
    exclude: exclude.length > 0 ? exclude : undefined,
  });

  const res = await fetch(`${WORKER_URL}/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`suggest request failed: ${res.status}`);
  }

  return SuggestResponse.parse(await res.json()).cards;
}

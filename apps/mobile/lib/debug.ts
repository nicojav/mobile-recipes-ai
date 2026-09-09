// Dev-only debug helpers — not part of the app's real API contract (see
// packages/shared/src/api.ts for that). Kept in their own file so they're
// easy to spot and delete if this ever needs cleaning up before a real
// production build (see CLAUDE.md's Build order: no prod deploy exists yet).

// Same resolution as lib/api.ts's WORKER_URL, duplicated rather than
// imported so this file has zero dependency on the real API module.
const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? 'http://localhost:8787';

export interface ImageUsageSnapshot {
  generatedThisSession: number;
  estimatedDailyLimit: number;
  quotaExceeded: boolean;
  devGenerationSkipped: boolean;
}

// GET /debug/image-usage needs no auth (see apps/worker/src/index.ts) — it's
// a read-only aggregate count, same precedent as /img/.
export async function fetchImageUsage(): Promise<ImageUsageSnapshot | null> {
  try {
    const res = await fetch(`${WORKER_URL}/debug/image-usage`);
    if (!res.ok) return null;
    return (await res.json()) as ImageUsageSnapshot;
  } catch {
    return null;
  }
}

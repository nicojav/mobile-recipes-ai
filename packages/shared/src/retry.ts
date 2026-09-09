// Shared between apps/mobile/lib/api.ts and apps/worker/harness/run.ts —
// both back off from the same Groq rate-limit shape, and used to each carry
// their own copy of this parser. See CLAUDE.md's Free tier ceilings note on
// Groq's 8,000 tokens/min cap being a normal transient condition, not an
// edge case.
const DEFAULT_RETRY_DELAY_MS = 5_000;
const MIN_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 60_000;

// Groq's own hint appears in its error body as "try again in 30.5s" or, once
// the wait crosses a minute, "try again in 1m30.5s" — the minute part is
// optional and easy to miss if only the seconds form is tested against.
const BODY_HINT = /try again in (?:(\d+)m)?([\d.]+)s/i;

function clamp(ms: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(MIN_RETRY_DELAY_MS, ms));
}

// Prefers a standard Retry-After header (seconds, forwarded by the Worker as
// of the 429 passthrough — see providers/types.ts's ProviderError) over
// regexing the provider's own error body, and falls back to a fixed default
// when neither is present (a network error, say, with no hint at all).
export function parseRetryDelayMs(retryAfterHeader: string | null | undefined, body: string): number {
  if (retryAfterHeader) {
    const seconds = parseFloat(retryAfterHeader);
    if (!Number.isNaN(seconds)) return clamp(Math.ceil(seconds * 1000) + 1000);
  }

  const match = body.match(BODY_HINT);
  if (!match) return DEFAULT_RETRY_DELAY_MS;
  const minutes = match[1] ? parseInt(match[1], 10) : 0;
  const seconds = parseFloat(match[2]);
  return clamp(Math.ceil((minutes * 60 + seconds) * 1000) + 1000);
}

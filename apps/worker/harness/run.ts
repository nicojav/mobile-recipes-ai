import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { SuggestRequest, SuggestResponse, parseRetryDelayMs } from "@mobile-recipes/shared";

// Reused every run so consecutive output dirs can be diffed side by side
// across prompt edits — see plans/README.md and plans/03-quality-and-images.md.
const SCENARIOS_DIR = join(import.meta.dirname, "scenarios");
const OUTPUT_DIR = join(import.meta.dirname, "output");
const TARGET_URL = process.env.WORKER_URL ?? "http://localhost:8787/suggest";
// Required since milestone 4's abuse protection — this harness predates it
// and used to run against an unauthenticated /suggest. Set APP_SECRET to the
// same value as the Worker's (apps/worker/.dev.vars for a local run).
const APP_SECRET = process.env.APP_SECRET ?? "";

interface ScenarioResult {
  name: string;
  ok: boolean;
  ms: number;
  cards?: number;
  error?: string;
}

const MAX_RETRIES = 5;
const NETWORK_ERROR_RETRY_DELAY_MS = 10_000;
// fetch() has no default timeout — a stalled connection (seen in practice
// against wrangler dev) would otherwise hang the whole run indefinitely with
// no further output. Bound every attempt and treat a timeout as retryable.
const REQUEST_TIMEOUT_MS = 45_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScenario(file: string, runDir: string): Promise<ScenarioResult> {
  const name = basename(file, ".json");
  const raw = await readFile(join(SCENARIOS_DIR, file), "utf8");

  const parsedRequest = SuggestRequest.safeParse(JSON.parse(raw));
  if (!parsedRequest.success) {
    return { name, ok: false, ms: 0, error: `scenario file does not match SuggestRequest: ${parsedRequest.error.message}` };
  }

  const start = Date.now();
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`  ${name}: attempt ${attempt}/${MAX_RETRIES}...`);
    try {
      const res = await fetch(TARGET_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "X-App-Secret": APP_SECRET },
        body: JSON.stringify(parsedRequest.data),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await res.json();

      // The Worker now forwards Groq's 429 as-is (see providers/types.ts's
      // ProviderError) instead of flattening every upstream failure into a
      // 502, so a rate limit no longer needs sniffing out of a 502 body.
      if (res.status === 429) {
        if (attempt === MAX_RETRIES) {
          const ms = Date.now() - start;
          await writeFile(join(runDir, `${name}.json`), JSON.stringify(body, null, 2));
          return { name, ok: false, ms, error: `rate-limited after ${MAX_RETRIES} attempts: ${JSON.stringify(body)}` };
        }
        const delay = parseRetryDelayMs(res.headers.get("retry-after"), JSON.stringify(body));
        console.log(`  ${name}: rate-limited (attempt ${attempt}/${MAX_RETRIES}), retrying in ${Math.round(delay / 1000)}s`);
        await sleep(delay);
        continue;
      }

      const ms = Date.now() - start;
      await writeFile(join(runDir, `${name}.json`), JSON.stringify(body, null, 2));

      if (!res.ok) {
        return { name, ok: false, ms, error: `HTTP ${res.status}: ${JSON.stringify(body)}` };
      }

      const parsedResponse = SuggestResponse.safeParse(body);
      if (!parsedResponse.success) {
        return { name, ok: false, ms, error: `response does not match SuggestResponse: ${parsedResponse.error.message}` };
      }

      return { name, ok: true, ms, cards: parsedResponse.data.cards.length };
    } catch (err) {
      // A stalled connection or timeout — retryable like a rate limit,
      // just with no provider hint to size the backoff from.
      if (attempt === MAX_RETRIES) {
        return { name, ok: false, ms: Date.now() - start, error: `network error after ${MAX_RETRIES} attempts: ${String(err)}` };
      }
      console.log(`  ${name}: network error (attempt ${attempt}/${MAX_RETRIES}) — ${String(err)}, retrying in ${NETWORK_ERROR_RETRY_DELAY_MS / 1000}s`);
      await sleep(NETWORK_ERROR_RETRY_DELAY_MS);
    }
  }
  // Unreachable — the loop always returns by MAX_RETRIES.
  return { name, ok: false, ms: Date.now() - start, error: "exhausted retries" };
}

async function main() {
  // Optional CLI args filter scenarios by substring — e.g. `npm run harness
  // --workspace=apps/worker -- 04 05` to re-check just a prompt-fix target
  // instead of burning the full free-tier budget on an unrelated re-run.
  const filters = process.argv.slice(2);
  const allFiles = (await readdir(SCENARIOS_DIR)).filter((f) => f.endsWith(".json")).sort();
  const files = filters.length > 0 ? allFiles.filter((f) => filters.some((filter) => f.includes(filter))) : allFiles;
  if (files.length === 0) {
    console.error(filters.length > 0 ? `no scenario files matched filters: ${filters.join(", ")}` : `no scenario files found in ${SCENARIOS_DIR}`);
    process.exitCode = 1;
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(OUTPUT_DIR, timestamp);
  await mkdir(runDir, { recursive: true });

  console.log(`running ${files.length} scenarios against ${TARGET_URL}\n`);

  const results: ScenarioResult[] = [];
  for (const file of files) {
    // Sequential, not Promise.all — this is Groq's free tier (30 req/min),
    // not the app's own prefetch path. Bursting all 15 would risk 429s.
    results.push(await runScenario(file, runDir));
  }

  for (const r of results) {
    const status = r.ok ? `ok — ${r.cards} cards, ${r.ms}ms` : `FAILED — ${r.error}`;
    console.log(`${r.name.padEnd(32)} ${status}`);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} scenarios succeeded.`);
  console.log(`Output written to ${runDir}`);
  if (failed > 0) process.exitCode = 1;
}

main();

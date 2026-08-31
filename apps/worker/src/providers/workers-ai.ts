import { z } from "zod";
import type { SuggestRequest } from "@cocina/shared";
import { buildSystemPrompt, buildUserPrompt } from "../prompt";
import { BaseCardProvider } from "./base";
import { CardsPayload } from "./schema";
import { ProviderError } from "./types";

// Confirmed against Cloudflare's JSON Mode model list — 70b for quality
// (Argentine voseo needs a model with real Spanish depth), "fast" fp8 variant
// to keep neuron cost down within the free 10k/day budget.
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Workers AI's response_format.json_schema takes plain JSON Schema directly
// (unlike Gemini's uppercase-typed proto) — z.toJSONSchema's default output
// works as-is, just drop $schema since the docs' own examples omit it.
const { $schema, ...workersAiResponseSchema } = z.toJSONSchema(CardsPayload);

class WorkersAiProvider extends BaseCardProvider {
  readonly name = "workers-ai";

  protected async callModel(request: SuggestRequest, env: Env): Promise<unknown> {
    try {
      return await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(request) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: workersAiResponseSchema,
        },
      });
    } catch (err) {
      throw new ProviderError(this.name, "request failed", err instanceof Error ? err.message : err);
    }
  }

  // Docs show JSON mode returning an already-parsed object; this model's own
  // type declares `response: string` — accept either, parseCardsPayload
  // (called by the base class) handles both.
  protected extractPayload(raw: any): unknown {
    return raw?.response;
  }
}

export const workersAiProvider = new WorkersAiProvider();

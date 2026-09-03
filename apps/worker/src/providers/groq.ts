import { z } from "zod";
import { CARD_COUNT, type SuggestRequest } from "@mobile-recipes/shared";
import { buildSystemPrompt, buildUserPrompt } from "../prompt";
import { BaseCardProvider } from "./base";
import { cardsPayloadFor } from "./schema";
import { ProviderError } from "./types";

// gpt-oss-20b (the smallest strict-mode-capable model) garbled our schema —
// it hoisted `imagePrompt` to a single top-level field instead of nesting it
// per card, despite strict mode. 120b handles the same schema correctly.
//
// Also the reason the first suggestion batch is split into two calls instead
// of one streamed call: Groq does not support streaming together with
// response_format: json_schema ("Streaming and tool use are not currently
// supported with Structured Outputs"). See CLAUDE.md "Decisions already
// made" for the full note and when to undo the split.
const MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// OpenAI-style strict mode: same plain JSON Schema Workers AI takes, just
// wrapped in {name, strict, schema} — z.toJSONSchema's default output
// already sets additionalProperties: false and lists every key as required,
// which strict mode requires. Memoized per count since the first batch of a
// session asks for fewer than CARD_COUNT — see the note above.
const jsonSchemaCache = new Map<number, Record<string, unknown>>();
function cardsJsonSchemaFor(count: number): Record<string, unknown> {
  let schema = jsonSchemaCache.get(count);
  if (!schema) {
    const { $schema, ...rest } = z.toJSONSchema(cardsPayloadFor(count));
    schema = rest;
    jsonSchemaCache.set(count, schema);
  }
  return schema;
}

class GroqProvider extends BaseCardProvider {
  readonly name = "groq";

  protected async callModel(request: SuggestRequest, env: Env): Promise<unknown> {
    const count = request.count ?? CARD_COUNT;
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(count) },
          { role: "user", content: buildUserPrompt(request, count) },
        ],
        // gpt-oss defaults to reasoning_effort "medium", which burns a large
        // chunk of the completion budget on hidden chain-of-thought before it
        // ever writes the JSON — "low" plus a generous max_completion_tokens
        // is what actually leaves room for full cards (title/description/
        // steps/ingredients each) to come out the other side.
        reasoning_effort: "low",
        max_completion_tokens: 4096,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "cards_payload",
            strict: true,
            schema: cardsJsonSchemaFor(count),
          },
        },
      }),
    });

    if (!res.ok) {
      throw new ProviderError(this.name, "request failed", await res.text());
    }
    return res.json();
  }

  protected extractPayload(raw: any): unknown {
    return raw?.choices?.[0]?.message?.content;
  }
}

export const groqProvider = new GroqProvider();

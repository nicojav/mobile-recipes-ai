import { z } from "zod";
import type { SuggestRequest } from "@cocina/shared";
import { buildSystemPrompt, buildUserPrompt } from "../prompt";
import { BaseCardProvider } from "./base";
import { CardsPayload } from "./schema";
import { ProviderError } from "./types";

// gpt-oss-20b (the smallest strict-mode-capable model) garbled our schema —
// it hoisted `imagePrompt` to a single top-level field instead of nesting it
// per card, despite strict mode. 120b handles the same schema correctly.
const MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// OpenAI-style strict mode: same plain JSON Schema Workers AI takes, just
// wrapped in {name, strict, schema} — z.toJSONSchema's default output
// already sets additionalProperties: false and lists every key as required,
// which strict mode requires.
const { $schema, ...cardsJsonSchema } = z.toJSONSchema(CardsPayload);

class GroqProvider extends BaseCardProvider {
  readonly name = "groq";

  protected async callModel(request: SuggestRequest, env: Env): Promise<unknown> {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(request) },
        ],
        // gpt-oss defaults to reasoning_effort "medium", which burns a large
        // chunk of the completion budget on hidden chain-of-thought before it
        // ever writes the JSON — "low" plus a generous max_completion_tokens
        // is what actually leaves room for 5 full cards (title/description/
        // steps/ingredients each) to come out the other side.
        reasoning_effort: "low",
        max_completion_tokens: 4096,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "cards_payload",
            strict: true,
            schema: cardsJsonSchema,
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

import { z } from "zod";
import type { SuggestRequest } from "@cocina/shared";
import { buildSystemPrompt, buildUserPrompt } from "../prompt";
import { BaseCardProvider } from "./base";
import { CardsPayload } from "./schema";
import { ProviderError } from "./types";

// CLAUDE.md says 2.5 Flash-Lite, but Google retired it for new API keys
// (confirmed via a live 404 pointing here) — 3.5 Flash-Lite is its direct
// replacement in the same tier/pricing bracket, so swapping the model id was
// the fix, not an architecture change.
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type JSONSchemaNode = Record<string, any>;

// Gemini's `responseSchema` is Google's own Schema proto — a constrained,
// UPPERCASE-typed subset of OpenAPI 3.0 (STRING/NUMBER/INTEGER/BOOLEAN/ARRAY/
// OBJECT) — not standard JSON Schema. z.toJSONSchema gives us standard
// (lowercase-typed) JSON Schema, so this walks the tree and reshapes it,
// keeping only the keywords Gemini's Schema proto understands and dropping
// the rest ($schema, additionalProperties, etc.) rather than sending them and
// hoping they're ignored.
function toGeminiSchema(node: JSONSchemaNode): JSONSchemaNode {
  if (node.enum) {
    return {
      type: "STRING",
      enum: node.enum,
      ...(node.description ? { description: node.description } : {}),
    };
  }

  if (node.type === "array") {
    return {
      type: "ARRAY",
      items: toGeminiSchema(node.items),
      ...(node.minItems !== undefined ? { minItems: node.minItems } : {}),
      ...(node.maxItems !== undefined ? { maxItems: node.maxItems } : {}),
      ...(node.description ? { description: node.description } : {}),
    };
  }

  if (node.type === "object") {
    const properties: JSONSchemaNode = {};
    for (const [key, value] of Object.entries(node.properties ?? {})) {
      properties[key] = toGeminiSchema(value as JSONSchemaNode);
    }
    return {
      type: "OBJECT",
      properties,
      ...(node.required ? { required: node.required } : {}),
      ...(node.description ? { description: node.description } : {}),
    };
  }

  const primitiveType: Record<string, string> = {
    string: "STRING",
    number: "NUMBER",
    integer: "INTEGER",
    boolean: "BOOLEAN",
  };
  return {
    type: primitiveType[node.type] ?? "STRING",
    ...(node.description ? { description: node.description } : {}),
  };
}

const geminiResponseSchema = toGeminiSchema(z.toJSONSchema(CardsPayload, { target: "openapi-3.0" }));

class GeminiProvider extends BaseCardProvider {
  readonly name = "gemini";

  protected async callModel(request: SuggestRequest, env: Env): Promise<unknown> {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(request) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: geminiResponseSchema,
        },
      }),
    });

    if (!res.ok) {
      throw new ProviderError(this.name, "request failed", await res.text());
    }
    return res.json();
  }

  // No markdown-fence stripping: JSON schema mode returns raw JSON. If this
  // ever fails to parse, that's a sign the config is broken, not something
  // to paper over with a regex.
  protected extractPayload(raw: any): unknown {
    return raw?.candidates?.[0]?.content?.parts?.[0]?.text;
  }
}

export const geminiProvider = new GeminiProvider();

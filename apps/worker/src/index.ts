import { SuggestRequest } from "@cocina/shared";
import { activeProvider, ProviderError } from "./providers";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/suggest") {
      return handleSuggest(request, env);
    }
    return jsonError(404, "not found");
  },
} satisfies ExportedHandler<Env>;

async function handleSuggest(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }

  const parsedRequest = SuggestRequest.safeParse(body);
  if (!parsedRequest.success) {
    return jsonError(400, "request does not match SuggestRequest", parsedRequest.error.flatten());
  }

  try {
    const cards = await activeProvider.generateCards(parsedRequest.data, env);
    return Response.json({ v: 1, cards });
  } catch (err) {
    if (err instanceof ProviderError) {
      return jsonError(502, `${err.provider}: ${err.message}`, err.detail);
    }
    throw err;
  }
}

function jsonError(status: number, error: string, detail?: unknown): Response {
  return Response.json({ error, ...(detail !== undefined ? { detail } : {}) }, { status });
}

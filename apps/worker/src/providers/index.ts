import { geminiProvider } from "./gemini";
import { groqProvider } from "./groq";
import { workersAiProvider } from "./workers-ai";

export type { CardProvider } from "./types";
export { ProviderError } from "./types";

// The one line to change to switch models. Using Groq for now — Gemini is
// blocked by an unresolved Google-side billing-sync bug, and Workers AI (this
// project's first choice, since it's already in the stack for images) is
// blocked by a fresh-account InferenceUpstreamError that showed no sign of
// clearing. Both bugs are tracked in plans/02-end-to-end.md; swap back to
// whichever clears first, or to whichever scores best on the milestone 3
// rubric once more than one actually works.
export const activeProvider = groqProvider;

// Kept registered (not deleted) so the swap above stays a one-line change.
export const providers = {
  gemini: geminiProvider,
  "workers-ai": workersAiProvider,
  groq: groqProvider,
};

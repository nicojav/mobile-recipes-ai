import type { ImageProvider } from "./types";
import { workersAiImageProvider } from "./workers-ai";

export type { ImageProvider } from "./types";
export { ImageQuotaExceededError } from "./types";

// Tried in order on an R2 miss; a provider that reports its quota exhausted is
// skipped until the next UTC midnight (see images.ts). Only Workers AI today:
// research (issues #13, #14) found no second source that is both $0 and
// able to take 5 concurrent jobs per batch. Adding one later is a one-line
// append here — the interface is the permanent decision, not the list.
export const imageProviders: readonly ImageProvider[] = [workersAiImageProvider];

// Generate per dish, not per card — recipes repeat constantly, so the R2 key
// is derived from the title alone. See CLAUDE.md's Image pipeline section.
export function imageKeyFor(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug}.jpg`;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Cache-miss path only — callers check R2 first (see index.ts's /img route)
// and only reach this when nothing's cached yet. flux-1-schnell has no
// width/height input (fixed at a 512x512 tile, matching CLAUDE.md's free-tier
// neuron accounting) and returns base64-encoded JPEG in an `image` field —
// verified against Cloudflare's current model docs, not assumed.
export async function generateImage(env: Env, imagePrompt: string): Promise<Uint8Array> {
  const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt: imagePrompt });
  if (!result.image) {
    throw new Error("flux-1-schnell response had no image field");
  }
  return base64ToBytes(result.image);
}

-- Fallback-only corpus of every card the LLM has actually generated, written
-- as a byproduct of normal /suggest traffic. Read only when live generation
-- is degraded (Groq 429/5xx) — see apps/worker/src/corpus.ts.
--
-- One row per dish, not per generation: (dish_key, category) is the primary
-- key, the first stored version wins, and repeats just bump seen_count.
-- No kitchen context is stored — a card's own `have` flags are relative to
-- whoever's kitchen generated it, so matching recomputes them per request.
CREATE TABLE corpus_cards (
  dish_key         TEXT    NOT NULL,
  category         TEXT    NOT NULL,
  effort           TEXT    NOT NULL,
  title            TEXT    NOT NULL,
  card_json        TEXT    NOT NULL,
  ingredient_names TEXT    NOT NULL, -- JSON array of normalized names
  first_seen_at    INTEGER NOT NULL, -- unix ms
  seen_count       INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (dish_key, category)
);

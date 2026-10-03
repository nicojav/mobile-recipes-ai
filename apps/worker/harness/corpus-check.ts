// Pure-logic checks for the fallback corpus's matching/selection (corpus.ts).
// No Worker, no D1, no network — run with `npm run corpus:check`.
import assert from "node:assert/strict";
import { SuggestRequest } from "@mobile-recipes/shared";
import { kitchenPhrases, matchScore, normalize, selectRows, type CorpusRow } from "../src/corpus";

function request(overrides: Partial<SuggestRequest> = {}): SuggestRequest {
  return SuggestRequest.parse({
    v: 1,
    freezer: [],
    heladera: ["Huevos", "Papas", "Cebolla de verdeo"],
    alacena: ["Arroz", "Fideos"],
    cajon: [],
    condimentos: "los habituales (ají molido, comino) y harina 000",
    ...overrides,
  });
}

function row(title: string, effort: CorpusRow["effort"], ingredients: string[], seenCount = 1): CorpusRow {
  return { title, effort, seenCount, ingredientNames: ingredients.map(normalize), cardJson: "{}" };
}

// Spanish plurals + accents collapse to one form.
assert.equal(normalize("Cebollas de Verdeo"), normalize("cebolla de verdeo"));
assert.equal(normalize("Ají molido"), "aji molido");
assert.equal(normalize("tomates cherry"), normalize("tomate cherry"));
assert.equal(normalize("morrones"), normalize("morrón"));
assert.equal(normalize("huevos"), normalize("huevo"));

// condimentos prose is split into phrases, not matched as one blob.
const kitchen = kitchenPhrases(request());
assert.ok(kitchen.includes("aji molido") && kitchen.includes("comino") && kitchen.includes("harina 000"));

// Staples don't count against a card; a missing real ingredient does.
assert.equal(matchScore(["sal", "aceite de oliva", "papa", "huevo"].map(normalize), kitchen), 1);
assert.equal(matchScore(["papa", "huevo", "chorizo colorado", "morron"].map(normalize), kitchen), 0.5);

// Whole-word containment works in both directions, not substrings.
assert.equal(matchScore(["queso cremoso"].map(normalize), ["cremoso"]), 1);
assert.equal(matchScore(["arroz"].map(normalize), ["arrozal"]), 0);

const pool = [
  row("Tortilla de papas", "easy", ["papa", "huevo", "cebolla"]),
  row("Arroz con verdeo", "medium", ["arroz", "cebolla de verdeo"]),
  row("Fideos al comino", "elaborate", ["fideos", "comino"]),
  row("Lomo wellington", "elaborate", ["lomo", "hojaldre", "champignones", "panceta"]),
];

// Below-floor cards are dropped, never padded in.
const picked = selectRows(pool, request(), 5, () => 0.5).map((r) => r.title);
assert.ok(!picked.includes("Lomo wellington"));
assert.equal(picked.length, 3);

// exclude is honored case/accent-insensitively.
const excluded = selectRows(pool, request({ exclude: ["TORTILLA DE PAPAS"] }), 5, () => 0.5).map((r) => r.title);
assert.ok(!excluded.includes("Tortilla de papas"));

// Equal scores: effort variety wins the tie over seen_count order.
const tied = [
  row("A", "easy", ["papa"], 9),
  row("B", "easy", ["huevo"], 8),
  row("C", "elaborate", ["arroz"], 1),
];
assert.deepEqual(
  selectRows(tied, request(), 2, () => 0.5).map((r) => r.title),
  ["A", "C"],
);

// Empty kitchen / empty corpus degrade to nothing (index.ts then returns the original error).
assert.deepEqual(selectRows([], request(), 5), []);
assert.deepEqual(
  selectRows(pool, request({ heladera: [], alacena: [], condimentos: "" }), 5),
  [],
);

console.log("corpus-check: ok");

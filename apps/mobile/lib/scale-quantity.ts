// Scales a recipe's free-text ingredient quantities (and, more cautiously, its
// step text) to a different serving count. This is a real recipe someone
// cooks from, so every rounded number has to land on something actually
// measurable, not just something arithmetically close — see the plan under
// plans/ for the rounding rationale.
//
// `quantity` is always free text from the model (packages/shared's Ingredient
// schema), e.g. "300 g", "2 cucharadas", "½ taza", "4 medianas", "al gusto".
// There is no structured amount/unit — parsing this string is the only way to
// scale it, and it's reliable: every quantity in the harness corpus
// (apps/worker/harness/output) that starts with a number or a unicode
// fraction parses with the regex below. None contain a range ("2-3"), so
// ranges aren't handled here — only in step prose, where a dash between two
// numbers is far more likely to be a cook-time range ("15-18 minutos"), which
// is correctly left untouched anyway (see scaleStepText).

const VULGAR_FRACTIONS: Record<string, number> = {
  '⅛': 1 / 8,
  '¼': 1 / 4,
  '⅓': 1 / 3,
  '½': 1 / 2,
  '⅔': 2 / 3,
  '¾': 3 / 4,
};
const VULGAR_CHARS = Object.keys(VULGAR_FRACTIONS).join('');

// A single amount: an optional "whole number + space" prefix followed by a
// digit run (with optional decimal and optional /fraction) or a bare vulgar
// fraction — covers "2", "1.5", "1,5", "1/2", "1 1/2", "½", "1 ½". All
// internal groups are non-capturing so this can be embedded in a larger
// regex without shifting capture-group indices.
const AMOUNT_SRC = `(?:\\d+\\s+)?(?:\\d+(?:[.,]\\d+)?(?:\\s*[/⁄]\\s*\\d+)?|[${VULGAR_CHARS}])`;

// Captures a leading amount, the separator run that follows it (a plain
// space or the narrow no-break space, U+202F, the model sometimes uses
// between a number and a unit), and everything after — reproduced
// byte-for-byte in the output.
const LEADING_AMOUNT = new RegExp(`^(${AMOUNT_SRC})([\\s\\u202f]*)(.*)$`);

function parseAmount(token: string): number | null {
  const trimmed = token.trim();
  if (trimmed in VULGAR_FRACTIONS) return VULGAR_FRACTIONS[trimmed];

  // Mixed number with a vulgar fraction, e.g. "1 ½".
  const mixedVulgar = trimmed.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s+([${VULGAR_CHARS}])$`));
  if (mixedVulgar) {
    return parseFloat(mixedVulgar[1].replace(',', '.')) + VULGAR_FRACTIONS[mixedVulgar[2]];
  }

  // ASCII fraction, optionally mixed: "1/2", "1 1/2".
  const ascii = trimmed.match(/^(?:(\d+(?:[.,]\d+)?)\s+)?(\d+(?:[.,]\d+)?)\s*[/⁄]\s*(\d+(?:[.,]\d+)?)$/);
  if (ascii) {
    const whole = ascii[1] ? parseFloat(ascii[1].replace(',', '.')) : 0;
    const num = parseFloat(ascii[2].replace(',', '.'));
    const den = parseFloat(ascii[3].replace(',', '.'));
    if (den === 0) return null;
    return whole + num / den;
  }

  const value = parseFloat(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

type UnitClass = 'countable' | 'cup' | 'spoon' | 'weightVolume';

// Classification is by the first *word* of whatever follows the number —
// unrecognized words (piezas, dientes, medianas, en tiras, ...) fall through
// to "countable": whole numbers, never an invented unit.
const CUP_WORDS = new Set(['taza', 'tazas']);
const SPOON_WORDS = new Set(['cucharada', 'cucharadas', 'cucharadita', 'cucharaditas', 'cda', 'cdas', 'cdta', 'cdtas']);
const WEIGHT_VOLUME_WORDS = new Set(['g', 'gr', 'grs', 'kg', 'ml', 'l', 'cc', 'litro', 'litros']);

function classify(word: string): UnitClass {
  const w = word.toLowerCase();
  if (CUP_WORDS.has(w)) return 'cup';
  if (SPOON_WORDS.has(w)) return 'spoon';
  if (WEIGHT_VOLUME_WORDS.has(w)) return 'weightVolume';
  return 'countable';
}

// Singular/plural pairs for unit nouns worth re-agreeing with the scaled
// count (e.g. "2 medianas" -> "1 mediana"). Deliberately excludes
// abbreviations (g, ml, cda, cdta, l) — those are never pluralized/singularized,
// so an abbreviation is never mangled by this pass.
const UNIT_PAIRS: [singular: string, plural: string][] = [
  ['taza', 'tazas'],
  ['cucharada', 'cucharadas'],
  ['cucharadita', 'cucharaditas'],
  ['litro', 'litros'],
  ['diente', 'dientes'],
  ['unidad', 'unidades'],
  ['pieza', 'piezas'],
  ['rama', 'ramas'],
  ['ramita', 'ramitas'],
  ['hoja', 'hojas'],
  ['manojo', 'manojos'],
  ['tallo', 'tallos'],
  ['pizca', 'pizcas'],
  ['cabeza', 'cabezas'],
  ['loncha', 'lonchas'],
  ['mediana', 'medianas'],
  ['mediano', 'medianos'],
  ['grande', 'grandes'],
];
const SINGULAR_OF = new Map(UNIT_PAIRS.map(([s, p]) => [p, s]));
const PLURAL_OF = new Map(UNIT_PAIRS.map(([s, p]) => [s, p]));

// Re-agrees a unit word's number with `value`, regardless of which form the
// model originally wrote (a batch scaled down from "4 medianas" needs to
// read "1 mediana", not stay plural). Unrecognized words — including every
// abbreviation — are returned unchanged.
function agreeNumber(word: string, value: number): string {
  const lower = word.toLowerCase();
  const singular = SINGULAR_OF.get(lower) ?? (PLURAL_OF.has(lower) ? lower : null);
  if (!singular) return word;
  const target = value > 1 ? PLURAL_OF.get(singular)! : singular;
  return word[0] === word[0].toUpperCase() ? target[0].toUpperCase() + target.slice(1) : target;
}

const CUP_LABELS: [value: number, label: string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

function nearest(value: number, candidates: number[]): number {
  return candidates.reduce((best, c) => (Math.abs(c - value) < Math.abs(best - value) ? c : best));
}

// Renders a scaled amount for the given class, applying that class's floor.
// Returns the numeric label only — the caller re-attaches the original
// separator, the unit word (re-agreed for number), and any trailing text.
function renderAmount(value: number, unitClass: UnitClass): string {
  switch (unitClass) {
    case 'countable':
      return String(Math.max(1, Math.round(value)));

    case 'cup': {
      const whole = Math.floor(value);
      // 0 is a valid candidate here — an exact whole number of cups must not
      // be nudged onto ⅛ just because ⅛ is the closest *fractional* option.
      const frac = nearest(value - whole, [0, ...CUP_LABELS.map(([v]) => v)]);
      const total = Math.max(1 / 8, whole + frac); // floor at ⅛ cup
      const totalWhole = Math.floor(total + 1e-9);
      const totalFrac = Math.round((total - totalWhole) * 1000) / 1000;
      if (totalFrac === 0) return String(Math.max(1, totalWhole));
      const label = CUP_LABELS.find(([v]) => Math.abs(v - totalFrac) < 1e-6)?.[1] ?? '⅛';
      return totalWhole > 0 ? `${totalWhole} ${label}` : label;
    }

    case 'spoon': {
      const rounded = Math.max(0.25, Math.round(value * 4) / 4);
      const whole = Math.floor(rounded + 1e-9);
      const frac = Math.round((rounded - whole) * 4) / 4;
      const fracLabel: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
      if (frac === 0) return String(whole);
      return whole > 0 ? `${whole} ${fracLabel[frac]}` : fracLabel[frac];
    }

    case 'weightVolume': {
      let rounded: number;
      if (value >= 100) rounded = Math.round(value / 10) * 10;
      else if (value >= 10) rounded = Math.round(value / 5) * 5;
      else rounded = Math.max(0.5, Math.round(value * 2) / 2);
      // es-AR decimal comma; whole numbers stay bare.
      return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
    }
  }
}

// The model often appends a prep instruction to `quantity`
// ("1 unidad, pelá y cortá en bastones", "2 dientes picados", "100 g
// rallado") that duplicates the numbered steps below it on Detalle — the
// ingredient list should show only the amount. Every occurrence of these in
// the harness corpus (apps/worker/harness/output) follows either a comma or
// one of these trigger words, so cutting at the first of either is
// sufficient. This runs unconditionally, independent of scaling, so a size
// descriptor that happens to be real quantity information — "1 grande" — is
// never affected, but "1 grande cortado en cubos" always renders as
// "1 grande" whether or not the serving count changed.
const PREP_CLAUSE_TRIGGER = new RegExp(
  '\\b(' +
    [
      'pic(?:ado|ada|ados|adas|á)',
      'cort(?:ado|ada|ados|adas|á)',
      'rall(?:ado|ada|ados|adas|á)',
      'trocead[oa]s?',
      'escurrid[oa]s?',
      'machacad[oa]s?',
      'batid[oa]s?',
      'laminad[oa]s?',
      'rebanad[oa]s?',
      'desmenuzad[oa]s?',
      'derretid[oa]s?',
      'pelad[oa]s?',
      'pelá',
      'lavad[oa]s?',
      'lavá',
      'desgarrad[oa]',
      'rasgad[oa]',
      'rompid[oa]',
      'separad[oa]',
      'en', // always "en cubos/tiras/rodajas/gajos/..." in this corpus
    ].join('|') +
    ')\\b',
  'i',
);

function stripPrepClause(remainder: string): string {
  const commaIndex = remainder.indexOf(',');
  const triggerMatch = remainder.match(PREP_CLAUSE_TRIGGER);
  const cutCandidates = [commaIndex >= 0 ? commaIndex : null, triggerMatch ? triggerMatch.index! : null].filter(
    (i): i is number => i !== null,
  );
  if (cutCandidates.length === 0) return remainder;
  return remainder.slice(0, Math.min(...cutCandidates)).replace(/[\s,]+$/, '');
}

/**
 * Scales a single ingredient's `quantity` string by `factor`, and always
 * strips a trailing prep clause regardless of `factor` (see
 * `stripPrepClause`). Prose without a leading number ("al gusto", "para
 * freír") passes through unchanged. An invalid or 1 factor skips the numeric
 * rescale but the prep-clause strip still applies.
 */
export function scaleQuantity(quantity: string, factor: number): string {
  const match = quantity.match(LEADING_AMOUNT);
  if (!match) return quantity;

  const [, amountToken, separator, rawRemainder] = match;
  const amountValue = parseAmount(amountToken);
  if (amountValue === null) return quantity;

  const remainder = stripPrepClause(rawRemainder);

  // "¼ de cucharadita" / "1/4 de manojo" — a fractional-portion phrasing
  // where the classifying unit noun follows "de ", not the amount directly.
  // Keep the connective in the output; skip past it only to classify.
  const deMatch = remainder.match(/^de[\s ]+/i);
  const dePrefix = deMatch?.[0] ?? '';
  const afterDe = remainder.slice(dePrefix.length);

  // Isolate just the letters of the first word (a comma or period can follow
  // directly, as in "medianas, cortá en cubos") so classification and
  // number agreement never see stray punctuation, while everything after
  // the word — punctuation included — is reproduced verbatim.
  const wordMatch = afterDe.match(/^[a-zA-ZáéíóúñÁÉÍÓÚÑ]+/);
  const firstWord = wordMatch?.[0] ?? '';
  const rest = afterDe.slice(firstWord.length);
  const unitClass = classify(firstWord);

  // If the prep-clause strip consumed everything after the amount (e.g. "1
  // batido para pincelar" -> nothing left), drop the separator too — nothing
  // survives for it to separate from.
  const trailing = `${dePrefix}${firstWord}${rest}`;
  const effectiveSeparator = trailing.length > 0 ? separator : '';

  const usableFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  if (usableFactor === 1) {
    // No rescale needed — reproduce the original amount and unit exactly,
    // just without the stripped prep clause.
    return `${amountToken}${effectiveSeparator}${trailing}`;
  }

  const scaledLabel = renderAmount(amountValue * usableFactor, unitClass);
  const scaledValue = parseAmount(scaledLabel) ?? 0;
  const unitWord = firstWord ? agreeNumber(firstWord, scaledValue) : firstWord;

  return `${scaledLabel}${effectiveSeparator}${dePrefix}${unitWord}${rest}`;
}

// Word list a step-text number must be immediately followed by to be
// scaled. Deliberately excludes bare countables — a number in prose is more
// likely a time, a temperature, a pan size or a piece count than an
// ingredient amount, and getting that wrong corrupts the recipe ("cociná 20
// minutos" must never become "cociná 30 minutos").
const STEP_UNIT_WORDS = new Set([...CUP_WORDS, ...SPOON_WORDS, ...WEIGHT_VOLUME_WORDS]);
const STEP_AMOUNT_AND_UNIT = new RegExp(
  `(${AMOUNT_SRC})([\\s\\u202f]+)(${[...STEP_UNIT_WORDS].join('|')})\\b`,
  'gi',
);

/**
 * Scales amounts inside free-text step prose, but only ones immediately
 * followed by a recognized measuring unit (g, ml, l, cucharada(s),
 * cucharadita(s), cda(s), cdta(s), taza(s)). Times, temperatures, oven
 * racks, pan sizes and piece counts have no such unit and are never touched.
 */
export function scaleStepText(step: string, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return step;

  return step.replace(STEP_AMOUNT_AND_UNIT, (full, amountToken: string, sep: string, unitWord: string) => {
    const value = parseAmount(amountToken);
    if (value === null) return full;
    const scaledLabel = renderAmount(value * factor, classify(unitWord));
    const scaledValue = parseAmount(scaledLabel) ?? 0;
    return `${scaledLabel}${sep}${agreeNumber(unitWord, scaledValue)}`;
  });
}

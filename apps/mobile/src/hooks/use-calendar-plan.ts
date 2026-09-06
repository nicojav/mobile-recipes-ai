import { useRef, useState } from "react";
import type { CardWithImage } from "@mobile-recipes/shared";

import { fetchSuggestions } from "@lib/api";
import type { MealSlot } from "@/constants/calendar";

// The /suggest contract has no meal-type field (see CLAUDE.md's API
// contract) — same trick the cuisine interstitial uses: stuff the hint into
// the existing free-text `notes` field rather than changing the schema.
const MEAL_HINT: Record<MealSlot, string> = {
  almuerzo: "Quiero una idea para el almuerzo (mediodía).",
  cena: "Quiero una idea para la cena.",
};

function planKey(dayKey: string, slot: MealSlot): string {
  return `${dayKey}:${slot}`;
}

// One card per day/slot, generated on demand via the same fetchSuggestions()
// "Buscar ideas" uses — reads the user's actual active kitchen items, hits
// the real Worker. Each generate() call requests a single card (not a full
// batch) since only one slot is being filled at a time.
export function useCalendarPlan() {
  const [plan, setPlan] = useState<Partial<Record<string, Partial<Record<MealSlot, CardWithImage>>>>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [errorKeys, setErrorKeys] = useState<Set<string>>(new Set());
  // Titles already handed out this session, across every day/slot — sent as
  // `exclude` so two slots never land on the same dish (same idea as Deck's
  // shownTitles, see CLAUDE.md Prefetching).
  const shownTitles = useRef<string[]>([]);

  async function generate(dayKey: string, slot: MealSlot) {
    const key = planKey(dayKey, slot);
    setLoadingKeys((prev) => new Set(prev).add(key));
    setErrorKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    try {
      const [card] = await fetchSuggestions(MEAL_HINT[slot], shownTitles.current, 1);
      shownTitles.current = [...shownTitles.current, card.title];
      setPlan((prev) => ({ ...prev, [dayKey]: { ...prev[dayKey], [slot]: card } }));
    } catch {
      setErrorKeys((prev) => new Set(prev).add(key));
    } finally {
      setLoadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return {
    recipeFor: (dayKey: string, slot: MealSlot) => plan[dayKey]?.[slot],
    isLoading: (dayKey: string, slot: MealSlot) => loadingKeys.has(planKey(dayKey, slot)),
    hasError: (dayKey: string, slot: MealSlot) => errorKeys.has(planKey(dayKey, slot)),
    generate,
  };
}

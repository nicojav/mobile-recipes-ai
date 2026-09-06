export type MealSlot = "almuerzo" | "cena";

export type CalendarDay = {
  key: string; // YYYY-MM-DD, stable across a session
  weekday: string; // "Lun", "Mar", ...
  dayNumber: string; // "8"
};

export function weekDays(count = 7): CalendarDay[] {
  const today = new Date();
  const weekdayFmt = new Intl.DateTimeFormat("es-AR", { weekday: "short" });
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const weekday = weekdayFmt.format(date).replace(".", "");
    return {
      key: date.toISOString().slice(0, 10),
      weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
      dayNumber: String(date.getDate()),
    };
  });
}

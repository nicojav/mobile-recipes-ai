export const esAR = {
  kitchen: {
    title: "Mi cocina",
    notesPlaceholder: 'algo suelto que compraste, tipo "cherry y un morrón"',
    findIdeas: "Buscar ideas",
    viewSaved: "Guardadas",
  },
  group: {
    show: "mostrar",
    hide: "ocultar",
  },
  // Display labels only — the underlying Location values (freezer, heladera,
  // alacena, condimentos, cajon) are the wire/storage format and stay as-is;
  // this is purely what the UI shows for each.
  location: {
    freezer: "Freezer",
    heladera: "Heladera",
    alacena: "Alacena",
    condimentos: "Condimentos",
    cajon: "Cajón",
  },
  // Display labels only — Card.effort's wire values (easy/medium/elaborate)
  // stay English; this is what the deck's effort badge shows instead.
  effort: {
    easy: "Fácil",
    medium: "Media",
    elaborate: "Elaborada",
  },
  deck: {
    counter: "{{current}} de {{total}}",
    minutes: "{{count}} min",
    missing: "Te falta:",
    loadingLines: [
      "Pensando qué darte de comer…",
      "Mirando bien lo que tenés…",
      "Ya casi…",
    ],
    error: "No se pudo conectar. Probá de nuevo.",
    retry: "Reintentar",
    discard: "Descartar",
    like: "Me gusta",
  },
  detail: {
    servings: "{{count}} porciones",
    ingredients: "Ingredientes",
    steps: "Preparación",
    save: "Guardar",
    saved: "Guardado",
    cooked: "La cociné",
    cookedCount_one: "La cocinaste {{count}} vez",
    cookedCount_other: "La cocinaste {{count}} veces",
  },
  saved: {
    title: "Guardadas",
    empty: "Todavía no guardaste ninguna receta.",
  },
} as const;

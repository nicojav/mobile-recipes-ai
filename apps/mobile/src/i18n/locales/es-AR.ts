export const esAR = {
  kitchen: {
    title: "Mi cocina",
    notesPlaceholder: 'anotá algo suelto, tipo "cherry y un morrón"',
    notesConfirmation: '"{{text}}" anotado para tu próxima búsqueda',
    findIdeas: "Buscar ideas · {{count}}",
    viewSaved: "Guardadas",
    more: "+{{count}} más",
    locationCount: "{{active}} de {{total}}",
    sheetDone: "Listo",
    sheetClose: "Cerrar",
    add: "Agregar",
    addPlaceholder: "¿Qué agregás?",
    deleteTitle: '¿Eliminar "{{name}}"?',
    deleteBody: "No vas a poder deshacer esto.",
    deleteConfirm: "Eliminar",
    deleteCancel: "Cancelar",
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
    back: "Volver",
    counter: "{{current}} de {{total}}",
    minutes: "{{count}} min",
    calories: "{{count}} kcal",
    missing: "Te falta:",
    loadingLines: [
      "Pensando qué darte de comer…",
      "Mirando bien lo que tenés…",
      "Ya casi…",
    ],
    error: "No se pudo conectar. Probá de nuevo.",
    // Shown instead of the cycling loadingLines while a request is being
    // retried after a rate-limit response (see LoadingView's `throttled`
    // prop) — honest about the wait instead of leaving the generic loading
    // copy running for what can be tens of seconds.
    throttled: "Pará un toque, estamos al límite de pedidos…",
    retry: "Reintentar",
    previous: "Anterior",
    next: "Siguiente",
    cuisine: {
      headline: "Probá suerte con la próxima tanda",
      spin: "🎲 Girar",
      spinning: "Girando…",
      confirm: "Sí, dale con {{country}}",
      keepCurrent: "Seguí en {{country}}",
    },
  },
  detail: {
    back: "Volver",
    servings_one: "{{count}} porción",
    servings_other: "{{count}} porciones",
    servingsDecrease: "Menos porciones",
    servingsIncrease: "Más porciones",
    ingredients: "Ingredientes",
    steps: "Preparación",
    save: "Guardar",
    saved: "Guardado",
    cooked: "La cociné",
    cookedCount_one: "La cocinaste {{count}} vez",
    cookedCount_other: "La cocinaste {{count}} veces",
  },
  saved: {
    back: "Volver",
    title: "Guardadas",
    empty: "Todavía no guardaste ninguna receta.",
  },
  calendar: {
    navLink: "Calendario",
    back: "Volver",
    title: "Esta semana",
    slotAlmuerzo: "Almuerzo",
    slotCena: "Cena",
    generate: "Generar receta",
    regenerate: "Regenerar",
    loading: "Pensando qué darte de comer…",
    error: "No se pudo conectar. Probá de nuevo.",
    retry: "Reintentar",
  },
} as const;

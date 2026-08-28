export const esAR = {
  kitchen: {
    title: "Mi cocina",
    notesPlaceholder: 'algo suelto que compraste, tipo "cherry y un morrón"',
    findIdeas: "Buscar ideas",
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
} as const;

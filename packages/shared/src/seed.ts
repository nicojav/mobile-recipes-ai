import type { Item, Location } from "./schema";

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type GroupOptions = {
  inCocina?: boolean;
  inReposteria?: boolean;
};

function group(location: Location, names: string[], options: GroupOptions = {}): Item[] {
  return names.map((name) => ({
    id: `${location}-${slugify(name)}`,
    name,
    location,
    active: true,
    inCocina: options.inCocina ?? true,
    inReposteria: options.inReposteria ?? false,
  }));
}

// Items Mi cocina already seeds that Repostería needs too — reclassified as
// shared (inReposteria: true) rather than duplicated as separate rows. See
// ticket "Repostería pantry seed list": harina leudante and harina 0000
// already exist in alacena; huevos and leche already exist in heladera.
const SHARED_WITH_REPOSTERIA = new Set(["harina leudante", "harina 0000", "huevos", "leche"]);

function withReposteriaSharing(items: Item[]): Item[] {
  return items.map((item) => (SHARED_WITH_REPOSTERIA.has(item.name) ? { ...item, inReposteria: true } : item));
}

export const seedItems: Item[] = [
  ...withReposteriaSharing([
    ...group("freezer", ["carne picada", "milanesa de pollo", "milanesa de carne"]),
    ...group("heladera", [
      "queso crema",
      "reggianito",
      "leche",
      "huevos",
      "mermelada",
      "tomate cherry",
      "lechuga",
      "zanahoria",
      "port salut",
      "muzzarella",
      "queso cremoso",
      "cebolla de verdeo",
    ]),
    ...group("alacena", [
      "aceite de oliva",
      "aceite de girasol",
      "arroz",
      "fideos",
      "salsa de tomate",
      "harina leudante",
      "harina 0000",
      "harina 000",
    ]),
    ...group("condimentos", ["ají molido", "comino", "pimentón", "orégano"]),
    ...group("cajon", ["papas", "batata", "cebolla"]),
  ]),
  // manteca: a new shared row, not exclusive to either pantry — a cook's
  // heladera stocks butter for both a stew finish and a torta.
  ...group("heladera", ["manteca"], { inReposteria: true }),
  // Repostería-only additions — inCocina: false since these don't belong in
  // Mi cocina's savory suggestions. Locations follow existing seed
  // conventions: dulce de leche as an opened jar → heladera (matches
  // mermelada's precedent); canela/nuez moscada/ralladura de limón →
  // condimentos (matches the existing spice rows); everything else →
  // alacena, alongside the flours and other dry goods.
  ...group(
    "alacena",
    [
      "levadura seca",
      "azúcar",
      "polvo de hornear",
      "esencia de vainilla",
      "bicarbonato de sodio",
      "azúcar impalpable",
      "chocolate cobertura",
      "cacao amargo",
      "coco rallado",
      "pasas de uva",
      "nueces",
    ],
    { inCocina: false, inReposteria: true },
  ),
  ...group("heladera", ["dulce de leche"], { inCocina: false, inReposteria: true }),
  ...group("condimentos", ["canela", "nuez moscada", "ralladura de limón"], { inCocina: false, inReposteria: true }),
];

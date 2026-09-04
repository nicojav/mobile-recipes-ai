import type { Item, Location } from "./schema";

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function group(location: Location, names: string[]): Item[] {
  return names.map((name) => ({
    id: `${location}-${slugify(name)}`,
    name,
    location,
    active: true,
  }));
}

export const seedItems: Item[] = [
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
];

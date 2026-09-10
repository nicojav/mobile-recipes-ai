import type { ImageSourcePropType } from 'react-native';

// PROTOTYPE ASSETS — one still-life photo per baking-ingredient category,
// generated once via the Worker's real FLUX pipeline (same as
// location-photos.ts's loc-*.jpg) and committed, then downscaled to 240px
// with `sips` since they only ever render as a ~38px avatar. Category-level,
// not per-item: both flours share `flour-bag`, matching how the vector-icon
// round used the same grouping. Quick-added items are always free text, so
// they can never have curated art — see ItemAvatar's letter-monogram
// fallback in prototype-reposteria.tsx.
export type IngredientPhotoKey =
  | 'flour-bag'
  | 'sugar'
  | 'powdered-sugar'
  | 'butter'
  | 'egg'
  | 'yeast'
  | 'baking-powder'
  | 'vanilla'
  | 'milk'
  | 'dulce-de-leche'
  | 'chocolate'
  | 'cacao'
  | 'coconut'
  | 'lemon'
  | 'cinnamon'
  | 'nutmeg'
  | 'raisins'
  | 'walnut';

export const ingredientPhotos: Record<IngredientPhotoKey, ImageSourcePropType> = {
  'flour-bag': require('@/assets/images/ing-flour-bag.jpg'),
  sugar: require('@/assets/images/ing-sugar.jpg'),
  'powdered-sugar': require('@/assets/images/ing-powdered-sugar.jpg'),
  butter: require('@/assets/images/ing-butter.jpg'),
  egg: require('@/assets/images/ing-egg.jpg'),
  yeast: require('@/assets/images/ing-yeast.jpg'),
  'baking-powder': require('@/assets/images/ing-baking-powder.jpg'),
  vanilla: require('@/assets/images/ing-vanilla.jpg'),
  milk: require('@/assets/images/ing-milk.jpg'),
  'dulce-de-leche': require('@/assets/images/ing-dulce-de-leche.jpg'),
  chocolate: require('@/assets/images/ing-chocolate.jpg'),
  cacao: require('@/assets/images/ing-cacao.jpg'),
  coconut: require('@/assets/images/ing-coconut.jpg'),
  lemon: require('@/assets/images/ing-lemon.jpg'),
  cinnamon: require('@/assets/images/ing-cinnamon.jpg'),
  nutmeg: require('@/assets/images/ing-nutmeg.jpg'),
  raisins: require('@/assets/images/ing-raisins.jpg'),
  walnut: require('@/assets/images/ing-walnut.jpg'),
};

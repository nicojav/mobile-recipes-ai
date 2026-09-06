import type { ImageSourcePropType } from 'react-native';
import { Location } from '@mobile-recipes/shared';

// One still-life photo per kitchen location, rendered full-bleed behind each
// LocationCard on Mi cocina (see Design.md → "Location photography"). Bundled
// static assets, generated once via the Worker's FLUX pipeline and committed
// — the app never calls FLUX for these, they're not part of the /suggest
// image pipeline. Metro requires a static, literal `require(...)` per file
// (no computed paths), so this map is written out by hand rather than built
// from a template string; typing it as Record<Location, ...> keeps it total —
// adding a location later fails to compile until it has a photo.
//
// `freezer` and `heladera` are open-appliance shots (the freezer/fridge
// itself, stocked with what actually lives there) rather than the flat-lay
// still life the other three use — a tabletop arrangement read as less
// evocative for exactly these two. See Design.md → "Location photography".
export const locationPhotos: Record<Location, ImageSourcePropType> = {
  freezer: require('@/assets/images/loc-freezer.jpg'),
  heladera: require('@/assets/images/loc-heladera.jpg'),
  alacena: require('@/assets/images/loc-alacena.jpg'),
  condimentos: require('@/assets/images/loc-condimentos.jpg'),
  cajon: require('@/assets/images/loc-cajon.jpg'),
};

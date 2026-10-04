import { StyleSheet, View } from 'react-native';
import { Circle, Path, Rect, Svg } from 'react-native-svg';

// Real vector flags instead of the system emoji font — CuisineInterstitial's
// original design used `country.flag` emoji, which render inconsistently
// (and, on some devices, poorly) across Android/iOS/fonts. A drawn shape
// looks identical everywhere. This won out over a flag-free monogram, a
// dish-icon, and a color-only mark tried in the same `/prototype` session.
// Deliberately simplified (no emblems, no cantons on most) — these render as
// small as 52px next to the country's own name label, so a busy, "accurate"
// flag would lose to a plain, confident one every time.
export function CountryFlag({ name, size }: { name: string; size: number }) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <FlagArt name={name} />
      </Svg>
    </View>
  );
}

function FlagArt({ name }: { name: string }) {
  switch (name) {
    case 'Argentina':
      return (
        <>
          <Rect x={0} y={0} width={100} height={33.3} fill="#75AADB" />
          <Rect x={0} y={33.3} width={100} height={33.3} fill="#FFFFFF" />
          <Rect x={0} y={66.6} width={100} height={33.4} fill="#75AADB" />
        </>
      );
    case 'México':
      return (
        <>
          <Rect x={0} y={0} width={33.3} height={100} fill="#006847" />
          <Rect x={33.3} y={0} width={33.4} height={100} fill="#FFFFFF" />
          <Rect x={66.7} y={0} width={33.3} height={100} fill="#CE1126" />
        </>
      );
    case 'Perú':
      return (
        <>
          <Rect x={0} y={0} width={33.3} height={100} fill="#D91023" />
          <Rect x={33.3} y={0} width={33.4} height={100} fill="#FFFFFF" />
          <Rect x={66.7} y={0} width={33.3} height={100} fill="#D91023" />
        </>
      );
    case 'Italia':
      return (
        <>
          <Rect x={0} y={0} width={33.3} height={100} fill="#009246" />
          <Rect x={33.3} y={0} width={33.4} height={100} fill="#FFFFFF" />
          <Rect x={66.7} y={0} width={33.3} height={100} fill="#CE2B37" />
        </>
      );
    case 'España':
      return (
        <>
          <Rect x={0} y={0} width={100} height={25} fill="#AA151B" />
          <Rect x={0} y={25} width={100} height={50} fill="#F1BF00" />
          <Rect x={0} y={75} width={100} height={25} fill="#AA151B" />
        </>
      );
    case 'Japón':
      return (
        <>
          <Rect x={0} y={0} width={100} height={100} fill="#FFFFFF" />
          <Circle cx={50} cy={50} r={24} fill="#BC002D" />
        </>
      );
    case 'Marruecos':
      return (
        <>
          <Rect x={0} y={0} width={100} height={100} fill="#C1272D" />
          <Path
            d="M50 30 L56 45 L72 45 L59 55 L64 70 L50 61 L36 70 L41 55 L28 45 L44 45 Z"
            fill="none"
            stroke="#006233"
            strokeWidth={3}
            strokeLinejoin="round"
          />
        </>
      );
    case 'Grecia':
      return (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <Rect key={i} x={0} y={i * 20} width={100} height={20} fill={i % 2 === 0 ? '#0D5EAF' : '#FFFFFF'} />
          ))}
        </>
      );
    case 'Francia':
      return (
        <>
          <Rect x={0} y={0} width={33.3} height={100} fill="#0055A4" />
          <Rect x={33.3} y={0} width={33.4} height={100} fill="#FFFFFF" />
          <Rect x={66.7} y={0} width={33.3} height={100} fill="#EF4135" />
        </>
      );
    case 'Corea':
      return (
        <>
          <Rect x={0} y={0} width={100} height={100} fill="#FFFFFF" />
          <Circle cx={50} cy={41} r={11} fill="#CD2E3A" />
          <Circle cx={50} cy={59} r={11} fill="#0047A0" />
        </>
      );
    case 'Estados Unidos':
      return (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Rect key={i} x={0} y={i * (100 / 6)} width={100} height={100 / 6} fill={i % 2 === 0 ? '#B22234' : '#FFFFFF'} />
          ))}
          <Rect x={0} y={0} width={45} height={50} fill="#3C3B6E" />
        </>
      );
    case 'Bulgaria':
      return (
        <>
          <Rect x={0} y={0} width={100} height={33.3} fill="#FFFFFF" />
          <Rect x={0} y={33.3} width={100} height={33.3} fill="#00966E" />
          <Rect x={0} y={66.6} width={100} height={33.4} fill="#D62612" />
        </>
      );
    case 'Alemania':
      return (
        <>
          <Rect x={0} y={0} width={100} height={33.3} fill="#000000" />
          <Rect x={0} y={33.3} width={100} height={33.3} fill="#DD0000" />
          <Rect x={0} y={66.6} width={100} height={33.4} fill="#FFCE00" />
        </>
      );
    case 'Inglaterra':
      // St. George's Cross, not the Union Jack — this pool means the country
      // (there's no standalone English flag emoji, which is what forced the
      // UK flag as a stand-in before this component existed).
      return (
        <>
          <Rect x={0} y={0} width={100} height={100} fill="#FFFFFF" />
          <Rect x={0} y={40} width={100} height={20} fill="#CE1124" />
          <Rect x={40} y={0} width={20} height={100} fill="#CE1124" />
        </>
      );
    case 'Ucrania':
      return (
        <>
          <Rect x={0} y={0} width={100} height={50} fill="#0057B7" />
          <Rect x={0} y={50} width={100} height={50} fill="#FFD700" />
        </>
      );
    default:
      return <Rect x={0} y={0} width={100} height={100} fill="#CCCCCC" />;
  }
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

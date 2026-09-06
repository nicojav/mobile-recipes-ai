// Thin-line SVG icon set — see Design.md → Icon set. Replaces the emoji/glyph
// placeholders (‹ › ✓ – 🍳) that stood in for "no icon library."
import { Path, Circle as SvgCircle, Rect, Svg, type SvgProps } from 'react-native-svg';

export type IconProps = {
  size?: number;
  color: string;
};

const STROKE_WIDTH = 1.5;

function Icon({ size = 16, children, ...rest }: SvgProps & { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      {children}
    </Svg>
  );
}

export function ChevronLeft({ size, color }: IconProps) {
  return (
    <Icon size={size}>
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function ChevronRight({ size, color }: IconProps) {
  return (
    <Icon size={size}>
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function XIcon({ size, color }: IconProps) {
  return (
    <Icon size={size}>
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
    </Icon>
  );
}

export function Bookmark({ size, color }: IconProps) {
  return (
    <Icon size={size}>
      <Path d="M6 4h12v16l-6-4-6 4V4z" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function Search({ size, color }: IconProps) {
  return (
    <Icon size={size}>
      <Path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 21l-4.3-4.3" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
    </Icon>
  );
}

export function Pencil({ size, color }: IconProps) {
  return (
    <Icon size={size}>
      <Path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function CheckCircle({ size, color }: IconProps) {
  return (
    <Icon size={size}>
      <SvgCircle cx="12" cy="12" r="9" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Path d="M8.5 12.3l2.3 2.3 4.7-4.7" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function OpenCircle({ size, color }: IconProps) {
  return (
    <Icon size={size}>
      <SvgCircle cx="12" cy="12" r="9" stroke={color} strokeWidth={STROKE_WIDTH} strokeDasharray="3 3" />
    </Icon>
  );
}

// Mi cocina's nav link to the weekly calendar screen.
export function CalendarIcon({ size, color }: IconProps) {
  return (
    <Icon size={size}>
      <Rect x="4" y="5" width="16" height="15" rx="2" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Path d="M4 9.5h16" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Path d="M8 3v4M16 3v4" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
    </Icon>
  );
}

export function Plus({ size, color }: IconProps) {
  return (
    <Icon size={size}>
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
    </Icon>
  );
}

// Image-well placeholder before a recipe's real photo loads.
export function Bowl({ size, color }: IconProps) {
  return (
    <Icon size={size}>
      <Path d="M4 12.5a8 8 0 0 0 16 0" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Path d="M4 12.5h16" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Path d="M9.5 5c-.5 1-.5 2 0 3" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Path d="M12.5 4.3c-.5 1-.5 2 0 3" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Path d="M15.5 5c-.5 1-.5 2 0 3" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
    </Icon>
  );
}

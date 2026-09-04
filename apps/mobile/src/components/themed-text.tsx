import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, FontFamily, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'cardTitle'
    | 'sheetTitle'
    | 'button'
    | 'small'
    | 'smallBold'
    | 'micro'
    | 'link'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'cardTitle' && styles.cardTitle,
        type === 'sheetTitle' && styles.sheetTitle,
        type === 'button' && styles.button,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'micro' && styles.micro,
        type === 'link' && styles.link,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

// See Design.md → Type scale. Sora for headings/buttons, Work Sans for
// everything else — fontFamily carries the weight (these are the exact
// registered family names per weight), so these styles never also set
// fontWeight alongside it.
const styles = StyleSheet.create({
  title: {
    fontFamily: FontFamily.heading,
    fontSize: 27,
    lineHeight: 33,
  },
  cardTitle: {
    fontFamily: FontFamily.heading,
    fontSize: 22,
    lineHeight: 28,
  },
  sheetTitle: {
    fontFamily: FontFamily.heading,
    fontSize: 18,
    lineHeight: 24,
  },
  button: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  default: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    lineHeight: 24,
  },
  small: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    lineHeight: 20,
  },
  micro: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.9, // ~0.08em at 11px
  },
  link: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 30,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});

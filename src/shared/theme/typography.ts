/**
 * Kashi Veda Design System Typography
 * 
 * Scaled typography system supporting Latin and Devanagari scripts.
 * React Native compatible type scale with strict platform font naming conventions.
 */
import { TextStyle } from 'react-native';

export const FONT_DISPLAY = 'RozhaOne-Regular';
export const FONT_UI_LATIN = 'PlusJakartaSans';
export const FONT_UI_DEVANAGARI = 'NotoSansDevanagari';

export const DEVANAGARI_LINE_HEIGHT_MULTIPLIER = 1.5;
export const MIN_FONT_SIZE = 12;
export const DEVANAGARI_VERTICAL_CLEARANCE = 4;

export const getDevanagariLineHeight = (fontSize: number): number => {
  return Math.max(fontSize * DEVANAGARI_LINE_HEIGHT_MULTIPLIER, fontSize + 6);
};

export const typeScale = {
  // Display & Headlines
  displayHero: {
    fontFamily: 'RozhaOne-Regular',
    fontWeight: '400',
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.25,
  },
  headlineLarge: {
    fontFamily: 'RozhaOne-Regular',
    fontWeight: '400',
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: 0,
  },
  headlineMedium: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 26,
    letterSpacing: -0.1,
  },
  headlineSmall: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0,
  },

  // Titles
  titleMedium: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
  },
  titleSmall: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
  },

  // Body
  bodyLarge: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontWeight: '400',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.15,
  },
  bodyMedium: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.2,
  },

  // Labels
  labelLarge: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  labelMedium: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.25,
  },

  // Caption
  caption: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0.25,
  },
} as const;

export interface TypographyStyle {
  readonly fontFamily: string;
  readonly fontWeight: '400' | '600' | '700';
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
}

export type TypographyVariant = keyof typeof typeScale;
export type TypeScale = typeof typeScale;

/**
 * Returns the corresponding typography style mapped for Devanagari text,
 * accounting for higher line-height requirements and Devanagari font families.
 */
export const getDevanagariTextStyle = (variant: TypographyVariant): TypographyStyle => {
  const base = typeScale[variant] || typeScale.bodyMedium;
  const devanagariFont =
    base.fontWeight === '700'
      ? 'NotoSansDevanagari-Bold'
      : base.fontWeight === '600'
      ? 'NotoSansDevanagari-SemiBold'
      : 'NotoSansDevanagari-Regular';

  return {
    ...base,
    fontFamily: devanagariFont,
    lineHeight: getDevanagariLineHeight(base.fontSize),
  };
};

/**
 * Backwards compatibility scale for initial Kashi Veda screens.
 */
export const typography = {
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    display: 30,
    hero: 36,
  },
  lineHeight: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 26,
    xl: 28,
    xxl: 32,
    display: 38,
    hero: 44,
  },
  fontWeight: {
    regular: "400" as TextStyle["fontWeight"],
    medium: "500" as TextStyle["fontWeight"],
    semibold: "600" as TextStyle["fontWeight"],
    bold: "700" as TextStyle["fontWeight"],
    heavy: "800" as TextStyle["fontWeight"],
  },
} as const;

export type TypographyToken = keyof typeof typography.fontSize;

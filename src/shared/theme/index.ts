// src/shared/theme/index.ts

// Territory G Dual Theme Provider & Hook
export { ThemeProvider, useTheme, ThemeContext } from './ThemeProvider';
export type { Theme, ThemeMode, ThemeProviderProps } from './ThemeProvider';

// Primitive Tokens & Types
export { primitiveTokens } from './tokens';
export type {
  ElevationStyle,
  ElevationLevel,
  ElevationSet,
  PrimitiveTokens,
  SpacingTokens,
  RadiusTokens,
  MotionTokens,
  LightElevationSet,
  DarkElevationSet,
} from './tokens';

// Semantics (Ivory Light & Obsidian Dark)
export { lightColors, darkColors } from './semantics';
export type { ThemeColors, SemanticTokens } from './semantics';

// Typography (11-level scale, Devanagari helpers, and legacy scale)
export {
  typeScale,
  FONT_DISPLAY,
  FONT_UI_LATIN,
  FONT_UI_DEVANAGARI,
  MIN_FONT_SIZE,
  DEVANAGARI_LINE_HEIGHT_MULTIPLIER,
  DEVANAGARI_VERTICAL_CLEARANCE,
  getDevanagariLineHeight,
  getDevanagariTextStyle,
  typography,
} from './typography';
export type {
  TypographyStyle,
  TypographyVariant,
  TypeScale,
  TypographyToken,
} from './typography';

// Backwards-Compatible Primitives for Existing Mobile Screens
export * from './colors';
export * from './spacing';
export * from './radius';
export * from './shadows';

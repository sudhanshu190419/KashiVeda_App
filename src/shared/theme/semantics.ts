import { primitiveTokens } from './tokens';

export const lightColors = {
  // Surface
  surfaceBase: primitiveTokens.colors.neutral[50], // #FFFDF9
  surfaceCard: primitiveTokens.colors.neutral[0], // #FFFFFF
  surfaceSubtle: primitiveTokens.colors.amber[100], // #FEF3C7
  surfaceNav: 'rgba(255, 253, 249, 0.95)',

  // Border
  borderDefault: primitiveTokens.colors.neutral[200], // #F3E8D6
  borderAccent: primitiveTokens.colors.amber[600], // #D97706

  // Text
  textPrimary: primitiveTokens.colors.neutral[975], // #1C1917
  textMuted: primitiveTokens.colors.neutral[500], // #78716C
  textOnPrimary: primitiveTokens.colors.neutral[0], // #FFFFFF

  // Brand
  brandPrimary: primitiveTokens.colors.amber[700], // #B45309
  brandButtonGradient: [primitiveTokens.colors.amber[700], primitiveTokens.colors.amber[600]] as const, // [#B45309, #D97706]
  brandPill: primitiveTokens.colors.amber[700], // #B45309

  // Status
  statusActive: primitiveTokens.colors.success[600], // #16A34A
  statusAlert: primitiveTokens.colors.vermillion[600], // #DC2626

  // Overlay
  overlayScrim: primitiveTokens.colors.overlay,

  // Feedback surfaces
  successBg: primitiveTokens.colors.success[50],
  successFg: primitiveTokens.colors.success[600],
  errorBg: primitiveTokens.colors.error[50],
  errorFg: primitiveTokens.colors.error[600],
  warningBg: primitiveTokens.colors.warning[50],
  warningFg: primitiveTokens.colors.warning[600],
  infoBg: primitiveTokens.colors.info[50],
  infoFg: primitiveTokens.colors.info[600],

  // Auxiliary
  samagriDispatched: primitiveTokens.colors.sky[400],
  enRoutePandit: primitiveTokens.colors.purple[500],
};

export const darkColors = {
  surfaceBase: primitiveTokens.colors.neutral[950], // #0B0E14
  surfaceCard: primitiveTokens.colors.neutral[900], // #121824
  surfaceSubtle: 'rgba(245, 158, 11, 0.14)',
  surfaceNav: 'rgba(18, 24, 36, 0.96)',

  borderDefault: primitiveTokens.colors.neutral[800], // #222D42
  borderAccent: primitiveTokens.colors.amber[500], // #F59E0B

  textPrimary: primitiveTokens.colors.neutral[25], // #F8FAFC
  textMuted: primitiveTokens.colors.neutral.slate400, // #94A3B8
  textOnPrimary: primitiveTokens.colors.neutral[950], // #0B0E14

  brandPrimary: primitiveTokens.colors.amber[500], // #F59E0B
  brandButtonGradient: [primitiveTokens.colors.amber[600], primitiveTokens.colors.amber[500]] as const, // [#D97706, #F59E0B]
  brandPill: primitiveTokens.colors.amber[400], // #FBBF24

  statusActive: primitiveTokens.colors.success[500], // #22C55E
  statusAlert: primitiveTokens.colors.vermillion[500], // #EF4444

  overlayScrim: primitiveTokens.colors.overlay,

  successBg: primitiveTokens.colors.success.surfaceDark,
  successFg: primitiveTokens.colors.success[400],
  errorBg: primitiveTokens.colors.error.surfaceDark,
  errorFg: primitiveTokens.colors.error[400],
  warningBg: primitiveTokens.colors.warning.surfaceDark,
  warningFg: primitiveTokens.colors.warning[400],
  infoBg: primitiveTokens.colors.info.surfaceDark,
  infoFg: primitiveTokens.colors.info[400],

  samagriDispatched: primitiveTokens.colors.sky[400],
  enRoutePandit: primitiveTokens.colors.purple[500],
};

type ColorSchema<T> = {
  [K in keyof T]: T[K] extends readonly [unknown, ...unknown[]]
    ? readonly [string, string]
    : string;
};

export type ThemeColors = ColorSchema<typeof lightColors>;
export type SemanticTokens = ThemeColors;

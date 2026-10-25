/**
 * Kashi Veda Design System Primitive Tokens
 * 
 * Absolute primitive tokens for the Kashi Veda mobile application.
 * Never use raw hex values in components — all styling flows through the theme system.
 */

export interface ElevationStyle {
  readonly shadowColor?: string;
  readonly shadowOffset?: { readonly width: number; readonly height: number };
  readonly shadowOpacity?: number;
  readonly shadowRadius?: number;
  readonly elevation?: number;
  readonly borderColor?: string;
  readonly borderWidth?: number;
  readonly backgroundColor?: string;
}

export type ElevationLevel =
  | 'elevation0'
  | 'elevation1'
  | 'elevation2'
  | 'elevation3'
  | 'elevation4';

export interface ElevationSet {
  readonly elevation0: ElevationStyle;
  readonly elevation1: ElevationStyle;
  readonly elevation2: ElevationStyle;
  readonly elevation3: ElevationStyle;
  readonly elevation4: ElevationStyle;
}

export const primitiveTokens = {
  colors: {
    // Temple Amber / Gold (Brand Primary)
    amber: {
      50: '#FFFBEB',
      100: '#FEF3C7',
      200: '#FDE68A',
      300: '#FCD34D',
      400: '#FBBF24',
      500: '#F59E0B',
      600: '#D97706',
      700: '#B45309',
      800: '#92400E',
      900: '#78350F',
    },

    // Sacred Vermillion / Crimson
    vermillion: {
      50: '#FEF2F2',
      100: '#FEE2E2',
      500: '#EF4444',
      600: '#DC2626',
      700: '#B91C1C',
      800: '#991B1B',
    },

    // Neutral Palette
    neutral: {
      0: '#FFFFFF',
      25: '#F8FAFC',
      50: '#FFFDF9',
      100: '#F8F6F0',
      200: '#F3E8D6',
      300: '#E7DEC8',
      400: '#A8A29E',
      slate400: '#94A3B8',
      500: '#78716C',
      600: '#57534E',
      700: '#292524',
      800: '#222D42',
      850: '#161F30',
      900: '#121824',
      925: '#0E131E',
      950: '#0B0E14',
      975: '#1C1917',
      1000: '#07090E',
    },

    // Auxiliary
    sky: {
      400: '#38BDF8',
    },
    purple: {
      500: '#A855F7',
    },
    overlay: 'rgba(0,0,0,0.75)',

    // Semantic Feedback
    // `surfaceDark` variants are translucent tints for the Obsidian theme, so
    // feedback banners and destructive controls do not glare as light blocks.
    success: {
      50: '#F0FDF4',
      400: '#4ADE80',
      500: '#22C55E',
      600: '#16A34A',
      surfaceDark: 'rgba(34, 197, 94, 0.14)',
    },
    error: {
      50: '#FEF2F2',
      400: '#F87171',
      500: '#EF4444',
      600: '#DC2626',
      surfaceDark: 'rgba(239, 68, 68, 0.14)',
    },
    warning: {
      50: '#FFFBEB',
      400: '#FBBF24',
      500: '#F59E0B',
      600: '#D97706',
      surfaceDark: 'rgba(245, 158, 11, 0.16)',
    },
    info: {
      50: '#EFF6FF',
      400: '#60A5FA',
      500: '#3B82F6',
      600: '#2563EB',
      surfaceDark: 'rgba(59, 130, 246, 0.18)',
    },
  },

  // Spacing (4dp grid)
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    xxxxl: 40,
    touch: 48,
  },

  // Corner Radii
  radius: {
    none: 0,
    sm: 6,
    md: 10,
    lg: 12,
    xl: 16,
    sheet: 24,
    full: 999,
  },

  // Elevation (React Native shadow props & dark mode border elevations)
  elevation: {
    light: {
      elevation0: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
      },
      elevation1: {
        shadowColor: '#B45309',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
      elevation2: {
        shadowColor: '#B45309',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.10,
        shadowRadius: 14,
        elevation: 4,
      },
      elevation3: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
        elevation: 8,
      },
      elevation4: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.35,
        shadowRadius: 48,
        elevation: 16,
      },
    },
    dark: {
      elevation0: {
        borderColor: 'transparent',
        borderWidth: 0,
        backgroundColor: 'transparent',
      },
      elevation1: {
        borderColor: '#222D42',
        borderWidth: 1,
        backgroundColor: '#121824',
      },
      elevation2: {
        borderColor: '#2B3852',
        borderWidth: 1,
        backgroundColor: '#161F30',
      },
      elevation3: {
        borderColor: '#334363',
        borderWidth: 1,
        backgroundColor: '#182236',
      },
      elevation4: {
        borderColor: '#3E5279',
        borderWidth: 1,
        backgroundColor: '#1C283F',
      },
    },
  },

  // Motion & Animation
  motion: {
    duration: {
      instant: 100,
      fast: 200,
      normal: 300,
      sheet: 400,
    },
    spring: {
      sheet: {
        damping: 24,
        stiffness: 280,
      },
    },
    shimmer: {
      cycle: 1500,
    },
    easing: {
      emphasized: [0.16, 1, 0.3, 1] as const,
      sheet: [0.2, 0.9, 0.2, 1.0] as const,
    },
  },
} as const;

export type PrimitiveTokens = typeof primitiveTokens;
export type SpacingTokens = typeof primitiveTokens.spacing;
export type RadiusTokens = typeof primitiveTokens.radius;
export type MotionTokens = typeof primitiveTokens.motion;
export type LightElevationSet = typeof primitiveTokens.elevation.light;
export type DarkElevationSet = typeof primitiveTokens.elevation.dark;

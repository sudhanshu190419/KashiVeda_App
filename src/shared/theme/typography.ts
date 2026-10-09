// src/shared/theme/typography.ts
import { TextStyle } from "react-native";

/**
 * Kashi Veda Design System — Typography
 * Standardized scale for clean visual hierarchy across mobile screens.
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

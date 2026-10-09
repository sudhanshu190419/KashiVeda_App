// src/shared/theme/colors.ts

/**
 * Kashi Veda Design System — Colors
 * Rooted in the spiritual heritage of Kashi: Sacred Saffron, Temple Gold, and Sandalwood Ivory.
 */
export const colors = {
  // Brand / Sacred Accents
  primary: "#E05A1B", // Sacred Saffron / Vermilion (Kashi Kesariya)
  primaryLight: "#FFF3EC", // Saffron cream wash
  primaryDark: "#B8410E", // Deep temple ochre
  primarySubtle: "#FCE7DB",

  secondary: "#D97706", // Marigold Gold (Ganga Aarti Gold)
  secondaryLight: "#FEF3C7", // Gentle golden glow
  secondaryDark: "#92400E", // Deep bronze gold

  accent: "#831843", // Kumkum maroon accent

  // Neutral Backgrounds & Surfaces
  background: "#FAFAF9", // Warm stone / Sandalwood ivory background
  surface: "#FFFFFF", // Pure surface card
  surfaceSubtle: "#F5F5F4", // Light grey surface
  surfaceDark: "#1E293B", // Temple slate dark

  // Text Hierarchy
  textPrimary: "#0F172A", // Deep slate black
  textSecondary: "#475569", // Muted slate charcoal
  textTertiary: "#94A3B8", // Subtle placeholder
  textInverse: "#FFFFFF", // High contrast light
  textBrand: "#E05A1B",

  // Borders & Outlines
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  borderFocus: "#E05A1B",

  // Status & Feedback
  success: "#16A34A",
  successLight: "#DCFCE7",
  warning: "#D97706",
  warningLight: "#FEF3C7",
  error: "#DC2626",
  errorLight: "#FEE2E2",
  info: "#2563EB",
  infoLight: "#DBEAFE",

  // Overlay
  overlay: "rgba(15, 23, 42, 0.6)",
} as const;

export type ColorToken = keyof typeof colors;

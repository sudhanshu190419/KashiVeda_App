import React, { forwardRef } from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  TextStyle,
  StyleSheet,
  StyleProp,
} from 'react-native';
import {
  useTheme,
  TypographyVariant,
  MIN_FONT_SIZE,
  getDevanagariTextStyle,
  getDevanagariLineHeight,
  ThemeColors,
} from '../../theme';

export type VTextColor =
  | 'textPrimary'
  | 'textMuted'
  | 'textOnPrimary'
  | 'brandPrimary'
  | 'error'
  | 'success'
  | keyof ThemeColors
  | (string & {});

export interface VTextProps extends RNTextProps {
  /** Typographic scale variant (11-level scale from displayHero to caption) */
  variant?: TypographyVariant;
  /** Semantic color token or custom color value */
  color?: VTextColor;
  /** Explicitly enforce Devanagari typography; if undefined, auto-detects from children */
  isDevanagari?: boolean;
  /** Text alignment shorthand */
  align?: TextStyle['textAlign'];
  /** Font weight override */
  weight?: TextStyle['fontWeight'];
  /** Children can be string, number, or nested text nodes */
  children?: React.ReactNode;
  /** Style override */
  style?: StyleProp<TextStyle>;
}

export type TypographyProps = VTextProps;

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

/**
 * Recursively inspects children nodes to detect Devanagari Unicode characters.
 */
function containsDevanagari(node: React.ReactNode): boolean {
  if (typeof node === 'string') {
    return DEVANAGARI_REGEX.test(node);
  }
  if (typeof node === 'number') {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some(containsDevanagari);
  }
  if (React.isValidElement(node) && node.props && typeof node.props === 'object' && 'children' in (node.props as Record<string, unknown>)) {
    return containsDevanagari((node.props as { children?: React.ReactNode }).children);
  }
  return false;
}

/**
 * Resolves semantic or token color key to concrete theme hex/rgb string.
 */
function resolveTextColor(colorKey: VTextColor | undefined, colors: ThemeColors): string {
  if (!colorKey) {
    return colors.textPrimary;
  }
  switch (colorKey) {
    case 'textPrimary':
      return colors.textPrimary;
    case 'textMuted':
      return colors.textMuted;
    case 'textOnPrimary':
      return colors.textOnPrimary;
    case 'brandPrimary':
      return colors.brandPrimary;
    case 'error':
      return colors.errorFg;
    case 'success':
      return colors.successFg;
    default:
      if (colorKey in colors) {
        const val = colors[colorKey as keyof ThemeColors];
        return typeof val === 'string' ? val : colors.textPrimary;
      }
      return colorKey;
  }
}

/**
 * VText — Core bilingual typography primitive for Kashi Veda mobile.
 *
 * Enforces:
 * - 11-level typography scale grounded in theme tokens
 * - Automatic Devanagari script detection with expanded line-height (>= 1.5x)
 * - Strict 12sp minimum floor (never renders below 12dp)
 * - Strict theme color token mapping
 */
export const VText = forwardRef<any, VTextProps>(function VText(
  {
    variant = 'bodyMedium',
    color = 'textPrimary',
    isDevanagari: isDevanagariProp,
    align,
    weight,
    style,
    children,
    accessibilityRole = 'text',
    ...rest
  },
  ref
) {
  const theme = useTheme();

  // Detect Devanagari presence if not explicitly declared
  const isDevanagari = isDevanagariProp ?? containsDevanagari(children);

  // Retrieve base typography definition
  const baseTypography = isDevanagari
    ? getDevanagariTextStyle(variant)
    : theme.typography[variant];

  // Flatten incoming style for floor overrides and inspection
  const flattened = (StyleSheet.flatten(style) || {}) as TextStyle;

  // Enforce strict 12sp minimum floor
  const requestedSize = flattened.fontSize ?? baseTypography.fontSize;
  const resolvedFontSize = Math.max(MIN_FONT_SIZE, requestedSize);

  // Compute line-height ensuring Devanagari vertical clearance
  let resolvedLineHeight: number;
  if (isDevanagari) {
    const rawLineHeight = flattened.lineHeight ?? baseTypography.lineHeight;
    resolvedLineHeight = Math.max(rawLineHeight, getDevanagariLineHeight(resolvedFontSize));
  } else {
    resolvedLineHeight = flattened.lineHeight ?? baseTypography.lineHeight;
  }

  // Resolve color
  const resolvedColor = flattened.color ?? resolveTextColor(color, theme.colors);

  const mergedStyle: TextStyle = {
    fontFamily: baseTypography.fontFamily,
    fontWeight: baseTypography.fontWeight,
    letterSpacing: baseTypography.letterSpacing,
    ...flattened,
    fontSize: resolvedFontSize,
    lineHeight: resolvedLineHeight,
    color: resolvedColor,
    ...(align ? { textAlign: align } : {}),
    ...(weight ? { fontWeight: weight } : {}),
  };

  return (
    <RNText
      ref={ref as any}
      style={mergedStyle}
      accessibilityRole={accessibilityRole}
      {...rest}
    >
      {children}
    </RNText>
  );
});

export default VText;

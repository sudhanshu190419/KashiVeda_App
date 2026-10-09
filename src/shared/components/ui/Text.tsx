// src/shared/components/ui/Text.tsx
import React from "react";
import { StyleSheet, Text as RNText, TextProps as RNTextProps, TextStyle } from "react-native";
import { colors } from "../../theme/colors.ts";
import { typography } from "../../theme/typography.ts";

export type TextVariant =
  | "hero"
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "body"
  | "bodyMedium"
  | "bodyBold"
  | "caption"
  | "captionMedium"
  | "overline";

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle["textAlign"];
  children: React.ReactNode;
}

export const Text: React.FC<TextProps> = ({
  variant = "body",
  color,
  align = "left",
  style,
  children,
  ...props
}) => {
  const variantStyle = styles[variant] || styles.body;
  const customColorStyle = color ? { color } : {};
  const alignStyle = { textAlign: align };

  return (
    <RNText
      style={[styles.base, variantStyle, customColorStyle, alignStyle, style]}
      {...props}
    >
      {children}
    </RNText>
  );
};

const styles = StyleSheet.create({
  base: {
    color: colors.textPrimary,
  },
  hero: {
    fontSize: typography.fontSize.hero,
    lineHeight: typography.lineHeight.hero,
    fontWeight: typography.fontWeight.bold,
  },
  display: {
    fontSize: typography.fontSize.display,
    lineHeight: typography.lineHeight.display,
    fontWeight: typography.fontWeight.bold,
  },
  h1: {
    fontSize: typography.fontSize.xxl,
    lineHeight: typography.lineHeight.xxl,
    fontWeight: typography.fontWeight.bold,
  },
  h2: {
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    fontWeight: typography.fontWeight.bold,
  },
  h3: {
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  body: {
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    fontWeight: typography.fontWeight.regular,
  },
  bodyMedium: {
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    fontWeight: typography.fontWeight.medium,
  },
  bodyBold: {
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    fontWeight: typography.fontWeight.bold,
  },
  caption: {
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    fontWeight: typography.fontWeight.regular,
    color: colors.textSecondary,
  },
  captionMedium: {
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
  },
  overline: {
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    fontWeight: typography.fontWeight.bold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.textTertiary,
  },
});

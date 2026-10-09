// src/shared/components/ui/Button.tsx
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from "react-native";
import { colors } from "../../theme/colors.ts";
import { radius } from "../../theme/radius.ts";
import { spacing } from "../../theme/spacing.ts";
import { typography } from "../../theme/typography.ts";
import { Text } from "./Text.tsx";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  style,
  onPress,
  ...props
}) => {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[
        styles.base,
        styles[variant],
        sizeStyles[size],
        isDisabled && styles.disabled,
        style,
      ]}
      disabled={isDisabled}
      onPress={onPress}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "outline" || variant === "ghost" ? colors.primary : colors.textInverse}
        />
      ) : (
        <Text
          variant="bodyBold"
          style={[styles.textBase, textStyles[variant], sizeTextStyles[size]]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.secondary,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  danger: {
    backgroundColor: colors.error,
  },
  disabled: {
    opacity: 0.5,
  },
  textBase: {
    textAlign: "center",
  },
});

const sizeStyles = StyleSheet.create({
  sm: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  md: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  lg: {
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xxl,
  },
});

const textStyles = StyleSheet.create({
  primary: {
    color: colors.textInverse,
  },
  secondary: {
    color: colors.textInverse,
  },
  outline: {
    color: colors.primary,
  },
  ghost: {
    color: colors.primary,
  },
  danger: {
    color: colors.textInverse,
  },
});

const sizeTextStyles = StyleSheet.create({
  sm: {
    fontSize: typography.fontSize.sm,
  },
  md: {
    fontSize: typography.fontSize.md,
  },
  lg: {
    fontSize: typography.fontSize.lg,
  },
});

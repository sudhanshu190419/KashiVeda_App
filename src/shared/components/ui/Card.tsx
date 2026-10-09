// src/shared/components/ui/Card.tsx
import React from "react";
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewProps, ViewStyle } from "react-native";
import { colors } from "../../theme/colors.ts";
import { radius } from "../../theme/radius.ts";
import { shadows } from "../../theme/shadows.ts";
import { spacing } from "../../theme/spacing.ts";

export interface CardProps extends ViewProps {
  onPress?: () => void;
  variant?: "default" | "elevated" | "outlined" | "subtle";
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  onPress,
  variant = "default",
  style,
  children,
  ...props
}) => {
  const cardStyle = [styles.base, styles[variant], style];

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={cardStyle}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={cardStyle} {...props}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  default: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  elevated: {
    ...shadows.md,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  subtle: {
    backgroundColor: colors.surfaceSubtle,
  },
});

// src/shared/components/ui/Input.tsx
import React, { useState } from "react";
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { colors } from "../../theme/colors.ts";
import { radius } from "../../theme/radius.ts";
import { spacing } from "../../theme/spacing.ts";
import { typography } from "../../theme/typography.ts";
import { Text } from "./Text.tsx";

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  helperText?: string;
  containerStyle?: ViewStyle;
  rightElement?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  containerStyle,
  rightElement,
  style,
  onFocus,
  onBlur,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text variant="captionMedium" style={styles.label}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.inputFocused,
          error ? styles.inputError : null,
        ]}
      >
        <TextInput
          style={[
            styles.input,
            rightElement ? styles.inputWithRight : null,
            style,
          ]}
          placeholderTextColor={colors.textTertiary}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {rightElement ? <View style={styles.rightElement}>{rightElement}</View> : null}
      </View>
      {error ? (
        <Text variant="caption" color={colors.error} style={styles.feedback}>
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="caption" style={styles.feedback}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
    color: colors.textSecondary,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
  },
  inputWithRight: {
    paddingRight: spacing.sm,
  },
  rightElement: {
    paddingRight: spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  inputError: {
    borderColor: colors.error,
    borderWidth: 1.5,
  },
  feedback: {
    marginTop: spacing.xs,
  },
});

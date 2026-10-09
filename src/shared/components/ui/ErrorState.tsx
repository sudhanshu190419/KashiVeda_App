// src/shared/components/ui/ErrorState.tsx
import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { colors } from "../../theme/colors.ts";
import { spacing } from "../../theme/spacing.ts";
import { Button } from "./Button.tsx";
import { Text } from "./Text.tsx";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please check your connection and try again.",
  onRetry,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <Text variant="display" color={colors.error} style={styles.icon}>
        ⚠
      </Text>
      <Text variant="h2" align="center" style={styles.title}>
        {title}
      </Text>
      <Text
        variant="body"
        color={colors.textSecondary}
        align="center"
        style={styles.message}
      >
        {message}
      </Text>
      {onRetry ? (
        <Button
          title="Try Again"
          onPress={onRetry}
          variant="outline"
          style={styles.button}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    flex: 1,
  },
  icon: {
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.xs,
  },
  message: {
    marginBottom: spacing.lg,
  },
  button: {
    minWidth: 140,
  },
});

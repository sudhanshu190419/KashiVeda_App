// src/shared/components/ui/LoadingState.tsx
import React from "react";
import { ActivityIndicator, StyleSheet, View, ViewStyle } from "react-native";
import { colors } from "../../theme/colors.ts";
import { spacing } from "../../theme/spacing.ts";
import { Text } from "./Text.tsx";

export interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
  style?: ViewStyle;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = "Loading...",
  fullScreen = true,
  style,
}) => {
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen, style]}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? (
        <Text variant="bodyMedium" style={styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  message: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    textAlign: "center",
  },
});

// src/shared/components/ui/EmptyState.tsx
import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { colors } from "../../theme/colors.ts";
import { spacing } from "../../theme/spacing.ts";
import { Button } from "./Button.tsx";
import { Text } from "./Text.tsx";

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionTitle?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionTitle,
  onAction,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <Text variant="display" color={colors.secondary} style={styles.icon}>
        ☸
      </Text>
      <Text variant="h2" align="center" style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text
          variant="body"
          color={colors.textSecondary}
          align="center"
          style={styles.description}
        >
          {description}
        </Text>
      ) : null}
      {actionTitle && onAction ? (
        <Button
          title={actionTitle}
          onPress={onAction}
          variant="primary"
          style={styles.action}
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
  description: {
    marginBottom: spacing.lg,
  },
  action: {
    minWidth: 160,
  },
});

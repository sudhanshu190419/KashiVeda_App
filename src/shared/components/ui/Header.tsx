// src/shared/components/ui/Header.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View, ViewStyle } from "react-native";
import { colors } from "../../theme/colors.ts";
import { spacing } from "../../theme/spacing.ts";
import { Text } from "./Text.tsx";

export interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onBack,
  rightAction,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.leftContainer}>
        {onBack ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onBack}
            style={styles.backButton}
          >
            <Text variant="bodyBold" color={colors.primary}>
              ←
            </Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.titleContainer}>
          <Text variant="h2" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {rightAction ? <View style={styles.rightContainer}>{rightAction}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
  },
  leftContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  backButton: {
    paddingRight: spacing.md,
    paddingVertical: spacing.xs,
  },
  titleContainer: {
    flex: 1,
  },
  rightContainer: {
    marginLeft: spacing.md,
  },
});

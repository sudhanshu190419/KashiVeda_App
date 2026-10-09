// src/features/discovery/components/CategoryCard.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, spacing } from "../../../shared/theme/index.ts";
import { PujaCategory } from "../types/discovery.ts";

interface CategoryCardProps {
  category: PujaCategory;
  onPress: () => void;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({ category, onPress }) => {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconBadge}>
            <Text variant="body" color={colors.primary}>
              🕉️
            </Text>
          </View>
          <View style={styles.textContainer}>
            <Text variant="h3">{category.name}</Text>
            {category.description ? (
              <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
                {category.description}
              </Text>
            ) : null}
          </View>
          <Text variant="body" color={colors.textTertiary}>
            ›
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
});

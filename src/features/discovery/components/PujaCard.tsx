// src/features/discovery/components/PujaCard.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { PujaService } from "../types/discovery.ts";

interface PujaCardProps {
  puja: PujaService;
  onPress: () => void;
}

export const PujaCard: React.FC<PujaCardProps> = ({ puja, onPress }) => {
  const allowedModesText = (puja.allowed_modes || [])
    .map((m) => (m === "home" ? "Home" : m === "temple" ? "Temple" : "Remote"))
    .join(" • ");

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <Card style={styles.card}>
        <View style={styles.topRow}>
          {puja.category?.name ? (
            <View style={styles.categoryBadge}>
              <Text variant="captionMedium" color={colors.primary}>
                {puja.category.name}
              </Text>
            </View>
          ) : null}
          {puja.default_duration_minutes ? (
            <Text variant="caption" color={colors.textSecondary}>
              ⏱ {puja.default_duration_minutes} mins
            </Text>
          ) : null}
        </View>

        <Text variant="h3" style={styles.title}>
          {puja.name}
        </Text>

        {puja.description ? (
          <Text variant="body" color={colors.textSecondary} numberOfLines={2} style={styles.description}>
            {puja.description}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.modesContainer}>
            <Text variant="caption" color={colors.textTertiary}>
              Modes: {allowedModesText || "Vedic Ritual"}
            </Text>
          </View>
          {puja.starting_price != null ? (
            <Text variant="bodyMedium" color={colors.primary}>
              From {formatCurrency(puja.starting_price)}
            </Text>
          ) : null}
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  categoryBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  title: {
    marginBottom: spacing.xxs,
  },
  description: {
    marginBottom: spacing.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xs,
    marginTop: spacing.xxs,
  },
  modesContainer: {
    flex: 1,
  },
});

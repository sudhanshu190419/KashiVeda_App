// src/features/kundli/components/KundliPanditCard.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, typography } from "../../../shared/theme/index.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { KundliPandit } from "../types/kundli.types.ts";

interface KundliPanditCardProps {
  pandit: KundliPandit;
  onSelect?: (pandit: KundliPandit) => void;
  isSelected?: boolean;
}

export const KundliPanditCard: React.FC<KundliPanditCardProps> = ({
  pandit,
  onSelect,
  isSelected = false,
}) => {
  const turnaroundText = pandit.kundli_turnaround_days
    ? `${pandit.kundli_turnaround_days} days delivery`
    : "Standard delivery";

  const languagesText =
    pandit.languages && pandit.languages.length > 0
      ? pandit.languages.join(", ")
      : "Hindi, Sanskrit";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onSelect?.(pandit)}
      disabled={!onSelect}
      accessibilityRole="button"
      accessibilityLabel={`Select Pandit ${pandit.display_name} for Kundli preparation`}
    >
      <Card
        style={[
          styles.card,
          isSelected && styles.cardSelected,
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {pandit.display_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.infoCol}>
            <Text variant="h3" style={styles.name}>
              {pandit.display_name}
            </Text>
            {pandit.experience_years !== null && pandit.experience_years !== undefined && (
              <Text variant="caption" color={colors.textSecondary}>
                📜 {pandit.experience_years} years Vedic experience
              </Text>
            )}
            <Text variant="caption" color={colors.textTertiary} numberOfLines={1}>
              🗣️ {languagesText}
            </Text>
          </View>
        </View>

        {pandit.bio ? (
          <Text variant="body" color={colors.textSecondary} numberOfLines={2} style={styles.bio}>
            {pandit.bio}
          </Text>
        ) : null}

        <View style={styles.footerRow}>
          <View style={styles.turnaroundBadge}>
            <Text style={styles.turnaroundText}>⏱️ {turnaroundText}</Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>Full Kundli</Text>
            <Text style={styles.priceValue}>{formatCurrency(pandit.kundli_price)}</Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    borderColor: colors.borderLight,
    borderWidth: 1,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primaryLight,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
  infoCol: {
    flex: 1,
  },
  name: {
    color: colors.textPrimary,
    marginBottom: 2,
  },
  bio: {
    marginVertical: spacing.xs,
    fontSize: typography.fontSize.sm,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  turnaroundBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  turnaroundText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  priceContainer: {
    alignItems: "flex-end",
  },
  priceLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  priceValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
});

// src/features/astrology/components/AstrologyPlanCard.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, spacing, radius } from "../../../shared/theme/index.ts";
import { AstrologySubscriptionPlan } from "../types/astrology.types.ts";

interface AstrologyPlanCardProps {
  plan: AstrologySubscriptionPlan;
  onSelect?: (plan: AstrologySubscriptionPlan) => void;
  isPopular?: boolean;
}

export const AstrologyPlanCard: React.FC<AstrologyPlanCardProps> = ({
  plan,
  onSelect,
  isPopular = false,
}) => {
  const formattedPrice = `₹${plan.price.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return (
    <Card
      variant={isPopular ? "elevated" : "outlined"}
      style={[styles.card, isPopular && styles.popularCard]}
    >
      {isPopular && (
        <View style={styles.badgeContainer}>
          <Text variant="captionMedium" color={colors.textInverse} style={styles.badgeText}>
            Recommended
          </Text>
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.titleContainer}>
            <Text variant="h3" style={styles.planName}>
              {plan.name}
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              {plan.duration_days} Days Term
            </Text>
          </View>
          <View style={styles.priceContainer}>
            <Text variant="h2" color={colors.primary}>
              {formattedPrice}
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              {plan.currency}
            </Text>
          </View>
        </View>

        {/* Feature Channels */}
        <View style={styles.featuresList}>
          {plan.daily_in_app_enabled && (
            <View style={styles.featureItem}>
              <Text variant="caption" color={colors.success} style={styles.featureBullet}>
                ✓
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                Daily Vedic Insights in App
              </Text>
            </View>
          )}

          {plan.weekly_whatsapp_enabled && (
            <View style={styles.featureItem}>
              <Text variant="caption" color={colors.secondary} style={styles.featureBullet}>
                ✓
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                Weekly Guidance via WhatsApp (Planned)
              </Text>
            </View>
          )}
        </View>

        {onSelect && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onSelect(plan)}
            accessibilityRole="button"
            accessibilityLabel={`View details for ${plan.name}`}
          >
            <Text variant="captionMedium" color={colors.primary}>
              View Plan Details →
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: spacing.xs,
    padding: spacing.md,
    position: "relative",
  },
  popularCard: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  badgeContainer: {
    position: "absolute",
    top: -1,
    right: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderBottomLeftRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  content: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  titleContainer: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  planName: {
    color: colors.textPrimary,
  },
  priceContainer: {
    alignItems: "flex-end",
  },
  featuresList: {
    marginTop: spacing.xs,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xs,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  featureBullet: {
    fontWeight: "bold",
    fontSize: 13,
  },
  actionButton: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
});

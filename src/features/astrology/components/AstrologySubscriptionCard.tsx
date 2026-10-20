// src/features/astrology/components/AstrologySubscriptionCard.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, spacing, radius } from "../../../shared/theme/index.ts";
import { AstrologySubscription } from "../types/astrology.types.ts";

interface AstrologySubscriptionCardProps {
  subscription: AstrologySubscription;
  onPressDetails?: () => void;
}

export const AstrologySubscriptionCard: React.FC<AstrologySubscriptionCardProps> = ({
  subscription,
}) => {
  const now = Date.now();
  const startMs = subscription.starts_at ? new Date(subscription.starts_at).getTime() : NaN;
  const endMs = subscription.ends_at ? new Date(subscription.ends_at).getTime() : NaN;

  const isFutureStart =
    subscription.status === "active" &&
    !isNaN(startMs) &&
    startMs > now;

  const isCurrentlyActive =
    subscription.status === "active" &&
    !isNaN(startMs) &&
    !isNaN(endMs) &&
    startMs <= now &&
    endMs > now;

  const isExpired =
    subscription.status === "expired" ||
    (subscription.status === "active" && !isNaN(endMs) && endMs <= now);

  const startDateFormatted = subscription.starts_at
    ? new Date(subscription.starts_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Pending Activation";

  const endDateFormatted = subscription.ends_at
    ? new Date(subscription.ends_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Pending Activation";

  const remainingDays = isCurrentlyActive && subscription.ends_at
    ? Math.max(
        0,
        Math.ceil(
          (endMs - now) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const daysUntilStart = isFutureStart && subscription.starts_at
    ? Math.max(
        0,
        Math.ceil(
          (startMs - now) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const getStatusBadge = () => {
    if (isCurrentlyActive) {
      return {
        label: "Active",
        bg: colors.successLight,
        text: colors.success,
      };
    }
    if (isFutureStart) {
      return {
        label: "Scheduled",
        bg: colors.surfaceSubtle,
        text: colors.primary,
      };
    }
    if (subscription.status === "payment_pending") {
      return {
        label: "Pending Activation",
        bg: colors.warningLight,
        text: colors.warning,
      };
    }
    if (isExpired) {
      return {
        label: "Expired",
        bg: colors.surfaceSubtle,
        text: colors.textSecondary,
      };
    }
    if (subscription.status === "cancelled") {
      return {
        label: "Cancelled",
        bg: colors.errorLight,
        text: colors.error,
      };
    }
    return {
      label: subscription.status,
      bg: colors.surfaceSubtle,
      text: colors.textSecondary,
    };
  };

  const badge = getStatusBadge();

  return (
    <Card variant="elevated" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.planInfo}>
          <Text variant="caption" color={colors.primaryDark}>
            Vedic Astrology Subscription
          </Text>
          <Text variant="h3" style={styles.planName}>
            {subscription.plan?.name || "Astrology Membership"}
          </Text>
        </View>

        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text variant="captionMedium" style={{ color: badge.text }}>
            {badge.label}
          </Text>
        </View>
      </View>

      <View style={styles.detailsGrid}>
        <View style={styles.detailCol}>
          <Text variant="caption" color={colors.textTertiary}>
            {isFutureStart ? "Starts On" : "Valid From"}
          </Text>
          <Text variant="captionMedium" style={styles.detailValue}>
            {startDateFormatted}
          </Text>
        </View>

        <View style={styles.detailCol}>
          <Text variant="caption" color={colors.textTertiary}>
            Valid Till
          </Text>
          <Text variant="captionMedium" style={styles.detailValue}>
            {endDateFormatted}
          </Text>
        </View>

        {isCurrentlyActive && (
          <View style={styles.detailCol}>
            <Text variant="caption" color={colors.textTertiary}>
              Remaining
            </Text>
            <Text variant="captionMedium" color={colors.primary} style={styles.remainingValue}>
              {remainingDays} {remainingDays === 1 ? "day" : "days"}
            </Text>
          </View>
        )}

        {isFutureStart && (
          <View style={styles.detailCol}>
            <Text variant="caption" color={colors.textTertiary}>
              Starts In
            </Text>
            <Text variant="captionMedium" color={colors.primary} style={styles.remainingValue}>
              {daysUntilStart} {daysUntilStart === 1 ? "day" : "days"}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    marginVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderColor: colors.primarySubtle,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    marginTop: 2,
    color: colors.textPrimary,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  detailsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  detailCol: {
    flex: 1,
  },
  detailValue: {
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: 2,
  },
  remainingValue: {
    fontWeight: "700",
    marginTop: 2,
  },
});

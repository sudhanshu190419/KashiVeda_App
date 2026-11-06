// src/features/discovery/components/ReviewCard.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatDate } from "../../../shared/utils/formatters.ts";
import { Review } from "../types/discovery.ts";

interface ReviewCardProps {
  review: Review;
}

export const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
  const stars = "★".repeat(Math.max(1, Math.min(5, review.rating))) + "☆".repeat(Math.max(0, 5 - review.rating));

  const formatLabel =
    review.service_mode === "home"
      ? "Home"
      : review.service_mode === "temple"
      ? "Temple"
      : review.service_mode === "remote"
      ? "Online"
      : null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.reviewerMeta}>
          <Text variant="captionMedium" color={colors.secondary} style={styles.stars}>
            {stars}
          </Text>
          <View style={styles.verifiedBadge}>
            <Text variant="overline" color={colors.success}>
              ✓ Verified Puja
            </Text>
          </View>
        </View>
        <Text variant="caption" color={colors.textTertiary}>
          {formatDate(review.created_at)}
        </Text>
      </View>

      <View style={styles.detailsRow}>
        {formatLabel && (
          <View style={styles.formatPill}>
            <Text variant="overline" color={colors.primary}>
              {formatLabel}
            </Text>
          </View>
        )}
        {review.puja_name && (
          <Text variant="caption" color={colors.textSecondary} numberOfLines={1} style={styles.pujaName}>
            {review.puja_name}
          </Text>
        )}
      </View>

      {review.comment ? (
        <Text variant="body" color={colors.textSecondary} style={styles.comment}>
          "{review.comment}"
        </Text>
      ) : (
        <Text variant="caption" color={colors.textTertiary} style={styles.comment}>
          Verified Devotee Rating
        </Text>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xxs,
  },
  reviewerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  stars: {
    letterSpacing: 2,
    fontSize: 14,
  },
  verifiedBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  formatPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  pujaName: {
    flex: 1,
  },
  comment: {
    fontStyle: "italic",
    lineHeight: 20,
  },
});


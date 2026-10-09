// src/features/discovery/components/ReviewCard.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, spacing } from "../../../shared/theme/index.ts";
import { formatDate } from "../../../shared/utils/formatters.ts";
import { Review } from "../types/discovery.ts";

interface ReviewCardProps {
  review: Review;
}

export const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
  const stars = "★".repeat(Math.max(1, Math.min(5, review.rating))) + "☆".repeat(Math.max(0, 5 - review.rating));

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="captionMedium" color={colors.secondary} style={styles.stars}>
          {stars}
        </Text>
        <Text variant="caption" color={colors.textTertiary}>
          {formatDate(review.created_at)}
        </Text>
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
  stars: {
    letterSpacing: 2,
    fontSize: 14,
  },
  comment: {
    marginTop: spacing.xxs,
    fontStyle: "italic",
  },
});

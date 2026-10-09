// src/features/discovery/components/PanditCard.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { PanditSummary } from "../types/discovery.ts";

interface PanditCardProps {
  pandit: PanditSummary;
  onPress: () => void;
}

export const PanditCard: React.FC<PanditCardProps> = ({ pandit, onPress }) => {
  const ratingText = pandit.rating_avg
    ? `★ ${Number(pandit.rating_avg).toFixed(1)} (${pandit.rating_count || 0})`
    : "★ New Acharya";

  const languagesText = (pandit.languages || []).join(", ");
  const offeringsCount = pandit.offering_names?.length || 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text variant="h2" color={colors.primary}>
              🕉️
            </Text>
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.nameRow}>
              <Text variant="h3">{pandit.display_name || "Vedic Acharya"}</Text>
              <View style={styles.verifiedBadge}>
                <Text variant="overline" color={colors.success}>
                  ✓ Verified
                </Text>
              </View>
            </View>
            <View style={styles.ratingRow}>
              <Text variant="captionMedium" color={colors.secondary}>
                {ratingText}
              </Text>
              {pandit.years_experience != null ? (
                <Text variant="caption" color={colors.textSecondary}>
                  {" • "}{pandit.years_experience} yrs exp
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {pandit.bio ? (
          <Text variant="body" color={colors.textSecondary} numberOfLines={2} style={styles.bio}>
            {pandit.bio}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.detailsCol}>
            {languagesText ? (
              <Text variant="caption" color={colors.textTertiary}>
                🗣️ {languagesText}
              </Text>
            ) : null}
            {offeringsCount > 0 ? (
              <Text variant="caption" color={colors.textTertiary}>
                🪔 {offeringsCount} Ritual offerings
              </Text>
            ) : null}
          </View>

          {pandit.puja_price != null ? (
            <View style={styles.priceContainer}>
              <Text variant="overline" color={colors.textSecondary}>
                Dakshina
              </Text>
              <Text variant="bodyMedium" color={colors.primary}>
                {formatCurrency(pandit.puja_price)}
              </Text>
            </View>
          ) : pandit.kundli_enabled && pandit.kundli_price != null ? (
            <View style={styles.priceContainer}>
              <Text variant="overline" color={colors.textSecondary}>
                Kundli
              </Text>
              <Text variant="bodyMedium" color={colors.primary}>
                {formatCurrency(pandit.kundli_price)}
              </Text>
            </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  verifiedBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xxs,
  },
  bio: {
    marginVertical: spacing.xs,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
  },
  detailsCol: {
    flex: 1,
  },
  priceContainer: {
    alignItems: "flex-end",
  },
});

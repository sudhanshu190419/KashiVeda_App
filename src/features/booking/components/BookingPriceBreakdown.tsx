// src/features/booking/components/BookingPriceBreakdown.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { ServiceMode } from "../../discovery/types/discovery.ts";

interface BookingPriceBreakdownProps {
  pujaPrice: number;
  samagriTotal: number;
  prasadTotal: number;
  totalAmount: number;
  advanceAmount: number;
  balanceAmount: number;
  serviceMode: ServiceMode;
  isAuthoritative?: boolean;
}

export const BookingPriceBreakdown: React.FC<BookingPriceBreakdownProps> = ({
  pujaPrice,
  samagriTotal,
  prasadTotal,
  totalAmount,
  advanceAmount,
  balanceAmount,
  serviceMode,
  isAuthoritative = false,
}) => {
  const advancePercentLabel =
    serviceMode === "home"
      ? "10% of Ritual + 100% Add-ons"
      : serviceMode === "remote"
      ? "50% of Ritual + 100% Add-ons"
      : "Temple Policy";

  return (
    <Card variant="elevated" style={styles.card}>
      <View style={styles.headerRow}>
        <Text variant="h3">Dakshina & Price Breakdown</Text>
        {isAuthoritative ? (
          <View style={styles.authoritativeBadge}>
            <Text variant="captionMedium" color="#15803D">
              ✓ Server Verified
            </Text>
          </View>
        ) : (
          <View style={styles.estimatedBadge}>
            <Text variant="caption" color={colors.textTertiary}>
              Catalog Estimate
            </Text>
          </View>
        )}
      </View>

      <View style={styles.rowsContainer}>
        <View style={styles.row}>
          <Text variant="body" color={colors.textSecondary}>
            Puja Ritual Dakshina
          </Text>
          <Text variant="bodyMedium">{formatCurrency(pujaPrice)}</Text>
        </View>

        {samagriTotal > 0 && (
          <View style={styles.row}>
            <Text variant="body" color={colors.textSecondary}>
              Sacred Samagri (100% upfront)
            </Text>
            <Text variant="bodyMedium">{formatCurrency(samagriTotal)}</Text>
          </View>
        )}

        {prasadTotal > 0 && (
          <View style={styles.row}>
            <Text variant="body" color={colors.textSecondary}>
              Blessed Prasad (100% upfront)
            </Text>
            <Text variant="bodyMedium">{formatCurrency(prasadTotal)}</Text>
          </View>
        )}

        <View style={[styles.row, styles.totalRow]}>
          <Text variant="bodyMedium">Total Ritual Amount</Text>
          <Text variant="h3" color={colors.textPrimary}>
            {formatCurrency(totalAmount)}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={[styles.row, styles.advanceRow]}>
          <View>
            <Text variant="bodyMedium" color={colors.primary}>
              Advance Required Today
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              ({advancePercentLabel})
            </Text>
          </View>
          <Text variant="h2" color={colors.primary}>
            {formatCurrency(advanceAmount)}
          </Text>
        </View>

        {balanceAmount > 0 && (
          <View style={styles.balanceBox}>
            <Text variant="caption" color={colors.textSecondary}>
              Remaining balance of {formatCurrency(balanceAmount)} will be paid separately online before or on ritual day.
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: spacing.sm,
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  authoritativeBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  estimatedBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  rowsContainer: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  totalRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xs,
  },
  advanceRow: {
    backgroundColor: "#FFF8F6",
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  balanceBox: {
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
});

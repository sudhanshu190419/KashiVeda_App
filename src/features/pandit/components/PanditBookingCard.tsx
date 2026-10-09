// src/features/pandit/components/PanditBookingCard.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatCurrency, formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { BookingStatusBadge } from "../../booking/components/BookingStatusBadge.tsx";
import { PanditBookingItem, PanditPayoutStatus } from "../types/pandit.types.ts";

interface PanditBookingCardProps {
  booking: PanditBookingItem;
  onPress: () => void;
  onCompletePress?: () => void;
}

const payoutStatusConfig: Record<
  PanditPayoutStatus,
  { label: string; bg: string; text: string; icon: string }
> = {
  pending: {
    label: "Awaiting Payout",
    bg: "#fef3c7",
    text: "#92400e",
    icon: "⏳",
  },
  approved: {
    label: "Payout Approved",
    bg: "#e0f2fe",
    text: "#0369a1",
    icon: "📋",
  },
  processing: {
    label: "Transfer Processing",
    bg: "#f3e8ff",
    text: "#6b21a8",
    icon: "🔄",
  },
  paid: {
    label: "Paid",
    bg: "#dcfce7",
    text: "#15803d",
    icon: "✓",
  },
  failed: {
    label: "Payout Failed",
    bg: "#fee2e2",
    text: "#b91c1c",
    icon: "⚠️",
  },
  cancelled: {
    label: "Payout Cancelled",
    bg: "#f1f5f9",
    text: "#475569",
    icon: "✕",
  },
};

export const PanditBookingCard: React.FC<PanditBookingCardProps> = ({
  booking,
  onPress,
}) => {
  const startDate = new Date(booking.scheduled_start_at);
  const isRemote = booking.service_mode === "remote";
  const isCompleted = booking.status === "completed";
  const completedDate = booking.completed_at ? new Date(booking.completed_at) : startDate;

  const payoutStatusInfo = booking.payout
    ? payoutStatusConfig[booking.payout.status] || {
        label: booking.payout.status,
        bg: colors.borderLight,
        text: colors.textSecondary,
        icon: "•",
      }
    : null;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.touchable}>
      <Card variant="elevated" style={styles.card}>
        {/* Header: Ceremony Name & Status */}
        <View style={styles.headerRow}>
          <View style={styles.titleWrap}>
            <Text variant="bodyMedium" style={styles.ceremonyTitle}>
              {booking.puja_service?.name || "Sacred Vedic Ritual"}
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              Ref: {booking.booking_number}
            </Text>
          </View>
          <BookingStatusBadge status={booking.status} />
        </View>

        {/* Devotee info */}
        <View style={styles.devoteeRow}>
          <Text style={styles.devoteeIcon}>👤</Text>
          <Text variant="body" color={colors.textPrimary} style={styles.devoteeName}>
            {`Devotee: ${booking.customer?.display_name || "Blessed Devotee"}`}
          </Text>
          <View style={styles.modeBadge}>
            <Text variant="caption" color={colors.primary} style={styles.modeText}>
              {booking.service_mode}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Completed Service View vs Upcoming/Active View */}
        {isCompleted ? (
          <View>
            <View style={styles.footerRow}>
              <View>
                <Text variant="caption" color={colors.textSecondary}>
                  Service Completed
                </Text>
                <Text variant="bodyMedium" color={colors.textPrimary}>
                  {formatDate(completedDate)}
                </Text>
              </View>

              <View style={styles.priceCol}>
                <Text variant="caption" color={colors.primary} align="right">
                  Your Net Dakshina
                </Text>
                {booking.payout ? (
                  <Text variant="bodyBold" color={colors.primary} align="right">
                    {formatCurrency(booking.payout.net_amount)}
                  </Text>
                ) : (
                  <Text variant="captionMedium" color="#b45309" align="right">
                    Settlement Pending
                  </Text>
                )}
              </View>
            </View>

            {/* Payout Status Pill for Completed Service */}
            <View style={styles.payoutStatusRow}>
              {payoutStatusInfo ? (
                <View style={[styles.payoutBadge, { backgroundColor: payoutStatusInfo.bg }]}>
                  <Text
                    variant="caption"
                    style={[styles.payoutBadgeText, { color: payoutStatusInfo.text }]}
                  >
                    {payoutStatusInfo.icon} {payoutStatusInfo.label}
                  </Text>
                </View>
              ) : (
                <View style={[styles.payoutBadge, styles.payoutBadgePending]}>
                  <Text variant="caption" style={[styles.payoutBadgeText, styles.payoutBadgeTextPending]}>
                    ⏳ Settlement Pending
                  </Text>
                </View>
              )}

              {booking.payout?.released_at || booking.payout?.confirmed_at ? (
                <Text variant="caption" color={colors.textSecondary}>
                  Disbursed: {formatDate(new Date(booking.payout.confirmed_at || booking.payout.released_at!))}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          /* Upcoming / Active Booking View */
          <View style={styles.footerRow}>
            <View>
              <Text variant="caption" color={colors.textSecondary}>
                Scheduled Muhurat
              </Text>
              <Text variant="bodyMedium" color={colors.textPrimary}>
                {formatDate(startDate)} • {formatTime(startDate)}
              </Text>
            </View>

            <View style={styles.priceCol}>
              <Text variant="caption" color={colors.textSecondary} align="right">
                Ritual Value
              </Text>
              <Text variant="bodyMedium" color={colors.primary} align="right">
                {formatCurrency(booking.total_amount)}
              </Text>
            </View>
          </View>
        )}

        {/* Remote Live Indicator */}
        {isRemote && booking.status === "confirmed" ? (
          <View style={styles.liveBanner}>
            <Text style={styles.liveDot}>🔴</Text>
            <Text variant="captionMedium" color={colors.secondaryDark}>
              LiveKit Video Sanctum Enabled
            </Text>
          </View>
        ) : null}
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    marginBottom: spacing.sm,
  },
  card: {
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  titleWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  ceremonyTitle: {
    fontSize: 15,
  },
  devoteeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.xxs,
  },
  devoteeIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  devoteeName: {
    flex: 1,
    fontSize: 13,
  },
  modeBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  modeText: {
    textTransform: "capitalize",
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xs,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceCol: {
    alignItems: "flex-end",
  },
  payoutStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  payoutBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.xs,
    alignSelf: "flex-start",
  },
  payoutBadgeText: {
    fontWeight: "700",
    fontSize: 11,
  },
  payoutBadgePending: {
    backgroundColor: "#fef3c7",
  },
  payoutBadgeTextPending: {
    color: "#92400e",
  },
  liveBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: radius.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  liveDot: {
    fontSize: 10,
  },
});


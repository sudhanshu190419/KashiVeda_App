// src/features/kundli/components/KundliOrderCard.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, typography } from "../../../shared/theme/index.ts";
import { formatCurrency, formatDate } from "../../../shared/utils/formatters.ts";
import { KundliOrder, KundliOrderStatus } from "../types/kundli.types.ts";

interface KundliOrderCardProps {
  order: KundliOrder;
  onPress: (order: KundliOrder) => void;
  viewerRole?: "customer" | "pandit";
}

export function getKundliStatusMeta(status: KundliOrderStatus): {
  label: string;
  badgeBg: string;
  badgeText: string;
} {
  switch (status) {
    case "draft":
      return { label: "Draft", badgeBg: "#E0E0E0", badgeText: "#616161" };
    case "payment_pending":
      return { label: "Payment Pending", badgeBg: "#FFF3E0", badgeText: "#E65100" };
    case "paid":
      return { label: "Paid & Assigned", badgeBg: "#E3F2FD", badgeText: "#1565C0" };
    case "in_progress":
      return { label: "Preparing Kundli", badgeBg: "#EDE7F6", badgeText: "#5E35B1" };
    case "document_uploaded":
      return { label: "Document Ready", badgeBg: "#E8F5E9", badgeText: "#2E7D32" };
    case "customer_confirmed":
      return { label: "Confirmed", badgeBg: "#E8F5E9", badgeText: "#1B5E20" };
    case "completed":
      return { label: "Completed", badgeBg: "#E8F8F5", badgeText: "#0E6655" };
    case "cancelled":
      return { label: "Cancelled", badgeBg: "#FFEBEE", badgeText: "#C62828" };
    case "disputed":
      return { label: "Disputed", badgeBg: "#FBE9E7", badgeText: "#D84315" };
    default:
      return { label: status, badgeBg: "#EEEEEE", badgeText: "#424242" };
  }
}

export const KundliOrderCard: React.FC<KundliOrderCardProps> = ({
  order,
  onPress,
  viewerRole = "customer",
}) => {
  const statusMeta = getKundliStatusMeta(order.status);
  const isPanditView = viewerRole === "pandit";
  const partnerName = isPanditView
    ? order.customer?.display_name || "Customer"
    : order.pandit?.display_name || "Vedic Astrologer";

  const hasDocument = Boolean(order.current_document || (order.documents && order.documents.length > 0));

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(order)}
      accessibilityRole="button"
      accessibilityLabel={`Kundli order ${order.order_number || order.id.slice(0, 8)}, status ${statusMeta.label}`}
    >
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.orderNumberContainer}>
            <Text style={styles.orderLabel}>Order</Text>
            <Text style={styles.orderNumber}>
              #{order.order_number || order.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusMeta.badgeBg }]}>
            <Text style={[styles.statusBadgeText, { color: statusMeta.badgeText }]}>
              {statusMeta.label}
            </Text>
          </View>
        </View>

        <View style={styles.detailsCol}>
          <View style={styles.metaRow}>
            <Text variant="caption" color={colors.textSecondary}>
              {isPanditView ? "👤 Devotee: " : "🪔 Astrologer: "}
            </Text>
            <Text variant="body" style={styles.partnerName}>
              {partnerName}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Text variant="caption" color={colors.textSecondary}>
              📅 Birth Date:{" "}
            </Text>
            <Text variant="caption" color={colors.textPrimary}>
              {formatDate(order.date_of_birth)} at {order.time_of_birth}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Text variant="caption" color={colors.textSecondary}>
              📍 Birth Place:{" "}
            </Text>
            <Text variant="caption" color={colors.textPrimary} numberOfLines={1}>
              {order.place_of_birth}
            </Text>
          </View>
        </View>

        <View style={styles.footerRow}>
          <View style={styles.docIndicator}>
            {hasDocument ? (
              <Text style={styles.docReadyText}>📄 PDF Available</Text>
            ) : (
              <Text style={styles.docPendingText}>⏳ Preparation Pending</Text>
            )}
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.orderPrice}>{formatCurrency(order.price)}</Text>
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  orderNumberContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  orderLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginRight: spacing.xs,
  },
  orderNumber: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  detailsCol: {
    marginVertical: spacing.xs,
    gap: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  partnerName: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  docIndicator: {
    flex: 1,
  },
  docReadyText: {
    fontSize: typography.fontSize.xs,
    color: "#2E7D32",
    fontWeight: typography.fontWeight.medium,
  },
  docPendingText: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  priceContainer: {
    alignItems: "flex-end",
  },
  orderPrice: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
});

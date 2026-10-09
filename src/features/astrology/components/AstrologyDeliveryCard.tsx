// src/features/astrology/components/AstrologyDeliveryCard.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, spacing, radius } from "../../../shared/theme/index.ts";
import { AstrologyDelivery, AstrologyDeliveryStatus } from "../types/astrology.types.ts";

interface AstrologyDeliveryCardProps {
  delivery: AstrologyDelivery;
}

export const AstrologyDeliveryCard: React.FC<AstrologyDeliveryCardProps> = ({
  delivery,
}) => {
  const scheduledDate = new Date(delivery.scheduled_at).toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );

  const getStatusMeta = (status: AstrologyDeliveryStatus) => {
    switch (status) {
      case "sent":
        return { label: "Delivered", bg: colors.successLight, text: colors.success };
      case "queued":
        return { label: "Scheduled", bg: colors.warningLight, text: colors.warning };
      case "failed":
        return { label: "Failed", bg: colors.errorLight, text: colors.error };
      case "skipped":
        return { label: "Skipped", bg: colors.surfaceSubtle, text: colors.textSecondary };
      default:
        return { label: status, bg: colors.surfaceSubtle, text: colors.textSecondary };
    }
  };

  const statusMeta = getStatusMeta(delivery.status);
  const isWhatsApp = delivery.channel === "whatsapp";

  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.channelRow}>
          <Text variant="captionMedium" color={colors.primaryDark}>
            {isWhatsApp ? "WhatsApp Broadcast" : "In-App Delivery"}
          </Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
          <Text variant="captionMedium" style={{ color: statusMeta.text }}>
            {statusMeta.label}
          </Text>
        </View>
      </View>

      <Text variant="h3" style={styles.contentTitle}>
        {delivery.content?.title || "Daily Vedic Planetary Guidance"}
      </Text>

      <View style={styles.footer}>
        <Text variant="caption" color={colors.textTertiary}>
          Scheduled: {scheduledDate}
        </Text>
        {delivery.sent_at && (
          <Text variant="caption" color={colors.textSecondary}>
            Sent: {new Date(delivery.sent_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: spacing.xs,
    padding: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  channelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  contentTitle: {
    marginVertical: spacing.xs,
    color: colors.textPrimary,
  },
  footer: {
    marginTop: spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xs,
  },
});

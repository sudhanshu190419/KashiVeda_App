// src/features/booking/components/BookingStatusBadge.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, typography } from "../../../shared/theme/index.ts";
import { BookingStatus } from "../types/booking.types.ts";

interface BookingStatusBadgeProps {
  status: BookingStatus;
}

export const BookingStatusBadge: React.FC<BookingStatusBadgeProps> = ({ status }) => {
  const config = getStatusConfig(status);

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Text style={[styles.label, { color: config.text }]}>
        {config.label}
      </Text>
    </View>
  );
};

const getStatusConfig = (status: BookingStatus) => {
  switch (status) {
    case "confirmed":
      return {
        label: "Confirmed",
        bg: "#DCFCE7",
        border: "#86EFAC",
        text: "#15803D",
      };
    case "upcoming":
      return {
        label: "Upcoming",
        bg: "#E0E7FF",
        border: "#A5B4FC",
        text: "#3730A3",
      };
    case "in_progress":
      return {
        label: "In Progress",
        bg: "#FEF3C7",
        border: "#FDE68A",
        text: "#B45309",
      };
    case "payment_pending":
      return {
        label: "Payment Pending",
        bg: "#FFFBEB",
        border: "#FCD34D",
        text: "#D97706",
      };
    case "completed":
      return {
        label: "Completed",
        bg: "#F3F4F6",
        border: "#E5E7EB",
        text: "#4B5563",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        bg: "#FEE2E2",
        border: "#FCA5A5",
        text: "#B91C1C",
      };
    case "rescheduled":
      return {
        label: "Rescheduled",
        bg: "#F3E8FF",
        border: "#D8B4FE",
        text: "#6B21A8",
      };
    default:
      return {
        label: status,
        bg: colors.surfaceSubtle,
        border: colors.borderLight,
        text: colors.textSecondary,
      };
  }
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
});

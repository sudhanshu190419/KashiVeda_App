// src/features/pandit/components/UnavailabilityBlockCard.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, spacing } from "../../../shared/theme/index.ts";
import { formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { PanditUnavailabilityBlock } from "../types/pandit.types.ts";

interface UnavailabilityBlockCardProps {
  block: PanditUnavailabilityBlock;
  onDelete: (blockId: string) => void;
}

export const UnavailabilityBlockCard: React.FC<UnavailabilityBlockCardProps> = ({
  block,
  onDelete,
}) => {
  const startDate = new Date(block.starts_at);
  const endDate = new Date(block.ends_at);

  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.row}>
        <View style={styles.infoCol}>
          <Text variant="bodyMedium" style={styles.reasonText}>
            {block.reason || "Personal Block / Unavailable"}
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.timeRange}>
            From: {formatDate(startDate)} at {formatTime(startDate)}
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            To: {formatDate(endDate)} at {formatTime(endDate)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => onDelete(block.id)}
          style={styles.deleteBtn}
          activeOpacity={0.7}
        >
          <Text variant="captionMedium" color={colors.error}>
            Delete
          </Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xs,
    padding: spacing.md,
    backgroundColor: "#FFF8F8",
    borderColor: "#FEE2E2",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  reasonText: {
    fontSize: 14,
    marginBottom: 2,
  },
  timeRange: {
    marginBottom: 2,
  },
  deleteBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
});

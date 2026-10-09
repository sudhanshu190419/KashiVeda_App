// src/features/astrology/components/AstrologyContentCard.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, spacing, radius } from "../../../shared/theme/index.ts";
import { AstrologyContent } from "../types/astrology.types.ts";

interface AstrologyContentCardProps {
  content: AstrologyContent;
  onPress: (content: AstrologyContent) => void;
}

export const AstrologyContentCard: React.FC<AstrologyContentCardProps> = ({
  content,
  onPress,
}) => {
  const publishDate = new Date(content.publish_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const isWhatsApp = content.channel === "whatsapp";
  const snippet =
    content.body.length > 120
      ? `${content.body.substring(0, 120)}...`
      : content.body;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(content)}
      accessibilityRole="button"
      accessibilityLabel={content.title || "Vedic Astrology Insight"}
    >
      <Card variant="outlined" style={styles.card}>
        <View style={styles.header}>
          <View style={styles.channelBadge}>
            <Text
              variant="captionMedium"
              color={isWhatsApp ? colors.secondaryDark : colors.primaryDark}
            >
              {isWhatsApp ? "WhatsApp Broadcast" : "Daily In-App Insight"}
            </Text>
          </View>
          <Text variant="caption" color={colors.textTertiary}>
            {publishDate}
          </Text>
        </View>

        <Text variant="h3" style={styles.title}>
          {content.title || "Daily Planetary Guidance"}
        </Text>

        <Text variant="body" color={colors.textSecondary} style={styles.snippet}>
          {snippet}
        </Text>

        <View style={styles.footer}>
          <Text variant="captionMedium" color={colors.primary}>
            Read Full Insight →
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
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
    marginBottom: spacing.xs,
  },
  channelBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  title: {
    marginVertical: spacing.xs,
    color: colors.textPrimary,
  },
  snippet: {
    lineHeight: 20,
  },
  footer: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});

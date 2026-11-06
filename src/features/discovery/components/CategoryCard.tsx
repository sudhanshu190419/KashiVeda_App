// src/features/discovery/components/CategoryCard.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { VCard, VText } from "../../../shared/components/index.ts";
import { Ionicons } from "../../../shared/components/icons/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { PujaCategory } from "../types/discovery.ts";

interface CategoryCardProps {
  category: PujaCategory;
  onPress: () => void;
}

const getCategoryIconName = (categoryName: string): any => {
  const lower = categoryName.toLowerCase();
  if (lower.includes("rudra") || lower.includes("shiva") || lower.includes("abhishek") || lower.includes("mahadev")) {
    return "water-outline"; // Holy Abhishek
  }
  if (lower.includes("havan") || lower.includes("yagya") || lower.includes("fire")) {
    return "flame-outline"; // Sacred Yagya
  }
  if (lower.includes("shanti") || lower.includes("navgrah") || lower.includes("graha") || lower.includes("astrology")) {
    return "planet-outline"; // Cosmic / Planetary
  }
  if (lower.includes("ganesh") || lower.includes("shubh") || lower.includes("vivah") || lower.includes("sanskara")) {
    return "sparkles-outline"; // Auspicious beginning
  }
  if (lower.includes("pitru") || lower.includes("shradh") || lower.includes("tarpan") || lower.includes("kashi")) {
    return "shield-checkmark-outline"; // Ancestral peace
  }
  if (lower.includes("jaap") || lower.includes("mantra") || lower.includes("path")) {
    return "book-outline"; // Sacred chanting
  }
  return "star-outline";
};

export const CategoryCard: React.FC<CategoryCardProps> = ({ category, onPress }) => {
  const { colors, spacing, radii } = useTheme();
  const iconName = getCategoryIconName(category.name);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Category ${category.name}`}
      style={styles.touchable}
    >
      <VCard
        elevation={1}
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
            borderRadius: radii.lg,
            padding: spacing.md,
            marginBottom: spacing.sm,
          },
        ]}
      >
        <View style={styles.header}>
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.full,
                marginRight: spacing.md,
              },
            ]}
          >
            <Ionicons
              name={iconName}
              size={20}
              color={colors.brandPrimary}
            />
          </View>
          <View style={styles.textContainer}>
            <VText variant="titleMedium" color="textPrimary" weight="700">
              {category.name}
            </VText>
            {category.description ? (
              <VText variant="caption" color="textMuted" numberOfLines={2} style={{ marginTop: 2 }}>
                {category.description}
              </VText>
            ) : null}
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.brandPrimary}
            style={{ marginLeft: spacing.xs }}
          />
        </View>
      </VCard>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    minHeight: 48,
    width: "100%",
  },
  card: {
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBadge: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
});

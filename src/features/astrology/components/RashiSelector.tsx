// src/features/astrology/components/RashiSelector.tsx
import React from "react";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { CANONICAL_RASHIS, RashiDefinition } from "../types/rashi.types.ts";

interface RashiSelectorProps {
  selectedRashiId: number;
  onSelectRashi: (rashiId: number) => void;
  disabled?: boolean;
}

export const RashiSelector: React.FC<RashiSelectorProps> = ({
  selectedRashiId,
  onSelectRashi,
  disabled = false,
}) => {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {CANONICAL_RASHIS.map((rashi: RashiDefinition) => {
          const isSelected = rashi.id === selectedRashiId;
          return (
            <TouchableOpacity
              key={rashi.id}
              activeOpacity={0.7}
              disabled={disabled}
              onPress={() => onSelectRashi(rashi.id)}
              style={[
                styles.chip,
                isSelected ? styles.chipSelected : styles.chipUnselected,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${rashi.fullName} zodiac sign`}
              accessibilityState={{ selected: isSelected }}
              testID={`rashi-chip-${rashi.id}`}
            >
              <Text
                variant="bodyMedium"
                style={[
                  styles.symbol,
                  { color: isSelected ? colors.primaryDark : colors.textSecondary },
                ]}
              >
                {rashi.symbol}
              </Text>
              <View style={styles.textContainer}>
                <Text
                  variant="captionMedium"
                  style={[
                    styles.label,
                    { color: isSelected ? colors.primaryDark : colors.textPrimary },
                  ]}
                >
                  {rashi.vedicName}
                </Text>
                <Text
                  variant="overline"
                  style={[
                    styles.sublabel,
                    { color: isSelected ? colors.primary : colors.textTertiary },
                  ]}
                >
                  {rashi.westernName}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: spacing.xs,
    gap: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  chipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  chipUnselected: {
    backgroundColor: colors.surface,
    borderColor: colors.borderLight,
  },
  symbol: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  textContainer: {
    flexDirection: "column",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
  sublabel: {
    fontSize: 9,
  },
});

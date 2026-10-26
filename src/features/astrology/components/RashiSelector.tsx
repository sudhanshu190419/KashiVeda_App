// src/features/astrology/components/RashiSelector.tsx
import React from "react";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { VText } from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
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
  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  return (
    <View style={[styles.container, { marginVertical: spacing.xs }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.xs, gap: spacing.xs }]}
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
                {
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                  backgroundColor: isSelected ? colors.surfaceCard : colors.surfaceSubtle,
                  borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${rashi.fullName} zodiac sign`}
              accessibilityState={{ selected: isSelected }}
              testID={`rashi-chip-${rashi.id}`}
            >
              <VText
                variant="bodyMedium"
                style={[
                  styles.symbol,
                  {
                    color: isSelected ? colors.brandPrimary : colors.textMuted,
                    marginRight: spacing.xs,
                  },
                ]}
              >
                {rashi.symbol}
              </VText>
              <View style={styles.textContainer}>
                <VText
                  variant="caption"
                  weight="600"
                  color={isSelected ? "brandPrimary" : "textPrimary"}
                  style={styles.label}
                >
                  {isHi && rashi.sanskritName ? rashi.sanskritName : rashi.vedicName}
                </VText>
                <VText
                  variant="caption"
                  color={isSelected ? "brandPrimary" : "textMuted"}
                  style={styles.sublabel}
                >
                  {rashi.westernName}
                </VText>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  scrollContent: {
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    minWidth: 64,
  },
  symbol: {
    fontSize: 18,
  },
  textContainer: {
    flexDirection: "column",
    justifyContent: "center",
  },
  label: {
    fontSize: 12,
  },
  sublabel: {
    fontSize: 10,
    lineHeight: 12,
  },
});

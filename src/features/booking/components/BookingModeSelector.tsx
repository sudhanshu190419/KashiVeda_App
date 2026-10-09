import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { ServiceMode } from "../../discovery/types/discovery.ts";

interface BookingModeSelectorProps {
  selectedMode: ServiceMode;
  allowedModes: ServiceMode[];
  modePrices?: {
    home?: number | null;
    temple?: number | null;
    remote?: number | null;
  };
  onSelectMode: (mode: ServiceMode) => void;
}

export const BookingModeSelector: React.FC<BookingModeSelectorProps> = ({
  selectedMode,
  allowedModes,
  modePrices,
  onSelectMode,
}) => {
  const modes: { mode: ServiceMode; icon: string; title: string; desc: string }[] = [
    {
      mode: "home",
      icon: "🪔",
      title: "Home Puja",
      desc: "Pandit visits your residence with complete sacred samagri.",
    },
    {
      mode: "temple",
      icon: "🏛️",
      title: "Temple Puja",
      desc: "Performed directly in consecrated temple sanctums in Kashi.",
    },
    {
      mode: "remote",
      icon: "🌐",
      title: "Online Puja",
      desc: "Connect with a Pandit through an interactive live video session.",
    },
  ];

  return (
    <View style={styles.container}>
      <Text variant="h3" style={styles.title}>
        Select Service Format
      </Text>
      <Text variant="caption" color={colors.textSecondary} style={styles.subtitle}>
        Choose how you would like the sacred ceremony to be performed.
      </Text>

      <View style={styles.list}>
        {modes.map((item) => {
          const modePrice = modePrices ? modePrices[item.mode] : undefined;
          const isOfferedByPandit = modePrices !== undefined ? modePrice != null && modePrice > 0 : true;
          const isAllowed = allowedModes.includes(item.mode) && isOfferedByPandit;
          const isSelected = selectedMode === item.mode;

          return (
            <TouchableOpacity
              key={item.mode}
              disabled={!isAllowed}
              onPress={() => onSelectMode(item.mode)}
              activeOpacity={0.7}
              style={[
                styles.modeCard,
                isSelected && styles.selectedCard,
                !isAllowed && styles.disabledCard,
              ]}
            >
              <Card
                variant={isSelected ? "elevated" : "outlined"}
                style={[
                  styles.cardInner,
                  isSelected && styles.selectedCardInner,
                  !isAllowed && styles.disabledCardInner,
                ]}
              >
                <View style={styles.row}>
                  <Text style={styles.icon}>{item.icon}</Text>
                  <View style={styles.info}>
                    <View style={styles.headerRow}>
                      <Text variant="bodyMedium" color={isSelected ? colors.primary : colors.textPrimary}>
                        {item.title}
                      </Text>
                      {isAllowed && modePrice != null && (
                        <Text variant="captionMedium" color={colors.primary}>
                          {formatCurrency(modePrice)}
                        </Text>
                      )}
                      {!isAllowed && (
                        <View style={styles.unavailableBadge}>
                          <Text variant="caption" color={colors.textTertiary}>
                            Not Offered
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text variant="caption" color={colors.textSecondary} style={styles.desc}>
                      {item.desc}
                    </Text>
                  </View>
                  <View style={[styles.radioCircle, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
  },
  title: {
    marginBottom: spacing.xxs,
  },
  subtitle: {
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.sm,
  },
  modeCard: {
    borderRadius: radius.md,
  },
  cardInner: {
    padding: spacing.md,
  },
  selectedCard: {
    transform: [{ scale: 1.01 }],
  },
  selectedCardInner: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: "#FFF8F6",
  },
  disabledCard: {
    opacity: 0.5,
  },
  disabledCardInner: {
    backgroundColor: colors.surfaceSubtle,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    fontSize: 28,
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
    marginRight: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  desc: {
    marginTop: spacing.xxs,
    lineHeight: 18,
  },
  unavailableBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});

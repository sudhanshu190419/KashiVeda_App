// src/features/astrology/components/RashiPersonalizationModal.tsx
import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Button,
  Card,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import {
  CANONICAL_RASHIS,
  getRashiById,
  RashiDefinition,
} from "../types/rashi.types.ts";

interface RashiPersonalizationModalProps {
  visible: boolean;
  initialRashiId?: number | null;
  calculatedKundliRashiId?: number | null;
  onConfirm: (rashiId: number | null) => void;
  onSkip: () => void;
  onClose: () => void;
}

export const RashiPersonalizationModal: React.FC<RashiPersonalizationModalProps> = ({
  visible,
  initialRashiId,
  calculatedKundliRashiId,
  onConfirm,
  onSkip,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState<number>(
    initialRashiId || calculatedKundliRashiId || 1
  );

  const calculatedRashi = getRashiById(calculatedKundliRashiId);

  const handleConfirm = () => {
    onConfirm(selectedId);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Card variant="elevated" style={styles.modalCard}>
          {/* Header */}
          <Text variant="captionMedium" color={colors.primary} align="center">
            ॥ ज्योतिष संस्मरण ॥
          </Text>
          <Text variant="h2" align="center" style={styles.title}>
            Personalize Your Daily Insights
          </Text>
          <Text variant="caption" color={colors.textSecondary} align="center" style={styles.subtitle}>
            Select your Vedic Moon sign (Janma Rashi) to receive tailored daily guidance. You can change this anytime.
          </Text>

          {/* Calculated Janma Rashi Recommendation from Kundli (if available) */}
          {calculatedRashi && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSelectedId(calculatedRashi.id)}
              style={styles.calculatedBox}
            >
              <View style={styles.calculatedRow}>
                <Text style={styles.calculatedIcon}>✨</Text>
                <View style={styles.calculatedInfo}>
                  <Text variant="captionMedium" color={colors.primaryDark}>
                    Detected from your Kundli
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    Janma Rashi: {calculatedRashi.fullName} ({calculatedRashi.sanskritName})
                  </Text>
                </View>
                {selectedId === calculatedRashi.id && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* 12-Rashi Grid Selector */}
          <ScrollView style={styles.scrollList} contentContainerStyle={styles.gridContainer}>
            {CANONICAL_RASHIS.map((rashi: RashiDefinition) => {
              const isSelected = rashi.id === selectedId;
              return (
                <TouchableOpacity
                  key={rashi.id}
                  activeOpacity={0.7}
                  onPress={() => setSelectedId(rashi.id)}
                  style={[
                    styles.rashiCard,
                    isSelected ? styles.rashiCardSelected : styles.rashiCardUnselected,
                  ]}
                  testID={`personalize-rashi-${rashi.id}`}
                >
                  <Text style={styles.rashiSymbol}>{rashi.symbol}</Text>
                  <Text
                    variant="captionMedium"
                    align="center"
                    style={[
                      styles.rashiName,
                      { color: isSelected ? colors.primaryDark : colors.textPrimary },
                    ]}
                  >
                    {rashi.vedicName}
                  </Text>
                  <Text
                    variant="overline"
                    align="center"
                    style={[
                      styles.rashiWestern,
                      { color: isSelected ? colors.primary : colors.textTertiary },
                    ]}
                  >
                    {rashi.westernName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actionsContainer}>
            <Button
              title="Save & Continue"
              variant="primary"
              size="md"
              onPress={handleConfirm}
              style={styles.actionBtn}
            />
            <Button
              title="I'll do this later"
              variant="secondary"
              size="md"
              onPress={onSkip}
              style={styles.actionBtn}
            />
          </View>
        </Card>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "85%",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: spacing.md,
  },
  title: {
    marginVertical: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  calculatedBox: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  calculatedRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  calculatedIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  calculatedInfo: {
    flex: 1,
  },
  checkmark: {
    fontSize: 18,
    color: colors.primaryDark,
    fontWeight: "bold",
  },
  scrollList: {
    maxHeight: 280,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  rashiCard: {
    width: "31%",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1.5,
  },
  rashiCardSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  rashiCardUnselected: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.borderLight,
  },
  rashiSymbol: {
    fontSize: 20,
    marginBottom: 2,
  },
  rashiName: {
    fontSize: 11,
  },
  rashiWestern: {
    fontSize: 9,
  },
  actionsContainer: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  actionBtn: {
    width: "100%",
  },
});

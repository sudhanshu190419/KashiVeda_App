// src/features/booking/components/PrasadSelector.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, spacing } from "../../../shared/theme/index.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { ServiceMode } from "../../discovery/types/discovery.ts";
import { PrasadSelection } from "../hooks/useBookingFlow.ts";
import { PrasadItem } from "../types/booking.types.ts";

interface PrasadSelectorProps {
  prasadCatalog: PrasadItem[];
  prasadSelections: PrasadSelection[];
  onUpdatePrasadQty: (item: PrasadItem, quantity: number) => void;
  serviceMode?: ServiceMode;
}

export const PrasadSelector: React.FC<PrasadSelectorProps> = ({
  prasadCatalog,
  prasadSelections,
  onUpdatePrasadQty,
  serviceMode,
}) => {
  // Consecrated Blessed Prasad is not applicable to Remote Puja
  if (serviceMode === "remote") {
    return null;
  }
  return (
    <View style={styles.container}>
      <Text variant="h3" style={styles.title}>
        Optional Blessed Prasad
      </Text>
      <Text variant="caption" color={colors.textSecondary} style={styles.subtitle}>
        Consecrated temple prasad directly from sacred sanctums in Varanasi.
      </Text>

      {prasadCatalog.length > 0 ? (
        <View style={styles.list}>
          {prasadCatalog.map((item) => {
            const selection = prasadSelections.find((p) => p.item.id === item.id);
            const currentQty = selection?.quantity || 0;

            return (
              <Card key={item.id} style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <Text variant="bodyMedium">🪔 {item.name}</Text>
                    {item.description ? (
                      <Text variant="caption" color={colors.textSecondary} style={styles.desc}>
                        {item.description}
                      </Text>
                    ) : null}
                    <Text variant="captionMedium" color={colors.primary} style={styles.price}>
                      {formatCurrency(item.unit_price)} per pack
                    </Text>
                  </View>

                  <View style={styles.qtyControlRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      disabled={currentQty === 0}
                      onPress={() => onUpdatePrasadQty(item, currentQty - 1)}
                    >
                      <Text variant="bodyMedium" color={currentQty === 0 ? colors.textTertiary : colors.primary}>
                        -
                      </Text>
                    </TouchableOpacity>
                    <Text variant="bodyMedium" style={styles.qtyText}>
                      {currentQty}
                    </Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => onUpdatePrasadQty(item, currentQty + 1)}
                    >
                      <Text variant="bodyMedium" color={colors.primary}>
                        +
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      ) : (
        <Card style={styles.emptyCard}>
          <Text variant="body" color={colors.textSecondary} align="center">
            No prasad offerings currently available for this ritual.
          </Text>
        </Card>
      )}
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
  itemCard: {
    padding: spacing.md,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  desc: {
    marginTop: spacing.xxs,
  },
  price: {
    marginTop: spacing.xs,
  },
  qtyControlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  qtyText: {
    minWidth: 20,
    textAlign: "center",
  },
  emptyCard: {
    padding: spacing.lg,
  },
});

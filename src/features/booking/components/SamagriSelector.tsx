// src/features/booking/components/SamagriSelector.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { SamagriItem, SamagriPackage, ServiceMode } from "../../discovery/types/discovery.ts";
import { CustomSamagriSelection } from "../hooks/useBookingFlow.ts";

interface SamagriSelectorProps {
  serviceMode?: ServiceMode;
  samagriType: "none" | "package" | "custom";
  onSelectSamagriType: (type: "none" | "package" | "custom") => void;
  packages: SamagriPackage[];
  selectedPackage: SamagriPackage | null;
  onSelectPackage: (pkg: SamagriPackage | null) => void;
  customCatalog: SamagriItem[];
  customSelections: CustomSamagriSelection[];
  onUpdateCustomQty: (item: SamagriItem, quantity: number) => void;
}

export const SamagriSelector: React.FC<SamagriSelectorProps> = ({
  serviceMode,
  samagriType,
  onSelectSamagriType,
  packages,
  selectedPackage,
  onSelectPackage,
  customCatalog,
  customSelections,
  onUpdateCustomQty,
}) => {
  if (serviceMode === "remote") {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text variant="h3" style={styles.title}>
        Sacred Samagri Options
      </Text>
      <Text variant="caption" color={colors.textSecondary} style={styles.subtitle}>
        Vedic herbs, dhoop, ghee, flowers, and pure Ganga jal arranged by Kashi Veda.
      </Text>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {packages.length > 0 && (
          <TouchableOpacity
            style={[styles.tab, samagriType === "package" && styles.tabActive]}
            onPress={() => onSelectSamagriType("package")}
          >
            <Text
              variant="captionMedium"
              color={samagriType === "package" ? colors.primary : colors.textSecondary}
            >
              Ritual Package
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.tab, samagriType === "custom" && styles.tabActive]}
          onPress={() => onSelectSamagriType("custom")}
        >
          <Text
            variant="captionMedium"
            color={samagriType === "custom" ? colors.primary : colors.textSecondary}
          >
            Custom Items
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, samagriType === "none" && styles.tabActive]}
          onPress={() => onSelectSamagriType("none")}
        >
          <Text
            variant="captionMedium"
            color={samagriType === "none" ? colors.primary : colors.textSecondary}
          >
            Devotee Arranged
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mode 1: Predefined Packages */}
      {samagriType === "package" && (
        <View style={styles.contentList}>
          {packages.map((pkg) => {
            const isSelected = selectedPackage?.id === pkg.id;
            let pkgPrice = 0;
            if (pkg.items && pkg.items.length > 0) {
              pkgPrice = pkg.items.reduce(
                (sum, pi) => sum + pi.quantity * (pi.item.unit_price || 0),
                0
              );
            }

            return (
              <TouchableOpacity
                key={pkg.id}
                onPress={() => onSelectPackage(pkg)}
                activeOpacity={0.7}
              >
                <Card
                  variant={isSelected ? "elevated" : "outlined"}
                  style={[styles.packageCard, isSelected && styles.packageCardSelected]}
                >
                  <View style={styles.packageHeader}>
                    <View style={styles.packageTitleBox}>
                      <Text variant="bodyMedium">{pkg.name}</Text>
                      {pkg.description ? (
                        <Text variant="caption" color={colors.textSecondary} style={styles.pkgDesc}>
                          {pkg.description}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.packagePriceBox}>
                      <Text variant="bodyMedium" color={colors.primary}>
                        {formatCurrency(pkgPrice)}
                      </Text>
                      <View style={[styles.radioCircle, isSelected && styles.radioSelected]}>
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                    </View>
                  </View>

                  {pkg.items && pkg.items.length > 0 ? (
                    <View style={styles.itemsPreview}>
                      <Text variant="caption" color={colors.textTertiary}>
                        Includes: {pkg.items.map((pi) => `${pi.item.name} (${pi.quantity} ${pi.item.unit})`).join(", ")}
                      </Text>
                    </View>
                  ) : null}
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Mode 2: Custom Items */}
      {samagriType === "custom" && (
        <View style={styles.contentList}>
          {customCatalog.length === 0 ? (
            <Card style={styles.noneCard}>
              <Text variant="body" color={colors.textSecondary} align="center">
                No individual custom Samagri items are currently available in the catalog. You can select a predefined Ritual Package or choose Devotee Arranged.
              </Text>
            </Card>
          ) : (
            customCatalog.map((item) => {
              const selection = customSelections.find((c) => c.item.id === item.id);
              const currentQty = selection?.quantity || 0;

              return (
                <Card key={item.id} style={styles.customItemCard}>
                  <View style={styles.customItemRow}>
                    <View style={styles.customItemInfo}>
                      <Text variant="bodyMedium">{item.name}</Text>
                      {item.description ? (
                        <Text variant="caption" color={colors.textTertiary} style={styles.itemDesc}>
                          {item.description}
                        </Text>
                      ) : null}
                      <Text variant="caption" color={colors.textSecondary}>
                        {formatCurrency(item.unit_price)} per {item.unit || "unit"}
                      </Text>
                    </View>
                    <View style={styles.qtyControlRow}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        disabled={currentQty === 0}
                        onPress={() => onUpdateCustomQty(item, currentQty - 1)}
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
                        onPress={() => onUpdateCustomQty(item, currentQty + 1)}
                      >
                        <Text variant="bodyMedium" color={colors.primary}>
                          +
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
              );
            })
          )}
        </View>
      )}

      {/* Mode 3: Devotee Arranged */}
      {samagriType === "none" && (
        <Card style={styles.noneCard}>
          <Text variant="body" color={colors.textSecondary} align="center">
            You have chosen to arrange your own sacred samagri. The Pandit will provide the list of required items upon booking confirmation.
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
  tabRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.xxs,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: "center",
    borderRadius: radius.sm,
  },
  tabActive: {
    backgroundColor: colors.surface,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  contentList: {
    gap: spacing.sm,
  },
  packageCard: {
    padding: spacing.md,
  },
  packageCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: "#FFF8F6",
  },
  packageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  packageTitleBox: {
    flex: 1,
    marginRight: spacing.sm,
  },
  pkgDesc: {
    marginTop: spacing.xxs,
  },
  packagePriceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  itemsPreview: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xs,
  },
  customItemCard: {
    padding: spacing.sm,
  },
  customItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  customItemInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  itemDesc: {
    marginVertical: spacing.xxs,
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
  noneCard: {
    padding: spacing.lg,
  },
});

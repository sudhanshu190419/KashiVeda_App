// src/features/pandit/components/PanditOfferingCard.tsx
import React, { useState } from "react";
import { StyleSheet, Switch, TouchableOpacity, View } from "react-native";
import { Card, Input, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { ServiceMode } from "../../discovery/types/discovery.ts";
import { PanditPujaServiceOffering } from "../types/pandit.types.ts";

interface PanditOfferingCardProps {
  offering: PanditPujaServiceOffering;
  onUpdatePrice: (
    offeringId: string,
    pricingOrPrice:
      | number
      | {
          home_price?: number | null;
          temple_price?: number | null;
          remote_price?: number | null;
        },
    isActive: boolean
  ) => Promise<any>;
}

export const PanditOfferingCard: React.FC<PanditOfferingCardProps> = ({
  offering,
  onUpdatePrice,
}) => {
  const allowedModes: ServiceMode[] =
    offering.puja_service?.allowed_modes && offering.puja_service.allowed_modes.length > 0
      ? offering.puja_service.allowed_modes
      : ["home", "temple", "remote"];

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(offering.is_active);

  // Mode enabled state
  const [homeEnabled, setHomeEnabled] = useState<boolean>(offering.home_price != null);
  const [homePriceStr, setHomePriceStr] = useState<string>(
    offering.home_price != null ? String(offering.home_price) : ""
  );

  const [templeEnabled, setTempleEnabled] = useState<boolean>(offering.temple_price != null);
  const [templePriceStr, setTemplePriceStr] = useState<string>(
    offering.temple_price != null ? String(offering.temple_price) : ""
  );

  const [remoteEnabled, setRemoteEnabled] = useState<boolean>(offering.remote_price != null);
  const [remotePriceStr, setRemotePriceStr] = useState<string>(
    offering.remote_price != null ? String(offering.remote_price) : ""
  );

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleActive = async (val: boolean) => {
    setIsActive(val);
    try {
      await onUpdatePrice(
        offering.id,
        {
          home_price: homeEnabled && homePriceStr ? parseFloat(homePriceStr) : null,
          temple_price: templeEnabled && templePriceStr ? parseFloat(templePriceStr) : null,
          remote_price: remoteEnabled && remotePriceStr ? parseFloat(remotePriceStr) : null,
        },
        val
      );
    } catch {
      setIsActive(!val);
    }
  };

  const handleSavePrices = async () => {
    setError(null);

    const homePrice = homeEnabled ? parseFloat(homePriceStr) : null;
    const templePrice = templeEnabled ? parseFloat(templePriceStr) : null;
    const remotePrice = remoteEnabled ? parseFloat(remotePriceStr) : null;

    if (homeEnabled && (isNaN(homePrice!) || homePrice! <= 0)) {
      setError("Please enter a valid Home Dakshina strictly greater than zero.");
      return;
    }
    if (templeEnabled && (isNaN(templePrice!) || templePrice! <= 0)) {
      setError("Please enter a valid Temple Dakshina strictly greater than zero.");
      return;
    }
    if (remoteEnabled && (isNaN(remotePrice!) || remotePrice! <= 0)) {
      setError("Please enter a valid Remote Dakshina strictly greater than zero.");
      return;
    }

    if (isActive && !homeEnabled && !templeEnabled && !remoteEnabled) {
      setError("At least one service format must be enabled with a valid Dakshina fee.");
      return;
    }

    setSaving(true);
    try {
      await onUpdatePrice(
        offering.id,
        {
          home_price: homeEnabled ? homePrice : null,
          temple_price: templeEnabled ? templePrice : null,
          remote_price: remoteEnabled ? remotePrice : null,
        },
        isActive
      );
      setIsEditing(false);
    } catch (err: any) {
      setError(err?.message || "Failed to update offering prices.");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setError(null);
    setHomeEnabled(offering.home_price != null);
    setHomePriceStr(offering.home_price != null ? String(offering.home_price) : "");
    setTempleEnabled(offering.temple_price != null);
    setTemplePriceStr(offering.temple_price != null ? String(offering.temple_price) : "");
    setRemoteEnabled(offering.remote_price != null);
    setRemotePriceStr(offering.remote_price != null ? String(offering.remote_price) : "");
  };

  return (
    <Card variant="outlined" style={[styles.card, !isActive && styles.inactiveCard]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleCol}>
          <Text variant="bodyMedium" style={styles.offeringTitle}>
            {offering.puja_service?.name || "Sacred Ritual"}
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            Duration: {offering.duration_minutes || offering.puja_service?.default_duration_minutes || 60} mins
          </Text>
        </View>

        <Switch
          value={isActive}
          onValueChange={handleToggleActive}
          trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
          thumbColor={isActive ? colors.primary : colors.surface}
        />
      </View>

      {/* Mode Pricing Overview */}
      {!isEditing ? (
        <View style={styles.modePricingSummary}>
          <View style={styles.modePricesList}>
            {allowedModes.includes("home") && (
              <View style={styles.modeBadgeRow}>
                <Text variant="caption" color={colors.textSecondary}>🪔 Home:</Text>
                <Text
                  variant="captionMedium"
                  color={offering.home_price != null ? colors.primary : colors.textTertiary}
                >
                  {offering.home_price != null ? formatCurrency(offering.home_price) : "Not Offered"}
                </Text>
              </View>
            )}

            {allowedModes.includes("temple") && (
              <View style={styles.modeBadgeRow}>
                <Text variant="caption" color={colors.textSecondary}>🏛️ Temple:</Text>
                <Text
                  variant="captionMedium"
                  color={offering.temple_price != null ? colors.primary : colors.textTertiary}
                >
                  {offering.temple_price != null ? formatCurrency(offering.temple_price) : "Not Offered"}
                </Text>
              </View>
            )}

            {allowedModes.includes("remote") && (
              <View style={styles.modeBadgeRow}>
                <Text variant="caption" color={colors.textSecondary}>🌐 Remote:</Text>
                <Text
                  variant="captionMedium"
                  color={offering.remote_price != null ? colors.primary : colors.textTertiary}
                >
                  {offering.remote_price != null ? formatCurrency(offering.remote_price) : "Not Offered"}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={() => setIsEditing(true)}
            style={styles.editPriceBtn}
            activeOpacity={0.7}
          >
            <Text variant="captionMedium" color={colors.primary}>
              Edit Dakshina &gt;
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Edit Mode Form */
        <View style={styles.editWrap}>
          <Text variant="captionMedium" color={colors.textPrimary} style={styles.editSectionTitle}>
            Configure Service Formats &amp; Dakshina
          </Text>

          {/* Home Mode */}
          {allowedModes.includes("home") && (
            <View style={styles.modeEditBlock}>
              <View style={styles.modeToggleRow}>
                <Text variant="captionMedium">🪔 Home Service</Text>
                <Switch
                  value={homeEnabled}
                  onValueChange={setHomeEnabled}
                  trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
                  thumbColor={homeEnabled ? colors.primary : colors.surface}
                />
              </View>
              {homeEnabled && (
                <Input
                  value={homePriceStr}
                  onChangeText={(val) => setHomePriceStr(val.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 5000"
                  keyboardType="numeric"
                  style={styles.modeInput}
                />
              )}
            </View>
          )}

          {/* Temple Mode */}
          {allowedModes.includes("temple") && (
            <View style={styles.modeEditBlock}>
              <View style={styles.modeToggleRow}>
                <Text variant="captionMedium">🏛️ Temple Service</Text>
                <Switch
                  value={templeEnabled}
                  onValueChange={setTempleEnabled}
                  trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
                  thumbColor={templeEnabled ? colors.primary : colors.surface}
                />
              </View>
              {templeEnabled && (
                <Input
                  value={templePriceStr}
                  onChangeText={(val) => setTemplePriceStr(val.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 3500"
                  keyboardType="numeric"
                  style={styles.modeInput}
                />
              )}
            </View>
          )}

          {/* Remote Mode */}
          {allowedModes.includes("remote") && (
            <View style={styles.modeEditBlock}>
              <View style={styles.modeToggleRow}>
                <Text variant="captionMedium">🌐 Live Remote Service</Text>
                <Switch
                  value={remoteEnabled}
                  onValueChange={setRemoteEnabled}
                  trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
                  thumbColor={remoteEnabled ? colors.primary : colors.surface}
                />
              </View>
              {remoteEnabled && (
                <Input
                  value={remotePriceStr}
                  onChangeText={(val) => setRemotePriceStr(val.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 2100"
                  keyboardType="numeric"
                  style={styles.modeInput}
                />
              )}
            </View>
          )}

          {error ? (
            <Text variant="caption" color={colors.error} style={styles.errorText}>
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity onPress={resetForm} style={styles.cancelBtn}>
              <Text variant="caption" color={colors.textSecondary}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSavePrices}
              disabled={saving}
              style={styles.saveBtn}
            >
              <Text variant="captionMedium" color={colors.surface}>
                {saving ? "Saving..." : "Save Fees"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xs,
    padding: spacing.md,
  },
  inactiveCard: {
    opacity: 0.6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  offeringTitle: {
    fontSize: 15,
  },
  modePricingSummary: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modePricesList: {
    flex: 1,
    gap: 4,
  },
  modeBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  editPriceBtn: {
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
  },
  editWrap: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  editSectionTitle: {
    marginBottom: spacing.xs,
  },
  modeEditBlock: {
    marginBottom: spacing.xs,
    padding: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.xs,
  },
  modeToggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modeInput: {
    marginTop: spacing.xxs,
  },
  errorText: {
    marginTop: spacing.xxs,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xs,
  },
});

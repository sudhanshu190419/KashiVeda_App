// src/features/pandit/screens/PanditProfileScreen.tsx
import React, { useState } from "react";
import { Alert, StyleSheet, Switch, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Button, Card, Header, Input, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { useAuth } from "../../auth/AuthContext.tsx";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { PanditOfferingCard } from "../components/PanditOfferingCard.tsx";
import { usePanditOfferings } from "../hooks/usePanditOfferings.ts";
import { panditService } from "../services/panditService.ts";

export const PanditProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { profile, panditProfile, signOut, setActiveMode } = useAuth();

  const handleSwitchToCustomerMode = async () => {
    await setActiveMode("customer");
  };
  const { offerings, updatePrice } = usePanditOfferings();

  const [isEditingBio, setIsEditingBio] = useState<boolean>(false);
  const [bio, setBio] = useState<string>(panditProfile?.bio || "");
  const [expStr, setExpStr] = useState<string>(String(panditProfile?.years_experience ?? panditProfile?.experience_years ?? 10));
  const [languagesStr, setLanguagesStr] = useState<string>("Sanskrit, Hindi");
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const hasOperationalCoords =
    panditProfile?.base_latitude != null &&
    panditProfile?.base_longitude != null &&
    !isNaN(Number(panditProfile.base_latitude)) &&
    !isNaN(Number(panditProfile.base_longitude));

  // Kundli Settings State
  const [isEditingKundli, setIsEditingKundli] = useState<boolean>(false);
  const [kundliEnabled, setKundliEnabled] = useState<boolean>(Boolean(panditProfile?.kundli_enabled));
  const [kundliPrice, setKundliPrice] = useState<string>(
    panditProfile?.kundli_price ? String(panditProfile.kundli_price) : ""
  );
  const [kundliTurnaround, setKundliTurnaround] = useState<string>(
    panditProfile?.kundli_turnaround_days ? String(panditProfile.kundli_turnaround_days) : "3"
  );
  const [savingKundli, setSavingKundli] = useState<boolean>(false);
  const [kundliMsg, setKundliMsg] = useState<string | null>(null);

  const handleSaveKundli = async () => {
    setSavingKundli(true);
    setKundliMsg(null);
    try {
      const priceNum = parseFloat(kundliPrice);
      const daysNum = parseInt(kundliTurnaround, 10);
      if (kundliEnabled && (isNaN(priceNum) || priceNum <= 0)) {
        throw new Error("Kundli price must be strictly greater than zero when Kundli is enabled.");
      }
      if (kundliEnabled && (isNaN(daysNum) || daysNum <= 0)) {
        throw new Error("Kundli turnaround days must be greater than zero.");
      }

      await panditService.updateKundliSettings(
        kundliEnabled,
        kundliEnabled ? priceNum : null,
        kundliEnabled ? daysNum : null
      );
      setIsEditingKundli(false);
      setKundliMsg("Kundli consultation settings updated successfully.");
    } catch (err: any) {
      setKundliMsg(err?.message || "Failed to update Kundli settings.");
    } finally {
      setSavingKundli(false);
    }
  };

  const handleSaveBio = async () => {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const parsedExp = parseInt(expStr, 10);
      const parsedLangs = languagesStr
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);

      await panditService.updatePanditProfile({
        bio: bio.trim() || null,
        years_experience: isNaN(parsedExp) ? null : parsedExp,
        languages: parsedLangs,
      });

      setIsEditingBio(false);
      setProfileMsg("Profile updated successfully.");
    } catch (err: any) {
      setProfileMsg(err?.message || "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out from Pandit Sanctum?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <ScreenContainer scrollable padded>
      <Header
        title="Acharya Profile"
        subtitle="Manage your Vedic biography, offerings, and credentials"
      />

      {/* Devotee Mode Toggle */}
      <Card style={styles.modeCard}>
        <View style={styles.modeRow}>
          <View style={styles.modeTextWrap}>
            <Text variant="bodyMedium">Devotee Mode</Text>
            <Text variant="caption" color={colors.textSecondary}>
              Switch back to devotee mode to book pujas or explore rituals
            </Text>
          </View>
          <Button
            title="Customer Mode"
            variant="outline"
            size="sm"
            onPress={handleSwitchToCustomerMode}
          />
        </View>
      </Card>

      {/* Main Profile Identity Card */}
      <Card variant="elevated" style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarLarge}>
            <Text variant="h1" color={colors.primary}>
              {profile?.display_name?.charAt(0) || "A"}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text variant="h2">{profile?.display_name || "Acharya"}</Text>
            <Text variant="caption" color={colors.textSecondary}>
              Phone: {profile?.phone || "Not set"}
            </Text>
            <View style={styles.badgeRow}>
              <View style={styles.verifiedBadge}>
                <Text variant="caption" color={colors.primary} style={styles.badgeText}>
                  {panditProfile?.verification_status === "verified"
                    ? "Verified Acharya ✓"
                    : "Verification Pending"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Bio & Details Section */}
        {!isEditingBio ? (
          <View>
            <Text variant="caption" color={colors.textSecondary}>
              Biography & Background
            </Text>
            <Text variant="body" style={styles.bioText}>
              {bio || "Dedicated Vedic scholar and priest consecrated in Varanasi rituals."}
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.statCol}>
                <Text variant="caption" color={colors.textSecondary}>
                  Experience
                </Text>
                <Text variant="bodyMedium">
                  {`${expStr} Years`}
                </Text>
              </View>

              <View style={styles.statCol}>
                <Text variant="caption" color={colors.textSecondary}>
                  Languages
                </Text>
                <Text variant="bodyMedium">
                  {languagesStr}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => setIsEditingBio(true)}
              style={styles.editProfileBtn}
              activeOpacity={0.7}
            >
              <Text variant="captionMedium" color={colors.primary}>
                Edit Biography &amp; Experience &gt;
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.editSection}>
            <Text variant="caption" color={colors.textSecondary} style={styles.inputLabel}>
              Biography
            </Text>
            <Input
              value={bio}
              onChangeText={setBio}
              placeholder="Enter your Vedic study and background..."
              multiline
              numberOfLines={3}
            />

            <Text variant="caption" color={colors.textSecondary} style={styles.inputLabel}>
              Years of Experience
            </Text>
            <Input
              value={expStr}
              onChangeText={setExpStr}
              placeholder="10"
              keyboardType="numeric"
            />

            <Text variant="caption" color={colors.textSecondary} style={styles.inputLabel}>
              Languages (Comma Separated)
            </Text>
            <Input
              value={languagesStr}
              onChangeText={setLanguagesStr}
              placeholder="Sanskrit, Hindi, Bengali"
            />

            <View style={styles.editActions}>
              <TouchableOpacity
                onPress={() => setIsEditingBio(false)}
                style={styles.cancelBtn}
              >
                <Text variant="bodyMedium" color={colors.textSecondary}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <Button
                title={savingProfile ? "Saving..." : "Save Bio"}
                variant="primary"
                size="sm"
                onPress={handleSaveBio}
                disabled={savingProfile}
              />
            </View>
          </View>
        )}

        {profileMsg ? (
          <Text variant="caption" color={colors.primary} style={styles.msgText}>
            {profileMsg}
          </Text>
        ) : null}
      </Card>

      {/* Operational Service Location & PostGIS Geofence Card */}
      <Card variant="elevated" style={styles.locationCard}>
        <View style={styles.locationRow}>
          <View style={styles.locationTextWrap}>
            <View style={styles.locationHeaderRow}>
              <Text variant="overline" color={hasOperationalCoords ? colors.primary : "#b45309"}>
                OPERATIONAL SERVICE AREA
              </Text>
              <View style={[styles.locBadge, hasOperationalCoords ? styles.locBadgeActive : styles.locBadgeInactive]}>
                <Text variant="caption" style={[styles.locBadgeText, hasOperationalCoords ? styles.locBadgeTextActive : styles.locBadgeTextInactive]}>
                  {hasOperationalCoords ? "ACTIVE ✓" : "NOT CONFIGURED"}
                </Text>
              </View>
            </View>
            <Text variant="h3">Home Puja Service Location</Text>
            <Text variant="caption" color={colors.textSecondary}>
              {hasOperationalCoords
                ? `Active within ${panditProfile?.service_radius_km || 25} km of (${Number(panditProfile?.base_latitude).toFixed(4)}°, ${Number(panditProfile?.base_longitude).toFixed(4)}°).`
                : "Home service location not configured. PostGIS spatial anchor required for home bookings."}
            </Text>
          </View>
          <Button
            title={hasOperationalCoords ? "Manage Area >" : "Set Location >"}
            variant={hasOperationalCoords ? "outline" : "primary"}
            size="sm"
            onPress={() => navigation.navigate("PanditServiceLocation")}
          />
        </View>
      </Card>

      {/* Temples I Serve At Management Card */}
      <Card variant="elevated" style={styles.earningsCard}>
        <View style={styles.earningsRow}>
          <View style={styles.earningsTextWrap}>
            <Text variant="overline" color={colors.primary}>
              CONSECRATED SANCTUMS
            </Text>
            <Text variant="h3">Temples I Serve At</Text>
            <Text variant="caption" color={colors.textSecondary}>
              Manage your approved temple affiliations and request new sacred temple venues for Temple Puja rituals.
            </Text>
          </View>
          <Button
            title="Manage Temples >"
            variant="outline"
            size="sm"
            onPress={() => navigation.navigate("PanditTemples")}
          />
        </View>
      </Card>

      {/* Earnings & Settlement Ledger Card */}
      <Card variant="elevated" style={styles.earningsCard}>
        <View style={styles.earningsRow}>
          <View style={styles.earningsTextWrap}>
            <Text variant="overline" color={colors.primary}>
              FINANCIAL SETTLEMENT
            </Text>
            <Text variant="h3">Earnings &amp; Payouts</Text>
            <Text variant="caption" color={colors.textSecondary}>
              Inspect your verified Dakshina ledger, platform fees, and bank disbursements.
            </Text>
          </View>
          <Button
            title="View Earnings &gt;"
            variant="primary"
            size="sm"
            onPress={() => navigation.navigate("PanditEarnings")}
          />
        </View>
      </Card>

      {/* Payout Bank Account Setup Card */}
      <Card variant="elevated" style={styles.earningsCard}>
        <View style={styles.earningsRow}>
          <View style={styles.earningsTextWrap}>
            <Text variant="overline" color={colors.primary}>
              BANK ACCOUNT &amp; SETTLEMENT
            </Text>
            <Text variant="h3">Payout Bank Account</Text>
            <Text variant="caption" color={colors.textSecondary}>
              Configure your verified bank details and UPI for direct Dakshina disbursements.
            </Text>
          </View>
          <Button
            title="Manage Account &gt;"
            variant="outline"
            size="sm"
            onPress={() => navigation.navigate("PanditPayoutSetup")}
          />
        </View>
      </Card>

      {/* Astrological Consultations: Janam Kundli Settings Card */}
      <Card variant="elevated" style={styles.kundliCard}>
        <View style={styles.kundliRow}>
          <View style={styles.kundliTextWrap}>
            <Text variant="overline" color={colors.primary}>
              ASTROLOGICAL CONSULTATION
            </Text>
            <Text variant="h3">Paid Janam Kundli Offering</Text>
            <Text variant="caption" color={colors.textSecondary}>
              Allow devotees to order personalized Janam Kundli charts and astrological analysis from you.
            </Text>
          </View>
          <Switch
            value={kundliEnabled}
            onValueChange={(val) => {
              setKundliEnabled(val);
              setIsEditingKundli(true);
            }}
            trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
            thumbColor={kundliEnabled ? colors.primary : colors.surface}
          />
        </View>

        <View style={styles.divider} />

        {!isEditingKundli ? (
          <View>
            <View style={styles.statsRow}>
              <View style={styles.statCol}>
                <Text variant="caption" color={colors.textSecondary}>
                  Kundli Offering
                </Text>
                <Text variant="bodyMedium" color={kundliEnabled ? colors.primary : colors.textSecondary}>
                  {kundliEnabled ? "Active Seva" : "Disabled"}
                </Text>
              </View>

              <View style={styles.statCol}>
                <Text variant="caption" color={colors.textSecondary}>
                  Your Dakshina Fee
                </Text>
                <Text variant="bodyMedium">
                  {kundliEnabled && kundliPrice ? formatCurrency(parseFloat(kundliPrice)) : "Not configured"}
                </Text>
              </View>

              <View style={styles.statCol}>
                <Text variant="caption" color={colors.textSecondary}>
                  Turnaround
                </Text>
                <Text variant="bodyMedium">
                  {kundliEnabled ? `${kundliTurnaround} Days` : "—"}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => setIsEditingKundli(true)}
              style={styles.editProfileBtn}
              activeOpacity={0.7}
            >
              <Text variant="captionMedium" color={colors.primary}>
                Edit Kundli Price &amp; Turnaround &gt;
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.editSection}>
            <Text variant="caption" color={colors.textSecondary} style={styles.inputLabel}>
              Kundli Dakshina / Price (₹) *
            </Text>
            <Input
              value={kundliPrice}
              onChangeText={(val) => setKundliPrice(val.replace(/[^0-9.]/g, ""))}
              placeholder="e.g. 501"
              keyboardType="numeric"
            />

            <Text variant="caption" color={colors.textSecondary} style={styles.inputLabel}>
              Estimated Turnaround Time (Days) *
            </Text>
            <Input
              value={kundliTurnaround}
              onChangeText={(val) => setKundliTurnaround(val.replace(/[^0-9]/g, ""))}
              placeholder="3"
              keyboardType="numeric"
            />

            <View style={styles.editActions}>
              <TouchableOpacity
                onPress={() => setIsEditingKundli(false)}
                style={styles.cancelBtn}
              >
                <Text variant="bodyMedium" color={colors.textSecondary}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <Button
                title={savingKundli ? "Saving..." : "Save Kundli Settings"}
                variant="primary"
                size="sm"
                onPress={handleSaveKundli}
                disabled={savingKundli}
              />
            </View>
          </View>
        )}

        {kundliMsg ? (
          <Text variant="caption" color={colors.primary} style={styles.msgText}>
            {kundliMsg}
          </Text>
        ) : null}
      </Card>

      {/* Puja Offerings & Pricing Section */}
      <View style={styles.offeringsSection}>
        <Text variant="h3" style={styles.sectionTitle}>
          Your Consecrated Offerings ({offerings.length})
        </Text>
        <Text variant="caption" color={colors.textSecondary} style={styles.sectionSubtitle}>
          Configure which rituals you offer and your personalized Dakshina fees.
        </Text>

        {offerings.length > 0 ? (
          offerings.map((offering) => (
            <PanditOfferingCard
              key={offering.id}
              offering={offering}
              onUpdatePrice={updatePrice}
            />
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <Text variant="body" color={colors.textSecondary} align="center">
              No specific offerings mapped yet. Standard catalog Dakshina will apply.
            </Text>
          </Card>
        )}
      </View>

      {/* Sign Out Button */}
      <View style={styles.signOutWrap}>
        <Button
          title="Sign Out from Pandit Account"
          variant="outline"
          size="md"
          onPress={handleSignOut}
        />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  profileCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  profileInfo: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    marginTop: spacing.xxs,
  },
  verifiedBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  badgeText: {
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  bioText: {
    marginTop: spacing.xxs,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    marginTop: spacing.sm,
    gap: spacing.lg,
  },
  statCol: {
    flex: 1,
  },
  editProfileBtn: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
  },
  editSection: {
    gap: spacing.xs,
  },
  inputLabel: {
    marginTop: spacing.xs,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  msgText: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
  offeringsSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: 2,
  },
  sectionSubtitle: {
    marginBottom: spacing.sm,
  },
  emptyCard: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  signOutWrap: {
    marginVertical: spacing.lg,
  },
  modeCard: {
    marginBottom: spacing.md,
    backgroundColor: "#f8fafc",
    padding: spacing.md,
  },
  modeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modeTextWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  earningsCard: {
    marginBottom: spacing.md,
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
    padding: spacing.md,
  },
  earningsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  earningsTextWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  kundliCard: {
    marginBottom: spacing.md,
    backgroundColor: "#faf5ff",
    borderColor: "#e9d5ff",
    borderWidth: 1,
    padding: spacing.md,
  },
  kundliRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kundliTextWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  locationCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  locationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  locationTextWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  locationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: 2,
  },
  locBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  locBadgeActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
  },
  locBadgeInactive: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
  },
  locBadgeText: {
    fontWeight: "700",
    fontSize: 9,
  },
  locBadgeTextActive: {
    color: "#059669",
  },
  locBadgeTextInactive: {
    color: "#b45309",
  },
});

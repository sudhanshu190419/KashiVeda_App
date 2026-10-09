// src/features/pandit/screens/PanditServiceLocationScreen.tsx
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Button, Card, Header, Input, LoadingState, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { panditService } from "../services/panditService.ts";

export const SACRED_HUBS = [
  { name: "Assi Ghat, Varanasi", label: "Assi Ghat, Varanasi", city: "Varanasi", address: "Assi Ghat Sacred Kshetra, Varanasi", lat: 25.2890, lng: 82.9994, latitude: 25.2890, longitude: 82.9994 },
  { name: "Kashi Vishwanath, Godowlia", label: "Kashi Vishwanath, Godowlia", city: "Varanasi", address: "Kashi Vishwanath Sanctum, Godowlia, Varanasi", lat: 25.3109, lng: 83.0104, latitude: 25.3109, longitude: 83.0104 },
  { name: "Dashashwamedh Ghat", label: "Dashashwamedh Ghat", city: "Varanasi", address: "Dashashwamedh Ghat, Varanasi", lat: 25.3072, lng: 83.0108, latitude: 25.3072, longitude: 83.0108 },
  { name: "Sigra / Cantt, Varanasi", label: "Sigra / Cantt, Varanasi", city: "Varanasi", address: "Sigra Central Area, Varanasi", lat: 25.3216, lng: 82.9872, latitude: 25.3216, longitude: 82.9872 },
  { name: "Sarnath, Varanasi", label: "Sarnath, Varanasi", city: "Varanasi", address: "Sarnath Dharmarajika Kshetra, Varanasi", lat: 25.3762, lng: 83.0227, latitude: 25.3762, longitude: 83.0227 },
  { name: "Ram Janmabhoomi, Ayodhya", label: "Ram Janmabhoomi, Ayodhya", city: "Ayodhya", address: "Ram Janmabhoomi Marg, Ayodhya", lat: 26.7956, lng: 82.1944, latitude: 26.7956, longitude: 82.1944 },
  { name: "Har Ki Pauri, Haridwar", label: "Har Ki Pauri, Haridwar", city: "Haridwar", address: "Har Ki Pauri, Haridwar", lat: 29.9567, lng: 78.1707, latitude: 29.9567, longitude: 78.1707 },
];

export const PanditServiceLocationScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Active configuration from database
  const [currentCity, setCurrentCity] = useState<string>("Varanasi");
  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);
  const [currentRadius, setCurrentRadius] = useState<number>(25);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);

  // Editable form fields
  const [editCity, setEditCity] = useState<string>("Varanasi");
  const [editAddress, setEditAddress] = useState<string>("");
  const [editLat, setEditLat] = useState<string>("");
  const [editLng, setEditLng] = useState<string>("");
  const [editRadius, setEditRadius] = useState<string>("25");

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadLocationData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await panditService.fetchServiceLocation();
      setCurrentCity(data.city);
      setCurrentLat(data.latitude);
      setCurrentLng(data.longitude);
      setCurrentRadius(data.radius_km);
      setIsConfigured(data.is_configured);

      // Populate form fields
      setEditCity(data.city || "Varanasi");
      setEditLat(data.latitude != null ? String(data.latitude) : "");
      setEditLng(data.longitude != null ? String(data.longitude) : "");
      setEditRadius(String(data.radius_km || 25));

      if (!data.is_configured) {
        setIsEditing(true);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to load operational service location.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocationData();
  }, []);

  const handleSelectHub = (hub: (typeof SACRED_HUBS)[0]) => {
    setEditAddress(hub.address);
    setEditLat(String(hub.latitude));
    setEditLng(String(hub.longitude));
    setEditCity(hub.city);
  };

  const handleSave = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const latNum = parseFloat(editLat.trim());
    const lngNum = parseFloat(editLng.trim());
    const radiusNum = parseFloat(editRadius.trim());

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      Alert.alert("Invalid Latitude", "Latitude must be a valid number between -90 and 90.");
      return;
    }

    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      Alert.alert("Invalid Longitude", "Longitude must be a valid number between -180 and 180.");
      return;
    }

    if (isNaN(radiusNum) || radiusNum <= 0 || radiusNum > 500) {
      Alert.alert("Invalid Radius", "Service radius must be between 1 and 500 km.");
      return;
    }

    try {
      setSaving(true);
      await panditService.updateServiceLocation({
        latitude: latNum,
        longitude: lngNum,
        radius_km: radiusNum,
        city: editCity.trim() || currentCity || "Varanasi",
      });

      setSuccessMsg("Operational service location updated successfully! Home Puja bookings are now active within your service area.");
      setIsEditing(false);
      await loadLocationData();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to update service location.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer padded>
        <LoadingState message="Connecting to service area registry..." />
      </ScreenContainer>
    );
  }

  const parsedLat = parseFloat(editLat);
  const parsedLng = parseFloat(editLng);
  const isFormCoordsValid = !isNaN(parsedLat) && parsedLat >= -90 && parsedLat <= 90 && !isNaN(parsedLng) && parsedLng >= -180 && parsedLng <= 180;

  return (
    <ScreenContainer scrollable padded>
      <Header
        title="Service Location"
        subtitle="Operational base and PostGIS coverage radius"
        onBack={() => navigation.goBack()}
      />

      {/* Main Status Hero Card */}
      <Card variant="elevated" style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View>
            <Text variant="overline" color={isConfigured ? colors.primary : "#b45309"}>
              HOME PUJA COVERAGE STATUS
            </Text>
            <Text variant="h3">
              {isConfigured ? "Home Service Configured ✓" : "Home service location not configured"}
            </Text>
          </View>
          <View style={[styles.badge, isConfigured ? styles.badgeActive : styles.badgeInactive]}>
            <Text variant="caption" style={[styles.badgeText, isConfigured ? styles.badgeTextActive : styles.badgeTextInactive]}>
              {isConfigured ? "CONFIGURED" : "NOT CONFIGURED"}
            </Text>
          </View>
        </View>

        {isConfigured ? (
          <View style={styles.configuredInfo}>
            <Text variant="bodyMedium" color="#15803d" style={styles.activeBannerText}>
              Home service is active within {currentRadius} km of this location.
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.policyNote}>
              Your Home Puja service area is calculated from this location and your service radius using PostGIS spatial boundaries.
            </Text>

            <View style={styles.detailsTable}>
              <View style={styles.detailRow}>
                <Text variant="caption" color={colors.textSecondary}>Primary City:</Text>
                <Text variant="bodyMedium">{currentCity}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text variant="caption" color={colors.textSecondary}>Coordinates:</Text>
                <Text variant="bodyMedium" style={styles.monoText}>
                  {currentLat != null ? currentLat.toFixed(6) : "—"}°N, {currentLng != null ? currentLng.toFixed(6) : "—"}°E
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text variant="caption" color={colors.textSecondary}>Coverage Radius:</Text>
                <Text variant="bodyMedium">{currentRadius} km</Text>
              </View>
            </View>

            {!isEditing && (
              <Button
                title="Edit Service Location"
                variant="outline"
                size="sm"
                onPress={() => {
                  setIsEditing(true);
                  setSuccessMsg(null);
                  setErrorMsg(null);
                }}
                style={styles.editBtn}
              />
            )}
          </View>
        ) : (
          <View style={styles.unconfiguredBox}>
            <Text variant="body" color={colors.textSecondary} style={styles.unconfiguredText}>
              Devotees cannot book in-person Home Pujas with you until your operational service coordinates are set. Temple and Remote Pujas remain fully available.
            </Text>
            {!isEditing && (
              <Button
                title="Set Service Location"
                variant="primary"
                size="md"
                onPress={() => setIsEditing(true)}
                style={styles.setBtn}
              />
            )}
          </View>
        )}
      </Card>

      {/* Success / Error Messages */}
      {successMsg ? (
        <Card style={styles.successCard}>
          <Text variant="captionMedium" color="#15803d">
            ✓ {successMsg}
          </Text>
        </Card>
      ) : null}

      {errorMsg ? (
        <Card style={styles.errorCard}>
          <Text variant="captionMedium" color={colors.error}>
            ⚠️ {errorMsg}
          </Text>
        </Card>
      ) : null}

      {/* Editing Form */}
      {isEditing && (
        <Card variant="elevated" style={styles.formCard}>
          <Text variant="h3" style={styles.formTitle}>
            {isConfigured ? "Update Operational Location" : "Configure Operational Location"}
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.formSubtitle}>
            Select a sacred landmark preset or enter exact coordinates to anchor your PostGIS delivery radius.
          </Text>

          {/* Primary City */}
          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Primary Service City *
          </Text>
          <Input
            value={editCity}
            onChangeText={setEditCity}
            placeholder="e.g. Varanasi"
          />

          {/* Base Address */}
          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Service Base Location / Locality Address
          </Text>
          <Input
            value={editAddress}
            onChangeText={setEditAddress}
            placeholder="e.g. Assi Ghat Road, Bhelupur, Varanasi"
          />

          {/* Sacred Hub Quick Presets */}
          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Quick Select Sacred Location Hub
          </Text>
          <View style={styles.hubsContainer}>
            {SACRED_HUBS.map((hub) => {
              const isSelected =
                (parsedLat === hub.latitude && parsedLng === hub.longitude) ||
                (editAddress && editAddress.toLowerCase().includes(hub.name.toLowerCase()));
              return (
                <TouchableOpacity
                  key={hub.name}
                  style={[styles.hubChip, isSelected && styles.hubChipActive]}
                  onPress={() => handleSelectHub(hub)}
                  activeOpacity={0.7}
                >
                  <Text
                    variant="caption"
                    color={isSelected ? colors.surface : colors.textPrimary}
                    style={styles.hubChipText}
                  >
                    📍 {hub.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Coordinate Inputs */}
          <View style={styles.coordsRow}>
            <View style={styles.coordCol}>
              <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
                Base Latitude (°N) *
              </Text>
              <Input
                value={editLat}
                onChangeText={setEditLat}
                placeholder="e.g. 25.2974"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.coordCol}>
              <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
                Base Longitude (°E) *
              </Text>
              <Input
                value={editLng}
                onChangeText={setEditLng}
                placeholder="e.g. 83.0039"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Live Spatial Verification Card */}
          {isFormCoordsValid ? (
            <View style={styles.geoValidCard}>
              <Text variant="captionMedium" color="#15803d">
                ✓ Spatial Anchor Active: Devotees within {editRadius || 25} km of ({parsedLat.toFixed(4)}°, {parsedLng.toFixed(4)}°) can book Home Pujas.
              </Text>
            </View>
          ) : (
            <View style={styles.geoWarningCard}>
              <Text variant="captionMedium" color="#b45309">
                ⚠️ Valid geographic coordinates are required to enable PostGIS radius matching.
              </Text>
            </View>
          )}

          {/* Service Radius */}
          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Operating Radius (Kilometers) *
          </Text>
          <Input
            value={editRadius}
            onChangeText={setEditRadius}
            placeholder="25"
            keyboardType="numeric"
          />

          {/* Form Action Buttons */}
          <View style={styles.formActions}>
            {isConfigured && (
              <TouchableOpacity
                onPress={() => {
                  setIsEditing(false);
                  setErrorMsg(null);
                }}
                style={styles.cancelBtn}
              >
                <Text variant="bodyMedium" color={colors.textSecondary}>
                  Cancel
                </Text>
              </TouchableOpacity>
            )}

            <Button
              title={saving ? "Saving Location..." : "Save Service Location"}
              variant="primary"
              size="md"
              onPress={handleSave}
              disabled={saving}
              style={styles.saveBtn}
            />
          </View>
        </Card>
      )}

      {/* Informational Guidance Card */}
      <Card style={styles.infoCard}>
        <Text variant="captionMedium" color={colors.textPrimary} style={styles.infoTitle}>
          Sanctum Spatial Radius Policy
        </Text>
        <Text variant="caption" color={colors.textSecondary} style={styles.infoText}>
          • Home Puja bookings strictly require geodesic distance validation between customer residence coordinates and your service base coordinates.
        </Text>
        <Text variant="caption" color={colors.textSecondary} style={styles.infoText}>
          • Temple Pujas (conducted at sanctified Varanasi shrines) and Remote Live Pujas are not restricted by geographic distance.
        </Text>
        <Text variant="caption" color={colors.textSecondary} style={styles.infoText}>
          • You may update your service location or radius anytime without affecting existing or historical bookings.
        </Text>
      </Card>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  statusCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  badgeActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
  },
  badgeInactive: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: "700",
  },
  badgeTextActive: {
    color: "#059669",
  },
  badgeTextInactive: {
    color: "#b45309",
  },
  configuredInfo: {
    marginTop: spacing.sm,
  },
  activeBannerText: {
    fontWeight: "600",
    marginBottom: 2,
  },
  policyNote: {
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  detailsTable: {
    backgroundColor: colors.background,
    borderRadius: radius.xs,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  monoText: {
    fontFamily: "Courier",
  },
  editBtn: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
  },
  unconfiguredBox: {
    marginTop: spacing.sm,
  },
  unconfiguredText: {
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  setBtn: {
    alignSelf: "flex-start",
  },
  successCard: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorCard: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  formCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  formTitle: {
    marginBottom: 2,
  },
  formSubtitle: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    marginTop: spacing.xs,
    marginBottom: 2,
  },
  hubsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  hubChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  hubChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  hubChipText: {
    fontWeight: "500",
  },
  coordsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  coordCol: {
    flex: 1,
  },
  geoValidCard: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
    borderWidth: 1,
    borderRadius: radius.xs,
    padding: spacing.sm,
    marginVertical: spacing.xs,
  },
  geoWarningCard: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
    borderRadius: radius.xs,
    padding: spacing.sm,
    marginVertical: spacing.xs,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  saveBtn: {
    minWidth: 160,
  },
  infoCard: {
    backgroundColor: "#f8fafc",
    padding: spacing.md,
    marginBottom: spacing.xxl,
    gap: 4,
  },
  infoTitle: {
    marginBottom: 2,
  },
  infoText: {
    lineHeight: 18,
  },
});

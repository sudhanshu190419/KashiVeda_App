// src/features/pandit/screens/PanditServiceLocationScreen.tsx
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Button, Card, Header, Input, LoadingState, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
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
  const { isDark, colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

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
      <ScreenContainer padded style={{ backgroundColor: themeColors.surfaceBase }}>
        <LoadingState message="Connecting to service area registry..." />
      </ScreenContainer>
    );
  }

  const parsedLat = parseFloat(editLat);
  const parsedLng = parseFloat(editLng);
  const isFormCoordsValid = !isNaN(parsedLat) && parsedLat >= -90 && parsedLat <= 90 && !isNaN(parsedLng) && parsedLng >= -180 && parsedLng <= 180;

  return (
    <ScreenContainer scrollable padded style={{ backgroundColor: themeColors.surfaceBase }}>
      <Header
        title="Service Location"
        subtitle="Operational base and PostGIS coverage radius"
        onBack={() => navigation.goBack()}
      />

      {/* Main Status Hero Card */}
      <Card
        variant="elevated"
        style={[
          styles.statusCard,
          {
            backgroundColor: themeColors.surfaceCard,
            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : colors.borderLight,
          },
        ]}
      >
        <View style={styles.statusRow}>
          <View>
            <Text variant="overline" color={isConfigured ? colors.primary : "#b45309"}>
              HOME PUJA COVERAGE STATUS
            </Text>
            <Text variant="h3" color={themeColors.textPrimary}>
              {isConfigured ? "Home Service Configured ✓" : "Home service location not configured"}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              isConfigured
                ? {
                    backgroundColor: isDark ? "rgba(16, 185, 129, 0.2)" : "#ecfdf5",
                    borderColor: isDark ? "rgba(16, 185, 129, 0.4)" : "#a7f3d0",
                  }
                : {
                    backgroundColor: isDark ? "rgba(245, 158, 11, 0.2)" : "#fffbeb",
                    borderColor: isDark ? "rgba(245, 158, 11, 0.4)" : "#fde68a",
                  },
            ]}
          >
            <Text
              variant="caption"
              style={[
                styles.badgeText,
                {
                  color: isConfigured ? (colors.success || "#059669") : "#b45309",
                },
              ]}
            >
              {isConfigured ? "CONFIGURED" : "NOT CONFIGURED"}
            </Text>
          </View>
        </View>

        {isConfigured ? (
          <View style={styles.configuredInfo}>
            <Text variant="bodyMedium" color={colors.success || "#15803d"} style={styles.activeBannerText}>
              Home service is active within {currentRadius} km of this location.
            </Text>
            <Text variant="caption" color={themeColors.textMuted} style={styles.policyNote}>
              Your Home Puja service area is calculated from this location and your service radius using PostGIS spatial boundaries.
            </Text>

            <View style={[styles.detailsTable, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : themeColors.surfaceBase }]}>
              <View style={styles.detailRow}>
                <Text variant="caption" color={themeColors.textMuted}>Primary City:</Text>
                <Text variant="bodyMedium" color={themeColors.textPrimary}>{currentCity}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text variant="caption" color={themeColors.textMuted}>Coordinates:</Text>
                <Text variant="bodyMedium" color={themeColors.textPrimary} style={styles.monoText}>
                  {currentLat != null ? currentLat.toFixed(6) : "—"}°N, {currentLng != null ? currentLng.toFixed(6) : "—"}°E
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text variant="caption" color={themeColors.textMuted}>Coverage Radius:</Text>
                <Text variant="bodyMedium" color={themeColors.textPrimary}>{currentRadius} km</Text>
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
            <Text variant="body" color={themeColors.textMuted} style={styles.unconfiguredText}>
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
        <Card
          style={[
            styles.successCard,
            {
              backgroundColor: isDark ? "rgba(16, 185, 129, 0.15)" : "#f0fdf4",
              borderColor: isDark ? "rgba(16, 185, 129, 0.3)" : "#86efac",
            },
          ]}
        >
          <Text variant="captionMedium" color={colors.success || "#15803d"}>
            ✓ {successMsg}
          </Text>
        </Card>
      ) : null}

      {errorMsg ? (
        <Card
          style={[
            styles.errorCard,
            {
              backgroundColor: isDark ? "rgba(239, 68, 68, 0.15)" : "#fef2f2",
              borderColor: isDark ? "rgba(239, 68, 68, 0.3)" : "#fecaca",
            },
          ]}
        >
          <Text variant="captionMedium" color={colors.error || "#EF4444"}>
            ⚠️ {errorMsg}
          </Text>
        </Card>
      ) : null}

      {isEditing && (
        <Card
          variant="elevated"
          style={[
            styles.formCard,
            {
              backgroundColor: themeColors.surfaceCard,
              borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : colors.borderLight,
            },
          ]}
        >
          <Text variant="h3" color={themeColors.textPrimary} style={styles.formTitle}>
            {isConfigured ? "Update Operational Location" : "Configure Operational Location"}
          </Text>
          <Text variant="caption" color={themeColors.textMuted} style={styles.formSubtitle}>
            Select a sacred landmark preset or enter exact coordinates to anchor your PostGIS delivery radius.
          </Text>

          {/* Primary City */}
          <Text variant="caption" color={themeColors.textMuted} style={styles.fieldLabel}>
            Primary Service City *
          </Text>
          <Input
            value={editCity}
            onChangeText={setEditCity}
            placeholder="e.g. Varanasi"
          />

          {/* Base Address */}
          <Text variant="caption" color={themeColors.textMuted} style={styles.fieldLabel}>
            Service Base Location / Locality Address
          </Text>
          <Input
            value={editAddress}
            onChangeText={setEditAddress}
            placeholder="e.g. Assi Ghat Road, Bhelupur, Varanasi"
          />

          {/* Sacred Hub Quick Presets */}
          <Text variant="caption" color={themeColors.textMuted} style={styles.fieldLabel}>
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
                  style={[
                    styles.hubChip,
                    {
                      backgroundColor: isSelected
                        ? colors.primary
                        : isDark
                        ? "rgba(255, 255, 255, 0.08)"
                        : "#f1f5f9",
                      borderColor: isSelected ? colors.primary : (isDark ? "rgba(255, 255, 255, 0.1)" : colors.borderLight),
                    },
                  ]}
                  onPress={() => handleSelectHub(hub)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Select hub ${hub.name}`}
                >
                  <Text
                    variant="caption"
                    color={isSelected ? "#FFFFFF" : themeColors.textPrimary}
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
              <Text variant="caption" color={themeColors.textMuted} style={styles.fieldLabel}>
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
              <Text variant="caption" color={themeColors.textMuted} style={styles.fieldLabel}>
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
            <View
              style={[
                styles.geoValidCard,
                {
                  backgroundColor: isDark ? "rgba(16, 185, 129, 0.15)" : "#f0fdf4",
                  borderColor: isDark ? "rgba(16, 185, 129, 0.3)" : "#86efac",
                },
              ]}
            >
              <Text variant="captionMedium" color={colors.success || "#15803d"}>
                ✓ Spatial Anchor Active: Devotees within {editRadius || 25} km of ({parsedLat.toFixed(4)}°, {parsedLng.toFixed(4)}°) can book Home Pujas.
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.geoWarningCard,
                {
                  backgroundColor: isDark ? "rgba(180, 83, 9, 0.15)" : "#fffbeb",
                  borderColor: isDark ? "rgba(245, 158, 11, 0.3)" : "#fde68a",
                },
              ]}
            >
              <Text variant="captionMedium" color="#b45309">
                ⚠️ Valid geographic coordinates are required to enable PostGIS radius matching.
              </Text>
            </View>
          )}

          {/* Service Radius */}
          <Text variant="caption" color={themeColors.textMuted} style={styles.fieldLabel}>
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
                accessibilityRole="button"
                accessibilityLabel="Cancel editing location"
              >
                <Text variant="bodyMedium" color={themeColors.textMuted}>
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
      <Card
        style={[
          styles.infoCard,
          {
            backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#f8fafc",
            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : colors.borderLight,
          },
        ]}
      >
        <Text variant="captionMedium" color={themeColors.textPrimary} style={styles.infoTitle}>
          Sanctum Spatial Radius Policy
        </Text>
        <Text variant="caption" color={themeColors.textMuted} style={styles.infoText}>
          • Home Puja bookings strictly require geodesic distance validation between customer residence coordinates and your service base coordinates.
        </Text>
        <Text variant="caption" color={themeColors.textMuted} style={styles.infoText}>
          • Temple Pujas (conducted at sanctified Varanasi shrines) and Remote Live Pujas are not restricted by geographic distance.
        </Text>
        <Text variant="caption" color={themeColors.textMuted} style={styles.infoText}>
          • You may update your service location or radius anytime without affecting existing or historical bookings.
        </Text>
      </Card>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  statusCard: {
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 10,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: "700",
  },
  configuredInfo: {
    marginTop: 12,
  },
  activeBannerText: {
    fontWeight: "600",
    marginBottom: 4,
  },
  policyNote: {
    lineHeight: 18,
    marginBottom: 12,
  },
  detailsTable: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    gap: 8,
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
    marginTop: 8,
    minHeight: 48,
  },
  unconfiguredBox: {
    marginTop: 12,
  },
  unconfiguredText: {
    lineHeight: 20,
    marginBottom: 14,
  },
  setBtn: {
    alignSelf: "flex-start",
    minHeight: 48,
  },
  successCard: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
    borderRadius: 8,
  },
  errorCard: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
    borderRadius: 8,
  },
  formCard: {
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 10,
  },
  formTitle: {
    marginBottom: 4,
  },
  formSubtitle: {
    marginBottom: 12,
  },
  fieldLabel: {
    marginTop: 10,
    marginBottom: 4,
  },
  hubsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 10,
  },
  hubChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
  },
  hubChipText: {
    fontWeight: "500",
  },
  coordsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  coordCol: {
    flex: 1,
  },
  geoValidCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
  },
  geoWarningCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  saveBtn: {
    minWidth: 160,
    minHeight: 48,
  },
  infoCard: {
    padding: 16,
    marginBottom: 32,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
  },
  infoTitle: {
    marginBottom: 4,
  },
  infoText: {
    lineHeight: 18,
  },
});

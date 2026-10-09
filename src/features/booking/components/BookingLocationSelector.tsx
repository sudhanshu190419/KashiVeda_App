// src/features/booking/components/BookingLocationSelector.tsx
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { Button, Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { ServiceMode } from "../../discovery/types/discovery.ts";
import { bookingService } from "../services/bookingService.ts";
import { CustomerAddress, Temple } from "../types/booking.types.ts";

interface BookingLocationSelectorProps {
  serviceMode: ServiceMode;
  selectedAddress: CustomerAddress | null;
  onSelectAddress: (address: CustomerAddress) => void;
  selectedTemple: Temple | null;
  onSelectTemple: (temple: Temple) => void;
}

export const BookingLocationSelector: React.FC<BookingLocationSelectorProps> = ({
  serviceMode,
  selectedAddress,
  onSelectAddress,
  selectedTemple,
  onSelectTemple,
}) => {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [temples, setTemples] = useState<Temple[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // Simple Add Address form state
  const [label, setLabel] = useState<string>("Home");
  const [addressLine1, setAddressLine1] = useState<string>("");
  const [addressLine2, setAddressLine2] = useState<string>("");
  const [city, setCity] = useState<string>("Varanasi");
  const [state] = useState<string>("Uttar Pradesh");
  const [pincode, setPincode] = useState<string>("221001");
  const [savingAddress, setSavingAddress] = useState<boolean>(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    if (serviceMode === "home") {
      bookingService
        .fetchCustomerAddresses()
        .then((res) => {
          if (isMounted) {
            setAddresses(res);
            if (res.length > 0 && !selectedAddress) {
              const defaultAddr = res.find((a) => a.is_default) || res[0];
              onSelectAddress(defaultAddr);
            }
          }
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else if (serviceMode === "temple") {
      bookingService
        .fetchTemples()
        .then((res) => {
          if (isMounted) {
            setTemples(res);
            if (res.length > 0 && !selectedTemple) {
              onSelectTemple(res[0]);
            }
          }
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [serviceMode, onSelectAddress, onSelectTemple, selectedAddress, selectedTemple]);

  const handleSaveNewAddress = async () => {
    if (!addressLine1.trim()) {
      setAddressError("Address line is required.");
      return;
    }
    if (!city.trim()) {
      setAddressError("City is required.");
      return;
    }

    setSavingAddress(true);
    setAddressError(null);

    try {
      const newAddr = await bookingService.saveCustomerAddress({
        label: label.trim() || "Residence",
        address_line1: addressLine1.trim(),
        address_line2: addressLine2.trim() || undefined,
        city: city.trim(),
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
        latitude: 25.3176, // Varanasi center coordinates fallback
        longitude: 82.9739,
        is_default: addresses.length === 0,
      });

      setAddresses((prev) => [newAddr, ...prev]);
      onSelectAddress(newAddr);
      setShowAddForm(false);
      setAddressLine1("");
      setAddressLine2("");
    } catch (err: any) {
      setAddressError(err?.message || "Failed to save address.");
    } finally {
      setSavingAddress(false);
    }
  };

  if (serviceMode === "remote") {
    return (
      <View style={styles.container}>
        <Text variant="h3" style={styles.title}>
          Ritual Location
        </Text>
        <Card variant="elevated" style={styles.remoteCard}>
          <Text style={styles.remoteIcon}>🌐</Text>
          <Text variant="h3" style={styles.remoteTitle}>
            Live Remote Vedic Sanctum
          </Text>
          <Text variant="body" color={colors.textSecondary} style={styles.remoteDesc}>
            No physical location required. A private, encrypted 1-on-1 HD live video room will be generated on LiveKit Cloud for you and the Acharya.
          </Text>
          <View style={styles.remoteBadge}>
            <Text variant="captionMedium" color={colors.primary}>
              ✨ Live Video Room (15 mins prior to start)
            </Text>
          </View>
        </Card>
      </View>
    );
  }

  if (serviceMode === "temple") {
    return (
      <View style={styles.container}>
        <Text variant="h3" style={styles.title}>
          Select Consecrated Temple
        </Text>
        <Text variant="caption" color={colors.textSecondary} style={styles.subtitle}>
          Choose the sacred temple where your sankalp will be invoked.
        </Text>

        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
        ) : (
          <View style={styles.list}>
            {temples.map((temple) => {
              const isSelected = selectedTemple?.id === temple.id;
              return (
                <TouchableOpacity
                  key={temple.id}
                  onPress={() => onSelectTemple(temple)}
                  activeOpacity={0.7}
                >
                  <Card
                    variant={isSelected ? "elevated" : "outlined"}
                    style={[styles.itemCard, isSelected && styles.itemCardSelected]}
                  >
                    <View style={styles.row}>
                      <Text style={styles.templeIcon}>🏛️</Text>
                      <View style={styles.info}>
                        <Text variant="bodyMedium">{temple.name}</Text>
                        <Text variant="caption" color={colors.textSecondary}>
                          {temple.address || temple.city || "Varanasi"}
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
        )}
      </View>
    );
  }

  // Home service mode
  return (
    <View style={styles.container}>
      <Text variant="h3" style={styles.title}>
        Select Home Address
      </Text>
      <Text variant="caption" color={colors.textSecondary} style={styles.subtitle}>
        The Pandit will arrive with complete puja samagri at this residence.
      </Text>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
      ) : showAddForm ? (
        <Card style={styles.addFormCard}>
          <Text variant="h3" style={styles.formTitle}>
            Add New Address
          </Text>

          {addressError ? (
            <Text variant="caption" color={colors.error} style={styles.errorText}>
              {addressError}
            </Text>
          ) : null}

          <TextInput
            placeholder="Address Label (e.g. Home, Ancestral Residence)"
            value={label}
            onChangeText={setLabel}
            style={styles.input}
            placeholderTextColor={colors.textTertiary}
          />
          <TextInput
            placeholder="House / Flat No., Building / Street Name *"
            value={addressLine1}
            onChangeText={setAddressLine1}
            style={styles.input}
            placeholderTextColor={colors.textTertiary}
          />
          <TextInput
            placeholder="Landmark / Locality (Optional)"
            value={addressLine2}
            onChangeText={setAddressLine2}
            style={styles.input}
            placeholderTextColor={colors.textTertiary}
          />
          <View style={styles.inputRow}>
            <TextInput
              placeholder="City *"
              value={city}
              onChangeText={setCity}
              style={[styles.input, styles.halfInput]}
              placeholderTextColor={colors.textTertiary}
            />
            <TextInput
              placeholder="Pincode"
              value={pincode}
              onChangeText={setPincode}
              keyboardType="number-pad"
              style={[styles.input, styles.halfInput]}
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.formActions}>
            <Button
              title="Cancel"
              variant="outline"
              size="sm"
              onPress={() => setShowAddForm(false)}
            />
            <Button
              title={savingAddress ? "Saving..." : "Save & Use"}
              variant="primary"
              size="sm"
              disabled={savingAddress}
              onPress={handleSaveNewAddress}
            />
          </View>
        </Card>
      ) : (
        <View style={styles.list}>
          {addresses.map((addr) => {
            const isSelected = selectedAddress?.id === addr.id;
            return (
              <TouchableOpacity
                key={addr.id}
                onPress={() => onSelectAddress(addr)}
                activeOpacity={0.7}
              >
                <Card
                  variant={isSelected ? "elevated" : "outlined"}
                  style={[styles.itemCard, isSelected && styles.itemCardSelected]}
                >
                  <View style={styles.row}>
                    <View style={styles.info}>
                      <View style={styles.labelRow}>
                        <Text variant="bodyMedium">{addr.label}</Text>
                        {addr.is_default && (
                          <View style={styles.defaultBadge}>
                            <Text variant="caption" color={colors.primary}>
                              Default
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text variant="caption" color={colors.textSecondary} style={styles.addrText}>
                        {addr.address_line1}
                        {addr.address_line2 ? `, ${addr.address_line2}` : ""}
                        {`, ${addr.city} - ${addr.pincode || ""}`}
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

          <Button
            title="+ Add New Residence Address"
            variant="secondary"
            size="sm"
            onPress={() => setShowAddForm(true)}
            style={styles.addBtn}
          />
        </View>
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
  loader: {
    paddingVertical: spacing.lg,
  },
  list: {
    gap: spacing.sm,
  },
  itemCard: {
    padding: spacing.md,
  },
  itemCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: "#FFF8F6",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  templeIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
    marginRight: spacing.sm,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  defaultBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  addrText: {
    marginTop: spacing.xxs,
    lineHeight: 18,
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
  addBtn: {
    marginTop: spacing.xs,
    alignSelf: "flex-start",
  },
  addFormCard: {
    padding: spacing.md,
  },
  formTitle: {
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  halfInput: {
    flex: 1,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  errorText: {
    marginBottom: spacing.xs,
  },
  remoteCard: {
    padding: spacing.lg,
    alignItems: "center",
  },
  remoteIcon: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  remoteTitle: {
    marginBottom: spacing.xs,
  },
  remoteDesc: {
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  remoteBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
});

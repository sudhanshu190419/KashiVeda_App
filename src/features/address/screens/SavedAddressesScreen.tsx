// src/features/address/screens/SavedAddressesScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  VButton,
  VBadge,
  VInput,
  Ionicons,
  LoadingState,
} from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerAddress } from "../../booking/types/booking.types.ts";
import { addressService } from "../services/addressService.ts";

const ADDRESS_LABELS = [
  { key: "home", en: "Home", hi: "घर", icon: "home-outline" },
  { key: "office", en: "Office", hi: "कार्यालय", icon: "business-outline" },
  { key: "temple", en: "Temple", hi: "मंदिर", icon: "location-outline" },
  { key: "parents", en: "Parents", hi: "माता-पिता", icon: "people-outline" },
  { key: "other", en: "Other", hi: "अन्य", icon: "bookmark-outline" },
] as const;

export const SavedAddressesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors, spacing, radii } = useTheme();
  const { language, pick } = useLanguage();
  const isHi = language === "hi";

  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>("home");
  const [addressLine1, setAddressLine1] = useState<string>("");
  const [addressLine2, setAddressLine2] = useState<string>("");
  const [city, setCity] = useState<string>("Varanasi");
  const [stateName, setStateName] = useState<string>("Uttar Pradesh");
  const [pincode, setPincode] = useState<string>("");
  const [isDefault, setIsDefault] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    try {
      setLoading(true);
      const data = await addressService.fetchAddresses();
      setAddresses(data);
    } catch (err: any) {
      Alert.alert(
        pick("त्रुटि", "Error"),
        err?.message || pick("पते लोड करने में विफल।", "Failed to load addresses.")
      );
    } finally {
      setLoading(false);
    }
  }, [pick]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const resetForm = () => {
    setEditingId(null);
    setSelectedLabel("home");
    setAddressLine1("");
    setAddressLine2("");
    setCity("Varanasi");
    setStateName("Uttar Pradesh");
    setPincode("");
    setIsDefault(addresses.length === 0);
    setFormError(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleOpenEdit = (addr: CustomerAddress) => {
    setEditingId(addr.id);
    const matchedLabel = ADDRESS_LABELS.find(
      (l) => l.en.toLowerCase() === addr.label.toLowerCase() || l.key === addr.label.toLowerCase()
    );
    setSelectedLabel(matchedLabel ? matchedLabel.key : "other");
    setAddressLine1(addr.address_line1);
    setAddressLine2(addr.address_line2 || "");
    setCity(addr.city);
    setStateName(addr.state || "Uttar Pradesh");
    setPincode(addr.pincode || "");
    setIsDefault(addr.is_default);
    setFormError(null);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!addressLine1.trim()) {
      setFormError(pick("कृपया भवन/फ्लैट विवरण दर्ज करें।", "Please enter flat / house details."));
      return;
    }
    if (!city.trim()) {
      setFormError(pick("कृपया शहर दर्ज करें।", "Please enter city."));
      return;
    }
    if (!pincode.trim() || pincode.trim().length !== 6) {
      setFormError(pick("कृपया मान्य 6-अंकीय पिनकोड दर्ज करें।", "Please enter a valid 6-digit pincode."));
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      const labelObj = ADDRESS_LABELS.find((l) => l.key === selectedLabel);
      const labelText = labelObj ? (isHi ? labelObj.hi : labelObj.en) : selectedLabel;

      if (editingId) {
        await addressService.updateAddress(editingId, {
          label: labelText,
          address_line1: addressLine1.trim(),
          address_line2: addressLine2.trim() || undefined,
          city: city.trim(),
          state: stateName.trim() || undefined,
          pincode: pincode.trim(),
          is_default: isDefault,
        });
      } else {
        await addressService.saveAddress({
          label: labelText,
          address_line1: addressLine1.trim(),
          address_line2: addressLine2.trim() || undefined,
          city: city.trim(),
          state: stateName.trim() || undefined,
          pincode: pincode.trim(),
          is_default: isDefault || addresses.length === 0,
        });
      }

      setModalVisible(false);
      await loadAddresses();
    } catch (err: any) {
      setFormError(err?.message || pick("पता सुरक्षित नहीं हो सका।", "Could not save address."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (addr: CustomerAddress) => {
    Alert.alert(
      pick("पता हटाएं", "Delete Address"),
      pick("क्या आप इस पते को हटाना चाहते हैं?", "Are you sure you want to delete this address?"),
      [
        { text: pick("रद्द करें", "Cancel"), style: "cancel" },
        {
          text: pick("हटाएं", "Delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await addressService.deleteAddress(addr.id);
              await loadAddresses();
            } catch (err: any) {
              Alert.alert(
                pick("त्रुटि", "Error"),
                err?.message || pick("पता नहीं हटाया जा सका।", "Failed to delete address.")
              );
            }
          },
        },
      ]
    );
  };

  const handleSetDefault = async (addr: CustomerAddress) => {
    try {
      await addressService.setDefaultAddress(addr.id);
      await loadAddresses();
    } catch (err: any) {
      Alert.alert(
        pick("त्रुटि", "Error"),
        err?.message || pick("प्राथमिक पता निर्धारित नहीं हो सका।", "Failed to set default address.")
      );
    }
  };

  return (
    <ScreenWrapper scrollable background="surfaceBase">
      <AppBar
        title={pick("सहेजे गए पते", "Saved Addresses")}
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        locationBadge={pick("वाराणसी", "Varanasi")}
      />

      <View style={[styles.container, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
        {/* Top Header & Add Action */}
        <View style={styles.topBar}>
          <VText variant="caption" color={colors.textMuted}>
            {pick(
              `${addresses.length} पते सुरक्षित`,
              `${addresses.length} saved location${addresses.length === 1 ? "" : "s"}`
            )}
          </VText>
          <VButton
            label={pick("+ नया पता", "+ Add Address")}
            variant="primary"
            size="sm"
            onPress={handleOpenAdd}
          />
        </View>

        {loading ? (
          <LoadingState message={pick("पते लोड हो रहे हैं...", "Loading addresses...")} />
        ) : addresses.length === 0 ? (
          <VCard elevation={1} style={styles.emptyCard}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceSubtle }]}>
              <Ionicons name="location-outline" size={32} color={colors.brandPrimary} />
            </View>
            <VText variant="titleMedium" style={styles.emptyTitle}>
              {pick("कोई सहेजा गया पता नहीं", "No Saved Addresses")}
            </VText>
            <VText variant="caption" color={colors.textMuted} style={styles.emptyDesc}>
              {pick(
                "घर पर वैदिक अनुष्ठान और प्रसाद वितरण हेतु अपना पता जोड़ें।",
                "Add your home or temple delivery address for doorstep Vedic rituals and sacred Prasad."
              )}
            </VText>
            <VButton
              label={pick("पहला पता जोड़ें", "Add First Address")}
              variant="primary"
              size="md"
              onPress={handleOpenAdd}
              style={styles.emptyButton}
            />
          </VCard>
        ) : (
          addresses.map((addr) => {
            const isHome = addr.label.toLowerCase().includes("home") || addr.label.includes("घर");
            const isOffice = addr.label.toLowerCase().includes("office") || addr.label.includes("कार्यालय");
            const isTemple = addr.label.toLowerCase().includes("temple") || addr.label.includes("मंदिर");

            const iconName = isHome
              ? "home-outline"
              : isOffice
              ? "business-outline"
              : isTemple
              ? "location-outline"
              : "bookmark-outline";

            return (
              <VCard
                key={addr.id}
                elevation={1}
                style={[
                  styles.addressCard,
                  addr.is_default && { borderColor: colors.brandPrimary, borderWidth: 1 },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.labelRow}>
                    <Ionicons
                      name={iconName}
                      size={18}
                      color={colors.brandPrimary}
                      style={{ marginRight: 6 }}
                    />
                    <VText variant="titleSmall" style={{ fontWeight: "700" }}>
                      {addr.label}
                    </VText>
                    {addr.is_default && (
                      <VBadge
                        variant="status"
                        color="brand"
                        label={pick("प्राथमिक", "Default")}
                        style={styles.defaultBadge}
                      />
                    )}
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => handleOpenEdit(addr)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.actionBtn}
                      accessibilityLabel={pick("संपादित करें", "Edit")}
                    >
                      <Ionicons name="create-outline" size={18} color={colors.textMuted} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(addr)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.actionBtn}
                      accessibilityLabel={pick("हटाएं", "Delete")}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.statusAlert} />
                    </Pressable>
                  </View>
                </View>

                <VText variant="bodyMedium" style={styles.addressLine}>
                  {addr.address_line1}
                </VText>
                {addr.address_line2 ? (
                  <VText variant="caption" color={colors.textMuted} style={styles.addressLineSub}>
                    {addr.address_line2}
                  </VText>
                ) : null}

                <VText variant="caption" color={colors.textMuted} style={styles.addressGeo}>
                  {`${addr.city}${addr.state ? `, ${addr.state}` : ""} - ${addr.pincode || ""}`}
                </VText>

                {!addr.is_default && (
                  <View style={styles.cardFooter}>
                    <Pressable
                      onPress={() => handleSetDefault(addr)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <VText variant="labelMedium" color={colors.brandPrimary} style={{ fontWeight: "600" }}>
                        {pick("प्राथमिक पता बनाएं >", "Set as Default >")}
                      </VText>
                    </Pressable>
                  </View>
                )}
              </VCard>
            );
          })
        )}
      </View>

      {/* Address Form Bottom Sheet Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setModalVisible(false)} />
          <View style={[styles.modalSheet, { backgroundColor: colors.surfaceCard, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <View style={styles.dragHandle} />

            <View style={styles.modalHeader}>
              <VText variant="titleMedium" style={{ fontWeight: "700" }}>
                {editingId
                  ? pick("पता संपादित करें", "Edit Address")
                  : pick("नया पता जोड़ें", "Add New Address")}
              </VText>
              <Pressable
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
              {formError && (
                <View style={[styles.errorBox, { backgroundColor: colors.errorBg, borderColor: colors.statusAlert }]}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.statusAlert} style={{ marginRight: 6 }} />
                  <VText variant="caption" color={colors.statusAlert} style={{ flex: 1 }}>
                    {formError}
                  </VText>
                </View>
              )}

              {/* Label Chips */}
              <VText variant="labelMedium" style={styles.fieldLabel}>
                {pick("पते का प्रकार", "Address Type")}
              </VText>
              <View style={styles.chipRow}>
                {ADDRESS_LABELS.map((item) => {
                  const isSelected = selectedLabel === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setSelectedLabel(item.key)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected ? colors.surfaceSubtle : colors.surfaceCard,
                          borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                        },
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={14}
                        color={isSelected ? colors.brandPrimary : colors.textMuted}
                        style={{ marginRight: 4 }}
                      />
                      <VText
                        variant="caption"
                        color={isSelected ? colors.brandPrimary : colors.textPrimary}
                        style={{ fontWeight: isSelected ? "700" : "500" }}
                      >
                        {isHi ? item.hi : item.en}
                      </VText>
                    </Pressable>
                  );
                })}
              </View>

              <VInput
                label={pick("भवन / फ़्लैट संख्या / परिसर *", "Flat / House No. / Building *")}
                placeholder={pick("उदा. बी-402, गंगा हाइट्स", "e.g. B-402, Ganga Heights")}
                value={addressLine1}
                onChangeText={setAddressLine1}
                containerStyle={styles.inputSpacing}
              />

              <VInput
                label={pick("गली / क्षेत्र / निकटतम स्थल", "Street / Area / Landmark")}
                placeholder={pick("उदा. अस्सी घाट रोड, तुलसी मंदिर के पास", "e.g. Assi Ghat Road, Near Tulsi Mandir")}
                value={addressLine2}
                onChangeText={setAddressLine2}
                containerStyle={styles.inputSpacing}
              />

              <View style={styles.twoCol}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <VInput
                    label={pick("शहर *", "City *")}
                    placeholder={pick("वाराणसी", "Varanasi")}
                    value={city}
                    onChangeText={setCity}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <VInput
                    label={pick("पिनकोड *", "Pincode *")}
                    placeholder="221005"
                    value={pincode}
                    onChangeText={setPincode}
                    keyboardType="numeric"
                    maxLength={6}
                  />
                </View>
              </View>

              <VInput
                label={pick("राज्य *", "State *")}
                placeholder={pick("उत्तर प्रदेश", "Uttar Pradesh")}
                value={stateName}
                onChangeText={setStateName}
                containerStyle={styles.inputSpacing}
              />

              {/* Set as Default Toggle */}
              <View style={[styles.defaultToggleRow, { backgroundColor: colors.surfaceSubtle }]}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <VText variant="labelMedium" style={{ fontWeight: "600" }}>
                    {pick("प्राथमिक पता निर्धारित करें", "Set as Default Address")}
                  </VText>
                  <VText variant="caption" color={colors.textMuted}>
                    {pick(
                      "सभी आगामी अनुष्ठानों के लिए स्वतः उपयोग होगा।",
                      "Used automatically for future home rituals."
                    )}
                  </VText>
                </View>
                <Switch
                  value={isDefault}
                  onValueChange={setIsDefault}
                  trackColor={{ false: colors.borderDefault, true: colors.brandPrimary }}
                  thumbColor={colors.surfaceCard}
                />
              </View>

              <VButton
                label={
                  editingId
                    ? pick("परिवर्तन सुरक्षित करें", "Save Changes")
                    : pick("पता सुरक्षित करें", "Save Address")
                }
                variant="primary"
                size="md"
                onPress={handleSave}
                loading={submitting}
                disabled={submitting}
                style={styles.saveBtn}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 32,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  addressCard: {
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  defaultBadge: {
    marginLeft: 8,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionBtn: {
    padding: 4,
  },
  addressLine: {
    fontWeight: "600",
    marginBottom: 2,
  },
  addressLineSub: {
    marginBottom: 4,
  },
  addressGeo: {
    marginTop: 4,
  },
  cardFooter: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  emptyCard: {
    padding: 24,
    alignItems: "center",
    marginTop: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  emptyDesc: {
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 18,
    maxWidth: 280,
  },
  emptyButton: {
    minWidth: 180,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    maxHeight: "85%",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignSelf: "center",
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  formScroll: {
    paddingBottom: 16,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  fieldLabel: {
    fontWeight: "600",
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  inputSpacing: {
    marginBottom: 12,
  },
  twoCol: {
    flexDirection: "row",
    marginBottom: 12,
  },
  defaultToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    marginTop: 6,
    marginBottom: 18,
  },
  saveBtn: {
    marginTop: 6,
  },
});

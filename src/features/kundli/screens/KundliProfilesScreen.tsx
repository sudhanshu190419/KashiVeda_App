// src/features/kundli/screens/KundliProfilesScreen.tsx
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
  VAvatar,
  VInput,
  Ionicons,
  LoadingState,
} from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { useAuth } from "../../auth/AuthContext.tsx";
import {
  KundliProfile,
  KundliRelation,
} from "../types/kundliProfile.types.ts";
import { kundliProfileService } from "../services/kundliProfileService.ts";

const RELATIONS: { key: KundliRelation; en: string; hi: string }[] = [
  { key: "self", en: "Self", hi: "स्वयं" },
  { key: "spouse", en: "Spouse", hi: "जीवनसाथी" },
  { key: "son", en: "Son", hi: "पुत्र" },
  { key: "daughter", en: "Daughter", hi: "पुत्री" },
  { key: "father", en: "Father", hi: "पिता" },
  { key: "mother", en: "Mother", hi: "माता" },
  { key: "brother", en: "Brother", hi: "भाई" },
  { key: "sister", en: "Sister", hi: "बहन" },
  { key: "other", en: "Other", hi: "अन्य" },
];

const GOTRA_LIST = [
  { en: "Kashyapa", hi: "कश्यप" },
  { en: "Bharadwaja", hi: "भारद्वाज" },
  { en: "Vashistha", hi: "वशिष्ठ" },
  { en: "Shandilya", hi: "शांडिल्य" },
  { en: "Garg", hi: "गर्ग" },
  { en: "Kaushika", hi: "कौशिक" },
  { en: "Parashara", hi: "पराशर" },
  { en: "Jamadagni", hi: "जमदग्नि" },
  { en: "Gautama", hi: "गौतम" },
  { en: "Other", hi: "अन्य / ज्ञात नहीं" },
];

const RASHI_LIST = [
  { en: "Aries (Mesh)", hi: "मेष" },
  { en: "Taurus (Vrishabha)", hi: "वृषभ" },
  { en: "Gemini (Mithuna)", hi: "मिथुन" },
  { en: "Cancer (Kark)", hi: "कर्क" },
  { en: "Leo (Simha)", hi: "सिंह" },
  { en: "Virgo (Kanya)", hi: "कन्या" },
  { en: "Libra (Tula)", hi: "तुला" },
  { en: "Scorpio (Vrishchik)", hi: "वृश्चिक" },
  { en: "Sagittarius (Dhanu)", hi: "धनु" },
  { en: "Capricorn (Makar)", hi: "मकर" },
  { en: "Aquarius (Kumbh)", hi: "कुम्भ" },
  { en: "Pisces (Meen)", hi: "मीन" },
];

export const KundliProfilesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors, spacing, radii } = useTheme();
  const { language, pick } = useLanguage();
  const isHi = language === "hi";
  const { user } = useAuth();

  const [profiles, setProfiles] = useState<KundliProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [relation, setRelation] = useState<KundliRelation>("self");
  const [dob, setDob] = useState<string>("");
  const [tob, setTob] = useState<string>("");
  const [timeUnknown, setTimeUnknown] = useState<boolean>(false);
  const [placeOfBirth, setPlaceOfBirth] = useState<string>("");
  const [gotra, setGotra] = useState<string>("");
  const [rashi, setRashi] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const userId = user?.id || "guest_user";

  const loadProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await kundliProfileService.fetchProfiles(userId);
      setProfiles(data);
    } catch (err: any) {
      Alert.alert(
        pick("त्रुटि", "Error"),
        err?.message || pick("प्रोफाइल लोड करने में विफल।", "Failed to load profiles.")
      );
    } finally {
      setLoading(false);
    }
  }, [userId, pick]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setRelation("self");
    setDob("");
    setTob("");
    setTimeUnknown(false);
    setPlaceOfBirth("Varanasi, Uttar Pradesh");
    setGotra(isHi ? "कश्यप" : "Kashyapa");
    setRashi("");
    setFormError(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleOpenEdit = (p: KundliProfile) => {
    setEditingId(p.id);
    setName(p.name);
    setRelation(p.relation);
    setDob(p.dateOfBirth);
    setTob(p.timeOfBirth || "");
    setTimeUnknown(!!p.timeUnknown);
    setPlaceOfBirth(p.placeOfBirth);
    setGotra(p.gotra || "");
    setRashi(p.rashi || "");
    setFormError(null);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setFormError(pick("कृपया भक्त / सदस्य का नाम दर्ज करें।", "Please enter member name."));
      return;
    }
    if (!dob.trim()) {
      setFormError(pick("कृपया जन्म तिथि दर्ज करें (YYYY-MM-DD)।", "Please enter date of birth (YYYY-MM-DD)."));
      return;
    }
    if (!timeUnknown && !tob.trim()) {
      setFormError(pick("कृपया जन्म समय दर्ज करें या 'समय ज्ञात नहीं' चुनें।", "Please enter birth time or toggle 'Time Unknown'."));
      return;
    }
    if (!placeOfBirth.trim()) {
      setFormError(pick("कृपया जन्म स्थान दर्ज करें।", "Please enter place of birth."));
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      const profilePayload = {
        name: name.trim(),
        relation,
        dateOfBirth: dob.trim(),
        timeOfBirth: timeUnknown ? undefined : tob.trim(),
        timeUnknown,
        placeOfBirth: placeOfBirth.trim(),
        gotra: gotra.trim() || undefined,
        rashi: rashi.trim() || undefined,
      };

      if (editingId) {
        await kundliProfileService.updateProfile(userId, editingId, profilePayload);
      } else {
        await kundliProfileService.saveProfile(userId, profilePayload);
      }

      setModalVisible(false);
      await loadProfiles();
    } catch (err: any) {
      setFormError(err?.message || pick("प्रोफाइल सुरक्षित नहीं हो सकी।", "Could not save profile."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (p: KundliProfile) => {
    Alert.alert(
      pick("प्रोफाइल हटाएं", "Delete Profile"),
      pick(
        `क्या आप ${p.name} की प्रोफाइल हटाना चाहते हैं?`,
        `Are you sure you want to delete profile for ${p.name}?`
      ),
      [
        { text: pick("रद्द करें", "Cancel"), style: "cancel" },
        {
          text: pick("हटाएं", "Delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await kundliProfileService.deleteProfile(userId, p.id);
              await loadProfiles();
            } catch (err: any) {
              Alert.alert(
                pick("त्रुटि", "Error"),
                err?.message || pick("प्रोफाइल नहीं हटाई जा सकी।", "Failed to delete profile.")
              );
            }
          },
        },
      ]
    );
  };

  const getRelationLabel = (relKey: KundliRelation): string => {
    const found = RELATIONS.find((r) => r.key === relKey);
    return found ? (isHi ? found.hi : found.en) : relKey;
  };

  return (
    <ScreenWrapper scrollable background="surfaceBase">
      <AppBar
        title={pick("कुंडली प्रोफाइल", "Kundli Profiles")}
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        locationBadge={pick("वाराणसी", "Varanasi")}
      />

      <View style={[styles.container, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
        {/* Top Header & Add Action */}
        <View style={styles.topBar}>
          <VText variant="caption" color={colors.textMuted}>
            {pick(
              `${profiles.length} सदस्य सुरक्षित`,
              `${profiles.length} member profile${profiles.length === 1 ? "" : "s"}`
            )}
          </VText>
          <VButton
            label={pick("+ नया सदस्य", "+ Add Member")}
            variant="primary"
            size="sm"
            onPress={handleOpenAdd}
          />
        </View>

        {loading ? (
          <LoadingState message={pick("प्रोफाइल लोड हो रही हैं...", "Loading profiles...")} />
        ) : profiles.length === 0 ? (
          <VCard elevation={1} style={styles.emptyCard}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceSubtle }]}>
              <Ionicons name="sparkles-outline" size={32} color={colors.brandPrimary} />
            </View>
            <VText variant="titleMedium" style={styles.emptyTitle}>
              {pick("कोई कुंडली प्रोफाइल नहीं", "No Kundli Profiles Saved")}
            </VText>
            <VText variant="caption" color={colors.textMuted} style={styles.emptyDesc}>
              {pick(
                "पारिवारिक सदस्यों के जन्म विवरण सुरक्षित करें ताकि संकल्प एवं कुंडली निर्माण शीघ्र हो सके।",
                "Save family birth details to auto-fill authentic Kundli generation and sacred Pandit Sankalps with one tap."
              )}
            </VText>
            <VButton
              label={pick("पहला सदस्य जोड़ें", "Add First Member")}
              variant="primary"
              size="md"
              onPress={handleOpenAdd}
              style={styles.emptyButton}
            />
          </VCard>
        ) : (
          profiles.map((p) => {
            return (
              <VCard key={p.id} elevation={1} style={styles.profileCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.identityRow}>
                    <VAvatar name={p.name} size="md" style={styles.avatar} />
                    <View style={styles.identityTextCol}>
                      <VText variant="titleSmall" style={{ fontWeight: "700" }}>
                        {p.name}
                      </VText>
                      <View style={styles.badgeRow}>
                        <VBadge
                          variant="status"
                          color="brand"
                          label={getRelationLabel(p.relation)}
                          showDot={false}
                          style={styles.relBadge}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => handleOpenEdit(p)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.actionBtn}
                      accessibilityLabel={pick("संपादित करें", "Edit")}
                    >
                      <Ionicons name="create-outline" size={18} color={colors.textMuted} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(p)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.actionBtn}
                      accessibilityLabel={pick("हटाएं", "Delete")}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.statusAlert} />
                    </Pressable>
                  </View>
                </View>

                {/* Astrological Attributes Grid */}
                <View style={[styles.attrGrid, { backgroundColor: colors.surfaceSubtle }]}>
                  <View style={styles.attrCol}>
                    <VText variant="caption" color={colors.textMuted}>
                      {pick("जन्म तिथि व समय", "Birth Date & Time")}
                    </VText>
                    <VText variant="labelMedium" style={{ fontWeight: "600" }}>
                      {`${p.dateOfBirth} • ${p.timeUnknown ? pick("समय अज्ञात", "Time Unknown") : p.timeOfBirth || "—"}`}
                    </VText>
                  </View>

                  <View style={styles.attrCol}>
                    <VText variant="caption" color={colors.textMuted}>
                      {pick("जन्म स्थान", "Place of Birth")}
                    </VText>
                    <VText variant="labelMedium" style={{ fontWeight: "600" }} numberOfLines={1}>
                      {p.placeOfBirth}
                    </VText>
                  </View>

                  {p.gotra ? (
                    <View style={styles.attrCol}>
                      <VText variant="caption" color={colors.textMuted}>
                        {pick("गोत्र", "Gotra")}
                      </VText>
                      <VText variant="labelMedium" style={{ fontWeight: "600" }}>
                        {p.gotra}
                      </VText>
                    </View>
                  ) : null}

                  {p.rashi ? (
                    <View style={styles.attrCol}>
                      <VText variant="caption" color={colors.textMuted}>
                        {pick("जन्म राशि", "Janma Rashi")}
                      </VText>
                      <VText variant="labelMedium" color={colors.brandPrimary} style={{ fontWeight: "600" }}>
                        {p.rashi}
                      </VText>
                    </View>
                  ) : null}
                </View>
              </VCard>
            );
          })
        )}
      </View>

      {/* Profile Form Bottom Sheet Modal */}
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
                  ? pick("सदस्य प्रोफाइल संपादित करें", "Edit Kundli Profile")
                  : pick("नया सदस्य जोड़ें", "Add Member Profile")}
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

              {/* Devotee Legal Name */}
              <VInput
                label={pick("भक्त का पूरा नाम *", "Full Legal Name *")}
                placeholder={pick("उदा. राघव शर्मा", "e.g. Raghav Sharma")}
                value={name}
                onChangeText={setName}
                containerStyle={styles.inputSpacing}
              />

              {/* Relationship Chips */}
              <VText variant="labelMedium" style={styles.fieldLabel}>
                {pick("भक्त से संबंध *", "Relationship to Devotee *")}
              </VText>
              <View style={styles.chipGrid}>
                {RELATIONS.map((r) => {
                  const isSelected = relation === r.key;
                  return (
                    <Pressable
                      key={r.key}
                      onPress={() => setRelation(r.key)}
                      style={[
                        styles.relChip,
                        {
                          backgroundColor: isSelected ? colors.surfaceSubtle : colors.surfaceCard,
                          borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                        },
                      ]}
                    >
                      <VText
                        variant="caption"
                        color={isSelected ? colors.brandPrimary : colors.textPrimary}
                        style={{ fontWeight: isSelected ? "700" : "500", textAlign: "center" }}
                      >
                        {isHi ? r.hi : r.en}
                      </VText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Birth Details: Date & Time */}
              <View style={styles.twoCol}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <VInput
                    label={pick("जन्म तिथि (YYYY-MM-DD) *", "Date of Birth *")}
                    placeholder="1995-05-15"
                    value={dob}
                    onChangeText={setDob}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <VInput
                    label={pick("जन्म समय (HH:mm)", "Time of Birth")}
                    placeholder="08:30"
                    value={tob}
                    onChangeText={setTob}
                    editable={!timeUnknown}
                  />
                </View>
              </View>

              {/* Time Unknown Switch */}
              <View style={[styles.switchRow, { backgroundColor: colors.surfaceSubtle }]}>
                <VText variant="caption" color={colors.textPrimary}>
                  {pick("सटीक जन्म समय ज्ञात नहीं", "Exact birth time unknown")}
                </VText>
                <Switch
                  value={timeUnknown}
                  onValueChange={setTimeUnknown}
                  trackColor={{ false: colors.borderDefault, true: colors.brandPrimary }}
                  thumbColor={colors.surfaceCard}
                />
              </View>

              {/* Place of Birth */}
              <VInput
                label={pick("जन्म स्थान (शहर, राज्य) *", "Place of Birth (City, State) *")}
                placeholder={pick("उदा. वाराणसी, उत्तर प्रदेश", "e.g. Varanasi, Uttar Pradesh")}
                value={placeOfBirth}
                onChangeText={setPlaceOfBirth}
                containerStyle={styles.inputSpacing}
              />

              {/* Gotra Selection */}
              <VText variant="labelMedium" style={styles.fieldLabel}>
                {pick("गोत्र", "Gotra")}
              </VText>
              <View style={styles.chipWrapRow}>
                {GOTRA_LIST.map((g) => {
                  const gText = isHi ? g.hi : g.en;
                  const isSelected = gotra === gText;
                  return (
                    <Pressable
                      key={g.en}
                      onPress={() => setGotra(gText)}
                      style={[
                        styles.smallChip,
                        {
                          backgroundColor: isSelected ? colors.surfaceSubtle : colors.surfaceCard,
                          borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                        },
                      ]}
                    >
                      <VText
                        variant="caption"
                        color={isSelected ? colors.brandPrimary : colors.textPrimary}
                        style={{ fontWeight: isSelected ? "700" : "500" }}
                      >
                        {gText}
                      </VText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Janma Rashi Selection */}
              <VText variant="labelMedium" style={[styles.fieldLabel, { marginTop: 12 }]}>
                {pick("जन्म राशि", "Janma Rashi")}
              </VText>
              <View style={styles.chipWrapRow}>
                {RASHI_LIST.map((r) => {
                  const rText = isHi ? r.hi : r.en;
                  const isSelected = rashi === rText;
                  return (
                    <Pressable
                      key={r.en}
                      onPress={() => setRashi(isSelected ? "" : rText)}
                      style={[
                        styles.smallChip,
                        {
                          backgroundColor: isSelected ? colors.surfaceSubtle : colors.surfaceCard,
                          borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                        },
                      ]}
                    >
                      <VText
                        variant="caption"
                        color={isSelected ? colors.brandPrimary : colors.textPrimary}
                        style={{ fontWeight: isSelected ? "700" : "500" }}
                      >
                        {rText}
                      </VText>
                    </Pressable>
                  );
                })}
              </View>

              <VButton
                label={
                  editingId
                    ? pick("परिवर्तन सुरक्षित करें", "Save Changes")
                    : pick("सदस्य सुरक्षित करें", "Save Member Profile")
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
  profileCard: {
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    marginRight: 12,
  },
  identityTextCol: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    marginTop: 4,
  },
  relBadge: {
    alignSelf: "flex-start",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionBtn: {
    padding: 4,
  },
  attrGrid: {
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  attrCol: {
    marginBottom: 2,
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
    maxHeight: "88%",
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
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 14,
  },
  relChip: {
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
    marginBottom: 8,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  chipWrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  smallChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  saveBtn: {
    marginTop: 14,
  },
});

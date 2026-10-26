// src/features/auth/screens/ProfileScreen.tsx
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  VButton,
  VAvatar,
  VBadge,
  Ionicons,
} from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { useAuth } from "../AuthContext.tsx";
import { panditApplicationService } from "../../pandit/services/panditApplicationService.ts";
import { PanditApplication } from "../../pandit/types/application.ts";

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { profile, roles, user, signOut, setActiveMode, deleteAccount } = useAuth();
  const { colors, spacing, radii, isDark, setMode } = useTheme();
  const { language, setLanguage, pick } = useLanguage();
  const [application, setApplication] = useState<PanditApplication | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (user?.id && !roles.includes("pandit")) {
      panditApplicationService
        .fetchMyApplication(user.id)
        .then((app) => {
          if (isMounted) setApplication(app);
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [user?.id, roles]);

  const handleDeleteAccount = () => {
    Alert.alert(
      pick("खाता हटाएं", "Delete Account"),
      pick(
        "क्या आप सुनिश्चित हैं कि आप अपना खाता हटाना चाहते हैं? यह क्रिया स्थायी है और इसे वापस नहीं लिया जा सकता। सभी व्यक्तिगत डेटा हटा दिया जाएगा।",
        "Are you sure you want to delete your account? This action is permanent and cannot be undone. All your personal data and sessions will be invalidated."
      ),
      [
        { text: pick("रद्द करें", "Cancel"), style: "cancel" },
        {
          text: pick("हटाने के लिए आगे बढ़ें", "Continue to Delete"),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              pick("अंतिम पुष्टि", "Final Confirmation"),
              pick(
                "क्या आप पूरी तरह सुनिश्चित हैं? आप तुरंत साइन आउट हो जाएंगे और इस प्रोफ़ाइल तक पहुंच खो देंगे।",
                "Are you completely sure? You will be signed out immediately and will lose access to this profile."
              ),
              [
                { text: pick("मेरा खाता रखें", "Keep My Account"), style: "cancel" },
                {
                  text: pick("स्थायी रूप से हटाएं", "Permanently Delete"),
                  style: "destructive",
                  onPress: async () => {
                    try {
                      setIsDeleting(true);
                      await deleteAccount();
                    } catch (err: any) {
                      setIsDeleting(false);
                      Alert.alert(
                        pick("हटाना अवरुद्ध", "Deletion Blocked"),
                        err?.message ||
                          pick(
                            "खाता हटाया नहीं जा सका। यदि आपकी कोई सक्रिय अनुष्ठान बुकिंग है, तो कृपया उनके पूर्ण होने तक प्रतीक्षा करें या उन्हें पहले रद्द करें।",
                            "Could not delete account. If you have active ritual bookings, please wait until they complete or cancel them first."
                          )
                      );
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const isPandit = roles.includes("pandit");
  const devoteeName = profile?.display_name || (user?.email ? user.email.split("@")[0] : pick("भक्त", "Devotee"));
  const contactText = user?.email || user?.phone || pick("कोई संपर्क विवरण नहीं", "No contact info");

  return (
    <ScreenWrapper scrollable background="surfaceBase">
      <AppBar
        title={pick("खाता एवं सेटिंग्स", "Account & Settings")}
        showBrandGlyph={true}
        locationBadge={pick("वाराणसी", "Varanasi")}
      />

      <View style={[styles.container, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
        {/* Devotee Identity Card */}
        <VCard elevation={1} style={styles.userCard}>
          <View style={styles.identityRow}>
            <VAvatar
              name={devoteeName}
              uri={profile?.avatar_url || null}
              size="lg"
              isVerified={isPandit}
              style={styles.avatar}
            />
            <View style={styles.identityDetails}>
              <VText variant="headlineMedium" style={styles.userName}>
                {devoteeName}
              </VText>
              <VText variant="bodyMedium" color={colors.textMuted} style={styles.userContact}>
                {contactText}
              </VText>
              <View style={styles.badgeRow}>
                {roles.map((r) => (
                  <VBadge
                    key={r}
                    variant="status"
                    color={r === "pandit" ? "brand" : "muted"}
                    label={r === "pandit" ? pick("पंडित", "PANDIT") : pick("भक्त", "DEVOTEE")}
                    showDot={false}
                    style={styles.roleBadge}
                  />
                ))}
                {isPandit && (
                  <VBadge
                    variant="verified"
                    color="success"
                    label={pick("सत्यापित", "VERIFIED")}
                    style={styles.roleBadge}
                  />
                )}
              </View>
            </View>
          </View>
        </VCard>

        {/* App Preferences: Language Switcher & Dual Theme Mode Switcher */}
        <VCard elevation={1} style={styles.prefCard}>
          <VText variant="titleMedium" style={styles.sectionHeader}>
            {pick("ऐप प्राथमिकताएं", "App Preferences")}
          </VText>

          {/* Bilingual Language Switcher */}
          <View style={styles.prefRow}>
            <View style={styles.prefInfo}>
              <Ionicons
                name="language-outline"
                size={22}
                color={colors.brandPrimary}
                style={styles.prefIcon}
              />
              <View style={styles.prefTextCol}>
                <VText variant="labelLarge">
                  {pick("भाषा (Language)", "Language")}
                </VText>
                <VText variant="caption" color={colors.textMuted}>
                  {language === "hi" ? "वर्तमान: हिन्दी" : "Current: English"}
                </VText>
              </View>
            </View>

            <View style={styles.segmentedControl}>
              <Pressable
                onPress={() => setLanguage("hi")}
                style={[
                  styles.segmentButton,
                  {
                    backgroundColor: language === "hi" ? colors.brandPrimary : colors.surfaceCard,
                    borderColor: language === "hi" ? colors.brandPrimary : colors.borderDefault,
                    borderTopLeftRadius: radii.md,
                    borderBottomLeftRadius: radii.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Switch to Hindi language"
                accessibilityState={{ selected: language === "hi" }}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <VText
                  variant="labelMedium"
                  isDevanagari
                  color={language === "hi" ? colors.textOnPrimary : colors.textPrimary}
                >
                  हिन्दी
                </VText>
              </Pressable>

              <Pressable
                onPress={() => setLanguage("en")}
                style={[
                  styles.segmentButton,
                  {
                    backgroundColor: language === "en" ? colors.brandPrimary : colors.surfaceCard,
                    borderColor: language === "en" ? colors.brandPrimary : colors.borderDefault,
                    borderTopRightRadius: radii.md,
                    borderBottomRightRadius: radii.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Switch to English language"
                accessibilityState={{ selected: language === "en" }}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <VText
                  variant="labelMedium"
                  color={language === "en" ? colors.textOnPrimary : colors.textPrimary}
                >
                  English
                </VText>
              </Pressable>
            </View>
          </View>

          <View style={[styles.prefDivider, { backgroundColor: colors.borderDefault }]} />

          {/* Theme Mode Switcher (Ivory Light / Obsidian Dark) */}
          <View style={styles.prefRow}>
            <View style={styles.prefInfo}>
              <Ionicons
                name={isDark ? "moon-outline" : "sunny-outline"}
                size={22}
                color={colors.brandPrimary}
                style={styles.prefIcon}
              />
              <View style={styles.prefTextCol}>
                <VText variant="labelLarge">
                  {pick("थीम (Theme)", "Theme")}
                </VText>
                <VText variant="caption" color={colors.textMuted}>
                  {isDark ? "Obsidian Dark" : "Ivory Light"}
                </VText>
              </View>
            </View>

            <View style={styles.segmentedControl}>
              <Pressable
                onPress={() => setMode("light")}
                style={[
                  styles.segmentButton,
                  {
                    backgroundColor: !isDark ? colors.brandPrimary : colors.surfaceCard,
                    borderColor: !isDark ? colors.brandPrimary : colors.borderDefault,
                    borderTopLeftRadius: radii.md,
                    borderBottomLeftRadius: radii.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Switch to Ivory Light theme"
                accessibilityState={{ selected: !isDark }}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons
                  name="sunny-outline"
                  size={14}
                  color={!isDark ? colors.textOnPrimary : colors.textPrimary}
                  style={{ marginRight: 4 }}
                />
                <VText
                  variant="caption"
                  color={!isDark ? colors.textOnPrimary : colors.textPrimary}
                >
                  Light
                </VText>
              </Pressable>

              <Pressable
                onPress={() => setMode("dark")}
                style={[
                  styles.segmentButton,
                  {
                    backgroundColor: isDark ? colors.brandPrimary : colors.surfaceCard,
                    borderColor: isDark ? colors.brandPrimary : colors.borderDefault,
                    borderTopRightRadius: radii.md,
                    borderBottomRightRadius: radii.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Switch to Obsidian Dark theme"
                accessibilityState={{ selected: isDark }}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons
                  name="moon-outline"
                  size={14}
                  color={isDark ? colors.textOnPrimary : colors.textPrimary}
                  style={{ marginRight: 4 }}
                />
                <VText
                  variant="caption"
                  color={isDark ? colors.textOnPrimary : colors.textPrimary}
                >
                  Dark
                </VText>
              </Pressable>
            </View>
          </View>
        </VCard>

        {/* Pandit Sanctum Mode Switcher or Onboarding Entry Point */}
        {isPandit ? (
          <VCard
            elevation={1}
            style={[
              styles.panditCard,
              { borderColor: colors.brandPrimary, borderWidth: 1 },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <VText variant="titleMedium" color={colors.brandPrimary}>
                {pick("पंडित गर्भगृह सक्रिय", "Pandit Sanctum Active")}
              </VText>
              <VBadge
                variant="verified"
                color="success"
                label={pick("सत्यापित ✓", "Verified ✓")}
              />
            </View>
            <VText variant="caption" color={colors.textMuted} style={styles.cardDesc}>
              {pick(
                "आप प्रमाणित काशी वेदा आचार्य हैं। अनुष्ठान बुकिंग, समय-सारणी और कुंडली प्रबंधन के लिए पंडित मोड में स्विच करें।",
                "You are authorized as a certified Kashi Veda Acharya. Switch to Pandit Mode to manage ritual bookings, schedules, and Kundli requests."
              )}
            </VText>
            <VButton
              title="Switch to Pandit Mode >"
              label={pick("पंडित मोड पर जाएं >", "Switch to Pandit Mode >")}
              variant="primary"
              size="md"
              onPress={() => setActiveMode("pandit")}
              fullWidth
              style={styles.modeActionBtn}
            />
          </VCard>
        ) : application ? (
          <VCard elevation={1} style={styles.panditCard}>
            <View style={styles.cardHeaderRow}>
              <VText variant="titleMedium">
                {pick("पंडित आवेदन", "Pandit Application")}
              </VText>
              <VBadge
                variant="status"
                color={
                  application.status === "approved"
                    ? "success"
                    : application.status === "rejected"
                    ? "alert"
                    : "brand"
                }
                label={application.status.toUpperCase()}
              />
            </View>
            <VText variant="caption" color={colors.textMuted} style={styles.cardDesc}>
              {application.status === "submitted" || application.status === "under_review"
                ? pick(
                    "आपका आवेदन वर्तमान में हमारी प्रशासनिक सत्यापन टीम द्वारा जांचा जा रहा है।",
                    "Your application is currently being evaluated by our administrative verification team."
                  )
                : application.status === "rejected"
                ? pick(
                    "समीक्षक की प्रतिक्रिया पर आपका ध्यान अपेक्षित है।",
                    "Action required: Reviewer feedback needs your attention."
                  )
                : pick(
                    "आपका एक अधूरा आवेदन ड्राफ़्ट सुरक्षित है।",
                    "You have an unfinished application draft."
                  )}
            </VText>
            <VButton
              title="View Application Telemetry"
              label={pick("आवेदन स्थिति देखें", "View Application Telemetry")}
              variant="outline"
              size="md"
              onPress={() => navigation.navigate("PanditApplicationStatus")}
              fullWidth
              style={styles.modeActionBtn}
            />
          </VCard>
        ) : (
          <VCard elevation={1} style={styles.panditCard}>
            <VText variant="titleMedium">
              {pick("पंडित बनें", "Become a Pandit")}
            </VText>
            <VText variant="caption" color={colors.textMuted} style={styles.cardDesc}>
              {pick(
                "क्या आप एक अधिकृत पुरोहित या वैदिक विद्वान हैं? काशी वेदा से जुड़ें और भारत भर के भक्तों की सेवा करें।",
                "Are you a consecrated priest, Purohit, or Vedic scholar? Apply to join Kashi Veda and serve devotees across India with traditional rituals."
              )}
            </VText>
            <VButton
              title="Start Pandit Application >"
              label={pick("पंडित आवेदन प्रारंभ करें >", "Start Pandit Application >")}
              variant="primary"
              size="md"
              onPress={() => navigation.navigate("PanditApplicationWizard")}
              fullWidth
              style={styles.modeActionBtn}
            />
          </VCard>
        )}

        {/* Navigation Shortcut Cards */}
        <VCard elevation={1} style={styles.menuCard}>
          <View style={styles.menuRow}>
            <Ionicons
              name="location-outline"
              size={24}
              color={colors.brandPrimary}
              style={styles.menuIcon}
            />
            <View style={styles.menuTextContainer}>
              <VText variant="titleMedium">
                {pick("सहेजे गए पते", "Saved Addresses")}
              </VText>
              <VText variant="caption" color={colors.textMuted}>
                {pick(
                  "घर और मंदिर सेवा वितरण पते प्रबंधित करें।",
                  "Manage your home and temple service delivery addresses."
                )}
              </VText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
        </VCard>

        <VCard elevation={1} style={styles.menuCard}>
          <View style={styles.menuRow}>
            <Ionicons
              name="sparkles-outline"
              size={24}
              color={colors.brandPrimary}
              style={styles.menuIcon}
            />
            <View style={styles.menuTextContainer}>
              <VText variant="titleMedium">
                {pick("पारिवारिक कुंडली प्रोफाइल", "Family Kundli Profiles")}
              </VText>
              <VText variant="caption" color={colors.textMuted}>
                {pick(
                  "शीघ्र कुंडली एवं संकल्प हेतु जन्म विवरण सुरक्षित करें।",
                  "Save birth details for quick Kundli generation and ritual sankalps."
                )}
              </VText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
        </VCard>

        {/* Danger Zone: Account Deletion */}
        <VCard
          variant="outlined"
          style={[
            styles.dangerCard,
            {
              borderColor: colors.statusAlert,
              backgroundColor: colors.errorBg,
            },
          ]}
        >
          <View style={styles.dangerHeaderRow}>
            <Ionicons
              name="warning-outline"
              size={20}
              color={colors.statusAlert}
              style={{ marginRight: spacing.xs }}
            />
            <VText variant="titleMedium" color={colors.statusAlert}>
              {pick("अति-संवेदनशील क्षेत्र", "Danger Zone")}
            </VText>
          </View>
          <VText variant="caption" color={colors.textMuted} style={styles.dangerDesc}>
            {pick(
              "अपना काशी वेदा खाता, प्रोफ़ाइल और डेटा हमेशा के लिए हटाएं। यह क्रिया वापस नहीं ली जा सकती।",
              "Permanently delete your Kashi Veda account, devotee profile, and access credentials. This action cannot be reversed."
            )}
          </VText>
          <VButton
            title="Delete Account"
            label={pick("खाता हमेशा के लिए हटाएं", "Delete Account")}
            variant="destructive"
            size="md"
            loading={isDeleting}
            disabled={isDeleting}
            onPress={handleDeleteAccount}
            style={styles.deleteButton}
          />
        </VCard>

        {/* Sign Out CTA */}
        <VButton
          title="Sign Out"
          label={pick("साइन आउट", "Sign Out")}
          variant="outline"
          size="lg"
          onPress={signOut}
          fullWidth
          style={styles.signOutButton}
          leadingIcon={<Ionicons name="log-out-outline" size={20} color={colors.brandPrimary} />}
        />
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  userCard: {
    padding: 18,
    marginBottom: 16,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    marginRight: 16,
  },
  identityDetails: {
    flex: 1,
  },
  userName: {
    marginBottom: 2,
  },
  userContact: {
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  roleBadge: {
    marginRight: 4,
  },
  prefCard: {
    padding: 18,
    marginBottom: 16,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  prefInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  prefIcon: {
    marginRight: 12,
  },
  prefTextCol: {
    flex: 1,
  },
  segmentedControl: {
    flexDirection: "row",
    alignItems: "center",
  },
  segmentButton: {
    minHeight: 48,
    minWidth: 64,
    paddingHorizontal: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  prefDivider: {
    height: 1,
    marginVertical: 14,
  },
  panditCard: {
    padding: 18,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardDesc: {
    lineHeight: 18,
    marginBottom: 14,
  },
  modeActionBtn: {
    marginTop: 4,
  },
  menuCard: {
    padding: 16,
    marginBottom: 12,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuIcon: {
    marginRight: 14,
  },
  menuTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  dangerCard: {
    padding: 18,
    marginTop: 8,
    marginBottom: 16,
  },
  dangerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  dangerDesc: {
    lineHeight: 18,
    marginBottom: 14,
  },
  deleteButton: {
    alignSelf: "flex-start",
  },
  signOutButton: {
    marginTop: 8,
    marginBottom: 36,
  },
});

// src/features/kundli/screens/KundliScreen.tsx
import React from "react";
import { FlatList, Platform, RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  VButton,
  VBadge,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../../shared/components/index.ts";
import { useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { KundliPanditCard } from "../components/KundliPanditCard.tsx";
import { useKundliPandits } from "../hooks/useKundliPandits.ts";
import { KundliPandit } from "../types/kundli.types.ts";

type CustomerNavProp = NativeStackNavigationProp<CustomerStackParamList>;

const SERIF_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "serif",
});

export const KundliScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavProp>();
  const { colors, spacing, radii, isDark } = useTheme();
  const { language, pick } = useLanguage();
  const isHi = language === "hi";

  const { pandits, loading, error, refresh } = useKundliPandits();

  const handleSelectPandit = (pandit: KundliPandit) => {
    navigation.navigate("KundliWizard", {
      panditId: pandit.id,
      panditName: pandit.display_name,
    });
  };

  const handleOpenOrders = () => {
    navigation.navigate("KundliOrders");
  };

  const handleGeneralStart = () => {
    navigation.navigate("KundliWizard", undefined);
  };

  return (
    <ScreenWrapper
      safeArea="top"
      background="surfaceBase"
      headerComponent={
        <AppBar
          title="Vedic Kundli"
          titleHi="वैदिक जन्मकुण्डली"
          locationBadge={isHi ? "वाराणसी" : "Varanasi"}
          includeSafeArea={false}
          rightComponent={
            <TouchableOpacity
              onPress={handleOpenOrders}
              style={[
                styles.ordersButton,
                {
                  borderColor: colors.borderDefault,
                  backgroundColor: isDark ? colors.surfaceCard : "#FAF2ED",
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.sm,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="View my Kundli orders"
            >
              <VText variant="labelMedium" weight="600" color="brandPrimary">
                {isHi ? "मेरे आदेश" : "My Orders"}
              </VText>
            </TouchableOpacity>
          }
        />
      }
    >
      <FlatList
        data={pandits}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            colors={[colors.brandPrimary]}
            tintColor={colors.brandPrimary}
          />
        }
        contentContainerStyle={[styles.listContent, { padding: spacing.md, paddingBottom: 40 }]}
        ListHeaderComponent={
          <View style={[styles.headerComponent, { marginBottom: spacing.md }]}>
            {/* Free Automated Kundli Card */}
            <VCard
              variant="default"
              elevation={1}
              style={[
                styles.card,
                {
                  padding: spacing.md,
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  borderRadius: radii.xl || 16,
                  marginBottom: spacing.md,
                },
              ]}
            >
              <View style={{ alignSelf: "flex-start", marginBottom: spacing.xs }}>
                <VBadge
                  variant="status"
                  color="brand"
                  label={pick("100% निःशुल्क एवं त्वरित", "100% FREE & INSTANT")}
                />
              </View>
              <VText
                variant="titleMedium"
                weight="700"
                color="brandPrimary"
                style={[{ marginBottom: spacing.xxs, fontFamily: SERIF_FONT, fontSize: 18 }]}
              >
                {pick("निःशुल्क वैदिक कुण्डली", "Free Vedic Kundli")}
              </VText>
              <VText
                variant="bodyMedium"
                color="textMuted"
                style={{
                  marginBottom: spacing.md,
                  lineHeight: getDevanagariLineHeight(15),
                }}
              >
                {pick(
                  "अपनी जन्म पत्रिका, लग्न, चंद्र राशि, ग्रहीय स्पष्ट अंश एवं विंशोत्तरी महादशा तुरंत प्राप्त करें।",
                  "Get your birth horoscope, Lagna, Moon sign, planetary degrees, and Vimshottari Mahadasha calculated instantly."
                )}
              </VText>
              <VButton
                title={pick("निःशुल्क कुण्डली बनाएं", "Calculate Free Kundli")}
                variant="outline"
                size="md"
                onPress={() => navigation.navigate("FreeKundliWizard")}
                style={{ minHeight: 46 }}
              />
            </VCard>

            {/* Paid Handwritten Kundli Service Hero Card */}
            <VCard
              variant="default"
              elevation={1}
              style={[
                styles.card,
                {
                  padding: spacing.md,
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  borderRadius: radii.xl || 16,
                  marginBottom: spacing.lg,
                },
              ]}
            >
              <View style={{ alignSelf: "flex-start", marginBottom: spacing.xs }}>
                <VBadge
                  variant="status"
                  color="warning"
                  label={pick("हस्तलिखित प्रामाणिक सेवा", "AUTHENTIC HANDWRITTEN")}
                />
              </View>
              <VText
                variant="titleMedium"
                weight="700"
                color="textPrimary"
                style={[{ marginBottom: spacing.xxs, fontFamily: SERIF_FONT, fontSize: 18 }]}
              >
                {pick("हस्तलिखित कुण्डली निर्माण", "Handwritten Kundli Service")}
              </VText>
              <VText
                variant="bodyMedium"
                color="textMuted"
                style={{
                  marginBottom: spacing.md,
                  lineHeight: getDevanagariLineHeight(15),
                }}
              >
                {pick(
                  "काशी के प्रमाणित ज्योतिषाचार्यों द्वारा हस्तनिर्मित विस्तृत वैदिक जन्मपत्रिका, उच्च-गुणवत्ता वाले स्कैन्ड दस्तावेज़ के रूप में उपलब्ध।",
                  "Receive an authentic, comprehensive Vedic horoscope manually prepared and handwritten by certified astrologers in Kashi, delivered as a high-resolution scanned PDF document."
                )}
              </VText>

              {/* Clean Checklist with zero emojis */}
              <View
                style={[
                  styles.bulletList,
                  {
                    backgroundColor: isDark ? colors.surfaceCard : "#FAF2ED",
                    borderColor: colors.borderDefault,
                    borderWidth: 1,
                    padding: spacing.sm,
                    borderRadius: radii.md,
                    gap: 6,
                    marginBottom: spacing.md,
                  },
                ]}
              >
                <View style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: colors.brandPrimary }]} />
                  <VText variant="caption" color="textPrimary" style={{ flex: 1 }}>
                    {pick(
                      "पारंपरिक वैदिक गणनाएं एवं षोडशवर्ग चक्र",
                      "Traditional Vedic calculations & planetary charts"
                    )}
                  </VText>
                </View>
                <View style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: colors.brandPrimary }]} />
                  <VText variant="caption" color="textPrimary" style={{ flex: 1 }}>
                    {pick(
                      "विस्तृत महादशा-अंतर्दशा विश्लेषण एवं फलकथन",
                      "Complete Dasha analysis & life predictions"
                    )}
                  </VText>
                </View>
                <View style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: colors.brandPrimary }]} />
                  <VText variant="caption" color="textPrimary" style={{ flex: 1 }}>
                    {pick(
                      "डाउनलोड योग्य सुरक्षित डिजिटल प्रति",
                      "Downloadable secure high-definition PDF"
                    )}
                  </VText>
                </View>
              </View>

              <VButton
                title={pick("कुण्डली अनुरोध प्रारंभ करें", "Create Kundli Request")}
                variant="primary"
                size="md"
                onPress={handleGeneralStart}
                style={{ minHeight: 46 }}
              />
            </VCard>

            <View style={[styles.sectionTitleRow, { marginTop: spacing.xs, marginBottom: spacing.sm }]}>
              <VText
                variant="titleMedium"
                weight="700"
                color="textPrimary"
                style={{ fontFamily: SERIF_FONT, fontSize: 17 }}
              >
                {pick("ज्योतिषाचार्य विशेषज्ञ चुनें", "Select Astrologer Specialist")}
              </VText>
              <VText variant="caption" color="textMuted">
                {pick("काशी के प्रामाणिक ज्योतिषी", "Certified astrologers in Varanasi")}
              </VText>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <KundliPanditCard
            pandit={item}
            onSelect={handleSelectPandit}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <LoadingState message={pick("कुण्डली विशेषज्ञों की खोज हो रही है...", "Finding verified Kundli astrologers...")} />
          ) : error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <EmptyState
              title={pick("कोई विशेषज्ञ उपलब्ध नहीं", "No Kundli specialists available")}
              description={pick(
                "वर्तमान में कोई कुण्डली विशेषज्ञ उपलब्ध नहीं हैं। कृपया कुछ समय बाद पुनः प्रयास करें।",
                "No Kundli specialists are currently available. Please check back later."
              )}
            />
          )
        }
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  ordersButton: {
    minHeight: 38,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  listContent: {},
  headerComponent: {},
  card: {},
  bulletList: {},
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 8,
  },
  sectionTitleRow: {},
});

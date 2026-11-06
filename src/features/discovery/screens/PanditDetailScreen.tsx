// src/features/discovery/screens/PanditDetailScreen.tsx
import React, { useMemo, useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VText,
  VCard,
  VAvatar,
  VTag,
  RatingStars,
  VerificationBadge,
  VedicVideoPlayer,
  VedicVideoItem,
  StickyBottomBar,
  VEmptyState as EmptyState,
} from "../../../shared/components/index.ts";
import { Ionicons } from "../../../shared/components/icons/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { ReviewCard } from "../components/ReviewCard.tsx";
import { usePanditDetail } from "../hooks/usePanditDetail.ts";

type PanditDetailRouteProp = RouteProp<CustomerStackParamList, "PanditDetail">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const PanditDetailScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<PanditDetailRouteProp>();
  const { panditId, panditName } = route.params;

  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const { pandit, offerings, reviews, loading, error, refresh } = usePanditDetail(panditId);
  const [selectedOfferingId, setSelectedOfferingId] = useState<string | undefined>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const selectedOffering = useMemo(() => {
    if (selectedOfferingId) {
      return offerings.find((o) => o.id === selectedOfferingId);
    }
    // If only 1 offering exists, auto-select it
    if (offerings.length === 1) {
      return offerings[0];
    }
    return undefined;
  }, [offerings, selectedOfferingId]);

  const basePriceInr = selectedOffering
    ? selectedOffering.home_price ||
      selectedOffering.temple_price ||
      selectedOffering.remote_price ||
      selectedOffering.price ||
      undefined
    : undefined;

  // Authoritative 25% Escrow Advance
  const advanceInr = basePriceInr ? Math.round(basePriceInr * 0.25) : undefined;

  const handleShare = async () => {
    try {
      await Share.share({
        title: pandit?.display_name || "Vedic Pandit Ji",
        message: isHi
          ? `${pandit?.display_name || "पंडित जी"} • काशी वेदा पर सत्यापित वैदिक पुरोहित। प्रोफ़ाइल देखें: https://kashiveda.org/pandits/${panditId}`
          : `${pandit?.display_name || "Pandit Ji"} • Verified Vedic Priest on Kashi Veda. View profile: https://kashiveda.org/pandits/${panditId}`,
      });
    } catch {
      // Ignored
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const videoItems: VedicVideoItem[] = useMemo(() => {
    if ((pandit as any)?.videos && Array.isArray((pandit as any).videos) && (pandit as any).videos.length > 0) {
      return (pandit as any).videos;
    }
    if ((pandit as any)?.video_url) {
      return [
        {
          id: "video-1",
          title: "Shri Rudram",
          titleHi: "श्रीरुद्रम् पाठ",
          durationLabel: "0:45",
          durationSeconds: 45,
          posterUrl: (pandit as any)?.video_thumbnail_url || pandit?.avatar_url || undefined,
          videoUrl: (pandit as any).video_url,
        },
      ];
    }
    return [];
  }, [pandit]);

  if (!pandit && !loading) {
    return (
      <ScreenWrapper safeArea="top" background="surfaceBase">
        <AppBar
          title={isHi ? "पंडित जी प्रोफ़ाइल" : "Pandit Ji Profile"}
          titleHi="पंडित जी प्रोफ़ाइल"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <EmptyState
          icon="alert-circle-outline"
          title={isHi ? "पंडित जी नहीं मिले" : "Pandit Ji Not Found"}
          titleHi="पंडित जी नहीं मिले"
          description={error || (isHi ? "इस पुरोहित का विवरण उपलब्ध नहीं है।" : "Could not find profile information for this priest.")}
          actionLabel={isHi ? "पुनः प्रयास करें" : "Retry"}
          actionLabelHi="पुनः प्रयास करें"
          onActionPress={refresh}
        />
      </ScreenWrapper>
    );
  }

  const scholarTitle = pandit?.display_name || panditName || (isHi ? "वैदिक पंडित जी" : "Vedic Pandit Ji");
  const selectedPujaTitle = selectedOffering?.puja_service?.name;

  return (
    <ScreenWrapper
      safeArea="top"
      background="surfaceBase"
      footerComponent={
        selectedOffering ? (
          <StickyBottomBar
            summarySlot={
              <View style={styles.summaryRow}>
                <View>
                  <VText variant="caption" color="textMuted" style={{ fontSize: 10 }}>
                    {isHi ? "एस्क्रो अग्रिम (25%)" : "25% ESCROW ADVANCE"}
                  </VText>
                  <VText variant="titleMedium" color="brandPrimary" weight="700">
                    {advanceInr
                      ? formatCurrency(advanceInr)
                      : isHi
                      ? "परामर्शानुसार दक्षिणा"
                      : "Dakshina on booking"}
                  </VText>
                  {basePriceInr ? (
                    <VText variant="caption" color="textMuted" style={{ fontSize: 10 }}>
                      {isHi ? `(कुल दक्षिणा: ${formatCurrency(basePriceInr)})` : `(Total Dakshina: ${formatCurrency(basePriceInr)})`}
                    </VText>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.escrowBadge,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.borderDefault,
                      borderWidth: 1,
                      borderRadius: radii.full,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 2,
                    },
                  ]}
                >
                  <Ionicons name="shield-checkmark" size={12} color="#065F46" />
                  <VText variant="caption" color="textPrimary" weight="600" style={{ fontSize: 10, color: "#065F46", marginLeft: 4 }}>
                    {isHi ? "75% पूर्णाहुति विमोचन" : "75% Purnahuti Release"}
                  </VText>
                </View>
              </View>
            }
            primaryLabel={
              selectedPujaTitle
                ? (isHi ? `${selectedPujaTitle} बुक करें` : `Book ${selectedPujaTitle}`)
                : (isHi ? "पूजा बुक करें" : "Book Puja with Pandit Ji")
            }
            onPrimaryPress={() => {
              if (selectedOffering) {
                navigation.navigate("BookingWizard", {
                  pujaId: selectedOffering.puja_service_id,
                  pujaName: selectedOffering.puja_service?.name,
                  panditId: pandit?.id || panditId,
                });
              } else {
                navigation.navigate("BookingWizard", {
                  panditId: pandit?.id || panditId,
                });
              }
            }}
          />
        ) : undefined
      }
      testID="c-05-pandit-detail"
    >
      <AppBar
        title={isHi ? "पंडित जी प्रोफ़ाइल" : "Pandit Ji Profile"}
        titleHi="पंडित जी प्रोफ़ाइल"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        showShareButton={true}
        onSharePress={handleShare}
        includeSafeArea={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: spacing.xxl,
          gap: spacing.md,
        }}
        refreshControl={
          typeof (globalThis as any).process !== "undefined" &&
          (globalThis as any).process?.env?.NODE_ENV === "test"
            ? undefined
            : (
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.brandPrimary}
                colors={[colors.brandPrimary]}
              />
            )
        }
      >
        {/* Scholar Hero Profile Card */}
        <VCard
          elevation={1}
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderDefault,
              borderWidth: 1,
              padding: spacing.md,
              borderRadius: radii.lg,
            },
          ]}
        >
          <View style={styles.heroRow}>
            <VAvatar
              uri={pandit?.avatar_url || undefined}
              name={scholarTitle}
              size="xl"
              isVerified={true}
            />
            <View style={[styles.heroInfo, { marginLeft: spacing.md }]}>
              <VText
                variant="headlineSmall"
                color="textPrimary"
                weight="700"
                style={{
                  fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
                }}
              >
                {scholarTitle}
              </VText>
              
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xxs, flexWrap: "wrap" }}>
                <VerificationBadge status="verified" size="sm" showTooltip={false} />
                <VText variant="caption" color="textMuted">
                  {`${pandit?.city ? `${pandit.city} • ` : ""}${isHi ? "अखिल भारतीय सेवा" : "Pan-India"}`}
                </VText>
              </View>

              {pandit?.rating_avg ? (
                <View style={{ marginTop: spacing.xxs }}>
                  <RatingStars
                    rating={Number(pandit.rating_avg)}
                    reviewCount={pandit.rating_count || 0}
                    size={14}
                    showNumber
                  />
                </View>
              ) : (
                <VText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                  {isHi ? "नवीन पुरोहित (शीघ्र समीक्षा)" : "New Priest (No reviews yet)"}
                </VText>
              )}
            </View>
          </View>

          {/* Credential 3-Metric Strip */}
          <View
            style={[
              styles.statsGrid,
              {
                borderTopColor: colors.borderDefault,
                borderBottomColor: colors.borderDefault,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                paddingVertical: spacing.sm,
                marginVertical: spacing.md,
              },
            ]}
          >
            <View style={styles.statColumn}>
              <VText variant="caption" color="textMuted" style={{ textTransform: "uppercase", fontSize: 10 }}>
                {isHi ? "अनुभव" : "Experience"}
              </VText>
              <VText variant="titleSmall" color="textPrimary" weight="700" style={{ marginTop: 2 }}>
                {pandit?.years_experience != null
                  ? `${pandit.years_experience} ${isHi ? "वर्ष" : "Years"}`
                  : "10+ Years"}
              </VText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.borderDefault }]} />
            <View style={styles.statColumn}>
              <VText variant="caption" color="textMuted" style={{ textTransform: "uppercase", fontSize: 10 }}>
                {isHi ? "परंपरा" : "Tradition"}
              </VText>
              <VText variant="titleSmall" color="brandPrimary" weight="700" style={{ marginTop: 2 }} numberOfLines={1}>
                {(pandit as any)?.tradition || (isHi ? "शुक्ल यजुर्वेद" : "Shukla Yajurveda")}
              </VText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.borderDefault }]} />
            <View style={styles.statColumn}>
              <VText variant="caption" color="textMuted" style={{ textTransform: "uppercase", fontSize: 10 }}>
                {isHi ? "संपन्न पूजाएं" : "Completed"}
              </VText>
              <VText variant="titleSmall" color="textPrimary" weight="700" style={{ marginTop: 2 }}>
                {(pandit as any)?.completed_pujas || (pandit?.rating_count ? `${pandit.rating_count * 3}+` : "250+")} {isHi ? "पूजाएं" : "Pujas"}
              </VText>
            </View>
          </View>

          {pandit?.bio ? (
            <VText variant="bodyMedium" color="textMuted" style={{ lineHeight: 22 }}>
              {pandit.bio}
            </VText>
          ) : null}

          {pandit?.languages && pandit.languages.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm }}>
              {pandit.languages.map((lang) => (
                <VTag key={lang} label={lang} variant="assist" />
              ))}
            </View>
          ) : null}
        </VCard>

        {/* Vedic Recitation Videos (Up to 3 videos, quick switcher) */}
        {videoItems.length > 0 ? (
          <VedicVideoPlayer
            videos={videoItems}
            panditName={scholarTitle}
            panditNameHi={scholarTitle}
          />
        ) : null}

        {/* Pujas Offered & Dakshina (Selection-Gated) */}
        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs }}>
            <VText
              variant="labelLarge"
              color="textPrimary"
              weight="700"
              style={{ textTransform: "uppercase", letterSpacing: 0.8 }}
            >
              {isHi ? "अनुष्ठान सेवाएं एवं दक्षिणा" : "Pujas Offered"}
            </VText>
            {!selectedOffering && offerings.length > 0 ? (
              <VText variant="caption" color="brandPrimary" weight="600" style={{ fontSize: 11 }}>
                {isHi ? "अनुष्ठान चुनें" : "Tap ritual to book"}
              </VText>
            ) : null}
          </View>

          {offerings.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {offerings.map((offering) => {
                const isSelected = selectedOffering?.id === offering.id;
                const ritualTitle = offering.puja_service?.name || "Sacred Puja";
                const duration =
                  offering.duration_minutes || offering.puja_service?.default_duration_minutes;

                return (
                  <TouchableOpacity
                    key={offering.id}
                    activeOpacity={0.8}
                    onPress={() => setSelectedOfferingId(offering.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${ritualTitle}, ${duration ? `${duration} mins` : ""}`}
                  >
                    <VCard
                      elevation={1}
                      style={[
                        styles.offeringCard,
                        {
                          backgroundColor: isSelected ? colors.surfaceSubtle : colors.surfaceCard,
                          borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                          borderWidth: isSelected ? 1.5 : 1,
                          padding: spacing.md,
                          borderRadius: radii.lg,
                          minHeight: 48,
                        },
                      ]}
                    >
                      <View style={styles.offeringHeader}>
                        <View style={{ flex: 1 }}>
                          <VText variant="titleMedium" color="textPrimary" weight="700">
                            {ritualTitle}
                          </VText>
                          {duration ? (
                            <VText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                              {duration} {isHi ? "मिनट" : "mins"}
                            </VText>
                          ) : null}
                        </View>
                        <View
                          style={[
                            styles.modeCheckCircle,
                            {
                              backgroundColor: isSelected ? colors.brandPrimary : "transparent",
                              borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                            },
                          ]}
                        >
                          {isSelected ? (
                            <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                          ) : null}
                        </View>
                      </View>

                      {/* Mode Pricing Breakdown */}
                      <View
                        style={[
                          styles.pricingRow,
                          {
                            borderTopColor: colors.borderDefault,
                            borderTopWidth: 1,
                            paddingTop: spacing.xs,
                            marginTop: spacing.xs,
                          },
                        ]}
                      >
                        {offering.home_price != null && (
                          <VText variant="caption" color="textMuted">
                            Home:{" "}
                            <VText variant="labelMedium" color="brandPrimary" weight="700">
                              {formatCurrency(offering.home_price)}
                            </VText>
                          </VText>
                        )}
                        {offering.temple_price != null && (
                          <VText variant="caption" color="textMuted">
                            Temple:{" "}
                            <VText variant="labelMedium" color="brandPrimary" weight="700">
                              {formatCurrency(offering.temple_price)}
                            </VText>
                          </VText>
                        )}
                        {offering.remote_price != null && (
                          <VText variant="caption" color="textMuted">
                            Online:{" "}
                            <VText variant="labelMedium" color="brandPrimary" weight="700">
                              {formatCurrency(offering.remote_price)}
                            </VText>
                          </VText>
                        )}
                        {!offering.home_price && !offering.temple_price && !offering.remote_price && (
                          <VText variant="labelLarge" color="brandPrimary" weight="700">
                            {formatCurrency(offering.price)}
                          </VText>
                        )}
                      </View>
                    </VCard>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <VCard
              elevation={1}
              style={{
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                padding: spacing.md,
                borderRadius: radii.lg,
              }}
            >
              <VText variant="bodyMedium" color="textMuted" align="center">
                {isHi
                  ? "शास्त्रोक्त वैदिक दक्षिणा अनुष्ठान के अनुसार निर्धारित होती है।"
                  : "Standard Vedic Dakshina applies according to ceremony scale."}
              </VText>
            </VCard>
          )}
        </View>

        {/* Handwritten Kundli Service (if enabled) */}
        {pandit?.kundli_enabled && pandit.kundli_price != null ? (
          <View>
            <VText
              variant="labelLarge"
              color="textPrimary"
              weight="700"
              style={{ textTransform: "uppercase", letterSpacing: 0.8, marginBottom: spacing.xs }}
            >
              {isHi ? "हस्तलिखित जन्मपत्रिका" : "Handwritten Kundli Service"}
            </VText>
            <VCard
              elevation={1}
              style={{
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                padding: spacing.md,
                borderRadius: radii.lg,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <VText variant="titleMedium" color="textPrimary" weight="700">
                    {isHi ? "हस्तलिखित वैदिक जन्मपत्री" : "Handwritten Vedic Kundli"}
                  </VText>
                  <VText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                    {isHi
                      ? "पंडित जी द्वारा व्यक्तिगत जन्म कुण्डली विश्लेषण एवं वैदिक उपाय।"
                      : "Personalized birth chart analysis with Shastric remedies."}
                  </VText>
                </View>
                <VText variant="titleMedium" color="brandPrimary" weight="700">
                  {formatCurrency(pandit.kundli_price)}
                </VText>
              </View>
            </VCard>
          </View>
        ) : null}

        {/* Devotee Reviews */}
        <View>
          <VText
            variant="labelLarge"
            color="textPrimary"
            weight="700"
            style={{ textTransform: "uppercase", letterSpacing: 0.8, marginBottom: spacing.xs }}
          >
            {isHi ? `यजमान समीक्षाएं (${reviews.length})` : `Devotee Reviews (${reviews.length})`}
          </VText>

          {reviews.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {reviews.map((rev) => (
                <ReviewCard key={rev.id} review={rev} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="star-outline"
              title={isHi ? "अभी कोई लिखित समीक्षा नहीं है" : "No Written Reviews Yet"}
              titleHi="अभी कोई लिखित समीक्षा नहीं है"
              description={isHi ? "अनुष्ठान पूर्ण होने के उपरांत यजमानों की समीक्षाएं यहां प्रदर्शित होंगी।" : "Devotee reviews will appear after completed pujas."}
              descriptionHi="अनुष्ठान पूर्ण होने के उपरांत यजमानों की समीक्षाएं यहां प्रदर्शित होंगी।"
            />
          )}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  heroCard: {
    width: "100%",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroInfo: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: "row",
    alignItems: "center",
  },
  statColumn: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    height: 30,
  },
  offeringCard: {
    width: "100%",
  },
  offeringHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modeCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  pricingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  escrowBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
});

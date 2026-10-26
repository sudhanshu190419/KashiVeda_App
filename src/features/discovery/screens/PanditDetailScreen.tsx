// src/features/discovery/screens/PanditDetailScreen.tsx
import React, { useMemo, useState } from "react";
import {
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
  SectionHeader,
  VText,
  VCard,
  VAvatar,
  VTag,
  VButton,
  RatingStars,
  VerificationBadge,
  ChantingAudioPlayer,
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
  const { language, pick } = useLanguage();
  const isHi = language === "hi";

  const { pandit, offerings, reviews, loading, error, refresh } = usePanditDetail(panditId);
  const [selectedOfferingId, setSelectedOfferingId] = useState<string | undefined>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const selectedOffering = useMemo(() => {
    if (selectedOfferingId) {
      return offerings.find((o) => o.id === selectedOfferingId) || offerings[0];
    }
    return offerings[0];
  }, [offerings, selectedOfferingId]);

  const basePriceInr = selectedOffering
    ? selectedOffering.home_price ||
      selectedOffering.temple_price ||
      selectedOffering.remote_price ||
      selectedOffering.price ||
      2100
    : 2100;

  const advanceInr = Math.round(basePriceInr * 0.5);

  const handleShare = async () => {
    try {
      await Share.share({
        title: pandit?.display_name || "Vedic Acharya",
        message: isHi
          ? `${pandit?.display_name} • काशी वेदा पर सत्यापित वैदिक पुरोहित (वाराणसी)। प्रोफ़ाइल देखें: https://kashiveda.org/pandits/${panditId}`
          : `${pandit?.display_name} • Verified Vedic priest on Kashi Veda (Varanasi). View profile: https://kashiveda.org/pandits/${panditId}`,
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

  if (!pandit && !loading) {
    return (
      <ScreenWrapper safeArea="top" background="surfaceBase">
        <AppBar
          title={panditName || "Acharya Profile"}
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <EmptyState
          icon="alert-circle-outline"
          title="Pandit Not Found"
          titleHi="पुरोहित नहीं मिले"
          description={error || "Could not find profile information for this priest."}
          actionLabel="Retry"
          actionLabelHi="पुनः प्रयास करें"
          onActionPress={refresh}
        />
      </ScreenWrapper>
    );
  }

  const scholarTitle = pandit?.display_name || panditName || "Vedic Acharya";

  return (
    <ScreenWrapper
      safeArea="top"
      background="surfaceBase"
      footerComponent={
        <StickyBottomBar
          summarySlot={
            <View style={styles.summaryRow}>
              <View>
                <VText variant="caption" color="textMuted">
                  {isHi ? "एस्क्रो अग्रिम (50%)" : "Escrow Advance (50%)"}
                </VText>
                <VText variant="titleMedium" color="brandPrimary" weight="700">
                  {formatCurrency(advanceInr)}
                </VText>
              </View>
              <View style={styles.escrowBadge}>
                <Ionicons name="shield-checkmark" size={14} color={colors.statusActive} />
                <VText variant="caption" color="textPrimary" weight="600" style={{ marginLeft: 4 }}>
                  {isHi ? "पूर्णाहुति गारंटी" : "Purnahuti Release"}
                </VText>
              </View>
            </View>
          }
          primaryLabel={isHi ? "अनुष्ठान हेतु बुक करें" : "Book Ritual"}
          onPrimaryPress={() => {
            if (offerings.length > 0) {
              navigation.navigate("BookingWizard", {
                pujaId: selectedOffering?.puja_service_id,
                pujaName: selectedOffering?.puja_service?.name,
                panditId: pandit?.id || panditId,
              });
            } else {
              navigation.navigate("BookingWizard", {
                panditId: pandit?.id || panditId,
              });
            }
          }}
        />
      }
      testID="c-05-pandit-detail"
    >
      <AppBar
        title={scholarTitle}
        subtitle="Verified Priest of Kashi"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        showShareButton={true}
        onSharePress={handleShare}
        locationBadge={isHi ? "वाराणसी" : "Varanasi"}
        includeSafeArea={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: spacing.xxl,
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
              marginBottom: spacing.md,
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
              <VText variant="headlineSmall" color="textPrimary" weight="700">
                {scholarTitle}
              </VText>
              <View style={{ marginTop: spacing.xxs }}>
                <VerificationBadge status="verified" size="sm" showTooltip={false} />
              </View>
              {pandit?.rating_avg ? (
                <View style={{ marginTop: spacing.xxs }}>
                  <RatingStars
                    rating={Number(pandit.rating_avg)}
                    reviewCount={pandit.rating_count || 0}
                    size={15}
                    showNumber
                  />
                </View>
              ) : (
                <VText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                  {isHi ? "नवीन आचार्य (शीघ्र समीक्षा)" : "New Acharya (No reviews yet)"}
                </VText>
              )}
            </View>
          </View>

          {/* Lineage & Stats Highlights */}
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
              <VText variant="caption" color="textMuted">
                {isHi ? "अनुभव" : "Experience"}
              </VText>
              <VText variant="titleSmall" color="textPrimary" weight="700">
                {pandit?.years_experience != null
                  ? `${pandit.years_experience} ${isHi ? "वर्ष" : "Years"}`
                  : isHi ? "वैदिक परंपरा" : "Vedic Lineage"}
              </VText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.borderDefault }]} />
            <View style={styles.statColumn}>
              <VText variant="caption" color="textMuted">
                {isHi ? "गोत्र प्रवर" : "Gotra Lineage"}
              </VText>
              <VText variant="titleSmall" color="brandPrimary" weight="700">
                {isHi ? "शाण्डिल्य / कश्यप" : "Shandilya / Kashyapa"}
              </VText>
            </View>
          </View>

          {pandit?.bio ? (
            <VText variant="bodyMedium" color="textMuted" style={{ lineHeight: 22 }}>
              {pandit.bio}
            </VText>
          ) : null}

          {pandit?.languages && pandit.languages.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: spacing.sm }}>
              {pandit.languages.map((lang) => (
                <VTag key={lang} label={lang} variant="assist" />
              ))}
            </View>
          ) : null}
        </VCard>

        {/* Chanting Audio Player: Authentic Sanskrit Audio Proof */}
        <View style={{ marginBottom: spacing.md }}>
          <SectionHeader
            title="Sacred Chanting Sample"
            titleHi="वैदिक मंत्रोच्चार श्रवण"
            subtitle="Authentic Sanskrit pronunciation proof"
            subtitleHi="शुद्ध वैदिक स्वर एवं उच्चारण प्रमाण"
            sacredGlyph={true}
          />
          <ChantingAudioPlayer
            audioUrl="https://kashiveda.org/audio/rudram.mp3"
            mantraTitle="Shri Rudram Laghunyasa"
            mantraTitleHi="श्रीरुद्रम् लघुन्यासः"
            panditName={scholarTitle}
            panditNameHi={scholarTitle}
            durationSeconds={60}
          />
        </View>

        {/* Ritual Services & Dakshina */}
        <View style={{ marginBottom: spacing.md }}>
          <SectionHeader
            title="Ritual Services & Dakshina"
            titleHi="अनुष्ठान सेवाएं एवं दक्षिणा"
            subtitle="Itemized Vedic ceremonies"
            subtitleHi="काशी शास्त्रसम्मत दक्षिणा व्यवस्था"
            sacredGlyph={true}
          />

          {offerings.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {offerings.map((offering) => {
                const isSelected = (selectedOffering?.id === offering.id);
                const ritualTitle = offering.puja_service?.name || "Sacred Ritual";
                const duration =
                  offering.duration_minutes || offering.puja_service?.default_duration_minutes;

                return (
                  <TouchableOpacity
                    key={offering.id}
                    activeOpacity={0.8}
                    onPress={() => setSelectedOfferingId(offering.id)}
                  >
                    <VCard
                      elevation={1}
                      style={[
                        styles.offeringCard,
                        {
                          backgroundColor: colors.surfaceCard,
                          borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                          borderWidth: isSelected ? 1.5 : 1,
                          padding: spacing.md,
                          borderRadius: radii.lg,
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
                              ⏱ {duration} {isHi ? "मिनट" : "mins"}
                            </VText>
                          ) : null}
                        </View>
                        {isSelected && (
                          <View
                            style={[
                              styles.selectedPill,
                              { backgroundColor: colors.surfaceSubtle, borderRadius: radii.full },
                            ]}
                          >
                            <VText variant="caption" color="brandPrimary" weight="700">
                              ✓ {isHi ? "चयनित" : "Selected"}
                            </VText>
                          </View>
                        )}
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
                            🪔 Home:{" "}
                            <VText variant="labelMedium" color="brandPrimary" weight="700">
                              {formatCurrency(offering.home_price)}
                            </VText>
                          </VText>
                        )}
                        {offering.temple_price != null && (
                          <VText variant="caption" color="textMuted">
                            🏛️ Temple:{" "}
                            <VText variant="labelMedium" color="brandPrimary" weight="700">
                              {formatCurrency(offering.temple_price)}
                            </VText>
                          </VText>
                        )}
                        {offering.remote_price != null && (
                          <VText variant="caption" color="textMuted">
                            🌐 Online:{" "}
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

        {/* Handwritten Kundli Service */}
        {pandit?.kundli_enabled && pandit.kundli_price != null ? (
          <View style={{ marginBottom: spacing.md }}>
            <SectionHeader
              title="Handwritten Kundli Service"
              titleHi="हस्तलिखित जन्मपत्रिका"
              sacredGlyph={true}
            />
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
                    📜 {isHi ? "हस्तलिखित वैदिक जन्मपत्री" : "Handwritten Vedic Kundli"}
                  </VText>
                  <VText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                    {isHi
                      ? "आचार्य द्वारा व्यक्तिगत जन्म कुण्डली विश्लेषण एवं वैदिक उपाय।"
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
        <View style={{ marginBottom: spacing.md }}>
          <SectionHeader
            title={`Devotee Reviews (${reviews.length})`}
            titleHi={`यजमान समीक्षाएं (${reviews.length})`}
            sacredGlyph={true}
          />

          {reviews.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {reviews.map((rev) => (
                <ReviewCard key={rev.id} review={rev} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="star-outline"
              title="No Written Reviews Yet"
              titleHi="अभी कोई लिखित समीक्षा नहीं है"
              description="Devotee reviews will appear after completed rituals."
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
  selectedPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
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

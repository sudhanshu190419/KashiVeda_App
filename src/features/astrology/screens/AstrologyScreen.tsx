// src/features/astrology/screens/AstrologyScreen.tsx
import React, { useCallback, useRef } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../../shared/components/index.ts";
import { useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { formatIndianDisplayDate, getIndianCalendarDate } from "../../../shared/utils/date.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { AstrologyPlanCard } from "../components/AstrologyPlanCard.tsx";
import { AstrologySubscriptionCard } from "../components/AstrologySubscriptionCard.tsx";
import { AstrologyContentCard } from "../components/AstrologyContentCard.tsx";
import { RashiSelector } from "../components/RashiSelector.tsx";
import { DailyRashiInsightCard } from "../components/DailyRashiInsightCard.tsx";
import { useAstrologyPlans } from "../hooks/useAstrologyPlans.ts";
import { useCustomerSubscription } from "../hooks/useCustomerSubscription.ts";
import { useAstrologyContent } from "../hooks/useAstrologyContent.ts";
import { useDailyRashiInsight } from "../hooks/useDailyRashiInsight.ts";
import { AstrologyContent as AstrologyContentType, AstrologySubscriptionPlan } from "../types/astrology.types.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const AstrologyScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const {
    plans,
    loading: plansLoading,
    error: plansError,
    refresh: refreshPlans,
  } = useAstrologyPlans();

  const {
    subscription,
    loading: subLoading,
    error: subError,
    refresh: refreshSub,
  } = useCustomerSubscription();

  const {
    content,
    loading: contentLoading,
    refreshing: contentRefreshing,
    error: contentError,
    refresh: refreshContent,
  } = useAstrologyContent({ pageSize: 3 });

  const {
    insight,
    selectedRashiId,
    selectedRashi,
    loading: insightLoading,
    error: insightError,
    isEntitled,
    isUnverifiedOffline,
    selectRashi,
    refresh: refreshDailyInsight,
  } = useDailyRashiInsight();

  // Revalidate subscription and daily insight on screen focus
  const isFirstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      refreshSub({ force: false });
      refreshDailyInsight({ force: false, revalidate: true });
    }, [refreshSub, refreshDailyInsight])
  );

  const isInitialLoading = plansLoading && subLoading && contentLoading && insightLoading;
  const isRefreshing = contentRefreshing;

  const handleRefreshAll = async () => {
    await Promise.all([refreshPlans(), refreshSub(), refreshContent(), refreshDailyInsight()]);
  };

  if (isInitialLoading) {
    return (
      <ScreenWrapper
        headerComponent={
          <AppBar
            title="Vedic Astrology"
            titleHi="वैदिक ज्योतिष"
            locationBadge="वाराणसी / Varanasi"
          />
        }
      >
        <LoadingState message="Loading planetary insights and plans..." />
      </ScreenWrapper>
    );
  }

  if (plansError && plans.length === 0 && !subscription && content.length === 0) {
    return (
      <ScreenWrapper
        headerComponent={
          <AppBar
            title="Vedic Astrology"
            titleHi="वैदिक ज्योतिष"
            locationBadge="वाराणसी / Varanasi"
          />
        }
      >
        <ErrorState
          title="Unable to Load Astrology Hub"
          message={plansError || subError || contentError || "Please check your network and try again."}
          onRetry={handleRefreshAll}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper
      scrollable
      refreshing={isRefreshing}
      onRefresh={handleRefreshAll}
      headerComponent={
        <AppBar
          title="Vedic Astrology"
          titleHi="वैदिक ज्योतिष"
          locationBadge="वाराणसी / Varanasi"
        />
      }
      contentContainerStyle={[styles.scrollContent, { padding: spacing.md }]}
    >
      {/* Vedic Astrology Introduction Banner */}
      <VCard
        variant="default"
        elevation={2}
        style={[
          styles.bannerCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderAccent,
            marginBottom: spacing.md,
          },
        ]}
      >
        <VText variant="caption" weight="600" color="brandPrimary">
          ॥ ग्रहाणां चरितं शुभम् ॥
        </VText>
        <VText
          variant="headlineMedium"
          weight="700"
          color="brandPrimary"
          style={[styles.bannerTitle, { marginVertical: spacing.xxs }]}
        >
          Cosmic Planetary Wisdom
        </VText>
        <VText
          variant="bodyMedium"
          color="textMuted"
          style={[
            styles.bannerDesc,
            {
              lineHeight: getDevanagariLineHeight(15),
              marginBottom: spacing.sm,
            },
          ]}
        >
          Receive authentic daily Jyotish guidance and planetary transits calculated according to classical Vedic principles.
        </VText>

        <View
          style={[
            styles.quickActionsRow,
            {
              borderTopColor: colors.borderDefault,
              paddingTop: spacing.xs,
              gap: spacing.md,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => navigation.navigate("AstrologyContent" as any)}
            accessibilityRole="button"
            accessibilityLabel="Browse all daily insights"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <VText variant="labelLarge" weight="600" color="brandPrimary">
              Browse All Insights →
            </VText>
          </TouchableOpacity>

          {subscription && (
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => navigation.navigate("AstrologyDeliveries" as any)}
              accessibilityRole="button"
              accessibilityLabel="View delivery history"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <VText variant="labelLarge" weight="600" color="brandPrimary">
                Delivery History →
              </VText>
            </TouchableOpacity>
          )}
        </View>
      </VCard>

      {/* General Cosmic Insights (Free Articles Feed) */}
      <View style={[styles.section, { marginBottom: spacing.lg }]}>
        <View style={[styles.sectionHeader, { marginBottom: spacing.xs }]}>
          <View>
            <VText variant="headlineMedium" weight="600" color="textPrimary">
              Cosmic Insights
            </VText>
            <VText variant="caption" color="textMuted">
              Daily celestial transits and spiritual guidance
            </VText>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate("AstrologyContent" as any)}
            accessibilityRole="button"
            accessibilityLabel="View all cosmic insights"
            style={styles.viewAllButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <VText variant="labelLarge" weight="600" color="brandPrimary">
              View All ›
            </VText>
          </TouchableOpacity>
        </View>

        {contentError && content.length === 0 ? (
          <ErrorState
            title="Unable to Load Insights"
            message={contentError}
            onRetry={refreshContent}
          />
        ) : content.length === 0 ? (
          <EmptyState
            title="No Insights Available"
            description="No astrology insights are published at this time. Devotees can explore the archive or check back shortly."
            actionTitle="Browse All Insights"
            onAction={() => navigation.navigate("AstrologyContent" as any)}
          />
        ) : (
          content.map((item: AstrologyContentType) => (
            <AstrologyContentCard
              key={item.id}
              content={item}
              onPress={(selectedItem) =>
                navigation.navigate("AstrologyContentDetail" as any, {
                  contentId: selectedItem.id,
                })
              }
            />
          ))
        )}
      </View>

      {/* Daily Vedic Astrological Insights (Paid Feature) */}
      <View style={[styles.section, { marginBottom: spacing.lg }]}>
        <View style={[styles.sectionHeader, { marginBottom: spacing.xs }]}>
          <VText variant="headlineMedium" weight="600" color="textPrimary">
            Daily Vedic Horoscope
          </VText>
          <VText variant="caption" color="textMuted">
            {formatIndianDisplayDate(insight?.insight_date || getIndianCalendarDate())}
          </VText>
        </View>

        {/* 12-Rashi Selector Strip */}
        <RashiSelector
          selectedRashiId={selectedRashiId}
          onSelectRashi={selectRashi}
        />

        {/* Daily Insight Content Card / Entitlement Locked State */}
        <DailyRashiInsightCard
          rashi={selectedRashi}
          insight={insight}
          loading={insightLoading}
          isEntitled={isEntitled}
          isUnverifiedOffline={isUnverifiedOffline}
          error={insightError}
          onSubscribePress={() => {
            if (plans.length > 0) {
              const eligiblePlan = plans.find((p) => p.daily_in_app_enabled) || plans[0];
              navigation.navigate("AstrologyPlanDetail" as any, { planId: eligiblePlan.id });
            }
          }}
          onRetry={refreshDailyInsight}
        />
      </View>

      {/* Current Active Subscription Status */}
      {subscription && (
        <View style={[styles.section, { marginBottom: spacing.lg }]}>
          <View style={[styles.sectionHeader, { marginBottom: spacing.xs }]}>
            <VText variant="headlineMedium" weight="600" color="textPrimary">
              Your Membership
            </VText>
            <TouchableOpacity
              onPress={() => navigation.navigate("AstrologySubscription" as any)}
              style={styles.viewAllButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <VText variant="labelLarge" weight="600" color="brandPrimary">
                Details
              </VText>
            </TouchableOpacity>
          </View>
          <AstrologySubscriptionCard subscription={subscription} />
        </View>
      )}

      {/* Available Plans Catalog */}
      <View style={[styles.section, { marginBottom: spacing.lg }]}>
        <View style={[styles.sectionHeader, { marginBottom: spacing.xs }]}>
          <VText variant="headlineMedium" weight="600" color="textPrimary">
            Subscription Plans
          </VText>
        </View>

        {plans.length === 0 ? (
          <EmptyState
            title="No Plans Available"
            description="No astrology subscription plans are currently configured."
          />
        ) : (
          plans.map((plan: AstrologySubscriptionPlan, index: number) => (
            <AstrologyPlanCard
              key={plan.id}
              plan={plan}
              isPopular={index === 0}
              onSelect={(selectedPlan) =>
                navigation.navigate("AstrologyPlanDetail" as any, {
                  planId: selectedPlan.id,
                })
              }
            />
          ))
        )}
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  bannerCard: {
    borderWidth: 1,
  },
  bannerTitle: {},
  bannerDesc: {},
  quickActionsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    alignItems: "center",
  },
  quickActionButton: {
    minHeight: 48,
    justifyContent: "center",
  },
  viewAllButton: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  section: {},
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});

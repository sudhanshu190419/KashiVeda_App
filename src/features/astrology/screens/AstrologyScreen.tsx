import React, { useCallback, useRef } from "react";
import { RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Card,
  EmptyState,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, spacing } from "../../../shared/theme/index.ts";
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

  // Revalidate subscription and daily insight on screen focus (e.g. return after checkout)
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
      <ScreenContainer>
        <Header title="Vedic Astrology" />
        <LoadingState message="Loading planetary insights and plans..." />
      </ScreenContainer>
    );
  }

  if (plansError && plans.length === 0 && !subscription && content.length === 0) {
    return (
      <ScreenContainer>
        <Header title="Vedic Astrology" />
        <ErrorState
          title="Unable to Load Astrology Hub"
          message={plansError || subError || contentError || "Please check your network and try again."}
          onRetry={handleRefreshAll}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      scrollable
      padded
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefreshAll}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <Header title="Vedic Astrology" />

      {/* Vedic Astrology Introduction Banner */}
      <Card variant="elevated" style={styles.bannerCard}>
        <Text variant="captionMedium" color={colors.primaryDark}>
          ॥ ग्रहाणां चरितं शुभम् ॥
        </Text>
        <Text variant="h2" style={styles.bannerTitle}>
          Cosmic Planetary Wisdom
        </Text>
        <Text variant="body" color={colors.textSecondary} style={styles.bannerDesc}>
          Receive authentic daily Jyotish guidance and planetary transits calculated according to classical Vedic principles.
        </Text>

        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => navigation.navigate("AstrologyContent" as any)}
            accessibilityRole="button"
            accessibilityLabel="Browse all daily insights"
          >
            <Text variant="captionMedium" color={colors.primary}>
              Browse All Insights →
            </Text>
          </TouchableOpacity>

          {subscription && (
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => navigation.navigate("AstrologyDeliveries" as any)}
              accessibilityRole="button"
              accessibilityLabel="View delivery history"
            >
              <Text variant="captionMedium" color={colors.secondaryDark}>
                Delivery History →
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>

      {/* General Cosmic Insights (Free Articles Feed) */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text variant="h3">Cosmic Insights</Text>
            <Text variant="caption" color={colors.textSecondary}>
              Daily celestial transits and spiritual guidance
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate("AstrologyContent" as any)}
            accessibilityRole="button"
            accessibilityLabel="View all cosmic insights"
          >
            <Text variant="captionMedium" color={colors.primary}>
              View All ›
            </Text>
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
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text variant="h3">Daily Vedic Horoscope</Text>
          <Text variant="captionMedium" color={colors.textSecondary}>
            {formatIndianDisplayDate(insight?.insight_date || getIndianCalendarDate())}
          </Text>
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
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="h3">Your Membership</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("AstrologySubscription" as any)}
            >
              <Text variant="captionMedium" color={colors.primary}>
                Details
              </Text>
            </TouchableOpacity>
          </View>
          <AstrologySubscriptionCard subscription={subscription} />
        </View>
      )}

      {/* Available Plans Catalog */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text variant="h3">Subscription Plans</Text>
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
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  bannerCard: {
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderColor: colors.primarySubtle,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  bannerTitle: {
    marginVertical: spacing.xs,
    color: colors.primaryDark,
  },
  bannerDesc: {
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.primarySubtle,
    paddingTop: spacing.xs,
  },
  quickActionButton: {
    paddingVertical: spacing.xs,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
});

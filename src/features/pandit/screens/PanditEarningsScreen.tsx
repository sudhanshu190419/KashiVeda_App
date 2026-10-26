// src/features/pandit/screens/PanditEarningsScreen.tsx
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  Card,
  EmptyState,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { PanditPayoutCard } from "../components/PanditPayoutCard.tsx";
import { PanditPayoutFilter, usePanditEarnings } from "../hooks/usePanditEarnings.ts";
import { PanditPayoutItem } from "../types/pandit.types.ts";

export const PanditEarningsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { isDark, colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const {
    summary,
    payouts,
    loading,
    refreshing,
    loadingMore,
    error,
    filter,
    setFilter,
    refresh,
    loadMore,
  } = usePanditEarnings();

  // Refresh authoritative data when navigating to or focusing screen
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (loading && !summary) {
    return (
      <ScreenContainer padded style={{ backgroundColor: themeColors.surfaceBase }}>
        <LoadingState message="Retrieving earnings from settlement ledger..." />
      </ScreenContainer>
    );
  }

  if (error && !summary) {
    return (
      <ScreenContainer padded style={{ backgroundColor: themeColors.surfaceBase }}>
        <ErrorState
          title="Unable to load earnings"
          message={error}
          onRetry={refresh}
        />
      </ScreenContainer>
    );
  }

  const filterTabs: { key: PanditPayoutFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Awaiting Payout" },
    { key: "paid", label: "Disbursed" },
    { key: "failed", label: "Failed" },
  ];

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Back Button & Payout Setup CTA */}
      <View style={styles.topNavRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go Back"
        >
          <Text variant="bodyMedium" color={colors.primary}>
            &larr; Back
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate("PanditPayoutSetup")}
          style={styles.payoutSetupBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Payout Account Setup"
        >
          <Text variant="captionMedium" color={colors.primary}>
            Payout Account &rarr;
          </Text>
        </TouchableOpacity>
      </View>

      <Header
        title="Earnings & Payouts"
        subtitle="Authoritative Vedic Sanctum Financial Ledger"
      />

      {/* Hero Earnings Summary Card */}
      <Card
        variant="elevated"
        style={[
          styles.heroCard,
          {
            backgroundColor: isDark ? "rgba(224, 86, 36, 0.9)" : colors.primary,
          },
        ]}
      >
        <View style={styles.heroHeader}>
          <Text variant="overline" color="#FFFFFF" style={styles.heroOverline}>
            TOTAL NET EARNINGS
          </Text>
          <Text variant="display" color="#FFFFFF" style={styles.heroAmount}>
            {formatCurrency(summary?.net_earnings || 0)}
          </Text>
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.heroStatsRow}>
          <View style={styles.heroStatItem}>
            <Text variant="caption" color="rgba(255,255,255,0.85)">
              Total Gross
            </Text>
            <Text variant="bodyBold" color="#FFFFFF">
              {formatCurrency(summary?.total_gross || 0)}
            </Text>
          </View>

          <View style={styles.heroStatItem}>
            <Text variant="caption" color="rgba(255,255,255,0.85)">
              Platform Fee
            </Text>
            <Text variant="bodyBold" color="rgba(255,255,255,0.9)">
              -{formatCurrency(summary?.total_platform_fee || 0)}
            </Text>
          </View>

          <View style={styles.heroStatItem}>
            <Text variant="caption" color="rgba(255,255,255,0.85)">
              Ritual / Kundli
            </Text>
            <Text variant="captionMedium" color="#FFFFFF">
              {formatCurrency(summary?.completed_service_gross || 0)} / {formatCurrency(summary?.completed_kundli_gross || 0)}
            </Text>
          </View>
        </View>
      </Card>

      {/* Metrics Row: Paid, Pending, Failed */}
      <View style={styles.metricsRow}>
        <Card style={[styles.metricCard, { backgroundColor: themeColors.surfaceCard, borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : colors.borderLight }]}>
          <Text variant="caption" color={themeColors.textMuted}>
            Disbursed
          </Text>
          <Text variant="h2" color={colors.success || "#10b981"}>
            {formatCurrency(summary?.paid_payouts || 0)}
          </Text>
          <Text variant="overline" color={colors.success || "#10b981"}>
            ✓ Cleared to Bank
          </Text>
        </Card>

        <Card style={[styles.metricCard, { backgroundColor: themeColors.surfaceCard, borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : colors.borderLight }]}>
          <Text variant="caption" color={themeColors.textMuted}>
            Pending
          </Text>
          <Text variant="h2" color="#b45309">
            {formatCurrency(summary?.pending_payouts || 0)}
          </Text>
          <Text variant="overline" color="#b45309">
            ⏳ Settlement
          </Text>
        </Card>

        {summary && summary.failed_payouts > 0 ? (
          <Card
            style={[
              styles.metricCard,
              {
                borderColor: isDark ? "rgba(239, 68, 68, 0.4)" : "#fecaca",
                backgroundColor: isDark ? "rgba(239, 68, 68, 0.15)" : "#fef2f2",
                borderWidth: 1,
              },
            ]}
          >
            <Text variant="caption" color="#b91c1c">
              Failed
            </Text>
            <Text variant="h2" color="#b91c1c">
              {formatCurrency(summary.failed_payouts)}
            </Text>
            <Text variant="overline" color="#b91c1c">
              ⚠️ In Review
            </Text>
          </Card>
        ) : null}
      </View>

      {/* Payout History Section Title & Filter Tabs */}
      <View style={styles.historyHeaderRow}>
        <Text variant="h3" color={themeColors.textPrimary}>Payout History</Text>
      </View>

      <View style={styles.tabsRow}>
        {filterTabs.map((tab) => {
          const isActive = filter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tabButton,
                {
                  backgroundColor: isActive ? colors.primary : themeColors.surfaceCard,
                  borderColor: isActive ? colors.primary : (isDark ? "rgba(255, 255, 255, 0.12)" : colors.borderLight),
                },
              ]}
              onPress={() => setFilter(tab.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${tab.label} payout filter`}
            >
              <Text
                variant="captionMedium"
                color={isActive ? "#FFFFFF" : themeColors.textMuted}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderPayoutItem = ({ item }: { item: PanditPayoutItem }) => (
    <PanditPayoutCard payout={item} />
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyLoadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="caption" color={themeColors.textMuted} style={styles.emptyLoadingText}>
            Loading payout records...
          </Text>
        </View>
      );
    }
    return (
      <EmptyState
        title="No Payouts Recorded"
        description={
          filter === "all"
            ? "You have no payouts recorded yet. Completed ritual ceremonies and fulfilled Kundli orders automatically create verified ledger payouts."
            : `No payouts currently in '${filter}' status.`
        }
      />
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  return (
    <ScreenContainer padded style={{ backgroundColor: themeColors.surfaceBase }}>
      <FlatList
        data={payouts}
        keyExtractor={(item) => item.id}
        renderItem={renderPayoutItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 32,
  },
  headerContainer: {
    marginBottom: 10,
  },
  topNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  backButton: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    paddingRight: 16,
  },
  payoutSetupBtn: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    paddingLeft: 16,
  },
  heroCard: {
    padding: 20,
    borderRadius: 14,
    marginBottom: 16,
  },
  heroHeader: {
    alignItems: "flex-start",
  },
  heroOverline: {
    letterSpacing: 1.5,
    opacity: 0.9,
    marginBottom: 4,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: "800",
  },
  heroDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginVertical: 14,
  },
  heroStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heroStatItem: {
    flex: 1,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
  },
  historyHeaderRow: {
    marginBottom: 8,
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  tabButton: {
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyLoadingBox: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyLoadingText: {
    marginTop: 8,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: "center",
  },
});

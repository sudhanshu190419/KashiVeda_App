// src/features/pandit/screens/PanditBookingsScreen.tsx
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
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Card, Header, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { PanditBookingCard } from "../components/PanditBookingCard.tsx";
import { PanditBookingFilter, usePanditBookings } from "../hooks/usePanditBookings.ts";
import { PanditBookingItem } from "../types/pandit.types.ts";

export const PanditBookingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { isDark, colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const {
    filter,
    changeFilter,
    bookings,
    loading,
    refreshing,
    loadingMore,
    totalCount,
    hasMore,
    refresh,
    loadMore,
  } = usePanditBookings("upcoming");

  // Re-fetch bookings on screen focus
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const filterTabs: { key: PanditBookingFilter; label: string }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "today", label: "Today" },
    { key: "completed", label: "Completed" },
    { key: "all", label: "All" },
  ];

  const renderBookingItem = ({ item }: { item: PanditBookingItem }) => (
    <PanditBookingCard
      booking={item}
      onPress={() => navigation.navigate("PanditBookingDetail", { bookingId: item.id })}
    />
  );

  return (
    <ScreenContainer padded style={{ backgroundColor: themeColors.surfaceBase }}>
      <Header
        title="Assigned Rituals"
        subtitle={`Managing ${totalCount} ceremony ${totalCount === 1 ? "booking" : "bookings"}`}
        onBack={() => navigation.goBack()}
      />

      {/* Filter Tabs */}
      <View
        style={[
          styles.tabsRow,
          {
            backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : colors.surfaceSubtle || "#F5EFE6",
          },
        ]}
      >
        {filterTabs.map((tab) => {
          const isActive = filter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tabButton,
                isActive && {
                  backgroundColor: colors.primary,
                },
              ]}
              onPress={() => changeFilter(tab.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${tab.label} filter tab`}
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

      {/* Completed Tab Quick-Link to Earnings & Payout Ledger */}
      {filter === "completed" && (
        <TouchableOpacity
          style={[
            styles.earningsBanner,
            {
              backgroundColor: isDark ? "rgba(180, 83, 9, 0.15)" : "#FFFBEB",
              borderColor: isDark ? "rgba(245, 158, 11, 0.3)" : "#FDE68A",
            },
          ]}
          onPress={() => navigation.navigate("PanditEarnings")}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="View Earnings and Payouts Ledger"
        >
          <View style={styles.earningsBannerContent}>
            <Text style={styles.earningsBannerIcon}>💰</Text>
            <View style={styles.earningsBannerTextWrap}>
              <Text variant="captionMedium" color={colors.primary}>
                View Earnings &amp; Payouts Ledger
              </Text>
              <Text variant="caption" color={themeColors.textMuted}>
                Inspect bank transfers, UTR references, and lifetime Dakshina
              </Text>
            </View>
          </View>
          <Text variant="bodyBold" color={colors.primary}>
            &rarr;
          </Text>
        </TouchableOpacity>
      )}

      {/* Booking List */}
      {loading && bookings.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="caption" color={themeColors.textMuted} style={styles.loadingText}>
            Loading ritual bookings...
          </Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={renderBookingItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={[colors.primary]}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <Card style={[styles.emptyCard, { backgroundColor: themeColors.surfaceCard, borderColor: themeColors.borderDefault }]}>
              <Text variant="h3" color={themeColors.textPrimary} align="center" style={styles.emptyTitle}>
                🪔 No Rituals Found
              </Text>
              <Text variant="body" color={themeColors.textMuted} align="center">
                There are no {filter !== "all" ? filter : ""} bookings assigned to your Acharya profile right now.
              </Text>
            </Card>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : hasMore ? (
              <TouchableOpacity onPress={loadMore} style={styles.loadMoreBtn}>
                <Text variant="captionMedium" color={colors.primary}>
                  Load More Bookings
                </Text>
              </TouchableOpacity>
            ) : undefined
          }
        />
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  tabsRow: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: 24,
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
  },
  emptyCard: {
    paddingVertical: 32,
    paddingHorizontal: 16,
    marginTop: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  emptyTitle: {
    marginBottom: 8,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: "center",
  },
  loadMoreBtn: {
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  earningsBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    minHeight: 52,
  },
  earningsBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  earningsBannerIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  earningsBannerTextWrap: {
    flex: 1,
  },
});

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
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { PanditBookingCard } from "../components/PanditBookingCard.tsx";
import { PanditBookingFilter, usePanditBookings } from "../hooks/usePanditBookings.ts";
import { PanditBookingItem } from "../types/pandit.types.ts";

export const PanditBookingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
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
    <ScreenContainer padded>
      <Header
        title="Assigned Rituals"
        subtitle={`Managing ${totalCount} ceremony ${totalCount === 1 ? "booking" : "bookings"}`}
      />

      {/* Filter Tabs */}
      <View style={styles.tabsRow}>
        {filterTabs.map((tab) => {
          const isActive = filter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => changeFilter(tab.key)}
              activeOpacity={0.7}
            >
              <Text
                variant="captionMedium"
                color={isActive ? colors.surface : colors.textSecondary}
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
          style={styles.earningsBanner}
          onPress={() => navigation.navigate("PanditEarnings")}
          activeOpacity={0.8}
        >
          <View style={styles.earningsBannerContent}>
            <Text style={styles.earningsBannerIcon}>💰</Text>
            <View style={styles.earningsBannerTextWrap}>
              <Text variant="captionMedium" color={colors.primary}>
                View Earnings &amp; Payouts Ledger
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
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
          <Text variant="caption" color={colors.textSecondary} style={styles.loadingText}>
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
            <Card style={styles.emptyCard}>
              <Text variant="h3" align="center" style={styles.emptyTitle}>
                🪔 No Rituals Found
              </Text>
              <Text variant="body" color={colors.textSecondary} align="center">
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
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: 3,
    marginBottom: spacing.sm,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.xs,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  loadingBox: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  loadingText: {
    marginTop: spacing.xs,
  },
  emptyCard: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  emptyTitle: {
    marginBottom: spacing.xs,
  },
  footerLoader: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  loadMoreBtn: {
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  earningsBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  earningsBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: spacing.sm,
  },
  earningsBannerIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  earningsBannerTextWrap: {
    flex: 1,
  },
});

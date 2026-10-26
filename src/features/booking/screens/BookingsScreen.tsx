// src/features/booking/screens/BookingsScreen.tsx
import React, { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  VDivider,
  LiveStatusPill,
  EmptyState,
  VTabs,
  TabItem,
} from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency, formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { useBookingHistory } from "../hooks/useBookingHistory.ts";
import { BookingDetail } from "../types/booking.types.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const BookingsScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const [filter, setFilter] = useState<string>("all");

  const { colors, spacing } = useTheme();
  const { pick } = useLanguage();

  const {
    bookings,
    loading,
    refreshing,
    refresh,
    loadMore,
  } = useBookingHistory(filter);

  const filters: TabItem[] = [
    { id: "all", label: "All" },
    { id: "upcoming", label: "Upcoming" },
    { id: "completed", label: "Completed" },
    { id: "cancelled", label: "Cancelled" },
  ];

  const renderBookingItem = ({ item }: { item: BookingDetail }) => {
    const startDate = new Date(item.scheduled_start_at);

    return (
      <TouchableOpacity
        onPress={() => navigation.navigate("BookingDetail", { bookingId: item.id })}
        activeOpacity={0.7}
        style={{ minHeight: 48 }}
        accessibilityRole="button"
        accessibilityLabel={`Booking ${item.booking_number}, ${item.puja_service?.name || "Vedic Puja"}`}
      >
        <VCard variant="default" elevation={1} style={styles.bookingCard}>
          <View style={styles.cardTopRow}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <VText variant="caption" color="textMuted">
                {item.booking_number}
              </VText>
              <VText variant="titleMedium" color="textPrimary" weight="600" style={styles.pujaTitle}>
                {item.puja_service?.name || "Vedic Puja"}
              </VText>
            </View>
            <LiveStatusPill status={item.status} />
          </View>

          <View style={styles.cardMidRow}>
            <View style={styles.panditRow}>
              <VText variant="bodyMedium">🪔</VText>
              <VText variant="bodyMedium" color="textMuted" style={{ marginLeft: spacing.xs }}>
                {item.pandit?.display_name || "Assigned Acharya"}
              </VText>
            </View>
            <View
              style={[
                styles.modeBadge,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.borderDefault,
                },
              ]}
            >
              <VText variant="caption" color="brandPrimary" style={styles.modeText}>
                {item.service_mode}
              </VText>
            </View>
          </View>

          <VDivider style={{ marginVertical: spacing.xs }} />

          <View style={styles.cardBottomRow}>
            <View>
              <VText variant="caption" color="textMuted">
                Scheduled For
              </VText>
              <VText variant="bodyMedium" weight="600">
                {formatDate(startDate)} at {formatTime(startDate)}
              </VText>
            </View>

            <View style={styles.amountBox}>
              <VText variant="caption" color="textMuted" align="right">
                Dakshina
              </VText>
              <VText variant="titleMedium" color="brandPrimary" align="right" weight="700">
                {formatCurrency(item.total_amount)}
              </VText>
            </View>
          </View>
        </VCard>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenWrapper
      safeArea="all"
      scrollable={false}
      headerComponent={
        <AppBar
          title="My Rituals"
          subtitle={pick("सत्यापित पूजा एवं आगामी अनुष्ठानों का प्रबंधन", "Manage your sacred bookings and upcoming ceremonies")}
          showBrandGlyph={true}
        />
      }
      contentContainerStyle={{ flex: 1, paddingHorizontal: spacing.md }}
    >
      {/* Filter Tabs via Territory G VTabs */}
      <View style={styles.tabsWrap}>
        <VTabs
          tabs={filters}
          activeTab={filter}
          onTabChange={(tabId) => setFilter(tabId)}
          variant="pill"
        />
      </View>

      {/* Booking List */}
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={renderBookingItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.brandPrimary}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <VCard variant="default" style={styles.emptyCard}>
              <EmptyState
                title="No Rituals Found"
                description={
                  filter === "all"
                    ? "You have not scheduled any ritual bookings yet. Explore sanctified ceremonies from Kashi."
                    : `No ${filter} rituals found.`
                }
                actionTitle="Explore Rituals"
                onAction={() => navigation.navigate("PujaList" as any)}
              />
            </VCard>
          ) : undefined
        }
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  tabsWrap: {
    marginVertical: 12,
  },
  listContent: {
    gap: 12,
    paddingBottom: 32,
  },
  bookingCard: {
    padding: 16,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  pujaTitle: {
    marginTop: 2,
  },
  cardMidRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 8,
  },
  panditRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  modeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountBox: {
    alignItems: "flex-end",
  },
  emptyCard: {
    paddingVertical: 32,
    marginTop: 16,
  },
  modeText: {
    textTransform: "capitalize",
  },
});

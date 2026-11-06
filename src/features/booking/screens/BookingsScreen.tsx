// src/features/booking/screens/BookingsScreen.tsx
import React, { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  EmptyState,
  VTabs,
  TabItem,
  UpcomingPujaCard,
} from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatDate, formatTime } from "../../../shared/utils/formatters.ts";
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
    const locationStr =
      item.temple?.name ||
      (item.service_mode === "home" ? "Devotee Residence" : undefined);

    return (
      <UpcomingPujaCard
        pujaName={item.puja_service?.name || "Vedic Puja"}
        location={locationStr}
        serviceMode={item.service_mode as any}
        status={item.status}
        dateString={formatDate(startDate)}
        timeString={formatTime(startDate)}
        panditName={item.pandit?.display_name || "Assigned Pandit Ji"}
        sankalpName={item.notes || undefined}
        onPress={() => navigation.navigate("BookingDetail", { bookingId: item.id })}
        onActionPress={() => navigation.navigate("BookingDetail", { bookingId: item.id })}
        actionLabel={pick("विवरण देखें", "View Booking Details")}
        style={{ marginBottom: spacing.md }}
        testID={`booking-card-${item.id}`}
      />
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
    paddingVertical: 8,
  },
  listContent: {
    paddingBottom: 24,
    paddingTop: 4,
  },
  emptyCard: {
    padding: 24,
    alignItems: "center",
  },
});

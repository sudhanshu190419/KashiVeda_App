// src/features/booking/screens/BookingsScreen.tsx
import React, { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Card, EmptyState, Header, LoadingState, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency, formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { BookingStatusBadge } from "../components/index.ts";
import { useBookingHistory } from "../hooks/useBookingHistory.ts";
import { BookingDetail } from "../types/booking.types.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const BookingsScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const [filter, setFilter] = useState<string>("all");

  const {
    bookings,
    loading,
    refreshing,
    refresh,
    loadMore,
  } = useBookingHistory(filter);

  const filters = [
    { key: "all", label: "All" },
    { key: "upcoming", label: "Upcoming" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  const renderBookingItem = ({ item }: { item: BookingDetail }) => {
    const startDate = new Date(item.scheduled_start_at);

    return (
      <TouchableOpacity
        onPress={() => navigation.navigate("BookingDetail", { bookingId: item.id })}
        activeOpacity={0.7}
      >
        <Card variant="elevated" style={styles.bookingCard}>
          <View style={styles.cardTopRow}>
            <View>
              <Text variant="caption" color={colors.textSecondary}>
                {item.booking_number}
              </Text>
              <Text variant="h3" style={styles.pujaTitle}>
                {item.puja_service?.name || "Vedic Puja"}
              </Text>
            </View>
            <BookingStatusBadge status={item.status} />
          </View>

          <View style={styles.cardMidRow}>
            <View style={styles.panditRow}>
              <Text style={styles.panditIcon}>🪔</Text>
              <Text variant="body" color={colors.textSecondary}>
                {item.pandit?.display_name || "Assigned Acharya"}
              </Text>
            </View>
            <View style={styles.modeBadge}>
              <Text variant="caption" color={colors.primary} style={styles.modeText}>
                {item.service_mode}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.cardBottomRow}>
            <View>
              <Text variant="caption" color={colors.textSecondary}>
                Scheduled For
              </Text>
              <Text variant="bodyMedium">
                {formatDate(startDate)} at {formatTime(startDate)}
              </Text>
            </View>

            <View style={styles.amountBox}>
              <Text variant="caption" color={colors.textSecondary} align="right">
                Dakshina
              </Text>
              <Text variant="bodyMedium" color={colors.primary} align="right">
                {formatCurrency(item.total_amount)}
              </Text>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer padded>
      <Header
        title="My Rituals"
        subtitle="Manage your sacred bookings and upcoming ceremonies"
      />

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text
              variant="captionMedium"
              color={filter === f.key ? colors.primary : colors.textSecondary}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Booking List */}
      {loading && !refreshing && bookings.length === 0 ? (
        <LoadingState message="Retrieving your sacred bookings..." />
      ) : (
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
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <EmptyState
                title="No Rituals Found"
                description={
                  filter === "all"
                    ? "You have not scheduled any ritual bookings yet. Explore sanctified ceremonies from Kashi."
                    : `No ${filter} rituals found.`
                }
                actionTitle="Explore Rituals"
                onAction={() => navigation.navigate("PujaList")}
              />
            </Card>
          }
        />
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
  },
  filterChipActive: {
    backgroundColor: "#FFF8F6",
    borderColor: colors.primary,
    borderWidth: 1,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  bookingCard: {
    padding: spacing.md,
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
    marginVertical: spacing.xs,
  },
  panditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  panditIcon: {
    fontSize: 16,
  },
  modeBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xs,
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
    paddingVertical: spacing.xl,
    marginTop: spacing.md,
  },
  modeText: {
    textTransform: "capitalize",
  },
});

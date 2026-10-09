// src/features/pandit/screens/PanditDashboardScreen.tsx
import React from "react";
import { RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Card, ErrorState, LoadingState, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { PanditBookingCard } from "../components/PanditBookingCard.tsx";
import { usePanditDashboard } from "../hooks/usePanditDashboard.ts";

export const PanditDashboardScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { summary, loading, refreshing, error, refresh } = usePanditDashboard();

  if (loading && !summary) {
    return (
      <ScreenContainer padded>
        <LoadingState message="Connecting to Pandit Sanctum..." />
      </ScreenContainer>
    );
  }

  if (error && !summary) {
    return (
      <ScreenContainer padded>
        <ErrorState
          title="Unable to load Dashboard"
          message={error}
          onRetry={refresh}
        />
      </ScreenContainer>
    );
  }

  const today = new Date();
  const nextBooking = summary?.nextBooking;
  const nextStart = nextBooking ? new Date(nextBooking.scheduled_start_at) : null;

  return (
    <ScreenContainer
      scrollable
      padded
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} />}
    >
      {/* Header Blessing */}
      <View style={styles.header}>
        <Text variant="captionMedium" color={colors.primary}>
          ॥ पण्डित सेवा कक्ष • काशी ॥
        </Text>
        <Text variant="h1">
          {`Pranam, ${summary?.pandit?.display_name || "Acharya"}`}
        </Text>
        <Text variant="caption" color={colors.textSecondary}>
          {formatDate(today)} • Authorized Vedic Priest
        </Text>
      </View>

      {/* Profile & Status Card */}
      <Card variant="elevated" style={styles.statusCard}>
        <View style={styles.statusHeaderRow}>
          <View>
            <Text variant="overline" color={colors.secondaryDark}>
              Operational Status
            </Text>
            <Text variant="h3">
              {summary?.pandit?.verification_status === "approved"
                ? "Verified Acharya ✓"
                : "Verification Pending"}
            </Text>
          </View>
          <View style={[styles.statusBadge, summary?.pandit?.public_status === "available" ? styles.statusAvailable : styles.statusUnavailable]}>
            <Text variant="caption" color={colors.surface} style={styles.statusBadgeText}>
              {summary?.pandit?.public_status || "available"}
            </Text>
          </View>
        </View>

        {!summary?.verifiedBankAccount ? (
          <TouchableOpacity
            style={styles.locationWarning}
            onPress={() => navigation.navigate("PanditPayoutSetup")}
            activeOpacity={0.8}
          >
            <Text style={styles.warningIcon}>💳</Text>
            <View style={styles.locationWarningTextWrap}>
              <Text variant="captionMedium" color="#b45309">
                Payout Bank Account Setup
              </Text>
              <Text variant="caption" color="#92400e">
                Bank account verification required by admin for ritual payout disbursements.
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {summary?.pandit?.base_latitude == null || summary?.pandit?.base_longitude == null ? (
          <TouchableOpacity
            style={styles.locationWarning}
            onPress={() => navigation.navigate("PanditServiceLocation")}
            activeOpacity={0.8}
          >
            <Text style={styles.warningIcon}>📍</Text>
            <View style={styles.locationWarningTextWrap}>
              <Text variant="captionMedium" color="#b45309">
                Home Service Location Not Configured
              </Text>
              <Text variant="caption" color="#92400e">
                Tap here to set your operational base and enable Home Puja bookings.
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </Card>

      {/* Metrics Row */}
      <View style={styles.metricsRow}>
        <Card style={styles.metricCard}>
          <Text variant="h1" color={colors.primary}>
            {summary?.todayBookingsCount || 0}
          </Text>
          <Text variant="captionMedium" color={colors.textSecondary}>
            Today&apos;s Rituals
          </Text>
        </Card>

        <Card style={styles.metricCard}>
          <Text variant="h1" color={colors.secondary}>
            {summary?.upcomingBookingsCount || 0}
          </Text>
          <Text variant="captionMedium" color={colors.textSecondary}>
            Upcoming
          </Text>
        </Card>

        <Card style={styles.metricCard}>
          <Text variant="h1" color={colors.success}>
            {summary?.completedBookingsCount || 0}
          </Text>
          <Text variant="captionMedium" color={colors.textSecondary}>
            Completed
          </Text>
        </Card>
      </View>

      {/* Next Ritual Spotlight */}
      {nextBooking && nextStart ? (
        <View style={styles.section}>
          <Text variant="h3" style={styles.sectionTitle}>
            Next Scheduled Ritual
          </Text>
          <Card variant="elevated" style={styles.nextCard}>
            <View style={styles.nextHeader}>
              <View style={styles.nextTimePill}>
                <Text variant="captionMedium" color={colors.primary}>
                  Today at {formatTime(nextStart)}
                </Text>
              </View>
              <Text variant="caption" color={colors.textSecondary}>
                Ref: {nextBooking.booking_number}
              </Text>
            </View>

            <Text variant="h2" style={styles.nextPujaName}>
              {nextBooking.puja_service?.name || "Vedic Ritual"}
            </Text>

            <Text variant="body" color={colors.textSecondary}>
              Devotee: {nextBooking.customer?.display_name || "Devotee"} ({nextBooking.service_mode} mode)
            </Text>

            <Button
              title="View Ritual Details & Location"
              variant="primary"
              size="sm"
              onPress={() => navigation.navigate("PanditBookingDetail", { bookingId: nextBooking.id })}
              style={styles.nextButton}
            />
          </Card>
        </View>
      ) : null}

      {/* Today's Rituals List */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text variant="h3">Today&apos;s Schedule</Text>
          <TouchableOpacity onPress={() => navigation.navigate("PanditBookings")}>
            <Text variant="captionMedium" color={colors.primary}>
              View All &gt;
            </Text>
          </TouchableOpacity>
        </View>

        {summary && summary.todayBookings.length > 0 ? (
          summary.todayBookings.map((bk) => (
            <PanditBookingCard
              key={bk.id}
              booking={bk}
              onPress={() => navigation.navigate("PanditBookingDetail", { bookingId: bk.id })}
            />
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <Text variant="body" color={colors.textSecondary} align="center">
              No rituals scheduled for today. May Lord Shiva bless your day.
            </Text>
          </Card>
        )}
      </View>

      {/* Quick Access Actions */}
      <View style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          Schedule & Operational Actions
        </Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("PanditAvailability")}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>📅</Text>
            <Text variant="bodyMedium" style={styles.actionTitle}>
              Weekly Schedule
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              Adjust your recurring daily working hours
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("PanditUnavailableBlocks")}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>🚫</Text>
            <Text variant="bodyMedium" style={styles.actionTitle}>
              Block Dates
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              Mark ad-hoc personal or travel unavailability
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("PanditEarnings")}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>💰</Text>
            <Text variant="bodyMedium" style={styles.actionTitle}>
              Earnings &amp; Payouts
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              View ritual Dakshina and bank settlement ledger
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("PanditServiceLocation")}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>📍</Text>
            <Text variant="bodyMedium" style={styles.actionTitle}>
              Service Location
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              Configure Home Puja coverage radius and operational base
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    marginVertical: spacing.md,
  },
  statusCard: {
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  statusHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xs,
  },
  statusAvailable: {
    backgroundColor: colors.success,
  },
  statusUnavailable: {
    backgroundColor: colors.textTertiary,
  },
  statusBadgeText: {
    textTransform: "capitalize",
    fontWeight: "600",
  },
  bankWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: radius.xs,
    padding: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  warningIcon: {
    fontSize: 16,
  },
  bankWarningText: {
    flex: 1,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metricCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  nextCard: {
    padding: spacing.md,
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: "#FFFDFB",
  },
  nextHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  nextTimePill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  nextPujaName: {
    fontSize: 18,
    marginBottom: spacing.xxs,
  },
  nextButton: {
    marginTop: spacing.sm,
  },
  emptyCard: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  locationWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderColor: "#FCD34D",
    borderWidth: 1,
    borderRadius: radius.xs,
    padding: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  locationWarningTextWrap: {
    flex: 1,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  actionTitle: {
    marginBottom: 2,
  },
});

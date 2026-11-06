// src/features/pandit/screens/PanditDashboardScreen.tsx
import React from "react";
import { RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Card, ErrorState, LoadingState, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { PanditBookingCard } from "../components/PanditBookingCard.tsx";
import { usePanditDashboard } from "../hooks/usePanditDashboard.ts";

export const PanditDashboardScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { isDark, colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";
  const { summary, loading, refreshing, error, refresh } = usePanditDashboard();

  if (loading && !summary) {
    return (
      <ScreenContainer padded style={{ backgroundColor: themeColors.surfaceBase }}>
        <LoadingState message="Connecting to Pandit Sanctum..." />
      </ScreenContainer>
    );
  }

  if (error && !summary) {
    return (
      <ScreenContainer padded style={{ backgroundColor: themeColors.surfaceBase }}>
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
      style={{ backgroundColor: themeColors.surfaceBase }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} />}
    >
      {/* Sacred Sanctum Banner & Pandit Ji Blessing */}
      <View style={styles.header}>
        <View style={[styles.sacredTopPill, { backgroundColor: isDark ? "rgba(224, 86, 36, 0.15)" : "#FEF3EB" }]}>
          <Text
            variant="captionMedium"
            color={colors.primary}
            style={{ lineHeight: getDevanagariLineHeight(13) }}
          >
            ॥ पण्डित सेवा कक्ष • काशी ॥
          </Text>
        </View>
        <Text variant="h1" color={themeColors.textPrimary} style={styles.greetingTitle}>
          {`Pranam, ${summary?.pandit?.display_name || "Pandit Ji"}`}
        </Text>
        <Text variant="caption" color={themeColors.textMuted}>
          {formatDate(today)} • Authorized Vedic Priest
        </Text>
      </View>

      {/* Profile & Operational Status Card */}
      <Card
        variant="elevated"
        style={[
          styles.statusCard,
          {
            backgroundColor: themeColors.surfaceCard,
            borderColor: themeColors.borderDefault,
          },
        ]}
      >
        <View style={styles.statusHeaderRow}>
          <View>
            <Text variant="overline" color={colors.secondaryDark || colors.primary}>
              Operational Status
            </Text>
            <Text variant="h3" color={themeColors.textPrimary}>
              {summary?.pandit?.verification_status === "approved"
                ? "Verified Pandit Ji ✓"
                : "Verification Pending"}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              summary?.pandit?.public_status === "available"
                ? { backgroundColor: colors.success || "#10B981" }
                : { backgroundColor: colors.textTertiary || "#9CA3AF" },
            ]}
          >
            <Text variant="caption" color="#FFFFFF" style={styles.statusBadgeText}>
              {summary?.pandit?.public_status || "available"}
            </Text>
          </View>
        </View>

        {!summary?.verifiedBankAccount ? (
          <TouchableOpacity
            style={[
              styles.locationWarning,
              {
                backgroundColor: isDark ? "rgba(180, 83, 9, 0.2)" : "#FEF3C7",
                borderColor: isDark ? "rgba(245, 158, 11, 0.4)" : "#FCD34D",
              },
            ]}
            onPress={() => navigation.navigate("PanditPayoutSetup")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Payout Bank Account Setup"
          >
            <Text style={styles.warningIcon}>💳</Text>
            <View style={styles.locationWarningTextWrap}>
              <Text variant="captionMedium" color={isDark ? "#FDE68A" : "#B45309"}>
                Payout Bank Account Setup
              </Text>
              <Text variant="caption" color={isDark ? "#FCD34D" : "#92400E"}>
                Bank account verification required by admin for ritual payout disbursements.
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {summary?.pandit?.base_latitude == null || summary?.pandit?.base_longitude == null ? (
          <TouchableOpacity
            style={[
              styles.locationWarning,
              {
                backgroundColor: isDark ? "rgba(180, 83, 9, 0.2)" : "#FEF3C7",
                borderColor: isDark ? "rgba(245, 158, 11, 0.4)" : "#FCD34D",
              },
            ]}
            onPress={() => navigation.navigate("PanditServiceLocation")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Configure Service Location"
          >
            <Text style={styles.warningIcon}>📍</Text>
            <View style={styles.locationWarningTextWrap}>
              <Text variant="captionMedium" color={isDark ? "#FDE68A" : "#B45309"}>
                Home Service Location Not Configured
              </Text>
              <Text variant="caption" color={isDark ? "#FCD34D" : "#92400E"}>
                Tap here to set your operational base and enable Home Puja bookings.
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </Card>

      {/* Metrics Row */}
      <View style={styles.metricsRow}>
        <Card style={[styles.metricCard, { backgroundColor: themeColors.surfaceCard, borderColor: themeColors.borderDefault }]}>
          <Text variant="h1" color={colors.primary}>
            {summary?.todayBookingsCount || 0}
          </Text>
          <Text variant="captionMedium" color={themeColors.textMuted}>
            Today&apos;s Rituals
          </Text>
        </Card>

        <Card style={[styles.metricCard, { backgroundColor: themeColors.surfaceCard, borderColor: themeColors.borderDefault }]}>
          <Text variant="h1" color={colors.secondary || "#D97706"}>
            {summary?.upcomingBookingsCount || 0}
          </Text>
          <Text variant="captionMedium" color={themeColors.textMuted}>
            Upcoming
          </Text>
        </Card>

        <Card style={[styles.metricCard, { backgroundColor: themeColors.surfaceCard, borderColor: themeColors.borderDefault }]}>
          <Text variant="h1" color={colors.success || "#10B981"}>
            {summary?.completedBookingsCount || 0}
          </Text>
          <Text variant="captionMedium" color={themeColors.textMuted}>
            Completed
          </Text>
        </Card>
      </View>

      {/* Next Ritual Spotlight */}
      {nextBooking && nextStart ? (
        <View style={styles.section}>
          <Text variant="h3" color={themeColors.textPrimary} style={styles.sectionTitle}>
            Next Scheduled Ritual
          </Text>
          <Card
            variant="elevated"
            style={[
              styles.nextCard,
              {
                borderColor: colors.primary,
                backgroundColor: isDark ? "rgba(224, 86, 36, 0.08)" : "#FFFDFB",
              },
            ]}
          >
            <View style={styles.nextHeader}>
              <View
                style={[
                  styles.nextTimePill,
                  {
                    backgroundColor: isDark ? "rgba(224, 86, 36, 0.2)" : colors.primaryLight || "#FEF3EB",
                  },
                ]}
              >
                <Text variant="captionMedium" color={colors.primary}>
                  Today at {formatTime(nextStart)}
                </Text>
              </View>
              <Text variant="caption" color={themeColors.textMuted}>
                Ref: {nextBooking.booking_number}
              </Text>
            </View>

            <Text variant="h2" color={themeColors.textPrimary} style={styles.nextPujaName}>
              {nextBooking.puja_service?.name || "Vedic Ritual"}
            </Text>

            <Text variant="body" color={themeColors.textMuted}>
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
          <Text variant="h3" color={themeColors.textPrimary}>Today&apos;s Schedule</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate("PanditBookings")}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.viewAllBtn}
            accessibilityRole="button"
            accessibilityLabel="View All Bookings"
          >
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
          <Card style={[styles.emptyCard, { backgroundColor: themeColors.surfaceCard, borderColor: themeColors.borderDefault }]}>
            <Text variant="body" color={themeColors.textMuted} align="center">
              No rituals scheduled for today. May Lord Shiva bless your day.
            </Text>
          </Card>
        )}
      </View>

      {/* Quick Access Actions */}
      <View style={styles.section}>
        <Text variant="h3" color={themeColors.textPrimary} style={styles.sectionTitle}>
          Schedule & Operational Actions
        </Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={[
              styles.actionCard,
              {
                backgroundColor: themeColors.surfaceCard,
                borderColor: themeColors.borderDefault,
              },
            ]}
            onPress={() => navigation.navigate("PanditAvailability")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Weekly Schedule"
          >
            <Text style={styles.actionIcon}>📅</Text>
            <Text variant="bodyMedium" color={themeColors.textPrimary} style={styles.actionTitle}>
              Weekly Schedule
            </Text>
            <Text variant="caption" color={themeColors.textMuted}>
              Adjust your recurring daily working hours
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionCard,
              {
                backgroundColor: themeColors.surfaceCard,
                borderColor: themeColors.borderDefault,
              },
            ]}
            onPress={() => navigation.navigate("PanditUnavailableBlocks")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Block Dates"
          >
            <Text style={styles.actionIcon}>🚫</Text>
            <Text variant="bodyMedium" color={themeColors.textPrimary} style={styles.actionTitle}>
              Block Dates
            </Text>
            <Text variant="caption" color={themeColors.textMuted}>
              Mark ad-hoc personal or travel unavailability
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionCard,
              {
                backgroundColor: themeColors.surfaceCard,
                borderColor: themeColors.borderDefault,
              },
            ]}
            onPress={() => navigation.navigate("PanditEarnings")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Earnings and Payouts"
          >
            <Text style={styles.actionIcon}>💰</Text>
            <Text variant="bodyMedium" color={themeColors.textPrimary} style={styles.actionTitle}>
              Earnings &amp; Payouts
            </Text>
            <Text variant="caption" color={themeColors.textMuted}>
              View ritual Dakshina and bank settlement ledger
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionCard,
              {
                backgroundColor: themeColors.surfaceCard,
                borderColor: themeColors.borderDefault,
              },
            ]}
            onPress={() => navigation.navigate("PanditServiceLocation")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Service Location"
          >
            <Text style={styles.actionIcon}>📍</Text>
            <Text variant="bodyMedium" color={themeColors.textPrimary} style={styles.actionTitle}>
              Service Location
            </Text>
            <Text variant="caption" color={themeColors.textMuted}>
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
    marginVertical: 12,
  },
  sacredTopPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  greetingTitle: {
    marginBottom: 2,
  },
  statusCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  statusHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    textTransform: "capitalize",
    fontWeight: "600",
  },
  locationWarning: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    gap: 8,
    minHeight: 48,
  },
  warningIcon: {
    fontSize: 18,
  },
  locationWarningTextWrap: {
    flex: 1,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  viewAllBtn: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  nextCard: {
    padding: 16,
    borderWidth: 1.5,
    borderRadius: radius.md,
  },
  nextHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  nextTimePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nextPujaName: {
    fontSize: 18,
    marginBottom: 4,
  },
  nextButton: {
    marginTop: 12,
    minHeight: 48,
  },
  emptyCard: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    minHeight: 110,
    justifyContent: "center",
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  actionTitle: {
    marginBottom: 2,
  },
});

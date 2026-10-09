// src/features/booking/screens/BookingSuccessScreen.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Card, ErrorState, LoadingState, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency, formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { BookingStatusBadge } from "../components/index.ts";
import { useBookingDetails } from "../hooks/useBookingDetails.ts";

type BookingSuccessRouteProp = RouteProp<CustomerStackParamList, "BookingSuccess">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const BookingSuccessScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<BookingSuccessRouteProp>();
  const bookingId = route.params?.bookingId || "";

  const { booking, loading, refreshing, error, refresh } = useBookingDetails(bookingId);

  if (loading || refreshing) {
    return (
      <ScreenContainer padded>
        <LoadingState message="Retrieving your confirmed sankalp..." />
      </ScreenContainer>
    );
  }

  if (error || !booking) {
    return (
      <ScreenContainer padded>
        <ErrorState
          title="Sankalp Retrieval Notice"
          message={error || "Your ritual is confirmed, but we could not load the details right now. Please try again."}
          onRetry={refresh}
        />
      </ScreenContainer>
    );
  }

  const startDate = new Date(booking.scheduled_start_at);

  return (
    <ScreenContainer scrollable padded>
      <View style={styles.container}>
        {/* Sacred Celebration Banner */}
        <View style={styles.celebrationHeader}>
          <Text style={styles.bellIcon}>🔔</Text>
          <Text variant="h1" color={colors.primary} align="center" style={styles.mainTitle}>
            Sankalp Confirmed!
          </Text>
          <Text variant="body" color={colors.textSecondary} align="center" style={styles.subTitle}>
            Har Har Mahadev! Your sacred ritual has been successfully scheduled.
          </Text>
        </View>

        {/* Confirmed Details Card */}
        <Card variant="elevated" style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text variant="caption" color={colors.textSecondary}>
                Booking Reference
              </Text>
              <Text variant="bodyMedium" color={colors.textPrimary}>
                {booking.booking_number}
              </Text>
            </View>
            <BookingStatusBadge status={booking.status} />
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text variant="caption" color={colors.textSecondary}>Sacred Ritual</Text>
            <Text variant="bodyMedium">{booking.puja_service?.name || "Vedic Puja"}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text variant="caption" color={colors.textSecondary}>Acharya</Text>
            <Text variant="bodyMedium">{booking.pandit?.display_name || "Assigned Pandit"}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text variant="caption" color={colors.textSecondary}>Format</Text>
            <Text variant="bodyMedium" style={styles.formatText}>
              {booking.service_mode} Ritual
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text variant="caption" color={colors.textSecondary}>Date & Time</Text>
            <Text variant="bodyMedium">
              {formatDate(startDate)} at {formatTime(startDate)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text variant="caption" color={colors.textSecondary}>Location</Text>
            <Text variant="bodyMedium" style={styles.locationText}>
              {booking.service_mode === "home"
                ? booking.location?.address_snapshot || `${booking.location?.city || "Home"}`
                : booking.service_mode === "temple"
                ? booking.location?.temple_name_snapshot || "Temple Sanctum"
                : "LiveKit Cloud HD Room (Opens 15m prior)"}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text variant="caption" color={colors.textSecondary}>Advance Paid</Text>
            <Text variant="h3" color={colors.primary}>
              {formatCurrency(booking.advance_amount)}
            </Text>
          </View>

          {booking.balance_amount > 0 && (
            <View style={styles.balanceNote}>
              <Text variant="caption" color={colors.textSecondary}>
                Remaining balance of {formatCurrency(booking.balance_amount)} will be settled online before the ritual.
              </Text>
            </View>
          )}
        </Card>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            title="View Full Booking Details"
            variant="primary"
            size="lg"
            onPress={() => navigation.replace("BookingDetail", { bookingId: booking.id })}
          />
          <Button
            title="Back to Home"
            variant="outline"
            size="md"
            onPress={() => navigation.navigate("CustomerTabs")}
          />
        </View>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
  },
  celebrationHeader: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  bellIcon: {
    fontSize: 48,
    marginBottom: spacing.xs,
  },
  mainTitle: {
    marginBottom: spacing.xxs,
  },
  subTitle: {
    paddingHorizontal: spacing.md,
    lineHeight: 20,
  },
  card: {
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  locationText: {
    maxWidth: "60%",
    textAlign: "right",
  },
  balanceNote: {
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
  },
  formatText: {
    textTransform: "capitalize",
  },
});

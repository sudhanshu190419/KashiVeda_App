// src/features/booking/screens/BookingSuccessScreen.tsx
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  VCard,
  VText,
  VButton,
  VDivider,
  LiveStatusPill,
  EscrowBadge,
} from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency, formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { useBookingDetails } from "../hooks/useBookingDetails.ts";

type BookingSuccessRouteProp = RouteProp<CustomerStackParamList, "BookingSuccess">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const BookingSuccessScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<BookingSuccessRouteProp>();
  const bookingId = route.params?.bookingId || "";

  const { colors, spacing, radii } = useTheme();
  const { pick } = useLanguage();

  const { booking, loading, refreshing, error, refresh } = useBookingDetails(bookingId);

  if (loading || refreshing) {
    return (
      <ScreenWrapper safeArea="all" scrollable={false} contentContainerStyle={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <VText variant="bodyMedium" color="textMuted" style={{ marginTop: spacing.md }}>
          {pick("संकल्प विवरण प्राप्त किया जा रहा है...", "Retrieving your confirmed sankalp...")}
        </VText>
      </ScreenWrapper>
    );
  }

  if (error || !booking) {
    return (
      <ScreenWrapper safeArea="all" scrollable={false} contentContainerStyle={styles.centerContainer}>
        <VCard
          variant="outlined"
          style={[
            styles.errorCard,
            {
              backgroundColor: colors.errorBg,
              borderColor: colors.statusAlert,
            },
          ]}
        >
          <VText variant="headlineMedium" color="error" align="center" style={{ marginBottom: spacing.sm }}>
            Sankalp Retrieval Notice
          </VText>
          <VText variant="bodyMedium" color="textMuted" align="center" style={{ marginBottom: spacing.lg }}>
            {error || "Your ritual is confirmed, but we could not load the details right now. Please try again."}
          </VText>
          <VButton
            title="Try Again"
            label="Try Again"
            variant="outline"
            size="md"
            onPress={refresh}
            style={{ minHeight: 48, minWidth: 160 }}
          />
        </VCard>
      </ScreenWrapper>
    );
  }

  const startDate = new Date(booking.scheduled_start_at);

  return (
    <ScreenWrapper
      safeArea="all"
      scrollable={true}
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxl }}
    >
      <View style={styles.container}>
        {/* Sacred Celebration Banner */}
        <View style={styles.celebrationHeader}>
          <VText variant="displayHero" align="center" style={styles.bellIcon}>
            🔔
          </VText>
          <VText variant="displayHero" color="brandPrimary" align="center" style={styles.mainTitle}>
            Sankalp Confirmed!
          </VText>
          <VText variant="bodyLarge" color="textMuted" align="center" style={styles.subTitle}>
            Har Har Mahadev! Your sacred ritual has been successfully scheduled.
          </VText>
        </View>

        {/* Confirmed Details Card */}
        <VCard variant="default" elevation={2} style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <VText variant="caption" color="textMuted">
                Booking Reference
              </VText>
              <VText variant="titleMedium" color="textPrimary" weight="700">
                {booking.booking_number}
              </VText>
            </View>
            <LiveStatusPill status={booking.status} />
          </View>

          <VDivider style={{ marginVertical: spacing.md }} />

          <View style={styles.detailRow}>
            <VText variant="caption" color="textMuted">Sacred Ritual</VText>
            <VText variant="bodyMedium" weight="600">{booking.puja_service?.name || "Vedic Puja"}</VText>
          </View>

          <View style={styles.detailRow}>
            <VText variant="caption" color="textMuted">Acharya</VText>
            <VText variant="bodyMedium" weight="600">{booking.pandit?.display_name || "Assigned Pandit"}</VText>
          </View>

          <View style={styles.detailRow}>
            <VText variant="caption" color="textMuted">Format</VText>
            <VText variant="bodyMedium" style={styles.formatText}>
              {booking.service_mode} Ritual
            </VText>
          </View>

          <View style={styles.detailRow}>
            <VText variant="caption" color="textMuted">Date & Time</VText>
            <VText variant="bodyMedium">
              {formatDate(startDate)} at {formatTime(startDate)}
            </VText>
          </View>

          <View style={styles.detailRow}>
            <VText variant="caption" color="textMuted">Location</VText>
            <VText variant="bodyMedium" style={styles.locationText}>
              {booking.service_mode === "home"
                ? booking.location?.address_snapshot || `${booking.location?.city || "Home"}`
                : booking.service_mode === "temple"
                ? booking.location?.temple_name_snapshot || "Temple Sanctum"
                : "LiveKit Cloud HD Room (Opens 15m prior)"}
            </VText>
          </View>

          <VDivider style={{ marginVertical: spacing.md }} />

          <View style={styles.detailRow}>
            <VText variant="caption" color="textMuted">Advance Paid</VText>
            <VText variant="headlineMedium" color="brandPrimary">
              {formatCurrency(booking.advance_amount)}
            </VText>
          </View>

          {booking.balance_amount > 0 && (
            <View
              style={[
                styles.balanceNote,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderRadius: radii.sm,
                  marginTop: spacing.sm,
                },
              ]}
            >
              <VText variant="caption" color="textMuted">
                Remaining balance of {formatCurrency(booking.balance_amount)} will be settled online before the ritual.
              </VText>
            </View>
          )}

          {/* 50% RBI Escrow Model Guarantee Badge */}
          <View style={{ marginTop: spacing.md, width: "100%" }}>
            <EscrowBadge
              status="confirmed"
              amountInr={booking.advance_amount}
              message={pick(
                "50% एस्क्रो सुरक्षा: पूर्णाहूति के उपरांत ही दक्षिणा आचार्य को अंतरित होगी।",
                "50% RBI Escrow Protection: Funds held securely until Vedic Purnahuti verification."
              )}
            />
          </View>
        </VCard>

        {/* Transit & Preparation Instructions */}
        <VCard
          variant="subtle"
          style={[
            styles.instructionsCard,
            {
              backgroundColor: colors.surfaceSubtle,
              borderRadius: radii.md,
              borderColor: colors.borderDefault,
            },
          ]}
        >
          <VText variant="labelMedium" color="brandPrimary" style={{ marginBottom: 4 }}>
            🕉️ {pick("दर्शन व तैयारी निर्देश", "Ritual Instructions")}
          </VText>
          <VText variant="caption" color="textMuted">
            {booking.service_mode === "home"
              ? pick(
                  "आचार्य जी संपूर्ण वैदिक सामग्री के साथ निर्धारित समय पर आपके निवास स्थान पहुंचेंगे।",
                  "The Acharya will arrive at your residence with complete consecrated samagri 15 minutes before the Muhurat."
                )
              : booking.service_mode === "temple"
              ? pick(
                  "कृपया अनुष्ठान समय से 15 मिनट पूर्व पवित्र मंदिर परिसर में उपस्थित रहें।",
                  "Please arrive at the consecrated temple sanctum 15 minutes prior to the Muhurat."
                )
              : pick(
                  "लाइव वीडियो गर्भगृह मुहूर्त समय से 15 मिनट पूर्व खुल जाएगा।",
                  "LiveKit Cloud HD Room will open 15 minutes prior to the Muhurat for audio/video check."
                )}
          </VText>
        </VCard>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <VButton
            title="View Full Booking Details"
            label="View Full Booking Details"
            variant="primary"
            size="lg"
            onPress={() => navigation.replace("BookingDetail", { bookingId: booking.id })}
            fullWidth
            style={{ minHeight: 48, marginBottom: 12 }}
          />
          <VButton
            title="Back to Home"
            label="Back to Home"
            variant="outline"
            size="md"
            onPress={() => navigation.navigate("CustomerTabs")}
            fullWidth
            style={{ minHeight: 48 }}
          />
        </View>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  celebrationHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  bellIcon: {
    marginBottom: 8,
  },
  mainTitle: {
    marginBottom: 8,
  },
  subTitle: {
    textAlign: "center",
    lineHeight: 22,
  },
  card: {
    padding: 20,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 4,
  },
  formatText: {
    textTransform: "capitalize",
  },
  locationText: {
    flex: 1,
    textAlign: "right",
    marginLeft: 16,
  },
  balanceNote: {
    padding: 12,
  },
  instructionsCard: {
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  actions: {
    width: "100%",
  },
  errorCard: {
    padding: 24,
    alignItems: "center",
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
  },
});

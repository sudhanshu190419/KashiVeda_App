// src/features/booking/screens/BookingPaymentScreen.tsx
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Card, Header, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { useBookingPayment } from "../hooks/useBookingPayment.ts";

type BookingPaymentRouteProp = RouteProp<CustomerStackParamList, "BookingPayment">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const BookingPaymentScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<BookingPaymentRouteProp>();
  const {
    bookingId = "",
    paymentOrderId = "",
    bookingNumber = "",
    advanceAmount = 0,
    pujaName = "Ritual",
    panditName = "Acharya",
    isBalancePayment = false,
    isFullPayment = false,
  } = route.params || {};

  const {
    status,
    error,
    startPayment,
    checkConfirmationManually,
  } = useBookingPayment({
    bookingId,
    paymentOrderId,
    bookingNumber,
    advanceAmount,
  });

  // Navigate to success screen upon confirmed payment webhook
  useEffect(() => {
    if (status === "confirmed") {
      navigation.replace("BookingSuccess", { bookingId });
    }
  }, [status, bookingId, navigation]);

  return (
    <ScreenContainer scrollable padded>
      <Header title="Secure Payment" onBack={() => navigation.goBack()} />

      <Card variant="elevated" style={styles.mainCard}>
        <Text style={styles.omIcon}>🕉️</Text>
        <Text variant="h2" align="center" style={styles.pujaTitle}>
          {pujaName}
        </Text>
        <Text variant="body" color={colors.textSecondary} align="center" style={styles.panditSubtitle}>
          Acharya: {panditName}
        </Text>
        <Text variant="caption" color={colors.textTertiary} align="center" style={styles.bookingNumber}>
          Booking Ref: {bookingNumber}
        </Text>

        <View style={styles.amountBox}>
          <Text variant="caption" color={colors.textSecondary} align="center">
            {isBalancePayment
              ? "Balance Amount Payable"
              : isFullPayment
              ? "Full Booking Amount Payable"
              : "Advance Amount Payable"}
          </Text>
          <Text variant="h1" color={colors.primary} align="center" style={styles.amountText}>
            {formatCurrency(advanceAmount)}
          </Text>
          <Text variant="caption" color={colors.textTertiary} align="center">
            Secures your sacred ritual with the Acharya
          </Text>
        </View>

        {/* Status Indicator */}
        <View style={styles.statusSection}>
          {status === "idle" && (
            <Text variant="body" color={colors.textSecondary} align="center">
              Tap below to pay securely via Razorpay (UPI, Netbanking, Cards).
            </Text>
          )}

          {status === "creating_order" && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="body" color={colors.textSecondary}>
                Generating secure gateway order...
              </Text>
            </View>
          )}

          {status === "processing_payment" && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="body" color={colors.textSecondary}>
                Completing checkout...
              </Text>
            </View>
          )}

          {status === "polling_confirmation" && (
            <View style={styles.pollingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="bodyMedium" align="center" style={styles.pollingTitle}>
                Waiting for Banking Webhook Confirmation...
              </Text>
              <Text variant="caption" color={colors.textSecondary} align="center">
                The bank is confirming your payment. Your booking will auto-confirm in a few seconds.
              </Text>
            </View>
          )}

          {status === "failed" && error && (
            <View style={styles.errorBox}>
              <Text variant="bodyMedium" color={colors.error} align="center">
                Payment Notice
              </Text>
              <Text variant="caption" color={colors.textSecondary} align="center" style={styles.errorText}>
                {error}
              </Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          {status === "idle" || status === "failed" ? (
            <Button
              title={`Pay ${formatCurrency(advanceAmount)} with Razorpay`}
              variant="primary"
              size="lg"
              onPress={() => startPayment()}
            />
          ) : null}

          {status === "polling_confirmation" ? (
            <Button
              title="Check Confirmation Status"
              variant="secondary"
              size="md"
              onPress={() => checkConfirmationManually()}
            />
          ) : null}
        </View>
      </Card>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  mainCard: {
    marginVertical: spacing.md,
    padding: spacing.lg,
    alignItems: "center",
  },
  omIcon: {
    fontSize: 40,
    marginBottom: spacing.xs,
  },
  pujaTitle: {
    marginBottom: spacing.xxs,
  },
  panditSubtitle: {
    marginBottom: spacing.xxs,
  },
  bookingNumber: {
    marginBottom: spacing.lg,
  },
  amountBox: {
    backgroundColor: "#FFF8F6",
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    width: "100%",
    marginBottom: spacing.lg,
  },
  amountText: {
    marginVertical: spacing.xs,
  },
  statusSection: {
    width: "100%",
    minHeight: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pollingBox: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  pollingTitle: {
    marginTop: spacing.xs,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: radius.sm,
    padding: spacing.md,
    width: "100%",
    alignItems: "center",
  },
  errorText: {
    marginTop: spacing.xxs,
  },
  actions: {
    width: "100%",
    gap: spacing.sm,
  },
});

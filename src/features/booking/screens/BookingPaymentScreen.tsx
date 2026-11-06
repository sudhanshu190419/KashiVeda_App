// src/features/booking/screens/BookingPaymentScreen.tsx
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  VButton,
  EscrowBadge,
} from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { useBookingPayment } from "../hooks/useBookingPayment.ts";

type BookingPaymentRouteProp = RouteProp<CustomerStackParamList, "BookingPayment">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const BookingPaymentScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<BookingPaymentRouteProp>();
  const { colors, spacing } = useTheme();
  const { pick } = useLanguage();

  const {
    bookingId = "",
    paymentOrderId = "",
    bookingNumber = "",
    advanceAmount = 0,
    pujaName = "Ritual",
    panditName = "Pandit Ji",
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
    <ScreenWrapper
      safeArea="all"
      scrollable={true}
      headerComponent={
        <AppBar
          title="Secure Payment"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
      }
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxl }}
    >
      <VCard variant="default" elevation={2} style={styles.mainCard}>
        
        <VText variant="headlineLarge" align="center" style={styles.pujaTitle}>
          {pujaName}
        </VText>
        <VText variant="bodyMedium" color="textMuted" align="center" style={styles.panditSubtitle}>
          Pandit Ji: {panditName}
        </VText>
        <VText variant="caption" color="textMuted" align="center" style={styles.bookingNumber}>
          Booking Ref: {bookingNumber}
        </VText>

        <View
          style={[
            styles.amountBox,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderDefault,
            },
          ]}
        >
          <VText variant="labelMedium" color="textMuted" align="center">
            {isBalancePayment
              ? "Balance Amount Payable"
              : isFullPayment
              ? "Full Booking Amount Payable"
              : "Advance Amount Payable"}
          </VText>
          <VText variant="displayHero" color="brandPrimary" align="center" style={styles.amountText}>
            {formatCurrency(advanceAmount)}
          </VText>
          <VText variant="caption" color="textMuted" align="center">
            {pick("पंडित जी के साथ आपका पावन अनुष्ठान सुरक्षित करता है", "Secures your sacred ritual with Pandit Ji")}
          </VText>
        </View>

        {/* 50% RBI Escrow Model Guarantee Badge */}
        <View style={{ width: "100%", marginBottom: spacing.md }}>
          <EscrowBadge
            status="payment_pending"
            amountInr={advanceAmount}
            message={pick(
              "50% एस्क्रो सुरक्षा: पूर्णाहूति के उपरांत ही दक्षिणा पंडित जी को अंतरित होगी।",
              "50% RBI Escrow Model: Funds held safely until Vedic Purnahuti verification."
            )}
          />
        </View>

        {/* Cancellation & Refund Policy Guarantee Notice */}
        <VCard
          variant="subtle"
          style={[
            styles.policyCard,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderDefault,
            },
          ]}
        >
          <VText variant="caption" color="textMuted">
            {pick(
              "100% धनवापसी गारंटी: अनुष्ठान से 48 घंटे पूर्व निःशुल्क रद्दीकरण। पंडित जी की आकस्मिक अनुपस्थिति पर 100% वापसी।",
              "100% Refund Policy: Full refund if cancelled > 48h prior. 100% customer refund on Pandit emergency."
            )}
          </VText>
        </VCard>

        {/* Status Indicator */}
        <View style={styles.statusSection}>
          {status === "idle" && (
            <VText variant="bodyMedium" color="textMuted" align="center">
              Tap below to pay securely via Razorpay (UPI, Netbanking, Cards).
            </VText>
          )}

          {status === "creating_order" && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.brandPrimary} />
              <VText variant="bodyMedium" color="textMuted">
                Generating secure gateway order...
              </VText>
            </View>
          )}

          {status === "processing_payment" && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.brandPrimary} />
              <VText variant="bodyMedium" color="textMuted">
                Completing checkout...
              </VText>
            </View>
          )}

          {status === "polling_confirmation" && (
            <View style={styles.pollingBox}>
              <ActivityIndicator size="small" color={colors.brandPrimary} />
              <VText variant="titleMedium" align="center" style={styles.pollingTitle}>
                Waiting for Banking Webhook Confirmation...
              </VText>
              <VText variant="caption" color="textMuted" align="center">
                The bank is confirming your payment. Your booking will auto-confirm in a few seconds.
              </VText>
            </View>
          )}

          {status === "failed" && error && (
            <VCard
              variant="outlined"
              style={[
                styles.errorBox,
                {
                  backgroundColor: colors.errorBg,
                  borderColor: colors.statusAlert,
                },
              ]}
            >
              <VText variant="titleSmall" color="error" align="center">
                Payment Notice
              </VText>
              <VText variant="caption" color="textMuted" align="center" style={styles.errorText}>
                {error}
              </VText>
            </VCard>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          {status === "idle" || status === "failed" ? (
            <VButton
              title={`Pay ${formatCurrency(advanceAmount)} with Razorpay`}
              label={`Pay ${formatCurrency(advanceAmount)} with Razorpay`}
              variant="primary"
              size="lg"
              onPress={() => startPayment()}
              fullWidth
              style={{ minHeight: 48 }}
            />
          ) : null}

          {status === "polling_confirmation" ? (
            <VButton
              title="Check Confirmation Status"
              label="Check Confirmation Status"
              variant="secondary"
              size="md"
              onPress={() => checkConfirmationManually()}
              fullWidth
              style={{ minHeight: 48 }}
            />
          ) : null}
        </View>
      </VCard>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  mainCard: {
    marginVertical: 16,
    padding: 20,
    alignItems: "center",
  },
  omIcon: {
    marginBottom: 8,
  },
  pujaTitle: {
    marginBottom: 4,
  },
  panditSubtitle: {
    marginBottom: 4,
  },
  bookingNumber: {
    marginBottom: 20,
  },
  amountBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    width: "100%",
    marginBottom: 16,
  },
  amountText: {
    marginVertical: 8,
  },
  policyCard: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusSection: {
    width: "100%",
    minHeight: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pollingBox: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  pollingTitle: {
    marginTop: 8,
  },
  errorBox: {
    borderRadius: 8,
    padding: 16,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
  },
  errorText: {
    marginTop: 4,
  },
  actions: {
    width: "100%",
    gap: 12,
  },
});

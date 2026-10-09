// src/features/kundli/screens/KundliPaymentScreen.tsx
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../../features/auth/index.ts";
import {
  Button,
  Card,
  Header,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, typography } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { kundliPaymentService } from "../services/kundliPaymentService.ts";

type PaymentRouteProp = RouteProp<CustomerStackParamList, "KundliPayment">;
type PaymentNavProp = NativeStackNavigationProp<CustomerStackParamList, "KundliPayment">;

type PaymentStep = "idle" | "initializing" | "verifying" | "confirmed" | "failed";

export const KundliPaymentScreen: React.FC = () => {
  const route = useRoute<PaymentRouteProp>();
  const navigation = useNavigation<PaymentNavProp>();
  const { profile, user } = useAuth();

  const { kundliOrderId, paymentOrderId, amount, panditName, orderNumber } = route.params;

  const [step, setStep] = useState<PaymentStep>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePayNow = async () => {
    try {
      setErrorMessage(null);
      setStep("initializing");

      // 1. Create Razorpay gateway order via Edge Function
      const rzpOrder = await kundliPaymentService.createRazorpayOrder(paymentOrderId);

      // 2. Open native checkout UI
      await kundliPaymentService.openRazorpayCheckout(rzpOrder, {
        name: profile?.display_name || undefined,
        email: profile?.email || user?.email || undefined,
        phone: profile?.phone || undefined,
      });

      // 3. Begin bounded polling to confirm authoritative DB state update from webhook
      setStep("verifying");
      const pollResult = await kundliPaymentService.pollKundliPaymentConfirmation(
        kundliOrderId,
        12,
        2000
      );

      if (pollResult.confirmed) {
        setStep("confirmed");
      } else {
        setStep("failed");
        setErrorMessage(
          "Payment verification pending. If money was debited, your order will update shortly."
        );
      }
    } catch (err: any) {
      setStep("failed");
      setErrorMessage(err?.message || "Payment was cancelled or failed. Please try again.");
    }
  };

  const handleViewOrder = () => {
    navigation.replace("KundliDetail", { orderId: kundliOrderId });
  };

  const handleGoToOrders = () => {
    navigation.replace("KundliOrders");
  };

  return (
    <ScreenContainer scrollable padded={false}>
      <Header
        title="Kundli Payment"
        onBack={step === "verifying" ? undefined : () => navigation.goBack()}
      />

      <View style={styles.content}>
        {step === "confirmed" ? (
          <Card style={styles.successCard}>
            <Text style={styles.successIcon}>🎉</Text>
            <Text variant="h2" style={styles.successTitle}>
              Payment Successful!
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.successSubtitle}>
              Your handwritten Kundli request has been confirmed and assigned to {panditName}.
            </Text>

            <View style={styles.summaryBox}>
              <Text variant="caption" color={colors.textTertiary}>
                Order Number
              </Text>
              <Text variant="body" style={styles.summaryValue}>
                #{orderNumber || kundliOrderId.slice(0, 8).toUpperCase()}
              </Text>
              <Text variant="caption" color={colors.textTertiary} style={styles.summaryFieldSpacer}>
                Amount Paid
              </Text>
              <Text variant="h3" style={styles.paidAmount}>
                {formatCurrency(amount)}
              </Text>
            </View>

            <Button
              title="View Kundli Status"
              onPress={handleViewOrder}
              style={styles.actionBtn}
            />
            <Button
              title="All Kundli Orders"
              variant="outline"
              onPress={handleGoToOrders}
              style={styles.actionBtn}
            />
          </Card>
        ) : (
          <>
            <Card style={styles.orderCard}>
              <Text variant="h3" style={styles.cardTitle}>
                Payment Summary
              </Text>
              <View style={styles.row}>
                <Text variant="body" color={colors.textSecondary}>
                  Service
                </Text>
                <Text variant="body" style={styles.boldText}>
                  Handwritten Vedic Kundli
                </Text>
              </View>
              <View style={styles.row}>
                <Text variant="body" color={colors.textSecondary}>
                  Astrologer
                </Text>
                <Text variant="body" style={styles.boldText}>
                  {panditName}
                </Text>
              </View>
              <View style={styles.row}>
                <Text variant="body" color={colors.textSecondary}>
                  Payment Model
                </Text>
                <Text variant="body" color={colors.primary} style={styles.boldText}>
                  100% Upfront
                </Text>
              </View>

              <View style={[styles.row, styles.totalRow]}>
                <Text variant="h3">Total Payable</Text>
                <Text variant="h2" style={styles.totalPrice}>
                  {formatCurrency(amount)}
                </Text>
              </View>
            </Card>

            {step === "initializing" && (
              <Card style={styles.statusCard}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.statusText}>Connecting to Razorpay gateway...</Text>
              </Card>
            )}

            {step === "verifying" && (
              <Card style={styles.statusCard}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text variant="h3" style={styles.verifyingTitle}>
                  Confirming Payment
                </Text>
                <Text variant="caption" color={colors.textSecondary} style={styles.statusText}>
                  Verifying transaction with Kashi Veda temple ledger...
                </Text>
              </Card>
            )}

            {step === "failed" && errorMessage && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
              </View>
            )}

            {step !== "verifying" && (
              <Button
                title={
                  step === "failed"
                    ? "Retry Payment"
                    : `Pay ${formatCurrency(amount)} Upfront`
                }
                onPress={handlePayNow}
                disabled={step === "initializing"}
                style={styles.payBtn}
              />
            )}
          </>
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  orderCard: {
    marginBottom: spacing.md,
    borderColor: colors.borderLight,
    borderWidth: 1,
  },
  cardTitle: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  boldText: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  totalRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    alignItems: "center",
  },
  totalPrice: {
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  statusCard: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  verifyingTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  statusText: {
    marginTop: spacing.sm,
    textAlign: "center",
    color: colors.textSecondary,
  },
  errorContainer: {
    backgroundColor: "#FFEBEE",
    padding: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    color: "#C62828",
    fontSize: typography.fontSize.sm,
  },
  payBtn: {
    marginTop: spacing.sm,
  },
  successCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  successIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  successTitle: {
    color: colors.primary,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  successSubtitle: {
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  summaryBox: {
    width: "100%",
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  summaryValue: {
    fontWeight: typography.fontWeight.bold,
    marginTop: 2,
  },
  summaryFieldSpacer: {
    marginTop: spacing.sm,
  },
  paidAmount: {
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
    marginTop: 2,
  },
  actionBtn: {
    width: "100%",
    marginBottom: spacing.sm,
  },
});

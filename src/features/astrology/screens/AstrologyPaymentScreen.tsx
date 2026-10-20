// src/features/astrology/screens/AstrologyPaymentScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../auth/index.ts";
import {
  Button,
  Card,
  Header,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { astrologyPaymentService } from "../services/astrologyPaymentService.ts";
import { astrologyEventBus } from "../services/astrologyEventBus.ts";
import { AstrologySubscription } from "../types/astrology.types.ts";

type PaymentRouteProp = RouteProp<CustomerStackParamList, "AstrologyPayment">;
type PaymentNavProp = NativeStackNavigationProp<CustomerStackParamList, "AstrologyPayment">;

type PaymentStep =
  | "idle"
  | "initializing"
  | "verifying"
  | "confirmed"
  | "cancelled"
  | "timeout"
  | "failed";

export const AstrologyPaymentScreen: React.FC = () => {
  const route = useRoute<PaymentRouteProp>();
  const navigation = useNavigation<PaymentNavProp>();
  const { profile, user } = useAuth();

  const {
    subscriptionId,
    paymentOrderId,
    planName,
    amount,
    durationDays,
  } = route.params;

  const [step, setStep] = useState<PaymentStep>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedSubscription, setConfirmedSubscription] = useState<AstrologySubscription | null>(null);

  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handlePayNow = async () => {
    try {
      setErrorMessage(null);
      setStep("initializing");

      // 1. Create Razorpay gateway order via Edge Function
      const rzpOrder = await astrologyPaymentService.createRazorpayOrder(paymentOrderId);

      // 2. Open native Razorpay checkout UI
      await astrologyPaymentService.openRazorpayCheckout(rzpOrder, {
        name: profile?.display_name || undefined,
        email: profile?.email || user?.email || undefined,
        phone: profile?.phone || undefined,
      });

      // 3. Immediately enter verification state upon SDK return (never assume active on client alone)
      if (!isMountedRef.current) return;
      setStep("verifying");

      // 4. Begin bounded polling against PostgreSQL authoritative state
      const pollResult = await astrologyPaymentService.pollSubscriptionConfirmation(
        subscriptionId,
        12,
        2000
      );

      if (!isMountedRef.current) return;

      if (pollResult.confirmed && pollResult.status === "active") {
        setConfirmedSubscription(pollResult.subscription || null);
        setStep("confirmed");
        astrologyEventBus.emit("SUBSCRIPTION_PURCHASED", {
          subscriptionId,
          isActive: true,
        });
      } else if (pollResult.status === "cancelled") {
        setStep("cancelled");
        setErrorMessage("Subscription payment was cancelled.");
      } else if (pollResult.status === "expired") {
        setStep("failed");
        setErrorMessage("Subscription period has expired.");
      } else {
        // Timed out while status is still payment_pending
        setStep("timeout");
        setErrorMessage(
          "Your payment is still being confirmed. Please check your subscription status shortly."
        );
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;

      const rawMsg = err?.message || "";
      if (
        rawMsg.toLowerCase().includes("cancelled") ||
        rawMsg.toLowerCase().includes("user cancel")
      ) {
        setStep("cancelled");
        setErrorMessage("Payment was cancelled. You can retry anytime.");
      } else {
        setStep("failed");
        setErrorMessage(rawMsg || "Payment was cancelled or failed. Please try again.");
      }
    }
  };

  const handleCheckStatusAgain = async () => {
    try {
      setErrorMessage(null);
      setStep("verifying");

      const pollResult = await astrologyPaymentService.pollSubscriptionConfirmation(
        subscriptionId,
        6,
        2000
      );

      if (!isMountedRef.current) return;

      if (pollResult.confirmed && pollResult.status === "active") {
        setConfirmedSubscription(pollResult.subscription || null);
        setStep("confirmed");
        astrologyEventBus.emit("SUBSCRIPTION_PURCHASED", {
          subscriptionId,
          isActive: true,
        });
      } else {
        setStep("timeout");
        setErrorMessage(
          "Your payment is still being confirmed. Please check your subscription status shortly."
        );
      }
    } catch {
      if (!isMountedRef.current) return;
      setStep("timeout");
      setErrorMessage(
        "Could not confirm status right now. Please refresh your subscription page."
      );
    }
  };

  const handleGoToSubscription = () => {
    navigation.replace("AstrologySubscription");
  };

  const handleGoToAstrologyHub = () => {
    navigation.replace("Astrology");
  };

  const formattedAmount = formatCurrency(amount);

  return (
    <ScreenContainer scrollable padded={false}>
      <Header
        title="Astrology Subscription"
        onBack={step === "verifying" ? undefined : () => navigation.goBack()}
      />

      <View style={styles.content}>
        {/* State: Confirmed / Active */}
        {step === "confirmed" && (
          <Card style={styles.successCard}>
            <Text style={styles.successIcon}>✨</Text>
            <Text variant="h2" style={styles.successTitle}>
              Subscription Activated!
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.successSubtitle}>
              Your Vedic Astrology membership is now active. You have full access to daily planetary insights and guidance.
            </Text>

            <View style={styles.summaryBox}>
              <Text variant="caption" color={colors.textTertiary}>
                Plan
              </Text>
              <Text variant="bodyMedium" style={styles.summaryValue}>
                {planName}
              </Text>

              <Text variant="caption" color={colors.textTertiary} style={styles.summaryFieldSpacer}>
                Duration
              </Text>
              <Text variant="body" style={styles.summaryValue}>
                {durationDays} Days Full Coverage
              </Text>

              {confirmedSubscription?.starts_at && confirmedSubscription?.ends_at && (
                <>
                  <Text variant="caption" color={colors.textTertiary} style={styles.summaryFieldSpacer}>
                    Valid Period
                  </Text>
                  <Text variant="captionMedium" style={styles.summaryValue}>
                    {new Date(confirmedSubscription.starts_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    -{" "}
                    {new Date(confirmedSubscription.ends_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Text>
                </>
              )}

              <Text variant="caption" color={colors.textTertiary} style={styles.summaryFieldSpacer}>
                Amount Paid
              </Text>
              <Text variant="h3" style={styles.paidAmount}>
                {formattedAmount}
              </Text>
            </View>

            <Button
              title="Access Cosmic Insights"
              onPress={handleGoToAstrologyHub}
              style={styles.actionBtn}
            />
            <Button
              title="View My Subscription"
              variant="outline"
              onPress={handleGoToSubscription}
              style={styles.actionBtn}
            />
          </Card>
        )}

        {/* State: Verifying */}
        {step === "verifying" && (
          <Card style={styles.stateCard}>
            <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            <Text variant="h3" style={styles.stateTitle}>
              Payment Received
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.stateSubtitle}>
              Confirming your subscription with the Vedic Astrology registry...
            </Text>
            <Text variant="caption" color={colors.textTertiary} style={styles.stateHint}>
              Please do not close the app or navigate away.
            </Text>
          </Card>
        )}

        {/* State: Timeout */}
        {step === "timeout" && (
          <Card style={styles.stateCard}>
            <Text style={styles.warningIcon}>⏳</Text>
            <Text variant="h3" style={styles.stateTitle}>
              Verification in Progress
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.stateSubtitle}>
              {errorMessage ||
                "Your payment is still being confirmed. Please check your subscription status shortly."}
            </Text>

            <Button
              title="Check Status Again"
              onPress={handleCheckStatusAgain}
              style={styles.actionBtn}
            />
            <Button
              title="Go to My Subscription"
              variant="outline"
              onPress={handleGoToSubscription}
              style={styles.actionBtn}
            />
          </Card>
        )}

        {/* State: Cancelled */}
        {step === "cancelled" && (
          <Card style={styles.stateCard}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text variant="h3" style={styles.stateTitle}>
              Payment Cancelled
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.stateSubtitle}>
              {errorMessage || "Payment was cancelled. You can retry whenever you are ready."}
            </Text>

            <Button
              title="Try Payment Again"
              onPress={handlePayNow}
              style={styles.actionBtn}
            />
            <Button
              title="Back to Plans"
              variant="outline"
              onPress={() => navigation.goBack()}
              style={styles.actionBtn}
            />
          </Card>
        )}

        {/* State: Failed */}
        {step === "failed" && (
          <Card style={styles.stateCard}>
            <Text style={styles.errorIcon}>❌</Text>
            <Text variant="h3" style={styles.stateTitle}>
              Payment Failed
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.stateSubtitle}>
              {errorMessage || "We could not complete your subscription payment."}
            </Text>

            <Button
              title="Retry Payment"
              onPress={handlePayNow}
              style={styles.actionBtn}
            />
            <Button
              title="Back to Plans"
              variant="outline"
              onPress={() => navigation.goBack()}
              style={styles.actionBtn}
            />
          </Card>
        )}

        {/* State: Idle / Initializing */}
        {(step === "idle" || step === "initializing") && (
          <>
            <Card style={styles.orderCard}>
              <Text variant="h3" style={styles.cardTitle}>
                Subscription Summary
              </Text>

              <View style={styles.row}>
                <Text variant="body" color={colors.textSecondary}>
                  Plan
                </Text>
                <Text variant="bodyMedium" style={styles.boldText}>
                  {planName}
                </Text>
              </View>

              <View style={styles.row}>
                <Text variant="body" color={colors.textSecondary}>
                  Coverage Period
                </Text>
                <Text variant="body" style={styles.boldText}>
                  {`${durationDays} Days`}
                </Text>
              </View>

              <View style={styles.row}>
                <Text variant="body" color={colors.textSecondary}>
                  Deliverables
                </Text>
                <Text variant="body" style={styles.boldText}>
                  Daily In-App Insights
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.row}>
                <Text variant="h3" style={styles.totalLabel}>
                  Total Amount
                </Text>
                <Text variant="h2" color={colors.primary} style={styles.totalAmount}>
                  {formattedAmount}
                </Text>
              </View>

              <Text variant="caption" color={colors.textTertiary} style={styles.taxNote}>
                One-time advance payment. Prices include all applicable taxes.
              </Text>
            </Card>

            <View style={styles.securityBox}>
              <Text variant="caption" color={colors.textSecondary}>
                🔒 256-bit SSL encrypted secure payment via Razorpay. Supported: UPI, Cards, NetBanking.
              </Text>
            </View>

            <View style={styles.bottomActions}>
              <Button
                title={
                  step === "initializing"
                    ? "Opening Payment Gateway..."
                    : `Pay ${formattedAmount}`
                }
                onPress={handlePayNow}
                disabled={step === "initializing"}
                style={styles.payBtn}
              />
            </View>
          </>
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  orderCard: {
    padding: spacing.lg,
  },
  cardTitle: {
    marginBottom: spacing.md,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  boldText: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  totalLabel: {
    fontWeight: "700",
  },
  totalAmount: {
    fontWeight: "700",
  },
  taxNote: {
    marginTop: spacing.xs,
  },
  securityBox: {
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  bottomActions: {
    marginTop: spacing.md,
  },
  payBtn: {
    width: "100%",
  },
  stateCard: {
    padding: spacing.xl,
    alignItems: "center",
    textAlign: "center",
  },
  loader: {
    marginBottom: spacing.md,
  },
  stateTitle: {
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  stateSubtitle: {
    textAlign: "center",
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  stateHint: {
    textAlign: "center",
  },
  warningIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  successCard: {
    padding: spacing.xl,
    alignItems: "center",
  },
  successIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  successTitle: {
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  successSubtitle: {
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  summaryBox: {
    width: "100%",
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  summaryValue: {
    marginTop: 2,
    color: colors.textPrimary,
  },
  summaryFieldSpacer: {
    marginTop: spacing.sm,
  },
  paidAmount: {
    color: colors.primary,
    fontWeight: "700",
    marginTop: 2,
  },
  actionBtn: {
    width: "100%",
    marginBottom: spacing.sm,
  },
});

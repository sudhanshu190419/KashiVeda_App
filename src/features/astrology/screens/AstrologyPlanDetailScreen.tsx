// src/features/astrology/screens/AstrologyPlanDetailScreen.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Button,
  Card,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { astrologyService } from "../services/astrologyService.ts";
import { AstrologySubscriptionPlan } from "../types/astrology.types.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const AstrologyPlanDetailScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<any>();
  const planId = route.params?.planId;

  const [plan, setPlan] = useState<AstrologySubscriptionPlan | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<boolean>(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPlan() {
      if (!planId) {
        setError("Plan identifier is missing.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await astrologyService.getPlanById(planId);
        if (isMounted) {
          if (!data) {
            setError("The requested astrology plan was not found.");
          } else {
            setPlan(data);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Failed to load plan details.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPlan();
    return () => {
      isMounted = false;
    };
  }, [planId]);

  if (loading) {
    return (
      <ScreenContainer>
        <Header title="Plan Details" onBack={() => navigation.goBack()} />
        <LoadingState message="Loading plan details..." />
      </ScreenContainer>
    );
  }

  if (error || !plan) {
    return (
      <ScreenContainer>
        <Header title="Plan Details" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Plan Not Found"
          message={error || "Could not retrieve plan information."}
          onRetry={() => navigation.goBack()}
        />
      </ScreenContainer>
    );
  }

  const formattedPrice = `₹${plan.price.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const handleSubscribe = async () => {
    if (!plan || subscribing) return;

    setSubscribing(true);
    setSubscribeError(null);

    try {
      // Authoritative backend order creation — only plan ID is passed
      const orderResult = await astrologyService.createSubscriptionOrder(plan.id);

      navigation.navigate("AstrologyPayment", {
        subscriptionId: orderResult.subscription_id,
        paymentOrderId: orderResult.payment_order_id,
        planId: plan.id,
        planName: plan.name,
        amount: orderResult.amount,
        currency: orderResult.currency,
        durationDays: plan.duration_days,
      });
    } catch (err: any) {
      const msg = err?.message || "Failed to initiate subscription order.";
      if (
        msg.toLowerCase().includes("already has an active") ||
        msg.toLowerCase().includes("active astrology subscription") ||
        msg.toLowerCase().includes("conflict")
      ) {
        setSubscribeError(
          "You already have an active astrology subscription. Please check your subscription page to view active benefits."
        );
      } else {
        setSubscribeError(msg);
      }
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <ScreenContainer scrollable padded>
      <Header title="Plan Details" onBack={() => navigation.goBack()} />

      {/* Plan Header Card */}
      <Card variant="elevated" style={styles.planCard}>
        <Text variant="captionMedium" color={colors.primaryDark}>
          Vedic Astrology Plan
        </Text>
        <Text variant="h1" style={styles.planName}>
          {plan.name}
        </Text>
        <Text variant="caption" color={colors.textSecondary}>
          {`${plan.duration_days} Days Full Coverage`}
        </Text>

        <View style={styles.priceRow}>
          <Text variant="h1" color={colors.primary} style={styles.priceValue}>
            {formattedPrice}
          </Text>
          <Text variant="caption" color={colors.textTertiary}>
            One-time Term ({plan.currency})
          </Text>
        </View>
      </Card>

      {/* Plan Deliverables & Channels */}
      <Card variant="outlined" style={styles.featuresCard}>
        <Text variant="h3" style={styles.featuresTitle}>
          What's Included
        </Text>

        <View style={styles.featureItem}>
          <View style={[styles.iconBullet, { backgroundColor: colors.successLight }]}>
            <Text variant="caption" color={colors.success} style={styles.checkIcon}>
              ✓
            </Text>
          </View>
          <View style={styles.featureTextContainer}>
            <Text variant="bodyMedium" style={styles.featureHeading}>
              Daily In-App Astrological Insights
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              {plan.daily_in_app_enabled
                ? "Daily planetary transits, auspicious timings, and Nakshatra guidance delivered directly inside the app."
                : "Not included in this plan tier."}
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <View style={[styles.iconBullet, { backgroundColor: colors.secondaryLight }]}>
            <Text variant="caption" color={colors.secondaryDark} style={styles.checkIcon}>
              ✓
            </Text>
          </View>
          <View style={styles.featureTextContainer}>
            <Text variant="bodyMedium" style={styles.featureHeading}>
              Weekly Guidance Broadcast
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              {plan.weekly_whatsapp_enabled
                ? "Weekly planetary shifts and comprehensive horoscope overview (WhatsApp channel planned for future activation)."
                : "Not included in this plan tier."}
            </Text>
          </View>
        </View>
      </Card>

      {/* Error / Conflict Notice */}
      {subscribeError && (
        <Card variant="outlined" style={styles.errorNoticeCard}>
          <Text variant="bodyMedium" color={colors.error} style={styles.errorNoticeText}>
            {subscribeError}
          </Text>
          {subscribeError.includes("active astrology subscription") && (
            <Button
              title="View My Subscription"
              variant="outline"
              size="sm"
              onPress={() => navigation.navigate("AstrologySubscription")}
              style={styles.viewSubBtn}
            />
          )}
        </Card>
      )}

      {/* Subscribe CTA with Duplicate-Tap Protection */}
      <View style={styles.ctaContainer}>
        <Button
          title={subscribing ? "Preparing Checkout..." : `Subscribe Now • ${formattedPrice}`}
          variant="primary"
          size="lg"
          disabled={subscribing}
          onPress={handleSubscribe}
        />
        <Text variant="caption" color={colors.textTertiary} style={styles.ctaExplanation}>
          Secure checkout with instant access upon payment confirmation.
        </Text>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  planCard: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.primarySubtle,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  planName: {
    marginVertical: spacing.xs,
    color: colors.textPrimary,
  },
  priceRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  priceValue: {
    fontWeight: "700",
  },
  featuresCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  featuresTitle: {
    marginBottom: spacing.xs,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  iconBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkIcon: {
    fontWeight: "bold",
  },
  featureTextContainer: {
    flex: 1,
  },
  featureHeading: {
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  noticeCard: {
    padding: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  noticeTitle: {
    marginBottom: spacing.xs,
  },
  noticeText: {
    lineHeight: 20,
  },
  errorNoticeCard: {
    padding: spacing.md,
    backgroundColor: colors.errorLight,
    borderColor: colors.error,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  errorNoticeText: {
    lineHeight: 18,
  },
  viewSubBtn: {
    marginTop: spacing.xs,
    alignSelf: "flex-start",
  },
  ctaContainer: {
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  ctaExplanation: {
    textAlign: "center",
    marginTop: 4,
  },
});

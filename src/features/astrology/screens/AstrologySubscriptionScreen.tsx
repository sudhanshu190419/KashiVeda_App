// src/features/astrology/screens/AstrologySubscriptionScreen.tsx
import React from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { AstrologySubscriptionCard } from "../components/AstrologySubscriptionCard.tsx";
import { useCustomerSubscription } from "../hooks/useCustomerSubscription.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const AstrologySubscriptionScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const { subscription, loading, error, refresh } = useCustomerSubscription();

  if (loading) {
    return (
      <ScreenContainer>
        <Header title="My Subscription" onBack={() => navigation.goBack()} />
        <LoadingState message="Fetching subscription details..." />
      </ScreenContainer>
    );
  }

  if (error && !subscription) {
    return (
      <ScreenContainer>
        <Header title="My Subscription" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Unable to Load Subscription"
          message={error}
          onRetry={refresh}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      scrollable
      padded
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <Header title="My Subscription" onBack={() => navigation.goBack()} />

      {!subscription ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="No Active Subscription"
            description="You don't have an active astrology subscription. Browse available plans to learn about cosmic guidance offerings."
          />
          <Button
            title="Explore Plans"
            variant="primary"
            onPress={() => navigation.navigate("Astrology" as any)}
            style={styles.exploreBtn}
          />
        </View>
      ) : (
        <View style={styles.content}>
          <AstrologySubscriptionCard subscription={subscription} />

          {/* Subscription Information Card */}
          <Card variant="outlined" style={styles.infoCard}>
            <Text variant="h3" style={styles.infoTitle}>
              Membership Privileges
            </Text>

            <View style={styles.benefitRow}>
              <Text variant="captionMedium" color={colors.primary} style={styles.benefitBullet}>
                ✦
              </Text>
              <Text variant="body" color={colors.textSecondary} style={styles.benefitText}>
                Daily Vedic Insights published every morning in the Cosmic Insights feed.
              </Text>
            </View>

            <View style={styles.benefitRow}>
              <Text variant="captionMedium" color={colors.primary} style={styles.benefitBullet}>
                ✦
              </Text>
              <Text variant="body" color={colors.textSecondary} style={styles.benefitText}>
                Automatic delivery dispatch to your subscriber journal.
              </Text>
            </View>

            <View style={styles.benefitRow}>
              <Text variant="captionMedium" color={colors.primary} style={styles.benefitBullet}>
                ✦
              </Text>
              <Text variant="body" color={colors.textSecondary} style={styles.benefitText}>
                Personal delivery record tracking and historical review.
              </Text>
            </View>
          </Card>

          <Button
            title="View Delivery Journal"
            variant="secondary"
            onPress={() => navigation.navigate("AstrologyDeliveries" as any)}
            style={styles.actionBtn}
          />
        </View>
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  emptyContainer: {
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  exploreBtn: {
    marginTop: spacing.md,
  },
  content: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  infoCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  infoTitle: {
    marginBottom: spacing.xs,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  benefitBullet: {
    fontWeight: "bold",
    marginTop: 2,
  },
  benefitText: {
    flex: 1,
    lineHeight: 20,
  },
  actionBtn: {
    marginTop: spacing.xs,
  },
});

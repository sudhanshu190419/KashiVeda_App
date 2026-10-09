// src/features/pandit/screens/PanditApplicationStatusScreen.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  Button,
  Card,
  Header,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { useAuth } from "../../auth/AuthContext.tsx";
import { panditApplicationService } from "../services/panditApplicationService.ts";
import { PanditApplication } from "../types/application.ts";

export const PanditApplicationStatusScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, setActiveMode, refreshProfile } = useAuth();

  const [application, setApplication] = useState<PanditApplication | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadStatus = useCallback(async () => {
    if (!user?.id) return;
    try {
      const app = await panditApplicationService.fetchMyApplication(user.id);
      setApplication(app);
      await refreshProfile();
    } catch (err) {
      console.warn("Could not load application status:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id, refreshProfile]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadStatus();
  };

  const handleSwitchToPanditMode = async () => {
    try {
      await setActiveMode("pandit");
    } catch (err: any) {
      console.warn("Error switching to pandit mode:", err?.message);
    }
  };

  if (isLoading) {
    return <LoadingState message="Checking verification status..." />;
  }

  if (!application) {
    return (
      <ScreenContainer scrollable padded>
        <Header
          title="Pandit Onboarding"
          subtitle="Track your consecrated ritual application status"
        />
        <Card style={styles.emptyCard}>
          <Text variant="h3" align="center" style={styles.cardTitle}>
            No Application Found
          </Text>
          <Text variant="body" color={colors.textSecondary} align="center">
            You have not yet submitted an application to become a certified Kashi Veda Acharya.
          </Text>
          <Button
            title="Start Application"
            variant="primary"
            onPress={() => navigation.navigate("PanditApplicationWizard")}
            style={styles.actionBtn}
          />
        </Card>
      </ScreenContainer>
    );
  }

  const { status, rejection_reason, submitted_at, approved_at, reviewed_at } = application;

  return (
    <ScreenContainer
      scrollable
      padded
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      <Header
        title="Application Status"
        subtitle="Real-time administrative verification telemetry"
      />

      {/* Main Status Hero Card */}
      <Card style={styles.statusHeroCard}>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.statusBadge,
              status === "approved"
                ? styles.badgeApproved
                : status === "rejected"
                ? styles.badgeRejected
                : status === "under_review"
                ? styles.badgeUnderReview
                : styles.badgeSubmitted,
            ]}
          >
            <Text
              variant="overline"
              color={
                status === "approved"
                  ? colors.success || "#10b981"
                  : status === "rejected"
                  ? colors.error || "#ef4444"
                  : colors.primary
              }
              style={styles.badgeText}
            >
              {status === "approved"
                ? "APPROVED & CONSECRATED"
                : status === "rejected"
                ? "ACTION REQUIRED / REJECTED"
                : status === "under_review"
                ? "UNDER ACTIVE REVIEW"
                : status === "submitted"
                ? "SUBMITTED • PENDING REVIEW"
                : "DRAFT IN PROGRESS"}
            </Text>
          </View>
        </View>

        <Text variant="h2" style={styles.heroTitle}>
          {status === "approved"
            ? "Welcome, Acharya!"
            : status === "rejected"
            ? "Application Needs Correction"
            : status === "under_review"
            ? "Review in Progress"
            : status === "submitted"
            ? "Application In Review Queue"
            : "Application Saved as Draft"}
        </Text>

        <Text variant="body" color={colors.textSecondary} style={styles.heroDescription}>
          {status === "approved"
            ? "Your Vedic credentials and certificates have been thoroughly verified. Your official Pandit profile is now active on the Kashi Veda platform."
            : status === "rejected"
            ? "The administrative verification team was unable to approve your application in its current state. Please review the reasons below and resubmit."
            : status === "under_review"
            ? "An administrator is actively examining your Gurukul certificates, lineage documentation, and background records."
            : status === "submitted"
            ? "Your application and uploaded documents have been received safely and are queued for document verification."
            : "You have an unfinished application draft. Complete and submit it to join the Kashi Veda Pandit fraternity."}
        </Text>
      </Card>

      {/* Rejection Feedback Details */}
      {status === "rejected" && rejection_reason ? (
        <Card style={styles.rejectionCard}>
          <Text variant="caption" color={colors.error} style={styles.rejectionHeader}>
            Administrator Reviewer Feedback:
          </Text>
          <Text variant="bodyMedium" color={colors.textPrimary} style={styles.rejectionBody}>
            {rejection_reason}
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.rejectionDate}>
            Reviewed on: {reviewed_at ? new Date(reviewed_at).toLocaleDateString() : "Recently"}
          </Text>
        </Card>
      ) : null}

      {/* Application Snapshot Card */}
      <Card style={styles.detailsCard}>
        <Text variant="h3" style={styles.detailsHeading}>
          Application Summary
        </Text>

        <View style={styles.detailRow}>
          <Text variant="caption" color={colors.textSecondary}>Applicant Name:</Text>
          <Text variant="bodyMedium">{application.full_name}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text variant="caption" color={colors.textSecondary}>Tradition:</Text>
          <Text variant="bodyMedium">{application.vedic_tradition || "Smarta"}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text variant="caption" color={colors.textSecondary}>Primary City:</Text>
          <Text variant="bodyMedium">{application.primary_city}</Text>
        </View>

        {application.base_address ? (
          <View style={styles.detailRow}>
            <Text variant="caption" color={colors.textSecondary}>Service Base:</Text>
            <Text variant="bodyMedium" numberOfLines={2} style={styles.detailValueRight}>
              {application.base_address}
            </Text>
          </View>
        ) : null}

        {application.base_latitude != null && application.base_longitude != null ? (
          <View style={styles.detailRow}>
            <Text variant="caption" color={colors.textSecondary}>Spatial Coordinates:</Text>
            <Text variant="bodyMedium">
              {Number(application.base_latitude).toFixed(4)}°N, {Number(application.base_longitude).toFixed(4)}°E
            </Text>
          </View>
        ) : null}

        <View style={styles.detailRow}>
          <Text variant="caption" color={colors.textSecondary}>Service Radius:</Text>
          <Text variant="bodyMedium">{application.service_radius_km || 25} km</Text>
        </View>

        <View style={styles.detailRow}>
          <Text variant="caption" color={colors.textSecondary}>Experience:</Text>
          <Text variant="bodyMedium">{application.years_experience} Years</Text>
        </View>

        <View style={styles.detailRow}>
          <Text variant="caption" color={colors.textSecondary}>Submitted At:</Text>
          <Text variant="bodyMedium">
            {submitted_at ? new Date(submitted_at).toLocaleDateString() : "Not yet submitted"}
          </Text>
        </View>

        {approved_at && (
          <View style={styles.detailRow}>
            <Text variant="caption" color={colors.textSecondary}>Approved At:</Text>
            <Text variant="bodyMedium" color={colors.success || "#10b981"}>
              {new Date(approved_at).toLocaleDateString()}
            </Text>
          </View>
        )}
      </Card>

      {/* Action Buttons based on status */}
      <View style={styles.actionsContainer}>
        {status === "approved" ? (
          <Button
            title="Enter Pandit Mode &gt;"
            variant="primary"
            size="lg"
            onPress={handleSwitchToPanditMode}
            style={styles.actionBtn}
          />
        ) : status === "rejected" || status === "draft" ? (
          <Button
            title={status === "rejected" ? "Edit & Resubmit Application" : "Continue Application"}
            variant="primary"
            size="md"
            onPress={() => navigation.navigate("PanditApplicationWizard")}
            style={styles.actionBtn}
          />
        ) : (
          <Button
            title="Refresh Status"
            variant="outline"
            size="md"
            onPress={onRefresh}
            style={styles.actionBtn}
          />
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  emptyCard: {
    padding: spacing.xl,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  cardTitle: {
    marginBottom: spacing.xs,
  },
  statusHeroCard: {
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  badgeRow: {
    marginBottom: spacing.xs,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: colors.primaryLight,
  },
  badgeApproved: {
    backgroundColor: "#ecfdf5",
  },
  badgeRejected: {
    backgroundColor: "#fef2f2",
  },
  badgeUnderReview: {
    backgroundColor: "#fffbeb",
  },
  badgeSubmitted: {
    backgroundColor: colors.primaryLight,
  },
  badgeText: {
    fontWeight: "700",
  },
  heroTitle: {
    marginVertical: 4,
  },
  heroDescription: {
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  rejectionCard: {
    padding: spacing.md,
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  rejectionHeader: {
    fontWeight: "700",
    marginBottom: 4,
  },
  rejectionBody: {
    lineHeight: 20,
  },
  rejectionDate: {
    marginTop: spacing.xs,
  },
  detailsCard: {
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  detailsHeading: {
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  detailValueRight: {
    flex: 1,
    textAlign: "right",
    paddingLeft: spacing.sm,
  },
  actionsContainer: {
    marginBottom: spacing.xxl,
  },
  actionBtn: {
    marginTop: spacing.xs,
  },
});

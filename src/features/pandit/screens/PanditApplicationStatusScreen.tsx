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
import { colors, radius, spacing, useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { useAuth } from "../../auth/AuthContext.tsx";
import { panditApplicationService } from "../services/panditApplicationService.ts";
import { PanditApplication } from "../types/application.ts";

export const PanditApplicationStatusScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, setActiveMode, refreshProfile } = useAuth();
  const { isDark, colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

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
    return (
      <ScreenContainer padded style={{ backgroundColor: themeColors.surfaceBase }}>
        <LoadingState message="Checking verification status..." />
      </ScreenContainer>
    );
  }

  if (!application) {
    return (
      <ScreenContainer scrollable padded style={{ backgroundColor: themeColors.surfaceBase }}>
        <Header
          title="Pandit Onboarding"
          subtitle="Track your consecrated ritual application status"
          onBack={() => navigation.goBack()}
        />
        <Card style={[styles.emptyCard, { backgroundColor: themeColors.surfaceCard, borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : colors.borderLight }]}>
          <Text variant="h3" color={themeColors.textPrimary} align="center" style={styles.cardTitle}>
            No Application Found
          </Text>
          <Text variant="body" color={themeColors.textMuted} align="center">
            You have not yet submitted an application to become a certified Kashi Veda Pandit Ji.
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
      style={{ backgroundColor: themeColors.surfaceBase }}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[colors.primary]} />
      }
    >
      <Header
        title="Application Status"
        subtitle="Real-time administrative verification telemetry"
        onBack={() => navigation.goBack()}
      />

      {/* Main Status Hero Card */}
      <Card
        variant="elevated"
        style={[
          styles.statusHeroCard,
          {
            backgroundColor: themeColors.surfaceCard,
            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : colors.borderLight,
          },
        ]}
      >
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.statusBadge,
              status === "approved"
                ? { backgroundColor: isDark ? "rgba(16, 185, 129, 0.2)" : "#ecfdf5" }
                : status === "rejected"
                ? { backgroundColor: isDark ? "rgba(239, 68, 68, 0.2)" : "#fef2f2" }
                : status === "under_review"
                ? { backgroundColor: isDark ? "rgba(245, 158, 11, 0.2)" : "#fffbeb" }
                : { backgroundColor: isDark ? "rgba(224, 86, 36, 0.2)" : colors.primaryLight || "#FEF3EB" },
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

        <Text variant="h2" color={themeColors.textPrimary} style={styles.heroTitle}>
          {status === "approved"
            ? "Welcome, Pandit Ji!"
            : status === "rejected"
            ? "Application Needs Correction"
            : status === "under_review"
            ? "Review in Progress"
            : status === "submitted"
            ? "Application In Review Queue"
            : "Application Saved as Draft"}
        </Text>

        <Text variant="body" color={themeColors.textMuted} style={styles.heroDescription}>
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
        <Card
          style={[
            styles.rejectionCard,
            {
              backgroundColor: isDark ? "rgba(239, 68, 68, 0.15)" : "#fff1f2",
              borderColor: isDark ? "rgba(239, 68, 68, 0.3)" : "#fecdd3",
            },
          ]}
        >
          <Text variant="caption" color={colors.error || "#ef4444"} style={styles.rejectionHeader}>
            Administrator Reviewer Feedback:
          </Text>
          <Text variant="bodyMedium" color={themeColors.textPrimary} style={styles.rejectionBody}>
            {rejection_reason}
          </Text>
          <Text variant="caption" color={themeColors.textMuted} style={styles.rejectionDate}>
            Reviewed on: {reviewed_at ? new Date(reviewed_at).toLocaleDateString() : "Recently"}
          </Text>
        </Card>
      ) : null}

      {/* Application Snapshot Card */}
      <Card
        variant="outlined"
        style={[
          styles.detailsCard,
          {
            backgroundColor: themeColors.surfaceCard,
            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : colors.borderLight,
          },
        ]}
      >
        <Text variant="h3" color={themeColors.textPrimary} style={styles.detailsHeading}>
          Application Summary
        </Text>

        <View style={[styles.detailRow, { borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.borderLight }]}>
          <Text variant="caption" color={themeColors.textMuted}>Applicant Name:</Text>
          <Text variant="bodyMedium" color={themeColors.textPrimary}>{application.full_name}</Text>
        </View>

        <View style={[styles.detailRow, { borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.borderLight }]}>
          <Text variant="caption" color={themeColors.textMuted}>Tradition:</Text>
          <Text variant="bodyMedium" color={themeColors.textPrimary}>{application.vedic_tradition || "Smarta"}</Text>
        </View>

        <View style={[styles.detailRow, { borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.borderLight }]}>
          <Text variant="caption" color={themeColors.textMuted}>Primary City:</Text>
          <Text variant="bodyMedium" color={themeColors.textPrimary}>{application.primary_city}</Text>
        </View>

        {application.base_address ? (
          <View style={[styles.detailRow, { borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.borderLight }]}>
            <Text variant="caption" color={themeColors.textMuted}>Service Base:</Text>
            <Text variant="bodyMedium" color={themeColors.textPrimary} numberOfLines={2} style={styles.detailValueRight}>
              {application.base_address}
            </Text>
          </View>
        ) : null}

        {application.base_latitude != null && application.base_longitude != null ? (
          <View style={[styles.detailRow, { borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.borderLight }]}>
            <Text variant="caption" color={themeColors.textMuted}>Spatial Coordinates:</Text>
            <Text variant="bodyMedium" color={themeColors.textPrimary}>
              {Number(application.base_latitude).toFixed(4)}°N, {Number(application.base_longitude).toFixed(4)}°E
            </Text>
          </View>
        ) : null}

        <View style={[styles.detailRow, { borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.borderLight }]}>
          <Text variant="caption" color={themeColors.textMuted}>Service Radius:</Text>
          <Text variant="bodyMedium" color={themeColors.textPrimary}>{application.service_radius_km || 25} km</Text>
        </View>

        <View style={[styles.detailRow, { borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.borderLight }]}>
          <Text variant="caption" color={themeColors.textMuted}>Experience:</Text>
          <Text variant="bodyMedium" color={themeColors.textPrimary}>{application.years_experience} Years</Text>
        </View>

        <View style={[styles.detailRow, { borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.borderLight }]}>
          <Text variant="caption" color={themeColors.textMuted}>Submitted At:</Text>
          <Text variant="bodyMedium" color={themeColors.textPrimary}>
            {submitted_at ? new Date(submitted_at).toLocaleDateString() : "Not yet submitted"}
          </Text>
        </View>

        {approved_at && (
          <View style={[styles.detailRow, { borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.borderLight }]}>
            <Text variant="caption" color={themeColors.textMuted}>Approved At:</Text>
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
    padding: 24,
    alignItems: "center",
    marginTop: 24,
    borderRadius: 10,
    borderWidth: 1,
  },
  cardTitle: {
    marginBottom: 8,
  },
  statusHeroCard: {
    padding: 18,
    marginBottom: 16,
    borderRadius: 10,
  },
  badgeRow: {
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontWeight: "700",
  },
  heroTitle: {
    marginVertical: 4,
  },
  heroDescription: {
    lineHeight: 20,
    marginTop: 8,
  },
  rejectionCard: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 16,
  },
  rejectionHeader: {
    fontWeight: "700",
    marginBottom: 4,
  },
  rejectionBody: {
    lineHeight: 20,
  },
  rejectionDate: {
    marginTop: 8,
  },
  detailsCard: {
    padding: 16,
    marginBottom: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  detailsHeading: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  detailValueRight: {
    flex: 1,
    textAlign: "right",
    paddingLeft: 8,
  },
  actionsContainer: {
    marginBottom: 32,
  },
  actionBtn: {
    marginTop: 8,
    minHeight: 48,
  },
});

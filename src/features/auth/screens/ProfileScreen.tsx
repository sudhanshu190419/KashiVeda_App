import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Button, Card, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { useAuth } from "../AuthContext.tsx";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { panditApplicationService } from "../../pandit/services/panditApplicationService.ts";
import { PanditApplication } from "../../pandit/types/application.ts";

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { profile, roles, user, signOut, setActiveMode, deleteAccount } = useAuth();
  const [application, setApplication] = useState<PanditApplication | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (user?.id && !roles.includes("pandit")) {
      panditApplicationService
        .fetchMyApplication(user.id)
        .then((app) => {
          if (isMounted) setApplication(app);
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [user?.id, roles]);

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action is permanent and cannot be undone. All your personal data and sessions will be invalidated.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue to Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "Are you completely sure? You will be signed out immediately and will lose access to this profile.",
              [
                { text: "Keep My Account", style: "cancel" },
                {
                  text: "Permanently Delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      setIsDeleting(true);
                      await deleteAccount();
                    } catch (err: any) {
                      setIsDeleting(false);
                      Alert.alert(
                        "Deletion Blocked",
                        err?.message || "Could not delete account. If you have active ritual bookings, please wait until they complete or cancel them first."
                      );
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const isPandit = roles.includes("pandit");

  return (
    <ScreenContainer scrollable padded>
      <View style={styles.header}>
        <Text variant="h1">Account & Settings</Text>
      </View>

      {/* User Identity Card */}
      <Card style={styles.userCard}>
        <Text variant="h2">{profile?.display_name || "Devotee"}</Text>
        <Text variant="body" color={colors.textSecondary}>
          {user?.phone || user?.email || "No contact info"}
        </Text>
        <View style={styles.badgeRow}>
          {roles.map((r) => (
            <View key={r} style={styles.badge}>
              <Text variant="overline" color={colors.primary}>
                Role: {r.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Pandit Sanctum Mode Switcher or Onboarding Entry Point */}
      {isPandit ? (
        <Card variant="elevated" style={styles.panditModeCard}>
          <View style={styles.panditModeHeader}>
            <Text variant="h3" color={colors.primary}>
              Pandit Sanctum Active
            </Text>
            <View style={styles.verifiedBadge}>
              <Text variant="caption" color={colors.surface} style={styles.verifiedText}>
                Verified ✓
              </Text>
            </View>
          </View>
          <Text variant="caption" color={colors.textSecondary} style={styles.panditModeDesc}>
            You are authorized as a certified Kashi Veda Acharya. Switch to Pandit Mode to manage ritual bookings, schedules, and Kundli requests.
          </Text>
          <Button
            title="Switch to Pandit Mode &gt;"
            variant="primary"
            size="md"
            onPress={() => setActiveMode("pandit")}
            style={styles.switchModeBtn}
          />
        </Card>
      ) : application ? (
        <Card variant="elevated" style={styles.onboardingCard}>
          <View style={styles.panditModeHeader}>
            <Text variant="h3">Pandit Application</Text>
            <View
              style={[
                styles.appStatusBadge,
                application.status === "approved"
                  ? styles.badgeApproved
                  : application.status === "rejected"
                  ? styles.badgeRejected
                  : styles.badgePending,
              ]}
            >
              <Text
                variant="overline"
                color={
                  application.status === "approved"
                    ? colors.success || "#10b981"
                    : application.status === "rejected"
                    ? colors.error || "#ef4444"
                    : colors.primary
                }
              >
                {application.status.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text variant="caption" color={colors.textSecondary} style={styles.panditModeDesc}>
            {application.status === "submitted" || application.status === "under_review"
              ? "Your application is currently being evaluated by our administrative verification team."
              : application.status === "rejected"
              ? "Action required: Reviewer feedback needs your attention."
              : "You have an unfinished application draft."}
          </Text>
          <Button
            title="View Application Telemetry"
            variant="outline"
            size="sm"
            onPress={() => navigation.navigate("PanditApplicationStatus")}
            style={styles.switchModeBtn}
          />
        </Card>
      ) : (
        <Card variant="elevated" style={styles.onboardingCard}>
          <Text variant="h3">Become a Pandit</Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.panditModeDesc}>
            Are you a consecrated priest, Purohit, or Vedic scholar? Apply to join Kashi Veda and serve devotees across India with traditional rituals.
          </Text>
          <Button
            title="Start Pandit Application &gt;"
            variant="primary"
            size="sm"
            onPress={() => navigation.navigate("PanditApplicationWizard")}
            style={styles.switchModeBtn}
          />
        </Card>
      )}

      {/* Existing App Menus */}
      <Card style={styles.menuCard}>
        <Text variant="h3">Saved Addresses</Text>
        <Text variant="caption" color={colors.textSecondary}>
          Manage your home and temple service delivery addresses.
        </Text>
      </Card>

      <Card style={styles.menuCard}>
        <Text variant="h3">Family Kundli Profiles</Text>
        <Text variant="caption" color={colors.textSecondary}>
          Save birth details for quick Kundli generation and ritual sankalps.
        </Text>
      </Card>

      {/* Danger Zone: Account Deletion */}
      <Card variant="outlined" style={styles.dangerCard}>
        <Text variant="h3" color={colors.error || "#ef4444"}>
          Danger Zone
        </Text>
        <Text variant="caption" color={colors.textSecondary} style={styles.dangerDesc}>
          Permanently delete your Kashi Veda account, devotee profile, and access credentials. This action cannot be reversed.
        </Text>
        <Button
          title="Delete Account"
          variant="danger"
          size="sm"
          loading={isDeleting}
          onPress={handleDeleteAccount}
          style={styles.deleteButton}
        />
      </Card>

      <Button
        title="Sign Out"
        variant="outline"
        onPress={signOut}
        style={styles.signOutButton}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    marginVertical: spacing.md,
  },
  userCard: {
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  badgeRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  badge: {
    backgroundColor: colors.primaryLight,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: 6,
  },
  panditModeCard: {
    padding: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
    borderWidth: 1,
  },
  panditModeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  verifiedBadge: {
    backgroundColor: colors.success || "#10b981",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  verifiedText: {
    fontWeight: "700",
  },
  panditModeDesc: {
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  switchModeBtn: {
    marginTop: spacing.md,
  },
  onboardingCard: {
    padding: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  appStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
    backgroundColor: colors.primaryLight,
  },
  badgeApproved: {
    backgroundColor: "#ecfdf5",
  },
  badgeRejected: {
    backgroundColor: "#fef2f2",
  },
  badgePending: {
    backgroundColor: colors.primaryLight,
  },
  menuCard: {
    marginBottom: spacing.md,
  },
  dangerCard: {
    marginBottom: spacing.md,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    padding: spacing.lg,
  },
  dangerDesc: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  deleteButton: {
    alignSelf: "flex-start",
  },
  signOutButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
  },
});

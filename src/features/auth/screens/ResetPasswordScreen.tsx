// src/features/auth/screens/ResetPasswordScreen.tsx
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VInput,
  VButton,
  VText,
  Ionicons,
} from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { AuthStackParamList } from "../../../shared/types/navigation.ts";
import { authService } from "../services/authService.ts";

type Props = NativeStackScreenProps<AuthStackParamList, "ResetPassword">;

export const ResetPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radii } = useTheme();
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const handleUpdatePassword = async () => {
    if (loading) return;

    if (!password || !authService.isValidPassword(password)) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await authService.updatePassword(password);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <ScreenWrapper scrollable background="surfaceBase">
        <AppBar
          title="Password Updated"
          showBackButton={true}
          onBackPress={() => navigation.navigate("Login")}
        />
        <View style={[styles.container, { paddingHorizontal: spacing.lg, paddingTop: spacing.lg }]}>
          <VCard elevation={1} style={styles.confirmCard}>
            <Ionicons
              name="checkmark-circle-outline"
              size={56}
              color={colors.statusActive}
              style={styles.icon}
            />
            <VText variant="headlineLarge" align="center" style={styles.title}>
              Password Changed
            </VText>
            <VText
              variant="bodyMedium"
              color={colors.textMuted}
              align="center"
              style={styles.description}
            >
              Your KashiVeda account password has been updated securely. You can now sign in with your new password.
            </VText>

            <VButton
              title="Continue to Sign In"
              label="Continue to Sign In"
              variant="primary"
              size="lg"
              onPress={() => navigation.navigate("Login")}
              fullWidth
              style={styles.actionBtn}
            />
          </VCard>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper scrollable keyboardAvoiding background="surfaceBase">
      <AppBar
        title="Set New Password"
        showBackButton={true}
        onBackPress={() => navigation.navigate("Login")}
      />

      <View style={[styles.container, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
        <VCard elevation={1} style={styles.card}>
          <VText variant="headlineMedium" style={styles.titleLeft}>
            Create New Password
          </VText>
          <VText
            variant="bodyMedium"
            color={colors.textMuted}
            style={styles.descriptionLeft}
          >
            Choose a strong password with at least 6 characters for your KashiVeda account.
          </VText>

          <VInput
            label="New Password (min 6 characters) *"
            placeholder="••••••••"
            isSecure={true}
            autoCapitalize="none"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (error) setError(null);
            }}
            isDisabled={loading}
            leadingIcon={<Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />}
            containerStyle={styles.inputSpacing}
          />

          <VInput
            label="Confirm New Password *"
            placeholder="••••••••"
            isSecure={true}
            autoCapitalize="none"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              if (error) setError(null);
            }}
            isDisabled={loading}
            leadingIcon={<Ionicons name="shield-checkmark-outline" size={20} color={colors.textMuted} />}
            containerStyle={styles.inputSpacing}
          />

          {error ? (
            <View
              style={[
                styles.errorContainer,
                {
                  backgroundColor: colors.errorBg,
                  borderColor: colors.statusAlert,
                  borderRadius: radii.sm,
                  padding: spacing.sm,
                  marginBottom: spacing.md,
                },
              ]}
              accessibilityRole="alert"
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.statusAlert}
                style={{ marginRight: spacing.xs }}
              />
              <VText variant="caption" color={colors.statusAlert} style={styles.errorText}>
                {error}
              </VText>
            </View>
          ) : null}

          <VButton
            title="Update Password"
            label={loading ? "Updating Password..." : "Update Password"}
            onPress={handleUpdatePassword}
            loading={loading}
            disabled={loading || !password || !confirmPassword}
            variant="primary"
            size="lg"
            fullWidth
            style={styles.actionBtn}
          />
        </VCard>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    padding: 20,
  },
  confirmCard: {
    padding: 24,
    alignItems: "center",
  },
  icon: {
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    marginBottom: 8,
  },
  titleLeft: {
    marginBottom: 4,
  },
  description: {
    marginBottom: 24,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  descriptionLeft: {
    marginBottom: 16,
    lineHeight: 20,
  },
  inputSpacing: {
    marginBottom: 14,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
  },
  actionBtn: {
    marginTop: 6,
  },
});

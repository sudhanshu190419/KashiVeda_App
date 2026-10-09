// src/features/auth/screens/ResetPasswordScreen.tsx
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Card, Header, Input, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { AuthStackParamList } from "../../../shared/types/navigation.ts";
import { authService } from "../services/authService.ts";

type Props = NativeStackScreenProps<AuthStackParamList, "ResetPassword">;

export const ResetPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
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
      <ScreenContainer scrollable padded>
        <Header title="Password Updated" onBack={() => navigation.navigate("Login")} />
        <Card variant="elevated" style={styles.card}>
          <Text style={styles.icon}>✅</Text>
          <Text variant="h2" align="center" style={styles.title}>
            Password Changed
          </Text>
          <Text variant="body" color={colors.textSecondary} align="center" style={styles.description}>
            Your KashiVeda account password has been updated securely. You can now sign in with your new password.
          </Text>

          <Button
            title="Continue to Sign In"
            variant="primary"
            size="lg"
            onPress={() => navigation.navigate("Login")}
            style={styles.actionBtn}
          />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable padded>
      <Header title="Set New Password" onBack={() => navigation.navigate("Login")} />

      <Card variant="elevated" style={styles.card}>
        <Text variant="h3" style={styles.titleLeft}>
          Create New Password
        </Text>
        <Text variant="body" color={colors.textSecondary} style={styles.descriptionLeft}>
          Choose a strong password with at least 6 characters for your KashiVeda account.
        </Text>

        <Input
          label="New Password (min 6 characters) *"
          placeholder="••••••••"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (error) setError(null);
          }}
          editable={!loading}
          rightElement={
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text variant="captionMedium" color={colors.textSecondary}>
                {showPassword ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          }
        />

        <Input
          label="Confirm New Password *"
          placeholder="••••••••"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            if (error) setError(null);
          }}
          editable={!loading}
        />

        {error ? (
          <View style={styles.errorContainer}>
            <Text variant="caption" color={colors.error} align="center">
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          title={loading ? "Updating Password..." : "Update Password"}
          onPress={handleUpdatePassword}
          loading={loading}
          disabled={loading || !password || !confirmPassword}
          variant="primary"
          size="lg"
          style={styles.actionBtn}
        />
      </Card>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.lg,
  },
  icon: {
    fontSize: 48,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.sm,
  },
  titleLeft: {
    marginBottom: spacing.xs,
  },
  description: {
    marginBottom: spacing.xl,
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
  },
  descriptionLeft: {
    marginBottom: spacing.base,
    lineHeight: 20,
  },
  errorContainer: {
    backgroundColor: "#FEE2E2",
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.base,
  },
  actionBtn: {
    marginTop: spacing.sm,
  },
});

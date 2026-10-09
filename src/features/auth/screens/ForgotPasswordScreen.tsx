// src/features/auth/screens/ForgotPasswordScreen.tsx
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Card, Header, Input, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { AuthStackParamList } from "../../../shared/types/navigation.ts";
import { authService } from "../services/authService.ts";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

export const ForgotPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);

  const handleSendResetLink = async () => {
    if (loading) return;

    if (!email.trim() || !authService.isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await authService.sendPasswordResetEmail(email);
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || "Failed to send reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <ScreenContainer scrollable padded>
        <Header title="Reset Password" onBack={() => navigation.navigate("Login")} />
        <Card variant="elevated" style={styles.card}>
          <Text style={styles.icon}>📬</Text>
          <Text variant="h2" align="center" style={styles.title}>
            Reset Link Dispatched
          </Text>
          <Text variant="body" color={colors.textSecondary} align="center" style={styles.description}>
            If an account is registered with:
          </Text>
          <Text variant="bodyMedium" color={colors.primary} align="center" style={styles.emailText}>
            {email.trim().toLowerCase()}
          </Text>
          <Text variant="caption" color={colors.textTertiary} align="center" style={styles.helperText}>
            You will receive an email containing a secure link to reset your password.
          </Text>

          <Button
            title="Return to Sign In"
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
      <Header title="Forgot Password" onBack={() => navigation.goBack()} />

      <Card variant="elevated" style={styles.card}>
        <Text variant="h3" style={styles.titleLeft}>
          Recover Password
        </Text>
        <Text variant="body" color={colors.textSecondary} style={styles.descriptionLeft}>
          Enter your registered email address and we'll send you instructions to reset your password.
        </Text>

        <Input
          label="Email Address"
          placeholder="your.email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
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
          title={loading ? "Sending Link..." : "Send Reset Link"}
          onPress={handleSendResetLink}
          loading={loading}
          disabled={loading || !email.trim()}
          variant="primary"
          size="lg"
          style={styles.actionBtn}
        />
      </Card>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => navigation.navigate("Login")}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text variant="bodyMedium" color={colors.primary}>
            ← Back to Sign In
          </Text>
        </TouchableOpacity>
      </View>
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
    marginBottom: spacing.xs,
  },
  descriptionLeft: {
    marginBottom: spacing.base,
    lineHeight: 20,
  },
  emailText: {
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  helperText: {
    lineHeight: 18,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xl,
  },
  errorContainer: {
    backgroundColor: "#FEE2E2",
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.base,
  },
  actionBtn: {
    marginTop: spacing.xs,
  },
  footer: {
    alignItems: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
});

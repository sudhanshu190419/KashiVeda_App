// src/features/auth/screens/ForgotPasswordScreen.tsx
import React, { useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
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

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

export const ForgotPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radii } = useTheme();
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
      <ScreenWrapper scrollable background="surfaceBase">
        <AppBar
          title="Reset Password"
          showBackButton={true}
          onBackPress={() => navigation.navigate("Login")}
        />
        <View style={[styles.container, { paddingHorizontal: spacing.lg, paddingTop: spacing.lg }]}>
          <VCard elevation={1} style={styles.confirmCard}>
            <Ionicons
              name="paper-plane-outline"
              size={56}
              color={colors.brandPrimary}
              style={styles.icon}
            />
            <VText variant="headlineLarge" align="center" style={styles.title}>
              Reset Link Dispatched
            </VText>
            <VText
              variant="bodyMedium"
              color={colors.textMuted}
              align="center"
              style={styles.description}
            >
              If an account is registered with:
            </VText>
            <VText
              variant="titleMedium"
              color={colors.brandPrimary}
              align="center"
              style={styles.emailText}
            >
              {email.trim().toLowerCase()}
            </VText>
            <VText
              variant="caption"
              color={colors.textMuted}
              align="center"
              style={styles.helperText}
            >
              You will receive an email containing a secure link to reset your password.
            </VText>

            <VButton
              title="Return to Sign In"
              label="Return to Sign In"
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
        title="Forgot Password"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />

      <View style={[styles.container, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
        <VCard elevation={1} style={styles.card}>
          <VText variant="headlineMedium" style={styles.titleLeft}>
            Recover Password
          </VText>
          <VText
            variant="bodyMedium"
            color={colors.textMuted}
            style={styles.descriptionLeft}
          >
            Enter your registered email address and we'll send you instructions to reset your password.
          </VText>

          <VInput
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
            isDisabled={loading}
            leadingIcon={<Ionicons name="mail-outline" size={20} color={colors.textMuted} />}
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
            title="Send Reset Link"
            label={loading ? "Sending Link..." : "Send Reset Link"}
            onPress={handleSendResetLink}
            loading={loading}
            disabled={loading || !email.trim()}
            variant="primary"
            size="lg"
            fullWidth
            style={styles.actionBtn}
          />
        </VCard>

        {/* Back to Sign In Link */}
        <View style={[styles.footer, { marginTop: spacing.xl, marginBottom: spacing.xxl }]}>
          <Pressable
            onPress={() => navigation.navigate("Login")}
            disabled={loading}
            style={styles.backLink}
            accessibilityRole="button"
            accessibilityLabel="Back to Sign In"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <VText variant="labelLarge" color={colors.brandPrimary}>
              ← Back to Sign In
            </VText>
          </Pressable>
        </View>
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
    marginBottom: 4,
  },
  descriptionLeft: {
    marginBottom: 16,
    lineHeight: 20,
  },
  emailText: {
    marginBottom: 16,
  },
  helperText: {
    lineHeight: 18,
    paddingHorizontal: 16,
    marginBottom: 24,
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
  footer: {
    alignItems: "center",
  },
  backLink: {
    minHeight: 48,
    justifyContent: "center",
  },
});

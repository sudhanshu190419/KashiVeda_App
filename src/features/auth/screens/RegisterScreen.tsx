// src/features/auth/screens/RegisterScreen.tsx
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

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radii } = useTheme();
  const [displayName, setDisplayName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState<boolean>(false);

  const handleRegister = async () => {
    if (loading) return;

    if (!displayName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!email.trim() || !authService.isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

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
      const res = await authService.signUpWithEmail(email, password, displayName);

      if (res.isEmailConfirmationRequired) {
        setConfirmationPending(true);
      }
      // If immediate session, AuthContext handles role resolution and routing
    } catch (err: any) {
      setError(err?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (confirmationPending) {
    return (
      <ScreenWrapper scrollable background="surfaceBase">
        <AppBar
          title="Verify Email"
          showBackButton={true}
          onBackPress={() => navigation.navigate("Login")}
        />
        <View style={[styles.container, { paddingHorizontal: spacing.lg, paddingTop: spacing.lg }]}>
          <VCard elevation={1} style={styles.confirmCard}>
            <Ionicons
              name="mail-unread-outline"
              size={56}
              color={colors.brandPrimary}
              style={styles.mailIcon}
            />
            <VText variant="headlineLarge" align="center" style={styles.confirmTitle}>
              Check Your Email
            </VText>
            <VText
              variant="bodyMedium"
              color={colors.textMuted}
              align="center"
              style={styles.confirmText}
            >
              We have sent a verification link to:
            </VText>
            <VText
              variant="titleMedium"
              color={colors.brandPrimary}
              align="center"
              style={styles.emailHighlight}
            >
              {email.trim().toLowerCase()}
            </VText>
            <VText
              variant="caption"
              color={colors.textMuted}
              align="center"
              style={styles.instructionText}
            >
              Please tap the link in the email to verify your account and activate your KashiVeda access.
            </VText>

            <VButton
              title="Back to Sign In"
              label="Back to Sign In"
              variant="primary"
              size="lg"
              onPress={() => navigation.navigate("Login")}
              fullWidth
              style={styles.backBtn}
            />
          </VCard>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper scrollable keyboardAvoiding background="surfaceBase">
      <AppBar
        title="Create Account"
        showBackButton={true}
        onBackPress={() => navigation.navigate("Login")}
      />

      <View style={[styles.container, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
        <VCard elevation={1} style={styles.card}>
          <VText variant="headlineMedium" style={styles.cardTitle}>
            Devotee Registration
          </VText>
          <VText
            variant="bodyMedium"
            color={colors.textMuted}
            style={styles.cardSubtitle}
          >
            Enter your information to register for Vedic rituals and consultations.
          </VText>

          <VInput
            label="Full Name *"
            placeholder="e.g. Rahul Sharma"
            value={displayName}
            onChangeText={(text) => {
              setDisplayName(text);
              if (error) setError(null);
            }}
            isDisabled={loading}
            leadingIcon={<Ionicons name="person-outline" size={20} color={colors.textMuted} />}
            containerStyle={styles.inputSpacing}
          />

          <VInput
            label="Email Address *"
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

          <VInput
            label="Password (min 6 characters) *"
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
            label="Confirm Password *"
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
            title="Create Account"
            label={loading ? "Creating Account..." : "Create Account"}
            onPress={handleRegister}
            loading={loading}
            disabled={loading}
            variant="primary"
            size="lg"
            fullWidth
            style={styles.actionBtn}
          />
        </VCard>

        {/* Sign In Footer */}
        <View style={[styles.footer, { marginTop: spacing.xl, marginBottom: spacing.xxl }]}>
          <VText variant="bodyMedium" color={colors.textMuted}>
            Already have an account?{" "}
          </VText>
          <Pressable
            onPress={() => navigation.navigate("Login")}
            disabled={loading}
            style={styles.inlineLink}
            accessibilityRole="button"
            accessibilityLabel="Sign In"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <VText variant="labelLarge" color={colors.brandPrimary}>
              Sign In
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
  cardTitle: {
    marginBottom: 4,
  },
  cardSubtitle: {
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  inlineLink: {
    minHeight: 48,
    justifyContent: "center",
  },
  confirmCard: {
    padding: 24,
    alignItems: "center",
  },
  mailIcon: {
    marginBottom: 16,
  },
  confirmTitle: {
    marginBottom: 8,
  },
  confirmText: {
    marginBottom: 4,
  },
  emailHighlight: {
    marginBottom: 16,
  },
  instructionText: {
    lineHeight: 18,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  backBtn: {
    width: "100%",
  },
});

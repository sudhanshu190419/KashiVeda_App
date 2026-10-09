// src/features/auth/screens/RegisterScreen.tsx
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Card, Header, Input, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { AuthStackParamList } from "../../../shared/types/navigation.ts";
import { authService } from "../services/authService.ts";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const [displayName, setDisplayName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
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
      <ScreenContainer scrollable padded>
        <Header title="Verify Email" onBack={() => navigation.navigate("Login")} />
        <Card variant="elevated" style={styles.confirmCard}>
          <Text style={styles.mailIcon}>✉️</Text>
          <Text variant="h2" align="center" style={styles.confirmTitle}>
            Check Your Email
          </Text>
          <Text variant="body" color={colors.textSecondary} align="center" style={styles.confirmText}>
            We have sent a verification link to:
          </Text>
          <Text variant="bodyMedium" color={colors.primary} align="center" style={styles.emailHighlight}>
            {email.trim().toLowerCase()}
          </Text>
          <Text variant="caption" color={colors.textTertiary} align="center" style={styles.instructionText}>
            Please tap the link in the email to verify your account and activate your KashiVeda access.
          </Text>

          <Button
            title="Back to Sign In"
            variant="primary"
            size="lg"
            onPress={() => navigation.navigate("Login")}
            style={styles.backBtn}
          />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable padded>
      <Header title="Create Account" onBack={() => navigation.navigate("Login")} />

      <Card variant="elevated" style={styles.card}>
        <Text variant="h3" style={styles.cardTitle}>
          Devotee Registration
        </Text>
        <Text variant="caption" color={colors.textSecondary} style={styles.cardSubtitle}>
          Enter your information to register for Vedic rituals and consultations.
        </Text>

        <Input
          label="Full Name *"
          placeholder="e.g. Rahul Sharma"
          value={displayName}
          onChangeText={(text) => {
            setDisplayName(text);
            if (error) setError(null);
          }}
          editable={!loading}
        />

        <Input
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
          editable={!loading}
        />

        <Input
          label="Password (min 6 characters) *"
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
          label="Confirm Password *"
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
          title={loading ? "Creating Account..." : "Create Account"}
          onPress={handleRegister}
          loading={loading}
          disabled={loading}
          variant="primary"
          size="lg"
          style={styles.actionBtn}
        />
      </Card>

      <View style={styles.footer}>
        <Text variant="body" color={colors.textSecondary}>
          Already have an account?{" "}
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate("Login")}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text variant="bodyMedium" color={colors.primary}>
            Sign In
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  cardTitle: {
    marginBottom: 4,
  },
  cardSubtitle: {
    marginBottom: spacing.base,
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
  confirmCard: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderRadius: radius.lg,
  },
  mailIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  confirmTitle: {
    marginBottom: spacing.sm,
  },
  confirmText: {
    marginBottom: spacing.xs,
  },
  emailHighlight: {
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  instructionText: {
    lineHeight: 18,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  backBtn: {
    width: "100%",
  },
});

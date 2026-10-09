// src/features/auth/screens/LoginScreen.tsx
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Card, Input, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { AuthStackParamList } from "../../../shared/types/navigation.ts";
import { authService } from "../services/authService.ts";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isFormBusy = loading || googleLoading;

  const handleSignIn = async () => {
    if (isFormBusy) return;

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await authService.signInWithEmail(email, password);
      // Navigation is automatically handled by AuthContext onAuthStateChange
    } catch (err: any) {
      setError(err?.message || "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isFormBusy) return;

    try {
      setGoogleLoading(true);
      setError(null);
      await authService.signInWithGoogleNative();
      // Navigation is automatically handled by AuthContext onAuthStateChange
    } catch (err: any) {
      if (err?.message?.toLowerCase().includes("cancelled")) {
        return;
      }
      setError(err?.message || "Google Sign-In failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <ScreenContainer scrollable padded>
      {/* Sacred Kashi Header */}
      <View style={styles.header}>
        <Text variant="captionMedium" color={colors.primary} style={styles.omGlyph}>
          ॥ श्री काशीविश्वनाथो विजयते ॥
        </Text>
        <Text variant="display" align="center" style={styles.brandTitle}>
          Kashi Veda
        </Text>
        <Text variant="body" color={colors.textSecondary} align="center" style={styles.subtitle}>
          Authentic Vedic rituals, certified Pandits, and sacred traditions of Varanasi.
        </Text>
      </View>

      {/* Login Credentials Card */}
      <Card variant="elevated" style={styles.card}>
        <Text variant="h3" style={styles.cardTitle}>
          Sign In
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
          editable={!isFormBusy}
        />

        <Input
          label="Password"
          placeholder="••••••••"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (error) setError(null);
          }}
          editable={!isFormBusy}
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

        {/* Forgot Password Link */}
        <TouchableOpacity
          onPress={() => navigation.navigate("ForgotPassword")}
          style={styles.forgotBtn}
          disabled={isFormBusy}
          activeOpacity={0.7}
        >
          <Text variant="captionMedium" color={colors.primary}>
            Forgot Password?
          </Text>
        </TouchableOpacity>

        {error ? (
          <View style={styles.errorContainer}>
            <Text variant="caption" color={colors.error} align="center">
              {error}
            </Text>
          </View>
        ) : null}

        {/* Sign In CTA */}
        <Button
          title={loading ? "Signing In..." : "Sign In"}
          onPress={handleSignIn}
          loading={loading}
          disabled={isFormBusy}
          variant="primary"
          size="lg"
          style={styles.actionBtn}
        />

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text variant="caption" color={colors.textTertiary} style={styles.dividerText}>
            OR
          </Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google Sign-In Button */}
        <TouchableOpacity
          style={[styles.googleBtn, isFormBusy && styles.googleBtnDisabled]}
          onPress={handleGoogleSignIn}
          disabled={isFormBusy}
          activeOpacity={0.8}
        >
          <Text style={styles.googleIcon}>🌐</Text>
          <Text variant="bodyMedium" color={colors.textPrimary}>
            {googleLoading ? "Connecting with Google..." : "Continue with Google"}
          </Text>
        </TouchableOpacity>
      </Card>

      {/* Create Account Footer */}
      <View style={styles.footer}>
        <Text variant="body" color={colors.textSecondary}>
          Don't have an account?{" "}
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate("Register")}
          disabled={isFormBusy}
          activeOpacity={0.7}
        >
          <Text variant="bodyMedium" color={colors.primary}>
            Create Account
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  omGlyph: {
    marginBottom: spacing.xs,
    fontSize: 14,
    letterSpacing: 1.5,
  },
  brandTitle: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    paddingHorizontal: spacing.md,
    lineHeight: 20,
  },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  cardTitle: {
    marginBottom: spacing.base,
  },
  forgotBtn: {
    alignSelf: "flex-end",
    marginBottom: spacing.base,
    marginTop: -spacing.xs,
  },
  errorContainer: {
    backgroundColor: "#FEE2E2",
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.base,
  },
  actionBtn: {
    marginTop: spacing.xs,
    marginBottom: spacing.base,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderLight,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontWeight: "600",
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  googleBtnDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
});

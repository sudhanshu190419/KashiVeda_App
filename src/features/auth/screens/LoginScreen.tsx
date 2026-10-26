// src/features/auth/screens/LoginScreen.tsx
import React, { useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  VCard,
  VInput,
  VButton,
  VText,
  SolarBrandGlyph,
  Ionicons,
} from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { AuthStackParamList } from "../../../shared/types/navigation.ts";
import { authService } from "../services/authService.ts";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radii } = useTheme();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
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
    <ScreenWrapper scrollable keyboardAvoiding background="surfaceBase">
      <View style={[styles.container, { paddingHorizontal: spacing.lg }]}>
        {/* Sacred Kashi Vedic Header */}
        <View style={[styles.header, { marginTop: spacing.xl, marginBottom: spacing.lg }]}>
          <SolarBrandGlyph size={64} style={styles.brandGlyph} />
          <VText
            variant="labelMedium"
            color={colors.brandPrimary}
            align="center"
            isDevanagari
            style={styles.omGlyph}
          >
            ॥ श्री काशीविश्वनाथो विजयते ॥
          </VText>
          <VText variant="displayHero" align="center" style={styles.brandTitle}>
            Kashi Veda
          </VText>
          <VText
            variant="bodyMedium"
            color={colors.textMuted}
            align="center"
            style={styles.subtitle}
          >
            Authentic Vedic rituals, certified Pandits, and sacred traditions of Varanasi.
          </VText>
        </View>

        {/* Login Credentials Card */}
        <VCard elevation={1} style={styles.card}>
          <VText variant="headlineMedium" style={styles.cardTitle}>
            Sign In
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
            isDisabled={isFormBusy}
            leadingIcon={<Ionicons name="mail-outline" size={20} color={colors.textMuted} />}
            containerStyle={styles.inputSpacing}
          />

          <VInput
            label="Password"
            placeholder="••••••••"
            isSecure={true}
            autoCapitalize="none"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (error) setError(null);
            }}
            isDisabled={isFormBusy}
            leadingIcon={<Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />}
            containerStyle={styles.inputSpacing}
          />

          {/* Forgot Password Link - 48dp min touch height */}
          <Pressable
            onPress={() => navigation.navigate("ForgotPassword")}
            style={styles.forgotBtn}
            disabled={isFormBusy}
            accessibilityRole="button"
            accessibilityLabel="Forgot Password?"
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <VText variant="labelMedium" color={colors.brandPrimary}>
              Forgot Password?
            </VText>
          </Pressable>

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

          {/* Sign In CTA */}
          <VButton
            title="Sign In"
            label={loading ? "Signing In..." : "Sign In"}
            onPress={handleSignIn}
            loading={loading}
            disabled={isFormBusy}
            variant="primary"
            size="lg"
            fullWidth
            style={styles.actionBtn}
          />

          {/* Divider */}
          <View style={[styles.dividerRow, { marginVertical: spacing.md }]}>
            <View style={[styles.dividerLine, { backgroundColor: colors.borderDefault }]} />
            <VText variant="labelMedium" color={colors.textMuted} style={styles.dividerText}>
              OR
            </VText>
            <View style={[styles.dividerLine, { backgroundColor: colors.borderDefault }]} />
          </View>

          {/* Google Sign-In Button */}
          <Pressable
            style={({ pressed }) => [
              styles.googleBtn,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderRadius: radii.md,
                minHeight: spacing.touch,
                opacity: isFormBusy ? 0.6 : pressed ? 0.8 : 1,
              },
            ]}
            onPress={handleGoogleSignIn}
            disabled={isFormBusy}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            <Ionicons name="logo-google" size={20} color={colors.brandPrimary} style={styles.googleIcon} />
            <VText variant="labelLarge" color={colors.textPrimary}>
              {googleLoading ? "Connecting with Google..." : "Continue with Google"}
            </VText>
          </Pressable>
        </VCard>

        {/* Create Account Footer */}
        <View style={[styles.footer, { marginTop: spacing.xl, marginBottom: spacing.xxl }]}>
          <VText variant="bodyMedium" color={colors.textMuted}>
            Don't have an account?{" "}
          </VText>
          <Pressable
            onPress={() => navigation.navigate("Register")}
            disabled={isFormBusy}
            style={styles.inlineLink}
            accessibilityRole="button"
            accessibilityLabel="Create Account"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <VText variant="labelLarge" color={colors.brandPrimary}>
              Create Account
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
  header: {
    alignItems: "center",
  },
  brandGlyph: {
    marginBottom: 12,
  },
  omGlyph: {
    marginBottom: 6,
    letterSpacing: 1.5,
  },
  brandTitle: {
    marginBottom: 6,
  },
  subtitle: {
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  card: {
    padding: 20,
  },
  cardTitle: {
    marginBottom: 16,
  },
  inputSpacing: {
    marginBottom: 14,
  },
  forgotBtn: {
    alignSelf: "flex-end",
    minHeight: 40,
    justifyContent: "center",
    marginBottom: 12,
    marginTop: -4,
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
    marginTop: 4,
    marginBottom: 8,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  googleIcon: {
    marginRight: 10,
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
});

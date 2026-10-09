// src/shared/screens/AdminNoticeScreen.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, ScreenContainer, Text } from "../components/ui/index.ts";
import { useAuth } from "../../features/auth/AuthContext.tsx";
import { colors } from "../theme/colors.ts";
import { spacing } from "../theme/spacing.ts";

export const AdminNoticeScreen: React.FC = () => {
  const { role, signOut } = useAuth();

  return (
    <ScreenContainer padded>
      <View style={styles.container}>
        <Card variant="elevated" style={styles.card}>
          <Text variant="display" color={colors.secondary} style={styles.icon}>
            🛡️
          </Text>
          <Text variant="h1" align="center" style={styles.title}>
            Administrative Account Detected
          </Text>
          <Text variant="body" color={colors.textSecondary} align="center" style={styles.description}>
            Your account is assigned the {role?.toUpperCase()} role.
            Administrative operations, catalog management, and moderation controls are exclusively available through the Kashi Veda Web Admin Portal.
          </Text>
          <Text variant="captionMedium" color={colors.primary} align="center" style={styles.linkText}>
            https://admin.kashiveda.org
          </Text>

          <Button
            title="Sign Out of Mobile App"
            variant="primary"
            onPress={signOut}
            style={styles.button}
          />
        </Card>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  card: {
    alignItems: "center",
    padding: spacing.xl,
  },
  icon: {
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.sm,
  },
  description: {
    marginBottom: spacing.md,
  },
  linkText: {
    marginBottom: spacing.xl,
  },
  button: {
    width: "100%",
  },
});

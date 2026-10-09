// src/features/pandit/screens/PanditAvailabilityScreen.tsx
import React from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Card, Header, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { AvailabilityRuleCard } from "../components/AvailabilityRuleCard.tsx";
import { usePanditAvailability } from "../hooks/usePanditAvailability.ts";

export const PanditAvailabilityScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { rules, loading, error, saveRule } = usePanditAvailability();

  // Days 0 (Sunday) through 6 (Saturday)
  const days = [0, 1, 2, 3, 4, 5, 6];

  return (
    <ScreenContainer scrollable padded>
      <Header
        title="Weekly Schedule"
        subtitle="Manage your recurring working hours across days of the week"
      />

      {/* Info Card */}
      <Card variant="outlined" style={styles.infoCard}>
        <Text variant="captionMedium" color={colors.primary}>
          ॥ कालनिर्णय • Working Windows ॥
        </Text>
        <Text variant="caption" color={colors.textSecondary} style={styles.infoText}>
          Devotees can only book rituals during active working hours. Existing confirmed bookings are never affected by schedule adjustments.
        </Text>
      </Card>

      {/* Quick Navigation to Blocks */}
      <TouchableOpacity
        style={styles.blockLinkCard}
        onPress={() => navigation.navigate("PanditUnavailableBlocks")}
        activeOpacity={0.7}
      >
        <Text style={styles.blockIcon}>🚫</Text>
        <View style={styles.blockTextWrap}>
          <Text variant="bodyMedium">
            Block Specific Dates or Travel Range &gt;
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            Mark ad-hoc personal or travel time off
          </Text>
        </View>
      </TouchableOpacity>

      {/* Rules list */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="caption" color={colors.textSecondary} style={styles.loadingText}>
            Loading weekly schedule...
          </Text>
        </View>
      ) : (
        <View style={styles.rulesList}>
          {days.map((dayNum) => {
            const rule = rules.find((r) => r.day_of_week === dayNum);
            return (
              <AvailabilityRuleCard
                key={dayNum}
                dayOfWeek={dayNum}
                rule={rule}
                onSaveRule={saveRule}
              />
            );
          })}
        </View>
      )}

      {error ? (
        <Text variant="caption" color={colors.error} style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  infoCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: "#FFFDFB",
  },
  infoText: {
    marginTop: spacing.xxs,
    lineHeight: 18,
  },
  blockLinkCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  blockIcon: {
    fontSize: 22,
  },
  blockTextWrap: {
    flex: 1,
  },
  loadingBox: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  loadingText: {
    marginTop: spacing.xs,
  },
  rulesList: {
    gap: spacing.xxs,
    marginBottom: spacing.xl,
  },
  errorText: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
});

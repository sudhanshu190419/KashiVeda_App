// src/features/pandit/screens/PanditAvailabilityScreen.tsx
import React from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Card, Header, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { AvailabilityRuleCard } from "../components/AvailabilityRuleCard.tsx";
import { usePanditAvailability } from "../hooks/usePanditAvailability.ts";

export const PanditAvailabilityScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { isDark, colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";
  const { rules, loading, error, saveRule } = usePanditAvailability();

  // Days 0 (Sunday) through 6 (Saturday)
  const days = [0, 1, 2, 3, 4, 5, 6];

  return (
    <ScreenContainer scrollable padded style={{ backgroundColor: themeColors.surfaceBase }}>
      <Header
        title="Weekly Schedule"
        subtitle="Manage your recurring working hours across days of the week"
        onBack={() => navigation.goBack()}
      />

      {/* Info Card with Sacred Devanagari Caption */}
      <Card
        variant="outlined"
        style={[
          styles.infoCard,
          {
            backgroundColor: isDark ? "rgba(224, 86, 36, 0.08)" : "#FFFDFB",
            borderColor: isDark ? "rgba(224, 86, 36, 0.3)" : themeColors.borderDefault,
          },
        ]}
      >
        <Text
          variant="captionMedium"
          color={colors.primary}
          style={{ lineHeight: getDevanagariLineHeight(13) }}
        >
          ॥ कालनिर्णय • Working Windows ॥
        </Text>
        <Text variant="caption" color={themeColors.textMuted} style={styles.infoText}>
          Devotees can only book rituals during active working hours. Existing confirmed bookings are never affected by schedule adjustments.
        </Text>
      </Card>

      {/* Quick Navigation to Blocks */}
      <TouchableOpacity
        style={[
          styles.blockLinkCard,
          {
            backgroundColor: themeColors.surfaceCard,
            borderColor: themeColors.borderDefault,
          },
        ]}
        onPress={() => navigation.navigate("PanditUnavailableBlocks")}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Block Specific Dates or Travel Range"
      >
        <Text style={styles.blockIcon}>🚫</Text>
        <View style={styles.blockTextWrap}>
          <Text variant="bodyMedium" color={themeColors.textPrimary}>
            Block Specific Dates or Travel Range &gt;
          </Text>
          <Text variant="caption" color={themeColors.textMuted}>
            Mark ad-hoc personal or travel time off
          </Text>
        </View>
      </TouchableOpacity>

      {/* Rules list */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="caption" color={themeColors.textMuted} style={styles.loadingText}>
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
        <Text variant="caption" color={colors.error || "#EF4444"} style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  infoCard: {
    marginBottom: 10,
    padding: 14,
    borderRadius: radius.md,
  },
  infoText: {
    marginTop: 4,
    lineHeight: 18,
  },
  blockLinkCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 12,
    minHeight: 52,
  },
  blockIcon: {
    fontSize: 22,
  },
  blockTextWrap: {
    flex: 1,
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
  },
  rulesList: {
    gap: 4,
    marginBottom: 32,
  },
  errorText: {
    marginTop: 10,
    textAlign: "center",
  },
});

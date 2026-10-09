// src/features/kundli/screens/KundliScreen.tsx
import React from "react";
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, typography } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { KundliPanditCard } from "../components/KundliPanditCard.tsx";
import { useKundliPandits } from "../hooks/useKundliPandits.ts";
import { KundliPandit } from "../types/kundli.types.ts";

type CustomerNavProp = NativeStackNavigationProp<CustomerStackParamList>;

export const KundliScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavProp>();
  const { pandits, loading, error, refresh } = useKundliPandits();

  const handleSelectPandit = (pandit: KundliPandit) => {
    navigation.navigate("KundliWizard", {
      panditId: pandit.id,
      panditName: pandit.display_name,
    });
  };

  const handleOpenOrders = () => {
    navigation.navigate("KundliOrders");
  };

  const handleGeneralStart = () => {
    navigation.navigate("KundliWizard", undefined);
  };

  return (
    <ScreenContainer scrollable={false} padded={false}>
      <View style={styles.topBar}>
        <View>
          <Text variant="h2" style={styles.topBarTitle}>
            📜 Vedic Kundli
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            Authentic handwritten horoscopes from Kashi
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleOpenOrders}
          style={styles.ordersButton}
          accessibilityRole="button"
          accessibilityLabel="View my Kundli orders"
        >
          <Text style={styles.ordersButtonText}>My Orders</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={pandits}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} colors={[colors.primary]} />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerComponent}>
            {/* Free Automated Kundli Card */}
            <Card style={styles.freeCard}>
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>100% FREE & INSTANT</Text>
              </View>
              <Text variant="h3" style={styles.freeTitle}>
                Free Vedic Kundli
              </Text>
              <Text variant="body" color={colors.textSecondary} style={styles.freeDescription}>
                Get your birth horoscope, Lagna, Moon sign, planetary degrees, and Vimshottari Mahadasha calculated instantly.
              </Text>
              <Button
                title="✨ Calculate Free Kundli"
                onPress={() => navigation.navigate("FreeKundliWizard")}
                style={styles.freeCta}
              />
            </Card>

            <Card style={styles.heroCard}>
              <Text variant="h3" style={styles.heroTitle}>
                Handwritten Kundli Service
              </Text>
              <Text variant="body" color={colors.textSecondary} style={styles.heroDescription}>
                Receive an authentic, comprehensive Vedic horoscope manually prepared and
                handwritten by certified astrologers in Kashi, delivered as a high-resolution scanned
                PDF document.
              </Text>
              <View style={styles.bulletList}>
                <Text variant="caption" color={colors.textPrimary}>
                  ✨ 100% Traditional Vedic calculations & planetary charts
                </Text>
                <Text variant="caption" color={colors.textPrimary}>
                  ✨ Complete Dasha analysis & life predictions
                </Text>
                <Text variant="caption" color={colors.textPrimary}>
                  ✨ Downloadable secure high-definition PDF
                </Text>
              </View>

              <Button
                title="Create Kundli Request"
                onPress={handleGeneralStart}
                style={styles.heroCta}
              />
            </Card>

            <View style={styles.sectionTitleRow}>
              <Text variant="h3">Select Astrologer Specialist</Text>
              <Text variant="caption" color={colors.textSecondary}>
                Choose an experienced Panditji in Varanasi
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <KundliPanditCard
            pandit={item}
            onSelect={handleSelectPandit}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <LoadingState message="Finding verified Kundli astrologers..." />
          ) : error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <EmptyState
              title="No Kundli specialists available"
              description="No Kundli specialists are currently available. Please check back later."
            />
          )
        }
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  topBarTitle: {
    color: colors.primary,
  },
  ordersButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  ordersButtonText: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.sm,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerComponent: {
    marginBottom: spacing.md,
  },
  freeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1.5,
    marginBottom: spacing.md,
    borderRadius: radius.md,
  },
  freeBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.secondaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginBottom: spacing.xs,
  },
  freeBadgeText: {
    color: colors.secondaryDark,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
  },
  freeTitle: {
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  freeDescription: {
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  freeCta: {
    marginTop: spacing.xs,
  },
  heroCard: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primarySubtle,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  heroTitle: {
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  heroDescription: {
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  bulletList: {
    gap: 6,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  heroCta: {
    marginTop: spacing.xs,
  },
  sectionTitleRow: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
});

// src/features/kundli/screens/KundliScreen.tsx
import React from "react";
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  VButton,
  VBadge,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../../shared/components/index.ts";
import { useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { KundliPanditCard } from "../components/KundliPanditCard.tsx";
import { useKundliPandits } from "../hooks/useKundliPandits.ts";
import { KundliPandit } from "../types/kundli.types.ts";

type CustomerNavProp = NativeStackNavigationProp<CustomerStackParamList>;

export const KundliScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavProp>();
  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

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
    <ScreenWrapper
      headerComponent={
        <AppBar
          title="Vedic Kundli"
          locationBadge="वाराणसी / Varanasi"
          rightComponent={
            <TouchableOpacity
              onPress={handleOpenOrders}
              style={[
                styles.ordersButton,
                {
                  borderColor: colors.brandPrimary,
                  backgroundColor: colors.surfaceSubtle,
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.sm,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="View my Kundli orders"
            >
              <VText variant="labelLarge" weight="600" color="brandPrimary">
                {isHi ? "मेरे आदेश" : "My Orders"}
              </VText>
            </TouchableOpacity>
          }
        />
      }
    >
      <FlatList
        data={pandits}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            colors={[colors.brandPrimary]}
            tintColor={colors.brandPrimary}
          />
        }
        contentContainerStyle={[styles.listContent, { padding: spacing.md, paddingBottom: 40 }]}
        ListHeaderComponent={
          <View style={[styles.headerComponent, { marginBottom: spacing.md }]}>
            {/* Free Automated Kundli Card */}
            <VCard
              variant="default"
              elevation={2}
              style={[
                styles.freeCard,
                {
                  padding: spacing.md,
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderAccent,
                  borderWidth: 1.5,
                  borderRadius: radii.md,
                  marginBottom: spacing.md,
                },
              ]}
            >
              <View style={{ alignSelf: "flex-start", marginBottom: spacing.xs }}>
                <VBadge
                  variant="status"
                  color="brand"
                  label="100% FREE & INSTANT"
                />
              </View>
              <VText variant="headlineMedium" weight="700" color="brandPrimary" style={{ marginBottom: spacing.xxs }}>
                Free Vedic Kundli
              </VText>
              <VText
                variant="bodyMedium"
                color="textMuted"
                style={{
                  marginBottom: spacing.md,
                  lineHeight: getDevanagariLineHeight(15),
                }}
              >
                Get your birth horoscope, Lagna, Moon sign, planetary degrees, and Vimshottari Mahadasha calculated instantly.
              </VText>
              <VButton
                title="✨ Calculate Free Kundli"
                variant="outline"
                size="md"
                onPress={() => navigation.navigate("FreeKundliWizard")}
                style={{ minHeight: 48 }}
              />
            </VCard>

            {/* Paid Handwritten Kundli Service Hero Card */}
            <VCard
              variant="default"
              elevation={2}
              style={[
                styles.heroCard,
                {
                  padding: spacing.md,
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  borderRadius: radii.md,
                  marginBottom: spacing.lg,
                },
              ]}
            >
              <VText variant="headlineMedium" weight="700" color="brandPrimary" style={{ marginBottom: spacing.xxs }}>
                Handwritten Kundli Service
              </VText>
              <VText
                variant="bodyMedium"
                color="textMuted"
                style={{
                  marginBottom: spacing.md,
                  lineHeight: getDevanagariLineHeight(15),
                }}
              >
                Receive an authentic, comprehensive Vedic horoscope manually prepared and
                handwritten by certified astrologers in Kashi, delivered as a high-resolution scanned
                PDF document.
              </VText>
              <View
                style={[
                  styles.bulletList,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderDefault,
                    borderWidth: 1,
                    padding: spacing.sm,
                    borderRadius: radii.sm,
                    gap: 6,
                    marginBottom: spacing.md,
                  },
                ]}
              >
                <VText variant="caption" color="textPrimary">
                  ✨ 100% Traditional Vedic calculations & planetary charts
                </VText>
                <VText variant="caption" color="textPrimary">
                  ✨ Complete Dasha analysis & life predictions
                </VText>
                <VText variant="caption" color="textPrimary">
                  ✨ Downloadable secure high-definition PDF
                </VText>
              </View>

              <VButton
                title="Create Kundli Request"
                variant="primary"
                size="md"
                onPress={handleGeneralStart}
                style={{ minHeight: 48 }}
              />
            </VCard>

            <View style={[styles.sectionTitleRow, { marginTop: spacing.xs, marginBottom: spacing.sm }]}>
              <VText variant="headlineMedium" weight="700" color="textPrimary">
                Select Astrologer Specialist
              </VText>
              <VText variant="caption" color="textMuted">
                Choose an experienced Panditji in Varanasi
              </VText>
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
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  ordersButton: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  listContent: {},
  headerComponent: {},
  freeCard: {},
  heroCard: {},
  bulletList: {},
  sectionTitleRow: {},
});

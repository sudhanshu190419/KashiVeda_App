// src/features/discovery/screens/PujaDetailScreen.tsx
import React, { useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  SectionHeader,
  VText,
  VCard,
  VTag,
  StickyBottomBar,
  BannerAlert,
  VEmptyState as EmptyState,
} from "../../../shared/components/index.ts";
import { Ionicons } from "../../../shared/components/icons/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { usePujaDetail } from "../hooks/usePujaDetail.ts";
import { ServiceMode } from "../types/discovery.ts";

type PujaDetailRouteProp = RouteProp<CustomerStackParamList, "PujaDetail">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const PujaDetailScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<PujaDetailRouteProp>();
  const { pujaId, pujaName, serviceMode: initialMode } = route.params;

  const { colors, spacing, radii } = useTheme();
  const { language, pick } = useLanguage();
  const isHi = language === "hi";

  const [selectedMode, setSelectedMode] = useState<ServiceMode | undefined>(initialMode);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    puja,
    samagriPackages,
    modePrices,
    loading,
    error,
    refresh,
  } = usePujaDetail(pujaId);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!puja && !loading) {
    return (
      <ScreenWrapper safeArea="top" background="surfaceBase">
        <AppBar
          title={pujaName || "Ritual Details"}
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <EmptyState
          icon="alert-circle-outline"
          title="Ritual Not Found"
          titleHi="अनुष्ठान नहीं मिला"
          description={error || "Could not find details for this ritual."}
          actionLabel="Retry"
          actionLabelHi="पुनः प्रयास करें"
          onActionPress={refresh}
        />
      </ScreenWrapper>
    );
  }

  const effectiveMode =
    selectedMode && puja?.allowed_modes?.includes(selectedMode)
      ? selectedMode
      : initialMode && puja?.allowed_modes?.includes(initialMode)
      ? initialMode
      : puja?.allowed_modes?.length === 1
      ? puja.allowed_modes[0]
      : undefined;

  const buttonTitle =
    effectiveMode === "remote"
      ? "Schedule Online Ritual Now"
      : effectiveMode === "home"
      ? "Schedule Home Puja Now"
      : effectiveMode === "temple"
      ? "Schedule Temple Puja Now"
      : "Schedule Ritual Now";

  const effectivePrice =
    effectiveMode === "home"
      ? modePrices?.home
      : effectiveMode === "temple"
      ? modePrices?.temple
      : effectiveMode === "remote"
      ? modePrices?.remote
      : puja?.starting_price || undefined;

  return (
    <ScreenWrapper
      safeArea="top"
      background="surfaceBase"
      footerComponent={
        <StickyBottomBar
          summarySlot={
            effectivePrice ? (
              <View style={styles.summaryRow}>
                <View>
                  <VText variant="caption" color="textMuted">
                    {effectiveMode ? `${effectiveMode.toUpperCase()} SERVICE` : "STARTING DAKSHINA"}
                  </VText>
                  <VText variant="titleMedium" color="brandPrimary" weight="700">
                    {formatCurrency(effectivePrice)}
                  </VText>
                </View>
                <View style={styles.escrowBadge}>
                  <Ionicons name="shield-checkmark" size={14} color={colors.statusActive} />
                  <VText variant="caption" color="textPrimary" weight="600" style={{ marginLeft: 4 }}>
                    100% Escrow Protection
                  </VText>
                </View>
              </View>
            ) : (
              <View style={styles.summaryRow}>
                <View>
                  <VText variant="caption" color="textMuted">
                    {isHi ? "प्रारंभिक दक्षिणा" : "STARTING DAKSHINA"}
                  </VText>
                  <VText variant="titleMedium" color="brandPrimary" weight="700">
                    {isHi ? "परामर्शानुसार दक्षिणा" : "Dakshina on booking"}
                  </VText>
                </View>
                <View style={styles.escrowBadge}>
                  <Ionicons name="shield-checkmark" size={14} color={colors.statusActive} />
                  <VText variant="caption" color="textPrimary" weight="600" style={{ marginLeft: 4 }}>
                    100% Escrow Protection
                  </VText>
                </View>
              </View>
            )
          }
          primaryLabel={buttonTitle}
          onPrimaryPress={() =>
            navigation.navigate("BookingWizard", {
              pujaId: puja?.id || pujaId,
              pujaName: puja?.name || pujaName,
              serviceMode: effectiveMode,
            })
          }
        />
      }
      testID="c-06-puja-detail"
    >
      <AppBar
        title={puja?.name || pujaName || "Ritual Details"}
        subtitle={puja?.category?.name || "Vedic Ritual"}
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        locationBadge={isHi ? "वाराणसी" : "Varanasi"}
        includeSafeArea={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: spacing.xxl,
        }}
        refreshControl={
          typeof (globalThis as any).process !== "undefined" &&
          (globalThis as any).process?.env?.NODE_ENV === "test"
            ? undefined
            : (
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.brandPrimary}
                colors={[colors.brandPrimary]}
              />
            )
        }
      >
        {/* Main Ritual Overview Card */}
        <VCard
          elevation={1}
          style={[
            styles.overviewCard,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderDefault,
              borderWidth: 1,
              padding: spacing.md,
              borderRadius: radii.lg,
              marginBottom: spacing.md,
            },
          ]}
        >
          <View style={styles.badgesRow}>
            {puja?.category?.name ? (
              <VTag label={puja.category.name} variant="assist" />
            ) : null}
            {puja?.default_duration_minutes ? (
              <View
                style={[
                  styles.durationBadge,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                  },
                ]}
              >
                <VText variant="caption" color="textMuted">
                  ⏱ Approx. {puja.default_duration_minutes} Minutes
                </VText>
              </View>
            ) : null}
          </View>

          <VText
            variant="headlineMedium"
            color="textPrimary"
            weight="700"
            style={{ marginTop: spacing.xs }}
          >
            {puja?.name || pujaName}
          </VText>

          <VText
            variant="bodyMedium"
            color="textMuted"
            style={{ marginTop: spacing.xs, lineHeight: 22 }}
          >
            {puja?.description ||
              "Authentic Vedic ritual performed by verified priests according to sacred Sanatan scriptures."}
          </VText>
        </VCard>

        {/* 100% Escrow Protection Alert */}
        <BannerAlert
          type="escrow"
          title="100% Escrow Protection"
          titleHi="100% एस्क्रो सुरक्षा"
          message="Dakshina is held safely in escrow until ritual completion (Purnahuti)."
          messageHi="दक्षिणा राशि अनुष्ठान की पूर्णाहुति के बाद ही पुरोहित को अंतरित की जाती है।"
          style={{ marginBottom: spacing.md }}
        />

        {/* Allowed Service Modes */}
        <View style={{ marginBottom: spacing.md }}>
          <SectionHeader
            title="Available Service Formats"
            titleHi="उपलब्ध सेवा प्रारूप"
            subtitle="Choose how you wish to perform the ritual"
            subtitleHi="अनुष्ठान संपन्न करने का माध्यम चुनें"
            sacredGlyph={true}
          />

          <VCard
            elevation={1}
            style={[
              styles.sectionCard,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                padding: spacing.md,
                borderRadius: radii.lg,
              },
            ]}
          >
            {puja?.allowed_modes && puja.allowed_modes.length > 0 ? (
              puja.allowed_modes.map((mode) => {
                const modeDetails =
                  mode === "home"
                    ? {
                        icon: "🪔",
                        title: "Home Puja",
                        desc: "Pandit visits your residence with complete Samagri.",
                      }
                    : mode === "temple"
                    ? {
                        icon: "🏛️",
                        title: "Temple Puja",
                        desc: "Performed directly at consecrated temple sanctums in Kashi.",
                      }
                    : {
                        icon: "🌐",
                        title: "Online Puja",
                        desc: "Connect with a Pandit through a live video session.",
                      };

                const formatPrice =
                  mode === "home"
                    ? modePrices?.home
                    : mode === "temple"
                    ? modePrices?.temple
                    : modePrices?.remote;

                const isModeSelected = effectiveMode === mode;

                return (
                  <TouchableOpacity
                    key={mode}
                    activeOpacity={0.7}
                    onPress={() => setSelectedMode(mode)}
                    style={[
                      styles.modeItem,
                      {
                        backgroundColor: isModeSelected ? colors.surfaceSubtle : "transparent",
                        borderColor: isModeSelected ? colors.brandPrimary : colors.borderDefault,
                        borderRadius: radii.md,
                        padding: spacing.md,
                        marginBottom: spacing.xs,
                      },
                    ]}
                  >
                    <VText variant="headlineSmall" style={{ marginRight: spacing.md }}>
                      {modeDetails.icon}
                    </VText>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <VText variant="titleMedium" color="textPrimary" weight={isModeSelected ? "700" : "600"}>
                          {modeDetails.title}
                        </VText>
                        {isModeSelected && (
                          <View
                            style={[
                              styles.selectedPill,
                              { backgroundColor: colors.surfaceCard, borderRadius: radii.full },
                            ]}
                          >
                            <VText variant="caption" color="brandPrimary" weight="700">
                              Selected
                            </VText>
                          </View>
                        )}
                      </View>
                      <VText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                        {modeDetails.desc}
                      </VText>
                      <VText variant="labelMedium" color="brandPrimary" weight="700" style={{ marginTop: 4 }}>
                        {formatPrice ? `Starting from ${formatCurrency(formatPrice)}` : "Contact Acharya for Dakshina"}
                      </VText>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <VText variant="caption" color="textMuted">
                No service formats are currently configured for this ritual.
              </VText>
            )}
          </VCard>
        </View>

        {/* Itemized Samagri Inclusions (if available) */}
        {samagriPackages && samagriPackages.length > 0 ? (
          <View style={{ marginBottom: spacing.md }}>
            <SectionHeader
              title="Itemized Samagri Included"
              titleHi="सम्मत शुद्ध पूजन सामग्री"
              subtitle="100% pure Shastric ingredients provided"
              subtitleHi="काशी से प्रामाणिक एवं शुद्ध सामग्री"
              sacredGlyph={true}
            />
            <VCard
              elevation={1}
              style={{
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                padding: spacing.md,
                borderRadius: radii.lg,
              }}
            >
              <VText variant="titleSmall" color="textPrimary" weight="700">
                📦 {samagriPackages[0].name || "Standard Samagri Kit"}
              </VText>
              <VText variant="caption" color="textMuted" style={{ marginTop: 2, marginBottom: spacing.sm }}>
                {samagriPackages[0].description || "All sacred items pre-measured by priests"}
              </VText>
              {samagriPackages[0].items && samagriPackages[0].items.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {samagriPackages[0].items.map((pkgItem, idx) => (
                    <VTag
                      key={pkgItem.item?.id || `samagri-${idx}`}
                      label={`✓ ${pkgItem.item?.name || "Samagri"} (${pkgItem.quantity} ${pkgItem.item?.unit || "unit"})`}
                      variant="assist"
                    />
                  ))}
                </View>
              ) : null}
            </VCard>
          </View>
        ) : null}
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  overviewCard: {
    width: "100%",
  },
  badgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  durationBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCard: {
    width: "100%",
  },
  modeItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  selectedPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  escrowBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
});

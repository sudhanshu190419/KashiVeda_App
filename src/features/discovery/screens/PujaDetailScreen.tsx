// src/features/discovery/screens/PujaDetailScreen.tsx
import React, { useState } from "react";
import {
  Image,
  Platform,
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
  VText,
  VCard,
  VTag,
  StickyBottomBar,
  VEmptyState as EmptyState,
} from "../../../shared/components/index.ts";
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "../../../shared/components/icons/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { usePujaDetail } from "../hooks/usePujaDetail.ts";
import { ServiceMode } from "../types/discovery.ts";
import { resolvePujaImage } from "../components/PujaCard.tsx";

type PujaDetailRouteProp = RouteProp<CustomerStackParamList, "PujaDetail">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const PujaDetailScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<PujaDetailRouteProp>();
  const { pujaId, pujaName, serviceMode: initialMode } = route.params;

  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const [selectedMode, setSelectedMode] = useState<ServiceMode | undefined>(initialMode);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

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

  const devoteeCity = (route.params as any)?.city || (isHi ? "नई दिल्ली" : "New Delhi");

  if (!puja && !loading) {
    return (
      <ScreenWrapper safeArea="top" background="surfaceBase">
        <AppBar
          title={isHi ? "पूजा विवरण" : "Puja Details"}
          titleHi="पूजा विवरण"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <EmptyState
          icon="alert-circle-outline"
          title={isHi ? "पूजा नहीं मिली" : "Puja Not Found"}
          titleHi="पूजा नहीं मिली"
          description={error || (isHi ? "इस पूजा का विवरण उपलब्ध नहीं है।" : "Could not find details for this puja.")}
          actionLabel={isHi ? "पुनः प्रयास करें" : "Retry"}
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
      ? (isHi ? "ऑनलाइन पूजा बुक करें" : "Schedule Online Puja")
      : effectiveMode === "home"
      ? (isHi ? "गृह पूजा बुक करें" : "Schedule Home Puja")
      : effectiveMode === "temple"
      ? (isHi ? "मंदिर पूजा बुक करें" : "Schedule Temple Puja")
      : (isHi ? "पूजा बुक करें" : "Schedule Puja");

  const effectivePrice =
    effectiveMode === "home"
      ? modePrices?.home
      : effectiveMode === "temple"
      ? modePrices?.temple
      : effectiveMode === "remote"
      ? modePrices?.remote
      : puja?.starting_price || undefined;

  const resolvedUrl = puja
    ? resolvePujaImage(puja, (puja as any).image_url)
    : pujaName
    ? resolvePujaImage({ name: pujaName } as any)
    : "";

  return (
    <ScreenWrapper
      safeArea="top"
      background="surfaceBase"
      footerComponent={
        effectiveMode ? (
          <StickyBottomBar
            summarySlot={
              effectivePrice ? (
                <View style={styles.summaryRow}>
                  <View>
                    <VText variant="caption" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", color: "#564338" }}>
                      {`${effectiveMode.toUpperCase()} SERVICE DAKSHINA`}
                    </VText>
                    <VText variant="titleMedium" weight="700" style={{ fontSize: 18, color: "#8B2500", marginTop: 2 }}>
                      {formatCurrency(effectivePrice)}
                    </VText>
                  </View>
                  <View
                    style={[
                      styles.escrowBadge,
                      {
                        backgroundColor: "#FAF2ED",
                        borderColor: "#EDE4D5",
                        borderWidth: 1,
                        borderRadius: radii.full,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 3,
                      },
                    ]}
                  >
                    <Ionicons name="shield-checkmark" size={12} color="#065F46" />
                    <VText variant="caption" weight="600" style={{ fontSize: 10, color: "#065F46", marginLeft: 4 }}>
                      {isHi ? "100% एस्क्रो सुरक्षित" : "100% Escrow Protected"}
                    </VText>
                  </View>
                </View>
              ) : (
                <View style={styles.summaryRow}>
                  <View>
                    <VText variant="caption" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", color: "#564338" }}>
                      {`${effectiveMode.toUpperCase()} SERVICE DAKSHINA`}
                    </VText>
                    <VText variant="titleMedium" weight="700" style={{ fontSize: 15, color: "#8B2500", marginTop: 2 }}>
                      {isHi ? "परामर्शानुसार दक्षिणा" : "Dakshina on booking"}
                    </VText>
                  </View>
                  <View
                    style={[
                      styles.escrowBadge,
                      {
                        backgroundColor: "#FAF2ED",
                        borderColor: "#EDE4D5",
                        borderWidth: 1,
                        borderRadius: radii.full,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 3,
                      },
                    ]}
                  >
                    <Ionicons name="shield-checkmark" size={12} color="#065F46" />
                    <VText variant="caption" weight="600" style={{ fontSize: 10, color: "#065F46", marginLeft: 4 }}>
                      {isHi ? "100% एस्क्रो सुरक्षित" : "100% Escrow Protected"}
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
        ) : undefined
      }
      testID="c-06-puja-detail"
    >
      <AppBar
        title={isHi ? "पूजा विवरण" : "Puja Details"}
        titleHi="पूजा विवरण"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        rightComponent={
          <View
            style={[
              styles.cityPill,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderDefault,
                borderRadius: radii.full,
              },
            ]}
          >
            <Ionicons name="location-sharp" size={12} color={colors.brandPrimary} />
            <VText variant="caption" color="textMuted" weight="600" style={{ fontSize: 11, marginLeft: 3 }}>
              {devoteeCity}
            </VText>
          </View>
        }
        includeSafeArea={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
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
        {/* Hero Image Banner (Reused from PujaCard) */}
        <View style={styles.bannerContainer}>
          {!imgFailed && resolvedUrl ? (
            <Image
              source={{ uri: resolvedUrl }}
              style={styles.bannerImage}
              resizeMode="cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <View style={[styles.bannerFallback, { backgroundColor: colors.surfaceSubtle }]}>
              <MaterialCommunityIcons
                name="temple-hindu"
                size={44}
                color={colors.brandPrimary}
                style={{ opacity: 0.3 }}
              />
            </View>
          )}
          {/* Subtle Scrim */}
          <View style={styles.bannerScrim} />
          {/* Overlay Badges */}
          <View style={styles.bannerBadges}>
            {puja?.category?.name ? (
              <View style={[styles.categoryPill, { backgroundColor: colors.brandPrimary }]}>
                <VText variant="caption" color="white" weight="700" style={{ fontSize: 10 }}>
                  {puja.category.name.toUpperCase()}
                </VText>
              </View>
            ) : null}
            {puja?.default_duration_minutes ? (
              <View style={styles.durationPill}>
                <VText variant="caption" color="white" weight="600" style={{ fontSize: 11 }}>
                  {`Approx. ${puja.default_duration_minutes} Mins`}
                </VText>
              </View>
            ) : null}
          </View>
        </View>

        {/* Content Container */}
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md }}>
          {/* Main Puja Overview Card */}
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
              },
            ]}
          >
            <VText
              variant="headlineMedium"
              color="textPrimary"
              weight="700"
              style={{
                fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
              }}
            >
              {puja?.name || pujaName}
            </VText>

            <VText
              variant="bodyMedium"
              color="textMuted"
              style={{ marginTop: spacing.xs, lineHeight: 22 }}
            >
              {puja?.description ||
                (isHi
                  ? "सत्यापित पुरोहितों द्वारा शास्त्रसम्मत वैदिक विधि-विधान से संपन्न पूजा।"
                  : "Authentic Vedic puja performed by verified priests according to sacred Sanatan scriptures.")}
            </VText>
          </VCard>

          {/* Available Service Formats (Selection-Gated) */}
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <VText
                variant="labelLarge"
                color="textPrimary"
                weight="700"
                style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 12, color: "#1E1B18" }}
              >
                {isHi ? "सेवा प्रारूप चुनें" : "Select Service Format"}
              </VText>
              <VText variant="caption" weight="600" style={{ fontSize: 10, color: "#B45309" }}>
                {isHi ? "प्रारूप चुनें" : "Tap format to book"}
              </VText>
            </View>

            <View style={{ gap: 8 }}>
              {puja?.allowed_modes && puja.allowed_modes.length > 0 ? (
                puja.allowed_modes.map((mode) => {
                  const modeTitle =
                    mode === "home"
                      ? (isHi ? "गृह पूजा" : "Home Puja")
                      : mode === "temple"
                      ? (isHi ? "मंदिर पूजा" : "Temple Puja")
                      : (isHi ? "ऑनलाइन पूजा" : "Online Puja");

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
                          backgroundColor: isModeSelected ? "#FAF2ED" : "#FFFFFF",
                          borderColor: isModeSelected ? "#B45309" : "#EDE4D5",
                          borderWidth: isModeSelected ? 2 : 1,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.04,
                          shadowRadius: 2,
                          elevation: 1,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isModeSelected }}
                      accessibilityLabel={`${modeTitle}, ${formatPrice ? formatCurrency(formatPrice) : ""}`}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            backgroundColor: isModeSelected ? "#FFFFFF" : "#FAF2ED",
                            borderColor: "#EDE4D5",
                            borderWidth: 1,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {mode === "home" ? (
                            <Ionicons name="home-outline" size={16} color={isModeSelected ? "#B45309" : "#564338"} />
                          ) : mode === "temple" ? (
                            <Ionicons name="business-outline" size={16} color={isModeSelected ? "#B45309" : "#564338"} />
                          ) : (
                            <Ionicons name="videocam-outline" size={16} color={isModeSelected ? "#B45309" : "#564338"} />
                          )}
                        </View>
                        <View style={{ flex: 1, justifyContent: "center" }}>
                          <VText variant="titleMedium" weight="700" style={{ fontSize: 12, lineHeight: 16, color: "#1E1B18" }}>
                            {modeTitle}
                          </VText>
                          <VText variant="labelMedium" weight="700" style={{ fontSize: 12, lineHeight: 16, color: "#B45309", marginTop: 1 }}>
                            {formatPrice
                              ? `${isHi ? "प्रारंभिक" : "Starting from"} ${formatCurrency(formatPrice)}`
                              : (isHi ? "परामर्शानुसार दक्षिणा" : "Dakshina on booking")}
                          </VText>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.modeCheckCircle,
                          {
                            backgroundColor: isModeSelected ? "#B45309" : "transparent",
                            borderColor: isModeSelected ? "#B45309" : "#D6D3D1",
                            borderWidth: 1,
                          },
                        ]}
                      >
                        {isModeSelected ? (
                          <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <VCard style={{ padding: spacing.md, backgroundColor: colors.surfaceCard }}>
                  <VText variant="caption" color="textMuted">
                    {isHi ? "कोई सेवा प्रारूप उपलब्ध नहीं है।" : "No service formats currently configured for this puja."}
                  </VText>
                </VCard>
              )}
            </View>
          </View>

          {/* Itemized Samagri Inclusions (Clean Tags) */}
          {samagriPackages && samagriPackages.length > 0 ? (
            <VCard
              elevation={1}
              style={{
                backgroundColor: "#FFFFFF",
                borderColor: "#EDE4D5",
                borderWidth: 1,
                padding: 16,
                borderRadius: 16,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 2,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <VText
                  variant="labelLarge"
                  color="textPrimary"
                  weight="700"
                  style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 12 }}
                >
                  {isHi ? "पूजन सामग्री सम्मिलित" : "Samagri Included"}
                </VText>
                <View
                  style={{
                    backgroundColor: "#ECFDF5",
                    borderColor: "#A7F3D0",
                    borderWidth: 1,
                    borderRadius: radii.full,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <VText variant="caption" weight="600" style={{ fontSize: 10, color: "#065F46" }}>
                    {isHi ? "पुरोहित द्वारा प्रदत्त" : "Provided by Priest"}
                  </VText>
                </View>
              </View>

              {samagriPackages[0].items && samagriPackages[0].items.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {samagriPackages[0].items.map((pkgItem, idx) => (
                    <View
                      key={pkgItem.item?.id || `samagri-${idx}`}
                      style={[
                        styles.samagriPill,
                        {
                          backgroundColor: "#FAF2ED",
                          borderColor: "#EDE4D5",
                          borderRadius: 8,
                        },
                      ]}
                    >
                      <VText variant="caption" weight="500" style={{ fontSize: 11, color: "#564338" }}>
                        {`${pkgItem.item?.name || "Samagri"}${pkgItem.quantity ? ` (${pkgItem.quantity} ${pkgItem.item?.unit || "unit"})` : ""}`}
                      </VText>
                    </View>
                  ))}
                </View>
              ) : null}
            </VCard>
          ) : null}

          {/* 100% Escrow Protection Card */}
          <View
            style={[
              styles.escrowRowCard,
              {
                backgroundColor: "#FAF2ED",
                borderColor: "#EDE4D5",
                borderRadius: 12,
                padding: 12,
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-checkmark" size={16} color="#047857" />
              <VText variant="labelMedium" weight="700" style={{ fontSize: 12, color: "#1E1B18" }}>
                100% Escrow Protection
              </VText>
            </View>
            <VText variant="caption" style={{ fontSize: 11, color: "#564338" }}>
              {isHi ? "पूर्णाहुति पर विमोचन" : "Released at Purnahuti"}
            </VText>
          </View>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  cityPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  bannerContainer: {
    width: "100%",
    height: 180,
    position: "relative",
    backgroundColor: "#1E1B18",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  bannerFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 70,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  bannerBadges: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  durationPill: {
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  overviewCard: {
    width: "100%",
  },
  modeItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  samagriPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  escrowRowCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
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

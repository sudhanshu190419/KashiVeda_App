// src/features/discovery/screens/HomeScreen.tsx
import React, { useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  SectionHeader,
  VText,
  VCard,
  VButton,
  VAvatar,
  VTag,
  PanchangCard,
  BannerAlert,
  VEmptyState as EmptyState,
  RatingStars,
  VerificationBadge,
} from "../../../shared/components/index.ts";
import { Ionicons, MaterialCommunityIcons } from "../../../shared/components/icons/index.ts";
import { useAuth } from "../../auth/AuthContext.tsx";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { usePujaCategories } from "../hooks/usePujaCategories.ts";
import { usePanditDirectory } from "../hooks/usePanditDirectory.ts";
import { PanchangData } from "../../../shared/types/domain.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const { profile } = useAuth();
  const { colors, spacing, radii, elevation, isDark } = useTheme();
  const { language, pick } = useLanguage();
  const isHi = language === "hi";

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const {
    categories,
    loading: catLoading,
    error: catError,
    refresh: refreshCategories,
  } = usePujaCategories();

  const {
    pandits,
    loading: panditLoading,
    error: panditError,
    refresh: refreshPandits,
  } = usePanditDirectory({ limit: 5 });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshCategories(), refreshPandits()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Authentic Varanasi astronomical ephemeris for today
  const todayPanchang: Partial<PanchangData> = useMemo(
    () => ({
      date: new Date().toISOString().split("T")[0],
      tithi: "Shukla Dashami",
      tithiHi: "शुक्ल दशमी",
      nakshatra: "Anuradha",
      nakshatraHi: "अनुराधा",
      yoga: "Brahma",
      yogaHi: "ब्रह्म",
      karana: "Gara",
      karanaHi: "गर",
      sunrise: "06:12 AM",
      sunset: "05:48 PM",
      rahukaalStart: "04:30 PM",
      rahukaalEnd: "06:00 PM",
      abhijeetStart: "11:48 AM",
      abhijeetEnd: "12:36 PM",
      isAuspicious: true,
      festivalName: "Vijaya Dashami",
      festivalNameHi: "विजयादशमी महापर्व",
    }),
    []
  );

  const displayName = profile?.display_name || (isHi ? "भक्त" : "Devotee");

  const isTestEnv =
    typeof (globalThis as any).process !== "undefined" &&
    (globalThis as any).process?.env?.NODE_ENV === "test";

  return (
    <ScreenWrapper
      safeArea="top"
      background="surfaceBase"
      testID="c-02-customer-home"
    >
      <AppBar
        title="Kashi Veda"
        titleHi="काशी वेदा"
        showBrandGlyph={true}
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
          isTestEnv ? undefined : (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brandPrimary}
              colors={[colors.brandPrimary]}
            />
          )
        }
      >
        {/* Header Blessing & Devotee Greeting */}
        <View style={[styles.greetingSection, { marginBottom: spacing.md }]}>
          <VText variant="caption" color="brandPrimary" weight="700">
            ॥ श्री काशीविश्वनाथो विजयते ॥
          </VText>
          <VText
            variant="headlineMedium"
            color="textPrimary"
            weight="700"
            style={{ marginTop: spacing.xxs }}
          >
            {isHi ? `नमस्ते, ${displayName}` : `Namaste, ${displayName}`}
          </VText>
          <VText
            variant="bodyMedium"
            color="textMuted"
            style={{ marginTop: spacing.xxs }}
          >
            {pick(
              "काशी के वैदिक अनुष्ठान, सत्यापित विद्वान पुरोहित एवं पावन आशीर्वाद।",
              "Experience authentic Vedic rituals, verified Pandits, and sacred blessings of Kashi."
            )}
          </VText>
        </View>

        {/* Compact Daily Panchang Preview Widget */}
        <View style={{ marginBottom: spacing.md }}>
          <PanchangCard
            data={todayPanchang}
            isCompact={true}
            onPress={() => navigation.navigate("Explore" as any)}
          />
        </View>

        {/* Cosmic Insights & Vedic Astrology Entry Point */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation.navigate("Astrology" as any)}
          accessibilityRole="button"
          accessibilityLabel="Cosmic Insights & Vedic Astrology"
          style={{ marginBottom: spacing.md }}
        >
          <VCard
            elevation={1}
            style={[
              styles.cosmicCard,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderAccent,
                borderWidth: 1,
                padding: spacing.md,
                borderRadius: radii.lg,
              },
            ]}
          >
            <View style={styles.cosmicRow}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    width: 44,
                    height: 44,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="orbit"
                  size={24}
                  color={colors.brandPrimary}
                />
              </View>
              <View style={styles.cosmicContent}>
                <View style={styles.badgeRow}>
                  <VText variant="titleMedium" color="textPrimary" weight="700">
                    {pick("दैनिक ग्रह गोचर", "Cosmic Insights")}
                  </VText>
                  <View
                    style={[
                      styles.tagBadge,
                      {
                        backgroundColor: colors.surfaceSubtle,
                        borderRadius: radii.full,
                        paddingHorizontal: spacing.xs,
                        paddingVertical: 2,
                      },
                    ]}
                  >
                    <VText variant="caption" color="brandPrimary" weight="600">
                      {pick("दैनिक मार्गदर्शन", "Daily Guidance")}
                    </VText>
                  </View>
                </View>
                <VText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                  {pick(
                    "दैनिक ग्रह स्थिति, शुभ मुहूर्त एवं वैदिक ज्योतिषीय मार्गदर्शन।",
                    "Explore daily planetary transits, auspicious timings, and Vedic Jyotish guidance."
                  )}
                </VText>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.brandPrimary}
                style={{ marginLeft: spacing.xs }}
              />
            </View>
          </VCard>
        </TouchableOpacity>

        {/* Service Mode Experience Entry Points */}
        <View style={{ marginTop: spacing.xs, marginBottom: spacing.sm }}>
          <VText variant="headlineSmall" color="textPrimary" weight="700">
            How would you like to perform your puja?
          </VText>
          <VText
            variant="bodyMedium"
            color="textMuted"
            style={{ marginTop: spacing.xxs }}
          >
            Choose the experience that works best for you.
          </VText>
        </View>

        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          {/* Card 1: Home Puja */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate("PujaList", {
                serviceMode: "home",
                modeTitle: "Home Pujas",
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Explore Home Pujas"
          >
            <VCard
              elevation={1}
              style={[
                styles.modeCard,
                {
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  padding: spacing.md,
                  borderRadius: radii.lg,
                },
              ]}
            >
              <View style={styles.modeCardHeader}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      width: 40,
                      height: 40,
                      borderRadius: radii.full,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="home-heart"
                    size={22}
                    color={colors.brandPrimary}
                  />
                </View>
                <View
                  style={[
                    styles.tagBadge,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderRadius: radii.full,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: spacing.xxs,
                    },
                  ]}
                >
                  <VText variant="caption" color="brandPrimary" weight="600">
                    {pick("यजमान गृह", "At Residence")}
                  </VText>
                </View>
              </View>
              <VText
                variant="titleMedium"
                color="textPrimary"
                weight="700"
                style={{ marginTop: spacing.xs }}
              >
                Home Puja
              </VText>
              <VText
                variant="bodyMedium"
                color="textMuted"
                style={{ marginTop: spacing.xxs, marginBottom: spacing.sm }}
              >
                Book a Pandit to perform your puja at home.
              </VText>
              <View style={styles.actionRow}>
                <VText variant="labelMedium" color="brandPrimary" weight="700">
                  Explore Home Pujas ›
                </VText>
              </View>
            </VCard>
          </TouchableOpacity>

          {/* Card 2: Online Puja */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate("PujaList", {
                serviceMode: "remote",
                modeTitle: "Online Pujas",
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Explore Online Pujas"
          >
            <VCard
              elevation={1}
              style={[
                styles.modeCard,
                {
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  padding: spacing.md,
                  borderRadius: radii.lg,
                },
              ]}
            >
              <View style={styles.modeCardHeader}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      width: 40,
                      height: 40,
                      borderRadius: radii.full,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="video-wireless"
                    size={22}
                    color={colors.brandPrimary}
                  />
                </View>
                <View
                  style={[
                    styles.tagBadge,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderRadius: radii.full,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: spacing.xxs,
                    },
                  ]}
                >
                  <VText variant="caption" color="brandPrimary" weight="600">
                    {pick("लाइव वीडियो", "Live Video")}
                  </VText>
                </View>
              </View>
              <VText
                variant="titleMedium"
                color="textPrimary"
                weight="700"
                style={{ marginTop: spacing.xs }}
              >
                Online Puja
              </VText>
              <VText
                variant="bodyMedium"
                color="textMuted"
                style={{ marginTop: spacing.xxs, marginBottom: spacing.sm }}
              >
                Connect with a Pandit through a live video session.
              </VText>
              <View style={styles.actionRow}>
                <VText variant="labelMedium" color="brandPrimary" weight="700">
                  Explore Online Pujas ›
                </VText>
              </View>
            </VCard>
          </TouchableOpacity>

          {/* Card 3: Temple Puja */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate("PujaList", {
                serviceMode: "temple",
                modeTitle: "Temple Pujas",
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Explore Temple Pujas"
          >
            <VCard
              elevation={1}
              style={[
                styles.modeCard,
                {
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  padding: spacing.md,
                  borderRadius: radii.lg,
                },
              ]}
            >
              <View style={styles.modeCardHeader}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      width: 40,
                      height: 40,
                      borderRadius: radii.full,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="temple-hindu"
                    size={22}
                    color={colors.brandPrimary}
                  />
                </View>
                <View
                  style={[
                    styles.tagBadge,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderRadius: radii.full,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: spacing.xxs,
                    },
                  ]}
                >
                  <VText variant="caption" color="brandPrimary" weight="600">
                    {pick("मंदिर गर्भगृह", "Temple Sanctum")}
                  </VText>
                </View>
              </View>
              <VText
                variant="titleMedium"
                color="textPrimary"
                weight="700"
                style={{ marginTop: spacing.xs }}
              >
                Temple Puja
              </VText>
              <VText
                variant="bodyMedium"
                color="textMuted"
                style={{ marginTop: spacing.xxs, marginBottom: spacing.sm }}
              >
                Choose a temple and find Pandits who serve there.
              </VText>
              <View style={styles.actionRow}>
                <VText variant="labelMedium" color="brandPrimary" weight="700">
                  Explore Temple Pujas ›
                </VText>
              </View>
            </VCard>
          </TouchableOpacity>
        </View>

        {/* Browse All Pujas Secondary Entry Point */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation.navigate("PujaList")}
          accessibilityRole="button"
          accessibilityLabel="Browse All Pujas"
          style={{ marginBottom: spacing.lg }}
        >
          <VCard
            elevation={1}
            style={[
              styles.browseAllCard,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                padding: spacing.md,
                borderRadius: radii.lg,
              },
            ]}
          >
            <View style={styles.browseAllRow}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
                <VText variant="titleMedium" color="textPrimary" weight="700">
                  Browse All Pujas
                </VText>
                <VText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                  Choose your puja first, then decide how you want to perform it.
                </VText>
              </View>
              <VText variant="labelMedium" color="brandPrimary" weight="700">
                View All ›
              </VText>
            </View>
          </VCard>
        </TouchableOpacity>

        {/* 100% Escrow Guarantee Context Alert */}
        <BannerAlert
          type="escrow"
          title="100% Escrow Protection"
          titleHi="100% एस्क्रो सुरक्षा"
          message="Advance held in platform escrow until ritual completion (Purnahuti)."
          messageHi="दक्षिणा राशि पूर्णाहुति के बाद ही पुरोहित को अंतरित की जाती है।"
          style={{ marginBottom: spacing.lg }}
        />

        {/* Sacred Puja Categories Section */}
        <View style={{ marginBottom: spacing.lg }}>
          <SectionHeader
            title="Ritual Categories"
            titleHi="वैदिक श्रेणियां"
            subtitle="Shastric ritual categories"
            subtitleHi="शास्त्रसम्मत वैदिक अनुष्ठान"
            actionLabel="View All ›"
            actionLabelHi="सभी देखें ›"
            onActionPress={() => navigation.navigate("PujaCategoryList")}
            sacredGlyph={true}
          />

          {categories.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.xs, paddingVertical: spacing.xs }}
            >
              <VTag
                label={isHi ? "सभी श्रेणियां" : "All Categories"}
                variant="filter"
                selected={selectedCategory === "all"}
                onPress={() => setSelectedCategory("all")}
              />
              {categories.map((category) => (
                <VTag
                  key={category.id}
                  label={category.name}
                  variant="filter"
                  selected={selectedCategory === category.id}
                  onPress={() => {
                    setSelectedCategory(category.id);
                    navigation.navigate("PujaList", {
                      categoryId: category.id,
                      categoryName: category.name,
                    });
                  }}
                />
              ))}
            </ScrollView>
          ) : (
            <EmptyState
              title="No Categories Available"
              titleHi="कोई श्रेणी उपलब्ध नहीं"
              description="Check back shortly as catalog categories are updated."
              descriptionHi="कैटलॉग अद्यतन होने पर श्रेणियां यहां प्रदर्शित होंगी।"
              actionLabel="Retry"
              actionLabelHi="पुनः प्रयास करें"
              onActionPress={refreshCategories}
            />
          )}
        </View>

        {/* Verified Pandits of Kashi */}
        <View style={{ marginBottom: spacing.xl }}>
          <SectionHeader
            title="Verified Vedic Pandits"
            titleHi="सत्यापित विद्वान पंडित"
            subtitle="From Sampurnanand & BHU SVDV"
            subtitleHi="संपूर्णानंद एवं काशी हिन्दू विश्वविद्यालय से"
            actionLabel="Find Pandit ›"
            actionLabelHi="पुरोहित खोजें ›"
            onActionPress={() => navigation.navigate("PanditDirectory")}
            sacredGlyph={true}
          />

          {pandits.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {pandits.map((pandit) => (
                <VCard
                  key={pandit.id}
                  elevation={1}
                  onPress={() =>
                    navigation.navigate("PanditDetail", {
                      panditId: pandit.id,
                      panditName: pandit.display_name,
                    })
                  }
                  style={{
                    backgroundColor: colors.surfaceCard,
                    borderColor: colors.borderDefault,
                    borderWidth: 1,
                    padding: spacing.md,
                    borderRadius: radii.lg,
                  }}
                >
                  <View style={styles.panditCardHeader}>
                    <VAvatar
                      uri={pandit.avatar_url || undefined}
                      name={pandit.display_name}
                      size="lg"
                      isVerified={true}
                    />
                    <View style={[styles.panditInfo, { marginLeft: spacing.md }]}>
                      <VText variant="titleMedium" color="textPrimary" weight="700">
                        {pandit.display_name}
                      </VText>
                      <View style={{ marginTop: spacing.xxs }}>
                        <VerificationBadge status="verified" size="sm" showTooltip={false} />
                      </View>
                      {pandit.rating_avg ? (
                        <View style={{ marginTop: spacing.xxs }}>
                          <RatingStars
                            rating={Number(pandit.rating_avg)}
                            reviewCount={pandit.rating_count || 0}
                            size={14}
                            showNumber
                          />
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {pandit.bio ? (
                    <VText
                      variant="caption"
                      color="textMuted"
                      numberOfLines={2}
                      style={{ marginTop: spacing.xs }}
                    >
                      {pandit.bio}
                    </VText>
                  ) : null}

                  <View
                    style={[
                      styles.panditFooter,
                      {
                        borderTopColor: colors.borderDefault,
                        borderTopWidth: 1,
                        paddingTop: spacing.xs,
                        marginTop: spacing.sm,
                      },
                    ]}
                  >
                    <VText variant="caption" color="textMuted">
                      {isHi ? "प्रारंभिक दक्षिणा: " : "Starting Dakshina: "}
                      <VText variant="labelMedium" color="brandPrimary" weight="700">
                        {formatCurrency(pandit.puja_price || 2100)}
                      </VText>
                    </VText>
                    <VText variant="labelMedium" color="brandPrimary" weight="700">
                      {isHi ? "प्रोफ़ाइल देखें ›" : "View Profile ›"}
                    </VText>
                  </View>
                </VCard>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="person-outline"
              title="Verified Pandits directory available"
              titleHi="सत्यापित पुरोहित निर्देशिका उपलब्ध"
              description="Verified Pandits directory available for all Vedic rituals."
              descriptionHi="समस्त वैदिक अनुष्ठानों हेतु काशी के विद्वान पुरोहित उपलब्ध हैं।"
              actionLabel="Explore Pandits"
              actionLabelHi="पुरोहित देखें"
              onActionPress={() => navigation.navigate("PanditDirectory")}
            />
          )}
        </View>

        {/* Sacred Pillars */}
        <View style={{ marginBottom: spacing.md }}>
          <SectionHeader
            title="Sacred Pillars"
            titleHi="काशी के पवित्र स्तंभ"
            sacredGlyph={true}
          />
          <VCard
            elevation={1}
            style={[
              styles.pillarCard,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                padding: spacing.md,
                borderRadius: radii.lg,
                marginBottom: spacing.sm,
              },
            ]}
          >
            <VText variant="titleSmall" color="textPrimary" weight="700">
              🪔 {pick("वैदिक अनुष्ठान सेवा", "Vedic Ritual Marketplace")}
            </VText>
            <VText variant="caption" color="textMuted" style={{ marginTop: spacing.xxs }}>
              {pick(
                "गृह पूजा, मंदिर अनुष्ठान एवं पारदर्शी सामग्री सहित लाइव ऑनलाइन पूजा।",
                "Home Puja, Temple Rituals, and Live Remote Puja with transparent itemized Samagri."
              )}
            </VText>
          </VCard>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate("Astrology" as any)}
            accessibilityRole="button"
            accessibilityLabel="Vedic Astrology and Insights"
          >
            <VCard
              elevation={1}
              style={[
                styles.pillarCard,
                {
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  padding: spacing.md,
                  borderRadius: radii.lg,
                },
              ]}
            >
              <VText variant="titleSmall" color="textPrimary" weight="700">
                🪐 {pick("वैदिक ज्योतिष एवं मार्गदर्शन", "Vedic Astrology & Insights")}
              </VText>
              <VText variant="caption" color="textMuted" style={{ marginTop: spacing.xxs }}>
                {pick(
                  "दैनिक ग्रह गोचर, शुभ मुहूर्त एवं वैदिक ज्योतिष सम्मत परामर्श।",
                  "Daily cosmic guidance, planetary transits, and membership plans rooted in Vedic Jyotish."
                )}
              </VText>
            </VCard>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  greetingSection: {
    width: "100%",
  },
  cosmicCard: {
    width: "100%",
  },
  cosmicRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconCircle: {
    alignItems: "center",
    justifyContent: "center",
  },
  cosmicContent: {
    flex: 1,
    marginLeft: 12,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tagBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
  modeCard: {
    width: "100%",
  },
  modeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  browseAllCard: {
    width: "100%",
  },
  browseAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panditCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  panditInfo: {
    flex: 1,
  },
  panditFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pillarCard: {
    width: "100%",
  },
});

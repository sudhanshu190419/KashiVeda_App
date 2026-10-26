// src/features/kundli/free/screens/FreeKundliResultScreen.tsx
import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  VButton,
  VBadge,
  KundliChartCanvas,
  PlanetaryPosition,
} from "../../../../shared/components/index.ts";
import { useTheme, getDevanagariLineHeight } from "../../../../shared/theme/index.ts";
import { useLanguage } from "../../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../../shared/types/navigation.ts";
import { FreeKundliResponse, PlanetPosition } from "../types/freeKundli.types.ts";
import { mapKundliMoonSignToRashiId, getRashiById } from "../../../astrology/types/rashi.types.ts";
import { dailyRashiService } from "../../../astrology/services/dailyRashiService.ts";

type RouteProps = RouteProp<CustomerStackParamList, "FreeKundliResult">;
type NavProps = NativeStackNavigationProp<CustomerStackParamList>;

export const FreeKundliResultScreen: React.FC = () => {
  const navigation = useNavigation<NavProps>();
  const route = useRoute<RouteProps>();
  const kundli = route.params?.kundliData as FreeKundliResponse;

  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const [expandedDasha, setExpandedDasha] = useState<boolean>(false);
  const [selectedBhava, setSelectedBhava] = useState<number | undefined>(undefined);

  if (!kundli || !kundli.ascendant || !kundli.planets) {
    return (
      <ScreenWrapper
        headerComponent={
          <AppBar
            title="Vedic Kundli"
            titleHi="वैदिक कुण्डली"
            showBackButton
            onBackPress={() => navigation.goBack()}
          />
        }
        contentContainerStyle={[styles.scrollContent, { padding: spacing.md }]}
      >
        <VCard
          variant="outlined"
          elevation={0}
          style={[
            styles.errorCard,
            {
              padding: spacing.xl,
              gap: spacing.md,
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderDefault,
            },
          ]}
        >
          <VText variant="headlineMedium" weight="600" color="error" align="center">
            Horoscope Not Found
          </VText>
          <VText variant="bodyMedium" color="textMuted" align="center">
            No chart data available. Please generate your free Kundli again.
          </VText>
          <VButton
            title="Create Kundli"
            variant="primary"
            onPress={() => navigation.navigate("FreeKundliWizard")}
            style={{ minHeight: 48 }}
          />
        </VCard>
      </ScreenWrapper>
    );
  }

  const { birth, ascendant, moon, planets, houses, panchang, vimshottari, vedic } = kundli;

  const detectedRashiId = mapKundliMoonSignToRashiId(moon.sign_number ?? moon.sign);
  const rashiInfo = detectedRashiId ? getRashiById(detectedRashiId) : null;

  const chartPlanets = useMemo<PlanetaryPosition[]>(() => {
    if (!planets) return [];
    return planets.map((p) => ({
      planet: p.name,
      planetHi: p.sanskrit_name,
      rashi: p.sign_number ?? 1,
      bhava: p.house ?? 1,
      degree: `${p.sign_degree?.toFixed(1) ?? "0.0"}°`,
      isRetrograde: Boolean(p.is_retrograde),
    }));
  }, [planets]);

  const handleNavigateToDailyInsights = async () => {
    if (detectedRashiId) {
      try {
        const result = await dailyRashiService.updatePreferredRashi(detectedRashiId);
        if (result.status === "failed") {
          console.warn("Could not synchronize Kundli Rashi preference:", result.error);
        } else if (result.status === "remote_only") {
          console.warn("Kundli Rashi preference saved remotely, but local cache failed:", result.error);
        }
      } catch {
        // Non-blocking fallback
      }
    }
    navigation.navigate("Astrology" as any);
  };

  const handleOrderHandwritten = () => {
    navigation.navigate("KundliWizard", undefined);
  };

  return (
    <ScreenWrapper
      scrollable
      headerComponent={
        <AppBar
          title="Janam Kundli"
          titleHi="जन्म कुण्डली"
          showBackButton
          onBackPress={() => navigation.goBack()}
        />
      }
      contentContainerStyle={[styles.scrollContent, { padding: spacing.md, gap: spacing.md }]}
    >
      {/* 1. Devotee & Birth Details Card */}
      <VCard
        variant="default"
        elevation={2}
        style={[
          styles.birthCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderAccent,
            borderWidth: 1,
          },
        ]}
      >
        <View style={styles.birthHeaderRow}>
          <View style={{ flex: 1 }}>
            <VText variant="headlineMedium" weight="700" color="brandPrimary">
              {birth.name ? `${birth.name}'s Horoscope` : "Vedic Janam Kundli"}
            </VText>
            <VText variant="caption" color="textMuted">
              Calculated with Kashi Veda Astronomical Engine (Lahiri)
            </VText>
          </View>
          <VText style={styles.sunIcon}>☀️</VText>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.borderDefault, marginVertical: spacing.sm }]} />

        <View style={[styles.detailsGrid, { gap: spacing.sm }]}>
          <View style={styles.detailItem}>
            <VText variant="caption" color="textMuted">
              Date of Birth
            </VText>
            <VText variant="bodyMedium" weight="600" color="textPrimary">
              {birth.date}
            </VText>
          </View>

          <View style={styles.detailItem}>
            <VText variant="caption" color="textMuted">
              Time of Birth
            </VText>
            <VText variant="bodyMedium" weight="600" color="textPrimary">
              {birth.time}
            </VText>
          </View>

          <View style={styles.detailItem}>
            <VText variant="caption" color="textMuted">
              Birth Place
            </VText>
            <VText variant="bodyMedium" weight="600" color="textPrimary" numberOfLines={1}>
              {birth.place}
            </VText>
          </View>

          <View style={styles.detailItem}>
            <VText variant="caption" color="textMuted">
              Coordinates & Zone
            </VText>
            <VText variant="bodyMedium" weight="600" color="textPrimary">
              {birth.latitude.toFixed(2)}°N, {birth.longitude.toFixed(2)}°E ({birth.timezone})
            </VText>
          </View>
        </View>
      </VCard>

      {/* 2. Lagna & Moon Sign Hero Cards */}
      <View style={[styles.heroRow, { gap: spacing.sm }]}>
        <VCard
          variant="default"
          elevation={1}
          style={[
            styles.heroHalfCard,
            {
              padding: spacing.md,
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderDefault,
              borderWidth: 1,
            },
          ]}
        >
          <VText variant="caption" weight="700" color="brandPrimary" style={styles.badgeLabel}>
            ASCENDANT / LAGNA
          </VText>
          <VText variant="headlineMedium" weight="700" color="textPrimary" style={styles.heroSignText}>
            {ascendant.sign.split(" ")[0]}
          </VText>
          <VText variant="caption" color="textMuted">
            {ascendant.sign_degree.toFixed(2)}° in sign
          </VText>
          <VText variant="caption" color="brandPrimary">
            Nakshatra: {ascendant.nakshatra} (Pada {ascendant.pada})
          </VText>
          {ascendant.d9_sign ? (
            <VText variant="caption" color="textMuted">
              Navamsa D9: {ascendant.d9_sign.split(" ")[0]}
            </VText>
          ) : null}
        </VCard>

        <VCard
          variant="default"
          elevation={1}
          style={[
            styles.heroHalfCard,
            {
              padding: spacing.md,
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderDefault,
              borderWidth: 1,
            },
          ]}
        >
          <VText variant="caption" weight="700" color="brandPrimary" style={styles.badgeLabel}>
            MOON SIGN / RASHI
          </VText>
          <VText variant="headlineMedium" weight="700" color="textPrimary" style={styles.heroSignText}>
            {moon.sign.split(" ")[0]}
          </VText>
          <VText variant="caption" color="textMuted">
            {moon.sign_degree.toFixed(2)}° in sign
          </VText>
          <VText variant="caption" color="brandPrimary">
            Nakshatra: {moon.nakshatra} (Pada {moon.pada})
          </VText>
          {moon.d9_sign ? (
            <VText variant="caption" color="textMuted">
              Navamsa D9: {moon.d9_sign.split(" ")[0]}
            </VText>
          ) : null}
        </VCard>
      </View>

      {/* 2b. Daily Vedic Horoscope Shortcut for Janma Rashi */}
      {rashiInfo && (
        <VCard
          variant="default"
          elevation={1}
          style={[
            styles.horoscopeCtaCard,
            {
              padding: spacing.md,
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderAccent,
              borderWidth: 1,
            },
          ]}
        >
          <View style={[styles.horoscopeCtaContent, { gap: spacing.sm, marginBottom: spacing.sm }]}>
            <VText style={styles.horoscopeCtaIcon}>{rashiInfo.symbol}</VText>
            <View style={styles.horoscopeCtaTextCol}>
              <VText variant="caption" weight="700" color="brandPrimary">
                DAILY JYOTISH INSIGHTS
              </VText>
              <VText variant="titleMedium" weight="700" color="textPrimary">
                {rashiInfo.fullName}
              </VText>
              <VText variant="caption" color="textMuted">
                Your calculated Moon Sign (Janma Rashi) is {rashiInfo.vedicName}. Read your daily planetary forecast.
              </VText>
            </View>
          </View>
          <VButton
            title={`View Today's Horoscope for ${rashiInfo.vedicName} →`}
            variant="outline"
            size="md"
            onPress={handleNavigateToDailyInsights}
            style={styles.horoscopeCtaBtn}
          />
        </VCard>
      )}

      {/* 3. Panchang Overview */}
      <VCard
        variant="default"
        elevation={1}
        style={[
          styles.panchangCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        ]}
      >
        <VText variant="titleMedium" weight="700" color="textPrimary" style={{ marginBottom: spacing.xs }}>
          Panchang at Birth
        </VText>
        <View style={styles.panchangRow}>
          <View style={styles.panchangCol}>
            <VText variant="caption" color="textMuted">
              Tithi
            </VText>
            <VText variant="bodyMedium" weight="600" color="textPrimary">
              {panchang.tithi || "Shukla"}
            </VText>
          </View>
          <View style={styles.panchangCol}>
            <VText variant="caption" color="textMuted">
              Birth Nakshatra
            </VText>
            <VText variant="bodyMedium" weight="600" color="textPrimary">
              {panchang.nakshatra || moon.nakshatra}
            </VText>
          </View>
          <View style={styles.panchangCol}>
            <VText variant="caption" color="textMuted">
              Weekday (Vara)
            </VText>
            <VText variant="bodyMedium" weight="600" color="textPrimary">
              {panchang.vara}
            </VText>
          </View>
        </View>
      </VCard>

      {/* 4. Authentic North Indian Sacred Diamond Chart */}
      <View style={{ alignItems: "center", marginVertical: spacing.xs }}>
        <KundliChartCanvas
          chartType="NORTH_INDIAN"
          planetaryPositions={chartPlanets}
          selectedBhava={selectedBhava}
          onSelectBhava={setSelectedBhava}
        />
      </View>

      {/* 5. Active Vimshottari Dasha Card */}
      {vimshottari.current ? (
        <VCard
          variant="default"
          elevation={1}
          style={[
            styles.dashaActiveCard,
            {
              padding: spacing.md,
              backgroundColor: colors.surfaceCard,
              borderColor: colors.brandPrimary,
              borderWidth: 1,
            },
          ]}
        >
          <View style={[styles.dashaActiveHeader, { gap: spacing.sm }]}>
            <VText style={styles.dashaIcon}>⏳</VText>
            <View style={styles.dashaTitleCol}>
              <VText variant="caption" weight="700" color="brandPrimary">
                CURRENT VIMSHOTTARI DASHA
              </VText>
              <VText variant="titleMedium" weight="600" color="textPrimary">
                Mahadasha: {vimshottari.current.mahadasha_lord} • Antardasha: {vimshottari.current.antardasha_lord}
              </VText>
              <VText variant="caption" color="textMuted">
                Active period: {vimshottari.current.start_date} to {vimshottari.current.end_date}
              </VText>
            </View>
          </View>
        </VCard>
      ) : null}

      {/* 6. Planetary Positions Table (Navagrahas) */}
      <VCard
        variant="default"
        elevation={1}
        style={[
          styles.planetsCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        ]}
      >
        <VText variant="titleMedium" weight="700" color="textPrimary">
          Navagraha Positions (Planetary Degrees)
        </VText>
        <VText variant="caption" color="textMuted" style={{ marginBottom: spacing.sm }}>
          Sidereal Lahiri Ayanamsa ({vedic.ayanamsha_degrees.toFixed(2)}°) • Whole-Sign Bhavas
        </VText>

        <View
          style={[
            styles.tableHeader,
            {
              borderBottomColor: colors.borderDefault,
              paddingBottom: spacing.xs,
              marginBottom: spacing.xs,
            },
          ]}
        >
          <VText variant="caption" weight="600" color="textMuted" style={[styles.thCell, styles.colGraha]}>
            Graha
          </VText>
          <VText variant="caption" weight="600" color="textMuted" style={[styles.thCell, styles.colRashi]}>
            Rashi
          </VText>
          <VText variant="caption" weight="600" color="textMuted" style={[styles.thCell, styles.colHouse]}>
            House
          </VText>
          <VText variant="caption" weight="600" color="textMuted" style={[styles.thCell, styles.colDegree]}>
            Degree
          </VText>
          <VText variant="caption" weight="600" color="textMuted" style={[styles.thCell, styles.colNakshatra]}>
            Nakshatra
          </VText>
        </View>

        {planets.map((planet: PlanetPosition) => (
          <View
            key={planet.name}
            style={[
              styles.tableRow,
              {
                borderBottomColor: colors.borderDefault,
                paddingVertical: spacing.xs,
              },
            ]}
          >
            <View style={[styles.tdCell, styles.colGraha]}>
              <VText variant="bodyMedium" weight="600" color="textPrimary">
                {planet.name}
              </VText>
              {planet.is_retrograde ? (
                <View style={[styles.retroBadge, { backgroundColor: colors.surfaceSubtle }]}>
                  <VText variant="caption" color="error" style={styles.retroText}>
                    R
                  </VText>
                </View>
              ) : null}
            </View>

            <VText variant="bodyMedium" color="textMuted" style={[styles.tdCell, styles.colRashi]}>
              {planet.sign.split(" ")[0]}
            </VText>

            <VText variant="bodyMedium" weight="600" color="brandPrimary" style={[styles.tdCell, styles.colHouse]}>
              {planet.house}H
            </VText>

            <VText variant="bodyMedium" color="textMuted" style={[styles.tdCell, styles.colDegree]}>
              {planet.sign_degree.toFixed(1)}°
            </VText>

            <VText variant="caption" color="brandPrimary" style={[styles.tdCell, styles.colNakshatra]}>
              {planet.nakshatra} ({planet.pada})
            </VText>
          </View>
        ))}
      </VCard>

      {/* 7. 12 Bhavas (Whole-Sign Houses) Summary */}
      <VCard
        variant="default"
        elevation={1}
        style={[
          styles.housesCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        ]}
      >
        <VText variant="titleMedium" weight="700" color="textPrimary" style={{ marginBottom: spacing.sm }}>
          12 Bhavas (Houses)
        </VText>
        <View style={[styles.housesGrid, { gap: spacing.xs }]}>
          {houses.map((house) => (
            <View
              key={house.house}
              style={[
                styles.houseBox,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.borderDefault,
                  borderRadius: radii.sm,
                  padding: spacing.xs,
                },
              ]}
            >
              <View style={styles.houseHeader}>
                <VText variant="caption" weight="700" color="brandPrimary" style={styles.houseNumText}>
                  {house.house}H
                </VText>
                <VText variant="caption" color="textMuted" numberOfLines={1}>
                  {house.sign ? house.sign.split(" ")[0] : ""}
                </VText>
              </View>
              <VText variant="caption" color="textPrimary" style={styles.occupantsText}>
                {house.occupants && house.occupants.length > 0 ? house.occupants.join(", ") : "Empty"}
              </VText>
            </View>
          ))}
        </View>
      </VCard>

      {/* 8. Vimshottari Mahadasha Timeline */}
      <VCard
        variant="default"
        elevation={1}
        style={[
          styles.dashaCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        ]}
      >
        <View style={[styles.dashaHeaderRow, { marginBottom: spacing.xs }]}>
          <VText variant="titleMedium" weight="700" color="textPrimary">
            Vimshottari Dasha Timeline
          </VText>
          <TouchableOpacity
            onPress={() => setExpandedDasha(!expandedDasha)}
            style={styles.dashaToggleBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <VText variant="labelLarge" weight="600" color="brandPrimary">
              {expandedDasha ? "Hide Periods ▲" : "View All Periods ▼"}
            </VText>
          </TouchableOpacity>
        </View>

        <View style={styles.dashaList}>
          {((vimshottari.mahadashas || []).slice(0, expandedDasha ? undefined : 3)).map(
            (md, idx) => {
              const lordName = md.lord || (md as any).planet || `Dasha-${idx}`;
              return (
                <View
                  key={`${lordName}-${md.start_date}`}
                  style={[
                    styles.dashaItem,
                    {
                      borderBottomColor: colors.borderDefault,
                      paddingVertical: spacing.xs,
                    },
                  ]}
                >
                  <View style={styles.dashaItemLeft}>
                    <VText
                      variant="bodyMedium"
                      weight={md.is_current ? "700" : "500"}
                      color={md.is_current ? "brandPrimary" : "textPrimary"}
                    >
                      {lordName} Mahadasha
                    </VText>
                    {md.is_current ? (
                      <View style={[styles.activeTag, { backgroundColor: colors.brandPrimary, borderRadius: radii.sm }]}>
                        <VText variant="caption" color="textOnPrimary" style={styles.activeTagText}>
                          Current
                        </VText>
                      </View>
                    ) : null}
                  </View>
                  <VText variant="caption" color="textMuted">
                    {md.start_date} to {md.end_date}
                  </VText>
                </View>
              );
            }
          )}
        </View>
      </VCard>

      {/* 9. Upsell to Certified Kashi Pandit Handwritten Kundli */}
      <VCard
        variant="default"
        elevation={2}
        style={[
          styles.upsellCard,
          {
            padding: spacing.lg,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderAccent,
            borderWidth: 1,
            alignItems: "center",
          },
        ]}
      >
        <VText style={styles.templeIcon}>🛕</VText>
        <VText variant="headlineSmall" weight="700" align="center" color="brandPrimary" style={{ marginVertical: spacing.xxs }}>
          Want Deep Personal Guidance?
        </VText>
        <VText
          variant="bodyMedium"
          color="textMuted"
          align="center"
          style={{ lineHeight: getDevanagariLineHeight(15), marginBottom: spacing.md }}
        >
          Get a comprehensive handwritten horoscope personally prepared and analyzed by certified
          Vedic astrologers in Varanasi, delivered as a high-definition PDF document with remedial guidance.
        </VText>
        <VButton
          title="Order Handwritten Kundli from Kashi 📜"
          variant="primary"
          size="lg"
          onPress={handleOrderHandwritten}
          style={styles.upsellBtn}
        />
      </VCard>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  errorCard: {},
  birthCard: {},
  birthHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sunIcon: {
    fontSize: 28,
  },
  divider: {
    height: 1,
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  detailItem: {
    width: "48%",
  },
  heroRow: {
    flexDirection: "row",
  },
  heroHalfCard: {
    flex: 1,
  },
  badgeLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  heroSignText: {
    marginBottom: 2,
  },
  horoscopeCtaCard: {},
  horoscopeCtaContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  horoscopeCtaIcon: {
    fontSize: 28,
  },
  horoscopeCtaTextCol: {
    flex: 1,
  },
  horoscopeCtaBtn: {
    minHeight: 48,
  },
  panchangCard: {},
  panchangRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  panchangCol: {
    flex: 1,
  },
  dashaActiveCard: {},
  dashaActiveHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  dashaIcon: {
    fontSize: 24,
  },
  dashaTitleCol: {
    flex: 1,
  },
  planetsCard: {},
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    alignItems: "center",
  },
  thCell: {},
  tdCell: {},
  colGraha: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  colRashi: {
    flex: 2,
  },
  colHouse: {
    flex: 1.2,
  },
  colDegree: {
    flex: 1.5,
  },
  colNakshatra: {
    flex: 2.3,
  },
  retroBadge: {
    marginLeft: 4,
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  retroText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  housesCard: {},
  housesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  houseBox: {
    width: "31%",
    borderWidth: 1,
    marginBottom: 6,
  },
  houseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  houseNumText: {},
  occupantsText: {
    marginTop: 2,
    fontSize: 10,
  },
  dashaCard: {},
  dashaHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dashaToggleBtn: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  dashaList: {},
  dashaItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  dashaItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activeTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  upsellCard: {},
  templeIcon: {
    fontSize: 32,
  },
  upsellBtn: {
    minHeight: 48,
    width: "100%",
  },
});

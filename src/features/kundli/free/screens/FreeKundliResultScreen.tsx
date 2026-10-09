// src/features/kundli/free/screens/FreeKundliResultScreen.tsx
import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Button,
  Card,
  Header,
  ScreenContainer,
  Text,
} from "../../../../shared/components/ui/index.ts";
import { colors, radius, spacing, typography } from "../../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../../shared/types/navigation.ts";
import { FreeKundliResponse, PlanetPosition } from "../types/freeKundli.types.ts";

type RouteProps = RouteProp<CustomerStackParamList, "FreeKundliResult">;
type NavProps = NativeStackNavigationProp<CustomerStackParamList>;

export const FreeKundliResultScreen: React.FC = () => {
  const navigation = useNavigation<NavProps>();
  const route = useRoute<RouteProps>();
  const kundli = route.params?.kundliData as FreeKundliResponse;

  const [expandedDasha, setExpandedDasha] = useState<boolean>(false);

  if (!kundli || !kundli.ascendant || !kundli.planets) {
    return (
      <ScreenContainer padded>
        <Header title="Vedic Kundli" onBack={() => navigation.goBack()} />
        <Card variant="outlined" style={styles.errorCard}>
          <Text variant="h3" color={colors.error} align="center">
            Horoscope Not Found
          </Text>
          <Text variant="body" color={colors.textSecondary} align="center">
            No chart data available. Please generate your free Kundli again.
          </Text>
          <Button
            title="Create Kundli"
            variant="primary"
            onPress={() => navigation.navigate("FreeKundliWizard")}
          />
        </Card>
      </ScreenContainer>
    );
  }

  const { birth, ascendant, moon, planets, houses, panchang, vimshottari, vedic } = kundli;

  const handleOrderHandwritten = () => {
    navigation.navigate("KundliWizard", undefined);
  };

  return (
    <ScreenContainer scrollable={false} padded={false}>
      <Header title="Janam Kundli" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 1. Devotee & Birth Details Card */}
        <Card variant="elevated" style={styles.birthCard}>
          <View style={styles.birthHeaderRow}>
            <View>
              <Text variant="h2" color={colors.primary}>
                {birth.name ? `${birth.name}'s Horoscope` : "Vedic Janam Kundli"}
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                Calculated with Kashi Veda Astronomical Engine (Lahiri)
              </Text>
            </View>
            <Text style={styles.sunIcon}>☀️</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Text variant="caption" color={colors.textSecondary}>
                Date of Birth
              </Text>
              <Text variant="bodyMedium" color={colors.textPrimary}>
                {birth.date}
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Text variant="caption" color={colors.textSecondary}>
                Time of Birth
              </Text>
              <Text variant="bodyMedium" color={colors.textPrimary}>
                {birth.time}
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Text variant="caption" color={colors.textSecondary}>
                Birth Place
              </Text>
              <Text variant="bodyMedium" color={colors.textPrimary} numberOfLines={1}>
                {birth.place}
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Text variant="caption" color={colors.textSecondary}>
                Coordinates & Zone
              </Text>
              <Text variant="bodyMedium" color={colors.textPrimary}>
                {birth.latitude.toFixed(2)}°N, {birth.longitude.toFixed(2)}°E ({birth.timezone})
              </Text>
            </View>
          </View>
        </Card>

        {/* 2. Lagna & Moon Sign Hero Cards */}
        <View style={styles.heroRow}>
          <Card variant="outlined" style={styles.heroHalfCard}>
            <Text variant="caption" color={colors.primary} style={styles.badgeLabel}>
              ASCENDANT / LAGNA
            </Text>
            <Text variant="h3" color={colors.textPrimary} style={styles.heroSignText}>
              {ascendant.sign.split(" ")[0]}
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              {ascendant.sign_degree.toFixed(2)}° in sign
            </Text>
            <Text variant="caption" color={colors.textTertiary}>
              Nakshatra: {ascendant.nakshatra} (Pada {ascendant.pada})
            </Text>
            {ascendant.d9_sign ? (
              <Text variant="caption" color={colors.textTertiary}>
                Navamsa D9: {ascendant.d9_sign.split(" ")[0]}
              </Text>
            ) : null}
          </Card>

          <Card variant="outlined" style={styles.heroHalfCard}>
            <Text variant="caption" color={colors.primary} style={styles.badgeLabel}>
              MOON SIGN / RASHI
            </Text>
            <Text variant="h3" color={colors.textPrimary} style={styles.heroSignText}>
              {moon.sign.split(" ")[0]}
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              {moon.sign_degree.toFixed(2)}° in sign
            </Text>
            <Text variant="caption" color={colors.textTertiary}>
              Nakshatra: {moon.nakshatra} (Pada {moon.pada})
            </Text>
            {moon.d9_sign ? (
              <Text variant="caption" color={colors.textTertiary}>
                Navamsa D9: {moon.d9_sign.split(" ")[0]}
              </Text>
            ) : null}
          </Card>
        </View>

        {/* 3. Panchang Overview */}
        <Card variant="outlined" style={styles.panchangCard}>
          <Text variant="h3" style={styles.sectionHeading}>
            Panchang at Birth
          </Text>
          <View style={styles.panchangRow}>
            <View style={styles.panchangCol}>
              <Text variant="caption" color={colors.textSecondary}>
                Tithi
              </Text>
              <Text variant="bodyMedium" color={colors.textPrimary}>
                {panchang.tithi || "Shukla"}
              </Text>
            </View>
            <View style={styles.panchangCol}>
              <Text variant="caption" color={colors.textSecondary}>
                Birth Nakshatra
              </Text>
              <Text variant="bodyMedium" color={colors.textPrimary}>
                {panchang.nakshatra || moon.nakshatra}
              </Text>
            </View>
            <View style={styles.panchangCol}>
              <Text variant="caption" color={colors.textSecondary}>
                Weekday (Vara)
              </Text>
              <Text variant="bodyMedium" color={colors.textPrimary}>
                {panchang.vara}
              </Text>
            </View>
          </View>
        </Card>

        {/* 4. Active Vimshottari Dasha Card */}
        {vimshottari.current ? (
          <Card variant="elevated" style={styles.dashaActiveCard}>
            <View style={styles.dashaActiveHeader}>
              <Text style={styles.dashaIcon}>⏳</Text>
              <View style={styles.dashaTitleCol}>
                <Text variant="caption" color={colors.primary}>
                  CURRENT VIMSHOTTARI DASHA
                </Text>
                <Text variant="h3" color={colors.textPrimary}>
                  Mahadasha: {vimshottari.current.mahadasha_lord} • Antardasha: {vimshottari.current.antardasha_lord}
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  Active period: {vimshottari.current.start_date} to {vimshottari.current.end_date}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* 5. Planetary Positions Table (Navagrahas) */}
        <Card variant="outlined" style={styles.planetsCard}>
          <Text variant="h3" style={styles.sectionHeading}>
            Navagraha Positions (Planetary Degrees)
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.sectionSub}>
            Sidereal Lahiri Ayanamsa ({vedic.ayanamsha_degrees.toFixed(2)}°) • Whole-Sign Bhavas
          </Text>

          <View style={styles.tableHeader}>
            <Text variant="caption" style={[styles.thCell, styles.colRashi]}>
              Graha
            </Text>
            <Text variant="caption" style={[styles.thCell, styles.colRashi]}>
              Rashi
            </Text>
            <Text variant="caption" style={[styles.thCell, styles.colHouse]}>
              House
            </Text>
            <Text variant="caption" style={[styles.thCell, styles.colDegree]}>
              Degree
            </Text>
            <Text variant="caption" style={[styles.thCell, styles.colNakshatra]}>
              Nakshatra
            </Text>
          </View>

          {planets.map((planet: PlanetPosition) => (
            <View key={planet.name} style={styles.tableRow}>
              <View style={[styles.tdCell, styles.colGraha]}>
                <Text variant="bodyMedium" color={colors.textPrimary}>
                  {planet.name}
                </Text>
                {planet.is_retrograde ? (
                  <View style={styles.retroBadge}>
                    <Text variant="caption" color={colors.error} style={styles.retroText}>
                      R
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text variant="bodyMedium" color={colors.textSecondary} style={[styles.tdCell, styles.colRashi]}>
                {planet.sign.split(" ")[0]}
              </Text>

              <Text variant="bodyMedium" color={colors.primary} style={[styles.tdCell, styles.colHouse]}>
                {planet.house}H
              </Text>

              <Text variant="bodyMedium" color={colors.textSecondary} style={[styles.tdCell, styles.colDegree]}>
                {planet.sign_degree.toFixed(1)}°
              </Text>

              <Text variant="caption" color={colors.textTertiary} style={[styles.tdCell, styles.colNakshatra]}>
                {planet.nakshatra} ({planet.pada})
              </Text>
            </View>
          ))}
        </Card>

        {/* 6. 12 Bhavas (Whole-Sign Houses) Summary */}
        <Card variant="outlined" style={styles.housesCard}>
          <Text variant="h3" style={styles.sectionHeading}>
            12 Bhavas (Houses)
          </Text>
          <View style={styles.housesGrid}>
            {houses.map((house) => (
              <View key={house.house} style={styles.houseBox}>
                <View style={styles.houseHeader}>
                  <Text variant="caption" color={colors.primary} style={styles.houseNumText}>
                    {house.house}H
                  </Text>
                  <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                    {house.sign ? house.sign.split(" ")[0] : ""}
                  </Text>
                </View>
                <Text variant="caption" color={colors.textPrimary} style={styles.occupantsText}>
                  {house.occupants && house.occupants.length > 0 ? house.occupants.join(", ") : "Empty"}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* 7. Vimshottari Mahadasha Timeline */}
        <Card variant="outlined" style={styles.dashaCard}>
          <View style={styles.dashaHeaderRow}>
            <Text variant="h3" style={styles.sectionHeading}>
              Vimshottari Dasha Timeline
            </Text>
            <TouchableOpacity onPress={() => setExpandedDasha(!expandedDasha)}>
              <Text variant="caption" color={colors.primary}>
                {expandedDasha ? "Hide Periods ▲" : "View All Periods ▼"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dashaList}>
            {(expandedDasha ? vimshottari.mahadashas : vimshottari.mahadashas.slice(0, 3)).map(
              (md, idx) => {
                const lordName = md.lord || (md as any).planet || `Dasha-${idx}`;
                return (
                  <View key={`${lordName}-${md.start_date}`} style={[styles.dashaItem, md.is_current && styles.dashaItemActive]}>
                    <View style={styles.dashaItemLeft}>
                      <Text variant="bodyMedium" color={md.is_current ? colors.primary : colors.textPrimary}>
                        {lordName} Mahadasha
                      </Text>
                      {md.is_current ? (
                        <View style={styles.activeTag}>
                          <Text variant="caption" color={colors.surface} style={styles.activeTagText}>
                            Current
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text variant="caption" color={colors.textSecondary}>
                      {md.start_date} to {md.end_date}
                    </Text>
                  </View>
                );
              }
            )}
          </View>
        </Card>

        {/* 8. Upsell to Certified Kashi Pandit Handwritten Kundli */}
        <Card variant="elevated" style={styles.upsellCard}>
          <Text style={styles.templeIcon}>🛕</Text>
          <Text variant="h3" align="center" style={styles.upsellTitle}>
            Want Deep Personal Guidance?
          </Text>
          <Text variant="body" color={colors.textSecondary} align="center" style={styles.upsellDesc}>
            Get a comprehensive handwritten horoscope personally prepared and analyzed by certified
            Vedic astrologers in Varanasi, delivered as a high-definition PDF document with remedial guidance.
          </Text>
          <Button
            title="Order Handwritten Kundli from Kashi 📜"
            variant="primary"
            size="md"
            onPress={handleOrderHandwritten}
            style={styles.upsellBtn}
          />
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  errorCard: {
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: "center",
  },
  birthCard: {
    padding: spacing.lg,
    backgroundColor: "#FFFBF7",
  },
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
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.sm,
  },
  detailItem: {
    width: "50%",
    paddingRight: spacing.xs,
  },
  heroRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  heroHalfCard: {
    flex: 1,
    padding: spacing.md,
    gap: 2,
    backgroundColor: colors.surface,
  },
  badgeLabel: {
    fontWeight: typography.fontWeight.bold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  heroSignText: {
    marginVertical: 2,
  },
  panchangCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  sectionHeading: {
    marginBottom: spacing.xxs,
  },
  sectionSub: {
    marginBottom: spacing.sm,
  },
  panchangRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  panchangCol: {
    flex: 1,
  },
  dashaActiveCard: {
    padding: spacing.md,
    backgroundColor: "#F3E5F5",
    borderColor: "#CE93D8",
    borderWidth: 1,
  },
  dashaActiveHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dashaIcon: {
    fontSize: 24,
  },
  dashaTitleCol: {
    flex: 1,
  },
  planetsCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 4,
  },
  thCell: {
    fontWeight: typography.fontWeight.bold,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  tdCell: {},
  colGraha: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
    flex: 2.2,
  },
  retroBadge: {
    backgroundColor: "#FFEBEE",
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  retroText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  housesCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  housesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  houseBox: {
    width: "31%",
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.sm,
    padding: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
  },
  houseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  houseNumText: {
    fontWeight: typography.fontWeight.bold,
  },
  occupantsText: {
    marginTop: 2,
    fontSize: 11,
  },
  dashaCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  dashaHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  dashaList: {
    gap: spacing.xs,
  },
  dashaItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  dashaItemActive: {
    backgroundColor: "#F1F8E9",
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
  dashaItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  activeTag: {
    backgroundColor: colors.success,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  upsellCard: {
    padding: spacing.lg,
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    borderColor: "#FFE082",
    borderWidth: 1,
    gap: spacing.xs,
  },
  templeIcon: {
    fontSize: 32,
  },
  upsellTitle: {
    color: colors.primary,
  },
  upsellDesc: {
    lineHeight: 20,
    marginVertical: spacing.xs,
  },
  upsellBtn: {
    width: "100%",
    marginTop: spacing.xs,
  },
});

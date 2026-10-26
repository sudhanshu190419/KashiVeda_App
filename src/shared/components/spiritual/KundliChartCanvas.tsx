import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';

export interface PlanetaryPosition {
  /** Planet standard name (e.g., 'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu') */
  planet: string;
  /** Authentic Hindi name (e.g., 'सूर्य', 'चन्द्र', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि', 'राहु', 'केतु') */
  planetHi?: string;
  /** Rashi (Zodiac) number (1 = Mesha to 12 = Meena) */
  rashi: number;
  /** House / Bhava number (1 to 12) */
  bhava: number;
  /** Exact degree and minute string (e.g., "14°28'") */
  degree?: string;
  /** Retrograde status indicator (वक्र) */
  isRetrograde?: boolean;
}

export interface KundliChartCanvasProps {
  /** Chart orientation geometry (defaults to 'NORTH_INDIAN' diamond) */
  chartType?: 'NORTH_INDIAN' | 'SOUTH_INDIAN' | string;
  /** Planetary positions mapped to bhavas and rashis */
  planetaryPositions?: PlanetaryPosition[];
  /** Alias for planetaryPositions for ergonomic DX across screens */
  planets?: PlanetaryPosition[];
  /** Currently selected Bhava index (1 to 12) */
  selectedBhava?: number;
  /** Callback fired when a Bhava is tapped */
  onSelectBhava?: (bhava: number) => void;
  /** Outer square size in dp (default: 320) */
  size?: number;
  /** Custom container style */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

interface BhavaDefinition {
  number: number;
  nameHi: string;
  nameEn: string;
  significanceHi: string;
  significanceEn: string;
  cx: number; // Centroid X ratio (0 to 1)
  cy: number; // Centroid Y ratio (0 to 1)
}

const BHAVA_DEFINITIONS: BhavaDefinition[] = [
  {
    number: 1,
    nameHi: 'लग्न (तनु भाव)',
    nameEn: 'Lagna (1st House)',
    significanceHi: 'शरीर, स्वभाव, व्यक्तित्व, स्वास्थ्य',
    significanceEn: 'Self, Body, Vitality, Temperament',
    cx: 0.5,
    cy: 0.25,
  },
  {
    number: 2,
    nameHi: 'धन भाव',
    nameEn: 'Dhana (2nd House)',
    significanceHi: 'धन, वाणी, कुटुंब, संचित संपदा',
    significanceEn: 'Wealth, Speech, Family, Assets',
    cx: 0.25,
    cy: 0.13,
  },
  {
    number: 3,
    nameHi: 'सहज भाव',
    nameEn: 'Sahaja (3rd House)',
    significanceHi: 'पराक्रम, छोटे भाई-बहन, साहस',
    significanceEn: 'Siblings, Courage, Endeavors',
    cx: 0.13,
    cy: 0.25,
  },
  {
    number: 4,
    nameHi: 'सुख भाव',
    nameEn: 'Sukha (4th House)',
    significanceHi: 'माता, गृह, वाहन, मानसिक शांति',
    significanceEn: 'Mother, Home, Vehicles, Mind',
    cx: 0.25,
    cy: 0.5,
  },
  {
    number: 5,
    nameHi: 'पुत्र भाव',
    nameEn: 'Putra (5th House)',
    significanceHi: 'विद्या, संतान, बुद्धि, पूर्वपुण्य',
    significanceEn: 'Children, Intelligence, Past Merits',
    cx: 0.13,
    cy: 0.75,
  },
  {
    number: 6,
    nameHi: 'रिपु भाव',
    nameEn: 'Ripu (6th House)',
    significanceHi: 'रोग, ऋण, शत्रु, प्रतिस्पर्धा',
    significanceEn: 'Debts, Enemies, Disease, Service',
    cx: 0.25,
    cy: 0.87,
  },
  {
    number: 7,
    nameHi: 'जाया भाव',
    nameEn: 'Jaya (7th House)',
    significanceHi: 'जीवनसाथी, साझेदारी, व्यापार',
    significanceEn: 'Spouse, Partnership, Foreign Travel',
    cx: 0.5,
    cy: 0.75,
  },
  {
    number: 8,
    nameHi: 'आयु भाव',
    nameEn: 'Ayur (8th House)',
    significanceHi: 'आयु, गूढ़ विद्या, आकस्मिक घटनाएं',
    significanceEn: 'Longevity, Occult, Transformation',
    cx: 0.75,
    cy: 0.87,
  },
  {
    number: 9,
    nameHi: 'भाग्य भाव',
    nameEn: 'Bhagya (9th House)',
    significanceHi: 'धर्म, गुरु, तीर्थयात्रा, उच्च ज्ञान',
    significanceEn: 'Destiny, Guru, Pilgrimage, Higher Truth',
    cx: 0.87,
    cy: 0.75,
  },
  {
    number: 10,
    nameHi: 'कर्म भाव',
    nameEn: 'Karma (10th House)',
    significanceHi: 'व्यवसाय, प्रतिष्ठा, पिता, अधिकार',
    significanceEn: 'Career, Honor, Authority, Actions',
    cx: 0.75,
    cy: 0.5,
  },
  {
    number: 11,
    nameHi: 'लाभ भाव',
    nameEn: 'Labha (11th House)',
    significanceHi: 'आय, मित्र, अभिलाषा पूर्ति',
    significanceEn: 'Gains, Friends, Desires Fulfillment',
    cx: 0.87,
    cy: 0.25,
  },
  {
    number: 12,
    nameHi: 'व्यय भाव',
    nameEn: 'Vyaya (12th House)',
    significanceHi: 'मोक्ष, व्यय, विदेश, एकांत',
    significanceEn: 'Expenses, Isolation, Moksha, Foreign',
    cx: 0.75,
    cy: 0.13,
  },
];

/**
 * Standard Sanskrit abbreviation map for Vedic grahas
 */
const PLANET_ABBREVIATIONS: Record<string, { hi: string; en: string }> = {
  Sun: { hi: 'सू', en: 'Su' },
  Moon: { hi: 'चं', en: 'Mo' },
  Mars: { hi: 'मं', en: 'Ma' },
  Mercury: { hi: 'बु', en: 'Me' },
  Jupiter: { hi: 'गु', en: 'Ju' },
  Venus: { hi: 'शु', en: 'Ve' },
  Saturn: { hi: 'श', en: 'Sa' },
  Rahu: { hi: 'रा', en: 'Ra' },
  Ketu: { hi: 'के', en: 'Ke' },
};

/**
 * KundliChartCanvas — Authentic North Indian Diamond Birth Chart (कुण्डली चक्र)
 *
 * Renders the classical Parashari 12-Bhava geometry with responsive scaling,
 * 48dp clickable house targets, retrograde notations (R), and detailed house info.
 */
export const KundliChartCanvas: React.FC<KundliChartCanvasProps> = ({
  chartType = 'NORTH_INDIAN',
  planetaryPositions,
  planets,
  selectedBhava,
  onSelectBhava,
  size = 320,
  style,
  testID = 'kundli-chart-canvas',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  const activePlanetaryPositions = planetaryPositions ?? planets ?? [];

  // Pre-index planets by bhava (1-12)
  const planetsByBhava = useMemo(() => {
    const map = new Map<number, PlanetaryPosition[]>();
    for (let i = 1; i <= 12; i++) {
      map.set(i, []);
    }
    for (const p of activePlanetaryPositions) {
      if (p.bhava >= 1 && p.bhava <= 12) {
        map.get(p.bhava)?.push(p);
      }
    }
    return map;
  }, [activePlanetaryPositions]);

  // Selected Bhava details
  const activeBhavaDef = useMemo(() => {
    if (!selectedBhava) return null;
    return BHAVA_DEFINITIONS.find((b) => b.number === selectedBhava) || null;
  }, [selectedBhava]);

  // Dimensions for geometry
  const innerDiamondSize = size / Math.SQRT2; // Side length of 45-deg inner square
  const diagonalLength = size * Math.SQRT2; // Length of full corner-to-corner diagonal

  return (
    <View
      style={[
        styles.rootContainer,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: colors.borderDefault,
          borderRadius: radii.lg,
          padding: spacing.md,
        },
        elevation.elevation1,
        style,
      ]}
      testID={testID}
      accessible={true}
      accessibilityRole="none"
      accessibilityLabel={
        isHi ? 'उत्तर भारतीय कुण्डली चक्र' : 'North Indian birth chart'
      }
    >
      {/* Title Header */}
      <View style={[styles.headerRow, { marginBottom: spacing.md }]}>
        <View>
          <Text
            style={[
              styles.chartTitleHi,
              {
                color: colors.textPrimary,
                fontFamily: typography.titleMedium.fontFamily,
                fontSize: typography.titleMedium.fontSize,
                lineHeight: getDevanagariLineHeight(typography.titleMedium.fontSize),
              },
            ]}
          >
            {isHi ? 'उत्तर भारतीय कुण्डली (चक्र)' : 'North Indian Birth Chart'}
          </Text>
          <Text
            style={[
              styles.chartSubtitleEn,
              {
                color: colors.textMuted,
                fontFamily: typography.caption.fontFamily,
                fontSize: typography.caption.fontSize,
                lineHeight: typography.caption.lineHeight,
              },
            ]}
          >
            {isHi ? 'द्वादश भाव • पाराशरी विधान' : 'Diamond chart • 12 bhavas'}
          </Text>
        </View>
        <View
          style={[
            styles.vedicTag,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderAccent,
              borderRadius: radii.full,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xxs,
            },
          ]}
        >
          <Text
            style={[
              styles.tagText,
              {
                color: colors.brandPrimary,
                fontFamily: typography.caption.fontFamily,
                fontSize: typography.caption.fontSize,
                lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
              },
            ]}
          >
            {isHi ? 'पाराशरी विधान' : 'Parashari'}
          </Text>
        </View>
      </View>

      {/* Outer Square Canvas */}
      <View style={styles.canvasWrapper}>
        <View
          style={[
            styles.chartSquare,
            {
              width: size,
              height: size,
              borderColor: colors.brandPrimary,
              backgroundColor: colors.surfaceBase,
            },
          ]}
        >
          {/* Inner Diamond (Square rotated 45 degrees, connecting midpoints) */}
          <View
            pointerEvents="none"
            style={[
              styles.innerDiamond,
              {
                width: innerDiamondSize,
                height: innerDiamondSize,
                top: (size - innerDiamondSize) / 2,
                left: (size - innerDiamondSize) / 2,
                borderColor: colors.borderAccent,
              },
            ]}
          />

          {/* Diagonal Line 1: Top-Left to Bottom-Right */}
          <View
            pointerEvents="none"
            style={[
              styles.diagonalLine,
              {
                width: diagonalLength,
                left: (size - diagonalLength) / 2,
                top: size / 2,
                backgroundColor: colors.borderAccent,
                transform: [{ rotate: '45deg' }],
              },
            ]}
          />

          {/* Diagonal Line 2: Top-Right to Bottom-Left */}
          <View
            pointerEvents="none"
            style={[
              styles.diagonalLine,
              {
                width: diagonalLength,
                left: (size - diagonalLength) / 2,
                top: size / 2,
                backgroundColor: colors.borderAccent,
                transform: [{ rotate: '-45deg' }],
              },
            ]}
          />

          {/* 12 Interactive Bhava Cells */}
          {BHAVA_DEFINITIONS.map((bhavaDef) => {
            const isSelected = selectedBhava === bhavaDef.number;
            const planets = planetsByBhava.get(bhavaDef.number) || [];
            const cellX = bhavaDef.cx * size;
            const cellY = bhavaDef.cy * size;
            const targetSize = Math.max(48, size * 0.2);

            return (
              <Pressable
                key={bhavaDef.number}
                onPress={() => onSelectBhava?.(bhavaDef.number)}
                style={({ pressed }) => [
                  styles.bhavaCell,
                  {
                    width: targetSize,
                    height: targetSize,
                    left: cellX - targetSize / 2,
                    top: cellY - targetSize / 2,
                    borderRadius: radii.sm,
                    backgroundColor: isSelected
                      ? colors.surfaceSubtle
                      : pressed
                      ? colors.surfaceNav
                      : 'transparent',
                    borderColor: isSelected ? colors.brandPrimary : 'transparent',
                    borderWidth: isSelected ? 1.5 : 0,
                  },
                ]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={
                  isHi
                    ? `${bhavaDef.number} ${bhavaDef.nameHi}, ${planets.length} ग्रह`
                    : `House ${bhavaDef.number}, ${bhavaDef.nameEn}, ${planets.length} planets`
                }
              >
                {/* House Number Badge */}
                <Text
                  style={[
                    styles.bhavaNumberText,
                    {
                      color: isSelected ? colors.brandPrimary : colors.textMuted,
                      fontFamily: typography.caption.fontFamily,
                      fontSize: 10,
                      lineHeight: 12,
                    },
                  ]}
                >
                  {bhavaDef.number}
                </Text>

                {/* Planets listed inside house */}
                {planets.length > 0 && (
                  <View style={styles.planetsContainer}>
                    {planets.slice(0, 3).map((pl, idx) => {
                      const abbrev =
                        (isHi
                          ? PLANET_ABBREVIATIONS[pl.planet]?.hi
                          : PLANET_ABBREVIATIONS[pl.planet]?.en) ||
                        (isHi ? pl.planetHi?.slice(0, 2) : pl.planet.slice(0, 2)) ||
                        pl.planet.slice(0, 2);

                      return (
                        <View key={`${pl.planet}-${idx}`} style={styles.planetPill}>
                          <Text
                            style={[
                              styles.planetAbbrevText,
                              {
                                color: pl.isRetrograde
                                  ? colors.statusAlert
                                  : colors.textPrimary,
                                fontFamily: typography.caption.fontFamily,
                                fontSize: 10,
                                lineHeight: 12,
                              },
                            ]}
                          >
                            {abbrev}
                            {pl.isRetrograde ? (isHi ? '(व)' : '(R)') : ''}
                          </Text>
                          {pl.degree && (
                            <Text
                              style={[
                                styles.planetDegreeText,
                                {
                                  color: colors.textMuted,
                                  fontSize: 8,
                                  lineHeight: 10,
                                },
                              ]}
                            >
                              {pl.degree}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                    {planets.length > 3 && (
                      <Text
                        style={[
                          styles.morePlanetsText,
                          {
                            color: colors.brandPrimary,
                            fontSize: 9,
                            lineHeight: 10,
                          },
                        ]}
                      >
                        +{planets.length - 3}
                      </Text>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Selected Bhava Details Panel */}
      {activeBhavaDef && (
        <View
          style={[
            styles.selectedInfoPanel,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderAccent,
              borderRadius: radii.md,
              padding: spacing.sm,
              marginTop: spacing.md,
            },
          ]}
        >
          <View style={styles.selectedHeaderRow}>
            <Text
              style={[
                styles.selectedTitleHi,
                {
                  color: colors.brandPrimary,
                  fontFamily: typography.titleSmall.fontFamily,
                  fontSize: typography.titleSmall.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
                },
              ]}
            >
              {activeBhavaDef.number}.{' '}
              {isHi ? activeBhavaDef.nameHi : activeBhavaDef.nameEn}
            </Text>
          </View>
          <Text
            style={[
              styles.selectedSignificance,
              {
                color: colors.textMuted,
                fontFamily: typography.caption.fontFamily,
                fontSize: typography.caption.fontSize,
                lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
              },
            ]}
          >
            {isHi ? activeBhavaDef.significanceHi : activeBhavaDef.significanceEn}
          </Text>

          {/* Occupying planets in active bhava */}
          {planetsByBhava.get(activeBhavaDef.number)?.length ? (
            <View style={[styles.activePlanetsRow, { marginTop: spacing.xs }]}>
              {planetsByBhava.get(activeBhavaDef.number)!.map((p, i) => (
                <View
                  key={`sel-${p.planet}-${i}`}
                  style={[
                    styles.activePlanetChip,
                    {
                      backgroundColor: colors.surfaceCard,
                      borderColor: p.isRetrograde
                        ? colors.statusAlert
                        : colors.borderDefault,
                      borderRadius: radii.sm,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: spacing.xxs,
                      marginRight: spacing.xs,
                      marginBottom: spacing.xxs,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.activePlanetText,
                      {
                        color: p.isRetrograde
                          ? colors.statusAlert
                          : colors.textPrimary,
                        fontFamily: typography.caption.fontFamily,
                        fontSize: typography.caption.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                      },
                    ]}
                  >
                    {isHi ? p.planetHi || p.planet : p.planet}{' '}
                    {p.degree ? `(${p.degree})` : ''}
                    {p.isRetrograde ? (isHi ? ' [वक्र]' : ' [R]') : ''}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text
              style={[
                styles.emptyBhavaText,
                {
                  color: colors.textMuted,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                  marginTop: spacing.xxs,
                },
              ]}
            >
              {isHi ? 'कोई ग्रह उपस्थित नहीं' : 'No occupying grahas'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

export const KundliChart = KundliChartCanvas;

export default KundliChartCanvas;

const styles = StyleSheet.create({
  rootContainer: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartTitleHi: {
    fontWeight: '700',
  },
  chartSubtitleEn: {
    marginTop: 2,
  },
  vedicTag: {
    borderWidth: 1,
  },
  tagText: {
    fontWeight: '600',
  },
  canvasWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartSquare: {
    borderWidth: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  innerDiamond: {
    position: 'absolute',
    borderWidth: 1.5,
    transform: [{ rotate: '45deg' }],
  },
  diagonalLine: {
    position: 'absolute',
    height: 1.5,
  },
  bhavaCell: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    minWidth: 48,
    minHeight: 48,
  },
  bhavaNumberText: {
    fontWeight: '700',
    opacity: 0.85,
  },
  planetsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  planetPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planetAbbrevText: {
    fontWeight: '700',
  },
  planetDegreeText: {
    marginLeft: 1,
  },
  morePlanetsText: {
    fontWeight: '700',
  },
  selectedInfoPanel: {
    borderWidth: 1,
  },
  selectedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedTitleHi: {
    fontWeight: '700',
  },
  selectedSignificance: {
    marginTop: 2,
  },
  activePlanetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  activePlanetChip: {
    borderWidth: 1,
  },
  activePlanetText: {
    fontWeight: '600',
  },
  emptyBhavaText: {
    fontStyle: 'italic',
  },
});

// src/shared/components/spiritual/PanchangCard.tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '../icons';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { PANCHANG_LABELS } from '../../constants/vedic';
import { PanchangData } from '../../types/domain';

export interface PanchangCardProps {
  /** Partial or full Panchang data for Varanasi ephemeris */
  data?: Partial<PanchangData>;
  /** Alias for data prop for ergonomic DX across screens */
  panchangData?: Partial<PanchangData>;
  /** Compact mode (shown on customer Home) */
  isCompact?: boolean;
  /** Full detail mode (shown on Explore ephemeris tab) */
  isFullDetail?: boolean;
  /** Optional press handler for opening full ephemeris calendar */
  onPress?: () => void;
  /** Container style overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

/**
 * PanchangCard — Authentic Varanasi Vedic Ephemeris Component
 * Styled according to Territory G and the approved Card Mockups:
 * - Card Top Bar: "TODAY'S PANCHANG" tag, date, and active Auspicious pill
 * - Vedic Data Grid: 2-column Tithi & Nakshatra cards
 * - Highlighted Shubh Muhurat (Abhijit) Banner with gold accent border
 * - Rahu Kaal Caution Box with time strip
 * - Telemetry Sunrise & Sunset Footer
 */
export const PanchangCard: React.FC<PanchangCardProps> = ({
  data,
  panchangData,
  isCompact = false,
  isFullDetail = false,
  onPress,
  style,
  testID = 'panchang-card',
}) => {
  const { colors, spacing, radii } = useTheme();
  const { language, pick } = useLanguage();
  const isHi = language === 'hi';

  const activeData = data ?? panchangData;

  const hasData =
    Boolean(activeData) &&
    Boolean(
      activeData?.tithi ||
        activeData?.nakshatra ||
        activeData?.yoga ||
        activeData?.karana ||
        activeData?.sunrise ||
        activeData?.rahukaalStart
    );

  const tithiValue = isHi
    ? activeData?.tithiHi || activeData?.tithi || '—'
    : activeData?.tithi || activeData?.tithiHi || '—';

  const nakshatraValue = isHi
    ? activeData?.nakshatraHi || activeData?.nakshatra || '—'
    : activeData?.nakshatra || activeData?.nakshatraHi || '—';

  const yogaValue = isHi
    ? activeData?.yogaHi || activeData?.yoga || '—'
    : activeData?.yoga || activeData?.yogaHi || '—';

  const karanaValue = isHi
    ? activeData?.karanaHi || activeData?.karana || '—'
    : activeData?.karana || activeData?.karanaHi || '—';

  const abhijeetTime =
    activeData?.abhijeetStart && activeData?.abhijeetEnd
      ? `${activeData.abhijeetStart} – ${activeData.abhijeetEnd}`
      : undefined;

  const rahukaalTime =
    activeData?.rahukaalStart && activeData?.rahukaalEnd
      ? `${activeData.rahukaalStart} – ${activeData.rahukaalEnd}`
      : undefined;

  const festivalName = isHi
    ? activeData?.festivalNameHi || activeData?.festivalName
    : activeData?.festivalName || activeData?.festivalNameHi;

  const cardBody = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: colors.borderDefault,
          borderRadius: radii.lg,
          padding: spacing.md,
        },
        style,
      ]}
      testID={testID}
      accessible={true}
      accessibilityRole={onPress ? 'button' : 'summary'}
      accessibilityLabel={`${isHi ? 'काशी दैनिक पंचांग' : "Today's Panchang"}, ${activeData?.date || 'Varanasi Ephemeris'}`}
    >
      {/* 1. Card Top Bar */}
      <View
        style={[
          styles.topBar,
          {
            borderBottomColor: colors.borderDefault,
            borderBottomWidth: 1,
            paddingBottom: spacing.xs,
            marginBottom: spacing.sm,
          },
        ]}
      >
        <View style={styles.topBarLeft}>
          <View
            style={[
              styles.panchangTag,
              {
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.xs,
                paddingHorizontal: spacing.xs,
                paddingVertical: 2,
                marginRight: spacing.xs,
              },
            ]}
          >
            <Text style={[styles.panchangTagText, { color: colors.brandPrimary }]}>
              {pick("दैनिक पंचांग", "TODAY'S PANCHANG")}
            </Text>
          </View>
          <Text style={[styles.ephemerisDate, { color: colors.textMuted }]}>
            {activeData?.date ? activeData.date : pick("वाराणसी पंचांग", "Varanasi Ephemeris")}
          </Text>
        </View>

        {/* Auspicious Status Pill / Festival Pill */}
        {festivalName ? (
          <View
            style={[
              styles.auspiciousPill,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderAccent,
                borderWidth: 1,
                borderRadius: radii.full,
                paddingHorizontal: spacing.xs,
                paddingVertical: 2,
              },
            ]}
          >
            <Text style={[styles.pillText, { color: colors.brandPrimary }]} numberOfLines={1}>
              {festivalName}
            </Text>
          </View>
        ) : activeData?.isAuspicious !== undefined ? (
          <View
            style={[
              styles.auspiciousPill,
              {
                backgroundColor: activeData.isAuspicious ? colors.successBg : colors.warningBg,
                borderColor: activeData.isAuspicious ? colors.statusActive : colors.warningFg,
                borderWidth: 1,
                borderRadius: radii.full,
                paddingHorizontal: spacing.xs,
                paddingVertical: 2,
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                { color: activeData.isAuspicious ? colors.statusActive : colors.warningFg },
              ]}
            >
              {activeData.isAuspicious
                ? pick("शुभ मुहूर्त", "Auspicious")
                : pick("सामान्य", "Neutral")}
            </Text>
          </View>
        ) : null}
      </View>

      {!hasData ? (
        /* Honest Empty State */
        <View
          style={[
            styles.emptyContainer,
            {
              backgroundColor: colors.surfaceSubtle,
              borderRadius: radii.md,
              padding: spacing.md,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="compass-off-outline"
            size={24}
            color={colors.textMuted}
            style={{ marginBottom: spacing.xs }}
          />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {pick("पंचांग डेटा उपलब्ध नहीं है", "Panchang data unavailable")}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted, marginTop: 2 }]}>
            {pick("वाराणसी पंचांग गणना उपलब्ध नहीं है", "Varanasi ephemeris is currently unavailable")}
          </Text>
        </View>
      ) : (
        <>
          {/* 2. Vedic Data Grid (Tithi & Nakshatra) */}
          <View style={styles.gridRow}>
            {/* Tithi Box */}
            <View
              style={[
                styles.metricCard,
                {
                  backgroundColor: colors.surfaceBase,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  borderRadius: radii.md,
                  padding: spacing.sm,
                  marginRight: spacing.xs,
                },
              ]}
            >
              <View style={styles.metricHeader}>
                <MaterialCommunityIcons
                  name="moon-waning-crescent"
                  size={15}
                  color={colors.brandPrimary}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                  {pick(PANCHANG_LABELS.tithi.hi, PANCHANG_LABELS.tithi.en)}
                </Text>
              </View>
              <Text
                style={[styles.metricMainValue, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {tithiValue}
              </Text>
              <Text style={[styles.metricSubText, { color: colors.textMuted }]}>
                {pick("शुक्ल पक्ष • काशी", "Shukla Paksha • Kashi")}
              </Text>
            </View>

            {/* Nakshatra Box */}
            <View
              style={[
                styles.metricCard,
                {
                  backgroundColor: colors.surfaceBase,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  borderRadius: radii.md,
                  padding: spacing.sm,
                  marginLeft: spacing.xs,
                },
              ]}
            >
              <View style={styles.metricHeader}>
                <MaterialCommunityIcons
                  name="star-four-points-outline"
                  size={15}
                  color={colors.brandPrimary}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                  {pick(PANCHANG_LABELS.nakshatra.hi, PANCHANG_LABELS.nakshatra.en)}
                </Text>
              </View>
              <Text
                style={[styles.metricMainValue, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {nakshatraValue}
              </Text>
              <Text style={[styles.metricSubText, { color: colors.textMuted }]}>
                {pick("शुभ नक्षत्र", "Auspicious Nakshatra")}
              </Text>
            </View>
          </View>

          {/* 3. Highlighted Shubh Muhurat (Abhijit) Banner */}
          {abhijeetTime && (
            <View
              style={[
                styles.shubhBanner,
                {
                  backgroundColor: colors.surfaceBase,
                  borderColor: colors.borderAccent,
                  borderWidth: 1.5,
                  borderRadius: radii.md,
                  padding: spacing.sm,
                  marginTop: spacing.xs,
                },
              ]}
            >
              <View style={styles.shubhLeft}>
                <View
                  style={[
                    styles.shubhIconCircle,
                    {
                      width: 32,
                      height: 32,
                      borderRadius: radii.full,
                      backgroundColor: colors.surfaceSubtle,
                      marginRight: spacing.sm,
                    },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={18} color={colors.statusActive} />
                </View>
                <View>
                  <Text style={[styles.shubhTitle, { color: colors.brandPrimary }]}>
                    {pick("शुभ मुहूर्त (अभिजित)", "Shubh Muhurat (Abhijit)")}
                  </Text>
                  <Text style={[styles.shubhTime, { color: colors.textPrimary }]}>
                    {abhijeetTime}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.shubhTag,
                  {
                    backgroundColor: colors.successBg,
                    borderColor: colors.statusActive,
                    borderWidth: 1,
                    borderRadius: radii.xs,
                    paddingHorizontal: spacing.xs,
                    paddingVertical: 2,
                  },
                ]}
              >
                <Text style={[styles.shubhTagText, { color: colors.statusActive }]}>
                  {pick("श्रेष्ठ समय", "Auspicious")}
                </Text>
              </View>
            </View>
          )}

          {/* 4. Rahu Kaal Caution Box */}
          {rahukaalTime && (
            <View
              style={[
                styles.rahuKaalRow,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                  marginTop: spacing.xs,
                },
              ]}
            >
              <View style={styles.rahuLeft}>
                <MaterialCommunityIcons
                  name="shield-alert-outline"
                  size={16}
                  color={colors.statusAlert}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.rahuLabel, { color: colors.textMuted }]}>
                  {pick("राहु काल (वर्जित):", "Rahu Kaal (Avoid Sankalp):")}
                </Text>
              </View>
              <Text style={[styles.rahuTime, { color: colors.statusAlert }]}>
                {rahukaalTime}
              </Text>
            </View>
          )}

          {/* Full Detail Mode: Extra Yoga and Karana Grid */}
          {isFullDetail && (
            <View style={[styles.gridRow, { marginTop: spacing.xs }]}>
              <View
                style={[
                  styles.metricCard,
                  {
                    backgroundColor: colors.surfaceBase,
                    borderColor: colors.borderDefault,
                    borderWidth: 1,
                    borderRadius: radii.md,
                    padding: spacing.sm,
                    marginRight: spacing.xs,
                  },
                ]}
              >
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                  {pick(PANCHANG_LABELS.yoga.hi, PANCHANG_LABELS.yoga.en)}
                </Text>
                <Text style={[styles.metricMainValue, { color: colors.textPrimary }]} numberOfLines={1}>
                  {yogaValue}
                </Text>
              </View>

              <View
                style={[
                  styles.metricCard,
                  {
                    backgroundColor: colors.surfaceBase,
                    borderColor: colors.borderDefault,
                    borderWidth: 1,
                    borderRadius: radii.md,
                    padding: spacing.sm,
                    marginLeft: spacing.xs,
                  },
                ]}
              >
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                  {pick(PANCHANG_LABELS.karana.hi, PANCHANG_LABELS.karana.en)}
                </Text>
                <Text style={[styles.metricMainValue, { color: colors.textPrimary }]} numberOfLines={1}>
                  {karanaValue}
                </Text>
              </View>
            </View>
          )}

          {/* 5. Telemetry Sunrise / Sunset Footer Row */}
          {(activeData?.sunrise || activeData?.sunset) && (
            <View
              style={[
                styles.telemetryFooter,
                {
                  borderTopColor: colors.borderDefault,
                  borderTopWidth: 1,
                  paddingTop: spacing.xs,
                  marginTop: spacing.sm,
                },
              ]}
            >
              <View style={styles.telemetryItem}>
                <MaterialCommunityIcons
                  name="weather-sunset-up"
                  size={16}
                  color={colors.brandPrimary}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.telemetryText, { color: colors.textMuted }]}>
                  {pick("सूर्योदय", "Sunrise")} {activeData?.sunrise || "06:12 AM"}
                </Text>
              </View>

              <View style={[styles.telemetryDivider, { backgroundColor: colors.borderDefault }]} />

              <View style={styles.telemetryItem}>
                <MaterialCommunityIcons
                  name="weather-sunset-down"
                  size={16}
                  color={colors.brandPrimary}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.telemetryText, { color: colors.textMuted }]}>
                  {pick("सूर्यास्त", "Sunset")} {activeData?.sunset || "05:48 PM"}
                </Text>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Open Full Ephemeris Calendar"
        style={styles.touchable}
      >
        {cardBody}
      </TouchableOpacity>
    );
  }

  return cardBody;
};

export const DailyPanchangWidget = PanchangCard;
export default PanchangCard;

const styles = StyleSheet.create({
  touchable: {
    width: '100%',
    minHeight: 48,
  },
  container: {
    width: '100%',
    borderWidth: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  panchangTag: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  panchangTagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  ephemerisDate: {
    fontSize: 12,
  },
  auspiciousPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  gridRow: {
    flexDirection: 'row',
  },
  metricCard: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 72,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  metricMainValue: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  metricSubText: {
    fontSize: 10,
  },
  shubhBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shubhLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  shubhIconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shubhTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  shubhTime: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  shubhTag: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shubhTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  rahuKaalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rahuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rahuLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  rahuTime: {
    fontSize: 11,
    fontWeight: '700',
  },
  telemetryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  telemetryItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  telemetryText: {
    fontSize: 11,
    fontWeight: '500',
  },
  telemetryDivider: {
    width: 1,
    height: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 11,
    textAlign: 'center',
  },
});

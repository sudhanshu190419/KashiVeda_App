import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { PANCHANG_LABELS } from '../../constants/vedic';
import { PanchangData } from '../../types/domain';

export interface PanchangCardProps {
  /** Partial or full Panchang data for Varanasi ephemeris */
  data?: Partial<PanchangData>;
  /** Alias for data prop for ergonomic DX across screens */
  panchangData?: Partial<PanchangData>;
  /** Compact mode shows 4 key metrics (Tithi, Nakshatra, Rahukaal, Abhijeet) */
  isCompact?: boolean;
  /** Full detail mode (explicitly disables compact mode) */
  isFullDetail?: boolean;
  /** Optional press handler for opening full ephemeris calendar */
  onPress?: () => void;
  /** Container style overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

interface MetricDisplayItem {
  key: string;
  labelEn: string;
  labelHi: string;
  value: string;
  icon: string;
  isAlert?: boolean;
  isAuspicious?: boolean;
}

/**
 * PanchangCard — Authentic Varanasi Vedic Ephemeris Component
 *
 * Displays up to 8 Shastric astronomical metrics sourced from PANCHANG_LABELS:
 * Tithi, Nakshatra, Yoga, Karana, Sunrise, Sunset, Rahukaal, and Abhijeet Muhurat.
 *
 * Adheres strictly to Zero Mock Data Policy: If ephemeris data is missing,
 * renders an honest empty state rather than fabricated metrics.
 */
export const PanchangCard: React.FC<PanchangCardProps> = ({
  data,
  panchangData,
  isCompact = false,
  isFullDetail,
  onPress,
  style,
  testID = 'panchang-card',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  const activeData = data ?? panchangData;
  const devanagariFont = 'NotoSansDevanagari-Regular';
  const devanagariTitleFont = 'NotoSansDevanagari-SemiBold';
  const scriptFont = (text: string | undefined) =>
    text && /[\u0900-\u097F]/.test(text)
      ? devanagariFont
      : typography.caption.fontFamily;
  const compactMode = isFullDetail !== undefined ? !isFullDetail : isCompact;

  // Determine if valid ephemeris metrics exist
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

  // Build formatted metric items
  const rahukaalValue =
    activeData?.rahukaalStart && activeData?.rahukaalEnd
      ? `${activeData.rahukaalStart} - ${activeData.rahukaalEnd}`
      : undefined;

  const abhijeetValue =
    activeData?.abhijeetStart && activeData?.abhijeetEnd
      ? `${activeData.abhijeetStart} - ${activeData.abhijeetEnd}`
      : undefined;

  const allMetrics: MetricDisplayItem[] = [
    {
      key: 'tithi',
      labelEn: PANCHANG_LABELS.tithi.en,
      labelHi: PANCHANG_LABELS.tithi.hi,
      value: (isHi ? activeData?.tithiHi ?? activeData?.tithi : activeData?.tithi ?? activeData?.tithiHi) || '—',
      icon: 'moon-waning-crescent',
    },
    {
      key: 'nakshatra',
      labelEn: PANCHANG_LABELS.nakshatra.en,
      labelHi: PANCHANG_LABELS.nakshatra.hi,
      value: (isHi ? activeData?.nakshatraHi ?? activeData?.nakshatra : activeData?.nakshatra ?? activeData?.nakshatraHi) || '—',
      icon: 'star-four-points-outline',
    },
    {
      key: 'rahukaal',
      labelEn: PANCHANG_LABELS.rahukaal.en,
      labelHi: PANCHANG_LABELS.rahukaal.hi,
      value: rahukaalValue || '—',
      icon: 'shield-alert-outline',
      isAlert: true,
    },
    {
      key: 'abhijeet',
      labelEn: PANCHANG_LABELS.abhijeet.en,
      labelHi: PANCHANG_LABELS.abhijeet.hi,
      value: abhijeetValue || '—',
      icon: 'weather-sunny',
      isAuspicious: true,
    },
    {
      key: 'yoga',
      labelEn: PANCHANG_LABELS.yoga.en,
      labelHi: PANCHANG_LABELS.yoga.hi,
      value: (isHi ? activeData?.yogaHi ?? activeData?.yoga : activeData?.yoga ?? activeData?.yogaHi) || '—',
      icon: 'meditation',
    },
    {
      key: 'karana',
      labelEn: PANCHANG_LABELS.karana.en,
      labelHi: PANCHANG_LABELS.karana.hi,
      value: (isHi ? activeData?.karanaHi ?? activeData?.karana : activeData?.karana ?? activeData?.karanaHi) || '—',
      icon: 'circle-slice-6',
    },
    {
      key: 'sunrise',
      labelEn: PANCHANG_LABELS.sunrise.en,
      labelHi: PANCHANG_LABELS.sunrise.hi,
      value: activeData?.sunrise ? `${activeData.sunrise} IST` : '—',
      icon: 'weather-sunset-up',
    },
    {
      key: 'sunset',
      labelEn: PANCHANG_LABELS.sunset.en,
      labelHi: PANCHANG_LABELS.sunset.hi,
      value: activeData?.sunset ? `${activeData.sunset} IST` : '—',
      icon: 'weather-sunset-down',
    },
  ];

  const displayedMetrics = compactMode ? allMetrics.slice(0, 4) : allMetrics;

  const cardContent = (
    <View
      style={[
        styles.cardContainer,
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
      accessibilityRole={onPress ? 'button' : 'summary'}
      accessibilityLabel={`${isHi ? 'काशी दैनिक पंचांग' : 'Kashi Daily Panchang'}, ${data?.date || (isHi ? 'वाराणसी पंचांग' : 'Varanasi Ephemeris')}`}
    >
      {/* Header bar */}
      <View style={[styles.headerRow, { marginBottom: spacing.sm }]}>
        <View style={styles.headerTitleContainer}>
          <View
            style={[
              styles.iconWrapper,
              {
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.full,
                marginRight: spacing.sm,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="calendar-clock"
              size={18}
              color={colors.brandPrimary}
            />
          </View>
          <View>
            <Text
              style={[
                styles.titleHi,
                {
                  color: colors.textPrimary,
                  fontFamily: isHi ? devanagariTitleFont : typography.titleSmall.fontFamily,
                  fontSize: typography.titleSmall.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
                },
              ]}
            >
              {isHi ? 'काशी दैनिक पंचांग' : 'Kashi Daily Panchang'}
            </Text>
            <Text
              style={[
                styles.subtitleEn,
                {
                  color: colors.textMuted,
                  fontFamily: isHi ? devanagariFont : typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                  lineHeight: isHi
                    ? getDevanagariLineHeight(typography.caption.fontSize)
                    : typography.caption.lineHeight,
                },
              ]}
            >
              {isHi ? 'वाराणसी पंचांग' : 'Varanasi Ephemeris'}
              {data?.date ? ` • ${data.date}` : ''}
            </Text>
          </View>
        </View>

        {/* Auspicious Badge / Alert Status */}
        {hasData && (
          <View style={styles.badgeRow}>
            {data?.isAuspicious !== undefined && (
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: data.isAuspicious
                      ? colors.successBg
                      : colors.warningBg,
                    borderColor: data.isAuspicious
                      ? colors.statusActive
                      : colors.warningFg,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                  },
                ]}
              >
                <Ionicons
                  name={data.isAuspicious ? 'checkmark-circle' : 'time-outline'}
                  size={12}
                  color={data.isAuspicious ? colors.statusActive : colors.warningFg}
                  style={styles.badgeIcon}
                />
                <Text
                  style={[
                    styles.statusText,
                    {
                      color: data.isAuspicious
                        ? colors.statusActive
                        : colors.warningFg,
                      fontFamily: typography.caption.fontFamily,
                      fontSize: typography.caption.fontSize,
                      lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                    },
                  ]}
                >
                  {isHi
                    ? data.isAuspicious
                      ? 'शुभ मुहूर्त'
                      : 'सामान्य'
                    : data.isAuspicious
                      ? 'Auspicious'
                      : 'Neutral'}
                </Text>
              </View>
            )}

            {onPress && (
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
                style={{ marginLeft: spacing.xs }}
              />
            )}
          </View>
        )}
      </View>

      {/* Festival Ribbon if present */}
      {(data?.festivalNameHi || data?.festivalName) && (
        <View
          style={[
            styles.festivalBanner,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderAccent,
              borderRadius: radii.md,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
              marginBottom: spacing.sm,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="om"
            size={16}
            color={colors.brandPrimary}
            style={{ marginRight: spacing.xs }}
          />
          <Text
            style={[
              styles.festivalText,
              {
                color: colors.brandPrimary,
                fontFamily: typography.titleSmall.fontFamily,
                fontSize: typography.titleSmall.fontSize,
                lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
              },
            ]}
            numberOfLines={1}
          >
            {isHi
              ? data.festivalNameHi ?? data.festivalName
              : data.festivalName ?? data.festivalNameHi}
          </Text>
        </View>
      )}

      {/* Content Section: Honest Empty State or Metrics Grid */}
      {!hasData ? (
        <View
          style={[
            styles.emptyStateContainer,
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
          <Text
            style={[
              styles.emptyTitle,
              {
                color: colors.textPrimary,
                fontFamily: typography.titleSmall.fontFamily,
                fontSize: typography.titleSmall.fontSize,
                lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
              },
            ]}
          >
            {isHi ? 'पंचांग डेटा उपलब्ध नहीं है' : 'Panchang data unavailable'}
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              {
                color: colors.textMuted,
                fontFamily: isHi ? devanagariFont : typography.caption.fontFamily,
                fontSize: typography.caption.fontSize,
                lineHeight: isHi
                  ? getDevanagariLineHeight(typography.caption.fontSize)
                  : typography.caption.lineHeight,
              },
            ]}
          >
            {isHi
              ? 'वाराणसी पंचांग गणना उपलब्ध नहीं है'
              : 'Varanasi ephemeris is currently unavailable'}
          </Text>
        </View>
      ) : (
        <View style={styles.metricsGrid}>
          {displayedMetrics.map((item) => {
            const isAlert = item.isAlert && item.value !== '—';
            const isAuspicious = item.isAuspicious && item.value !== '—';

            let itemBg = colors.surfaceBase;
            let itemBorder = colors.borderDefault;
            let iconColor = colors.brandPrimary;

            if (isAlert) {
              itemBg = colors.errorBg;
              itemBorder = colors.statusAlert;
              iconColor = colors.statusAlert;
            } else if (isAuspicious) {
              itemBg = colors.successBg;
              itemBorder = colors.statusActive;
              iconColor = colors.statusActive;
            }

            return (
              <View
                key={item.key}
                style={[
                  styles.metricCell,
                  {
                    backgroundColor: itemBg,
                    borderColor: itemBorder,
                    borderRadius: radii.md,
                    padding: spacing.sm,
                    marginBottom: spacing.xs,
                  },
                ]}
              >
                <View style={styles.metricHeader}>
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={14}
                    color={iconColor}
                    style={{ marginRight: spacing.xxs }}
                  />
                  <Text
                    style={[
                      styles.metricLabel,
                      {
                        color: colors.textMuted,
                        fontFamily: isHi ? devanagariFont : typography.caption.fontFamily,
                        fontSize: typography.caption.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {isHi ? item.labelHi : item.labelEn}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.metricValue,
                    {
                      color: isAlert
                        ? colors.statusAlert
                        : isAuspicious
                        ? colors.statusActive
                        : colors.textPrimary,
                      fontFamily: scriptFont(item.value),
                      fontSize: item.value.length > 15 ? 12 : typography.labelLarge.fontSize,
                      lineHeight: getDevanagariLineHeight(item.value.length > 15 ? 12 : typography.labelLarge.fontSize),
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit={true}
                  minimumFontScale={0.75}
                >
                  {item.value}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {cardContent}
      </Pressable>
    );
  }

  return cardContent;
};

export const DailyPanchangWidget = PanchangCard;

export default PanchangCard;

const styles = StyleSheet.create({
  cardContainer: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleHi: {
    fontWeight: '600',
  },
  subtitleEn: {
    marginTop: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  badgeIcon: {
    marginRight: 4,
  },
  statusText: {
    fontWeight: '600',
  },
  festivalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  festivalText: {
    fontWeight: '600',
    flex: 1,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
  },
  emptyTitle: {
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricCell: {
    width: '48.5%',
    borderWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  metricLabel: {
    flex: 1,
  },
  metricValue: {
    fontWeight: '700',
  },
});

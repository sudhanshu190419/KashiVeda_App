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

export interface PanditRatingCardProps {
  /** Average quantitative rating (e.g., 4.9) */
  rating: number;
  /** Total count of devotee reviews */
  totalReviews?: number;
  /** Whether the Pandit holds an authenticated academic certificate */
  verified?: boolean;
  /** Sponsoring or Alma Mater institution (English) */
  institutionName?: string;
  /** Alma Mater institution (Hindi) */
  institutionNameHi?: string;
  /** Whether to expand the 1 to 5 star rating distribution */
  showBreakdown?: boolean;
  /** Star breakdown count map: e.g. { 5: 120, 4: 25, 3: 4, 2: 1, 1: 0 } */
  ratingBreakdown?: { [star: number]: number };
  /** Handler invoked when user taps to view all devotee reviews */
  onPressReviews?: () => void;
  /** Container styling overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

/**
 * PanditRatingCard — Vedic Scholar Quantitative Reputation & Verification Display
 *
 * Renders star ratings, Varanasi academic accreditation badge,
 * and optional 5-tier review histogram bars.
 */
export const PanditRatingCard: React.FC<PanditRatingCardProps> = ({
  rating,
  totalReviews = 0,
  verified = false,
  institutionName,
  institutionNameHi,
  showBreakdown = false,
  ratingBreakdown,
  onPressReviews,
  style,
  testID = 'pandit-rating-card',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  const formattedRating = Math.min(5, Math.max(0, rating)).toFixed(1);
  const displayInstitution = isHi ? institutionNameHi || institutionName : institutionName;

  // Compute breakdown percentages
  const breakdownRows = [5, 4, 3, 2, 1].map((stars) => {
    const count = ratingBreakdown?.[stars] ?? 0;
    const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
    return { stars, count, percentage };
  });

  return (
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
      accessibilityRole="none"
      accessibilityLabel={
        isHi
          ? `पंडित जी रेटिंग ${formattedRating} स्टार, कुल ${totalReviews} समीक्षाएं`
          : `Scholar rating ${formattedRating} stars from ${totalReviews} reviews`
      }
    >
      {/* Top Section: Rating Score & Verified Badge */}
      <View style={styles.topRow}>
        <View style={styles.scoreWrap}>
          <Text
            style={[
              styles.ratingScore,
              {
                color: colors.brandPrimary,
                fontFamily: typography.displayHero.fontFamily,
                fontSize: 32,
                lineHeight: 38,
              },
            ]}
          >
            {formattedRating}
          </Text>
          <View style={{ marginLeft: spacing.sm }}>
            {/* 5-Star Row */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((starIndex) => {
                const filled = starIndex <= Math.round(rating);
                return (
                  <Ionicons
                    key={starIndex}
                    name={filled ? 'star' : 'star-outline'}
                    size={16}
                    color={filled ? colors.brandPrimary : colors.borderDefault}
                    style={{ marginRight: 2 }}
                  />
                );
              })}
            </View>
            <Text
              style={[
                styles.reviewCountText,
                {
                  color: colors.textMuted,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                  lineHeight: typography.caption.lineHeight,
                  marginTop: 2,
                },
              ]}
            >
              {totalReviews > 0
                ? isHi
                  ? `${totalReviews} समीक्षाएं`
                  : `${totalReviews} reviews`
                : isHi
                ? 'नई प्रोफ़ाइल'
                : 'New profile'}
            </Text>
          </View>
        </View>

        {/* Academic verification badge */}
        {verified && (
          <View
            style={[
              styles.verifiedBadge,
              {
                backgroundColor: colors.successBg,
                borderColor: colors.statusActive,
                borderRadius: radii.full,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xxs,
              },
            ]}
          >
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={colors.statusActive}
              style={{ marginRight: 3 }}
            />
            <Text
              style={[
                styles.verifiedText,
                {
                  color: colors.statusActive,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: 11,
                  lineHeight: getDevanagariLineHeight(11),
                },
              ]}
            >
              {isHi ? 'प्रमाणित विद्वान' : 'Verified scholar'}
            </Text>
          </View>
        )}
      </View>

      {/* Sponsoring/Graduating Institution in Kashi */}
      {(institutionNameHi || institutionName) && (
        <View
          style={[
            styles.institutionWrap,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderAccent,
              borderRadius: radii.md,
              padding: spacing.sm,
              marginTop: spacing.sm,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="school-outline"
            size={16}
            color={colors.brandPrimary}
            style={{ marginRight: spacing.xs }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.institutionTextHi,
                {
                  color: colors.brandPrimary,
                  fontFamily: typography.titleSmall.fontFamily,
                  fontSize: typography.titleSmall.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
                },
              ]}
              numberOfLines={1}
            >
              {displayInstitution}
            </Text>
          </View>
        </View>
      )}

      {/* 5-Tier Star Breakdown Bars */}
      {showBreakdown && (
        <View style={[styles.breakdownContainer, { marginTop: spacing.md }]}>
          {breakdownRows.map((row) => (
            <View key={row.stars} style={styles.breakdownRow}>
              <View style={styles.starNumberLabel}>
                <Text
                  style={[
                    styles.starNumberText,
                    {
                      color: colors.textPrimary,
                      fontFamily: typography.caption.fontFamily,
                      fontSize: 11,
                    },
                  ]}
                >
                  {row.stars} ★
                </Text>
              </View>
              {/* Progress track */}
              <View
                style={[
                  styles.progressTrack,
                  {
                    backgroundColor: colors.surfaceBase,
                    borderColor: colors.borderDefault,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(100, Math.max(0, row.percentage))}%`,
                      backgroundColor: colors.brandPrimary,
                      borderRadius: radii.full,
                    },
                  ]}
                />
              </View>
              <View style={styles.rowCountLabel}>
                <Text
                  style={[
                    styles.rowCountText,
                    {
                      color: colors.textMuted,
                      fontFamily: typography.caption.fontFamily,
                      fontSize: 10,
                    },
                  ]}
                >
                  {row.count}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Devotee Reviews Tap CTA */}
      {onPressReviews && (
        <Pressable
          onPress={onPressReviews}
          style={({ pressed }) => [
            styles.reviewsCtaWrap,
            {
              borderTopColor: colors.borderDefault,
              borderTopWidth: 1,
              marginTop: spacing.sm,
              paddingTop: spacing.sm,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={isHi ? 'सभी यजमान समीक्षाएं देखें' : 'View all devotee reviews'}
        >
          <Text
            style={[
              styles.reviewsCtaText,
              {
                color: colors.brandPrimary,
                fontFamily: typography.labelLarge.fontFamily,
                fontSize: typography.labelLarge.fontSize,
                lineHeight: getDevanagariLineHeight(typography.labelLarge.fontSize),
              },
            ]}
          >
            {isHi ? 'सभी यजमान समीक्षाएं देखें' : 'View all reviews'}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.brandPrimary}
          />
        </Pressable>
      )}
    </View>
  );
};

export default PanditRatingCard;

const styles = StyleSheet.create({
  cardContainer: {
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingScore: {
    fontWeight: '700',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewCountText: {
    fontWeight: '500',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  verifiedText: {
    fontWeight: '700',
  },
  institutionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  institutionTextHi: {
    fontWeight: '600',
  },
  institutionTextEn: {
    marginTop: 1,
  },
  breakdownContainer: {
    width: '100%',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  starNumberLabel: {
    width: 28,
  },
  starNumberText: {
    fontWeight: '600',
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderWidth: 0.5,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  progressFill: {
    height: '100%',
  },
  rowCountLabel: {
    width: 32,
    alignItems: 'flex-end',
  },
  rowCountText: {
    fontWeight: '500',
  },
  reviewsCtaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  reviewsCtaText: {
    fontWeight: '700',
  },
});

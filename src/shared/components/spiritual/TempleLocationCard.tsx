import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { VARANASI_GHATS } from '../../constants/vedic';

export interface TempleLocationCardProps {
  /** Temple or shrine name (English) */
  templeName: string;
  /** Temple or shrine name in Devanagari (Hindi) */
  templeNameHi?: string;
  /** Spiritual significance (English) */
  significanceEn?: string;
  /** Spiritual significance (Hindi) */
  significanceHi?: string;
  /** Optional reference to authentic Varanasi Ghat (assi, dashashwamedh, manikarnika, etc.) */
  ghatId?: string;
  /** Estimated distance from devotee/pandit in kilometers */
  distanceKm?: number;
  /** Action handler when devotee taps "मार्ग दर्शन / Directions" */
  onDirectionsPress?: () => void;
  /** Container styling overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

/**
 * TempleLocationCard — Sacred Varanasi Temple & Ghat Visit Card
 *
 * References authentic Ghats along the sacred Ganga from VARANASI_GHATS,
 * highlighting Shastric significance, geographical distance, and navigation CTA.
 */
export const TempleLocationCard: React.FC<TempleLocationCardProps> = ({
  templeName,
  templeNameHi,
  significanceEn,
  significanceHi,
  ghatId,
  distanceKm,
  onDirectionsPress,
  style,
  testID = 'temple-location-card',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  // Find authentic Ghat record if ghatId is provided
  const matchedGhat = useMemo(() => {
    if (!ghatId) return null;
    return VARANASI_GHATS.find((g) => g.id === ghatId) || null;
  }, [ghatId]);

  const displayTitleHi = templeNameHi || matchedGhat?.nameHi || templeName;
  const displayTitleEn = templeName || matchedGhat?.nameEn || displayTitleHi;
  const displaySignificanceHi =
    significanceHi || matchedGhat?.significanceHi || '';
  const displaySignificanceEn =
    significanceEn || matchedGhat?.significanceEn || '';

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
        isHi ? `तीर्थ स्थल: ${displayTitleHi}` : `Sacred site: ${displayTitleEn}`
      }
    >
      {/* Header Row */}
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
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
              name="hydro-power"
              size={18}
              color={colors.brandPrimary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.titleHi,
                {
                  color: colors.textPrimary,
                  fontFamily: typography.titleMedium.fontFamily,
                  fontSize: typography.titleMedium.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.titleMedium.fontSize),
                },
              ]}
              numberOfLines={1}
            >
              {isHi ? displayTitleHi : displayTitleEn}
            </Text>
          </View>
        </View>

        {/* Distance Badge */}
        {distanceKm !== undefined && (
          <View
            style={[
              styles.distancePill,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderAccent,
                borderRadius: radii.full,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xxs,
              },
            ]}
          >
            <Ionicons
              name="location"
              size={12}
              color={colors.brandPrimary}
              style={{ marginRight: 2 }}
            />
            <Text
              style={[
                styles.distanceText,
                {
                  color: colors.brandPrimary,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                  lineHeight: typography.caption.lineHeight,
                },
              ]}
            >
              {distanceKm.toFixed(1)} {isHi ? 'किमी' : 'km'}
            </Text>
          </View>
        )}
      </View>

      {/* Ghat Affiliation Ribbon if matched */}
      {matchedGhat && (
        <View
          style={[
            styles.ghatAffiliationBanner,
            {
              backgroundColor: colors.surfaceBase,
              borderColor: colors.borderDefault,
              borderRadius: radii.md,
              padding: spacing.xs,
              marginVertical: spacing.xs,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="waves"
            size={14}
            color={colors.brandPrimary}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.ghatBannerText,
              {
                color: colors.brandPrimary,
                fontFamily: typography.caption.fontFamily,
                fontSize: typography.caption.fontSize,
                lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                flex: 1,
              },
            ]}
          >
            {isHi ? 'काशी गंगा तट' : 'Kashi ghat'}:{' '}
            {isHi ? matchedGhat.nameHi : matchedGhat.nameEn}
          </Text>
        </View>
      )}

      {/* Spiritual Significance Box */}
      {(displaySignificanceHi || displaySignificanceEn) && (
        <View
          style={[
            styles.significanceBox,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderAccent,
              borderRadius: radii.md,
              padding: spacing.sm,
              marginVertical: spacing.xs,
            },
          ]}
        >
          <Text
            style={[
              styles.significanceHi,
              {
                color: colors.textPrimary,
                fontFamily: typography.bodyMedium.fontFamily,
                fontSize: typography.bodyMedium.fontSize,
                lineHeight: getDevanagariLineHeight(typography.bodyMedium.fontSize),
              },
            ]}
          >
            {isHi ? displaySignificanceHi : displaySignificanceEn}
          </Text>
        </View>
      )}

      {/* Directions Action Button — 48dp Touch Target Floor */}
      {onDirectionsPress && (
        <Pressable
          onPress={onDirectionsPress}
          style={({ pressed }) => [
            styles.directionsButton,
            {
              backgroundColor: colors.brandPrimary,
              borderRadius: radii.md,
              paddingHorizontal: spacing.md,
              opacity: pressed ? 0.88 : 1,
              marginTop: spacing.xs,
            },
          ]}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={
            isHi
              ? `मार्ग दर्शन: ${displayTitleHi}`
              : `Get directions to ${displayTitleEn}`
          }
        >
          <Ionicons
            name="navigate"
            size={18}
            color={colors.textOnPrimary}
            style={{ marginRight: spacing.xs }}
          />
          <Text
            style={[
              styles.directionsButtonText,
              {
                color: colors.textOnPrimary,
                fontFamily: typography.labelLarge.fontFamily,
                fontSize: typography.labelLarge.fontSize,
                lineHeight: getDevanagariLineHeight(typography.labelLarge.fontSize),
              },
            ]}
          >
            {isHi ? 'मार्ग दर्शन' : 'Get directions'}
          </Text>
        </Pressable>
      )}
    </View>
  );
};

export default TempleLocationCard;

const styles = StyleSheet.create({
  cardContainer: {
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleHi: {
    fontWeight: '700',
  },
  titleEn: {
    marginTop: 1,
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  distanceText: {
    fontWeight: '600',
  },
  ghatAffiliationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  ghatBannerText: {
    fontWeight: '600',
  },
  significanceBox: {
    borderWidth: 1,
  },
  significanceHi: {
    fontWeight: '500',
  },
  significanceEn: {
    fontStyle: 'italic',
  },
  directionsButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionsButtonText: {
    fontWeight: '700',
  },
});

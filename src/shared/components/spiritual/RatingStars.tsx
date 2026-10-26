import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme } from '../../theme';

export interface RatingStarsProps {
  /** Numerical rating value (0 to 5) */
  rating: number;
  /** Maximum number of stars (defaults to 5) */
  maxStars?: number;
  /** Size of each star icon in dp (defaults to 20) */
  size?: number;
  /** Whether user can tap stars to set a rating */
  isInteractive?: boolean;
  /** Callback fired when user taps a star in interactive mode */
  onRate?: (rating: number) => void;
  /** Optional review count number to display next to stars */
  reviewCount?: number;
  /** Whether to display the numerical rating label */
  showNumber?: boolean;
  /** Container styling overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

/**
 * RatingStars — Auspicious Vedic Star Rating Component
 *
 * Supports both read-only scholar reputation displays (C-05) and interactive
 * post-puja devotee review input (C-14).
 *
 * Enforces:
 * - 48x48dp minimum touch bounds for interactive stars
 * - Temple Amber brandPrimary star fill colors
 * - Half-star and whole-star rendering
 * - Fully accessible radio/rating semantics
 */
export const RatingStars: React.FC<RatingStarsProps> = ({
  rating,
  maxStars = 5,
  size = 20,
  isInteractive = false,
  onRate,
  reviewCount,
  showNumber = false,
  style,
  testID = 'rating-stars',
}) => {
  const { colors, typography, spacing } = useTheme();

  const clampedRating = Math.min(maxStars, Math.max(0, rating));

  return (
    <View
      style={[styles.container, style]}
      testID={testID}
      accessible={true}
      accessibilityRole={isInteractive ? 'adjustable' : 'none'}
      accessibilityLabel={`Rating: ${clampedRating.toFixed(1)} of ${maxStars} stars${
        reviewCount !== undefined ? `, based on ${reviewCount} reviews` : ''
      }`}
    >
      <View style={styles.starsRow}>
        {Array.from({ length: maxStars }).map((_, index) => {
          const starNumber = index + 1;
          const isFull = clampedRating >= starNumber;
          const isHalf = !isFull && clampedRating >= starNumber - 0.5;

          const starIconName: string = isFull
            ? 'star'
            : isHalf
            ? 'star-half'
            : 'star-outline';

          const starColor = isFull || isHalf ? colors.brandPrimary : colors.borderDefault;

          if (isInteractive && onRate) {
            return (
              <Pressable
                key={`star-touch-${starNumber}`}
                onPress={() => onRate(starNumber)}
                style={styles.interactiveStarTarget}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${starNumber} out of ${maxStars} stars`}
              >
                <Ionicons
                  name={starIconName}
                  size={Math.max(size, 24)}
                  color={starColor}
                />
              </Pressable>
            );
          }

          return (
            <Ionicons
              key={`star-static-${starNumber}`}
              name={starIconName}
              size={size}
              color={starColor}
              style={{ marginRight: 2 }}
            />
          );
        })}
      </View>

      {/* Optional numerical score */}
      {showNumber ? (
        <Text
          style={[
            styles.ratingNumber,
            {
              color: colors.brandPrimary,
              fontFamily: typography.labelLarge.fontFamily,
              fontSize: typography.labelLarge.fontSize,
              marginLeft: spacing.xs,
            },
          ]}
        >
          {clampedRating.toFixed(1)}
        </Text>
      ) : null}

      {/* Optional Review Count Badge */}
      {reviewCount !== undefined ? (
        <Text
          style={[
            styles.reviewCountText,
            {
              color: colors.textMuted,
              fontFamily: typography.caption.fontFamily,
              fontSize: typography.caption.fontSize,
              marginLeft: spacing.xs,
            },
          ]}
        >
          ({reviewCount})
        </Text>
      ) : null}
    </View>
  );
};

export default RatingStars;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  interactiveStarTarget: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingNumber: {
    fontWeight: '700',
  },
  reviewCountText: {
    fontWeight: '500',
  },
});

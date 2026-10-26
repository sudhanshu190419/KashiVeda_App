import React, { useEffect } from 'react';
import {
  StyleSheet,
  StyleProp,
  ViewStyle,
  DimensionValue,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { useTheme, RadiusTokens } from '../../theme';

export type VShimmerVariant = 'card' | 'circle' | 'text' | 'rect';

export interface VShimmerProps {
  /** Geometry preset: 'card' (default 12dp radius), 'circle', 'text', or 'rect' */
  variant?: VShimmerVariant;
  /** Width dimension in dp, percent, or 'auto' */
  width?: DimensionValue;
  /** Height dimension in dp, percent, or 'auto' */
  height?: DimensionValue;
  /** Corner radius token or raw dp value (defaults to theme.radii.lg = 12dp) */
  radius?: keyof RadiusTokens | number;
  /** Cycle duration in ms (defaults to theme.motion.shimmer.cycle = 1500ms) */
  duration?: number;
  /** Custom container style override */
  style?: StyleProp<ViewStyle>;
  /** Optional nested children */
  children?: React.ReactNode;
  /** Custom accessibility label */
  accessibilityLabel?: string;
  /** Test identifier */
  testID?: string;
}

export type SkeletonProps = VShimmerProps;

/**
 * VShimmer — Reanimated shimmer/skeleton placeholder matching card geometry.
 *
 * Enforces:
 * - Card geometry with 12dp radius (`radii.lg`)
 * - Looping pulse/shimmer animation across theme surface colors (`surfaceCard` -> `surfaceSubtle`)
 * - Uses token cycle speed (`motion.shimmer.cycle` = 1500ms)
 * - Zero raw hex codes or untokenized values
 */
export const VShimmer: React.FC<VShimmerProps> = ({
  variant = 'card',
  width,
  height,
  radius,
  duration,
  style,
  children,
  accessibilityLabel = 'Loading placeholder',
  testID,
}) => {
  const theme = useTheme();
  const progress = useSharedValue(0);

  const cycleDuration = duration ?? theme.motion.shimmer.cycle;

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: cycleDuration,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [progress, cycleDuration]);

  // Interpolate across surface card and surface subtle tokens
  const startColor = theme.colors.surfaceCard;
  const endColor = theme.colors.surfaceSubtle;

  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [startColor, endColor]
    );
    return { backgroundColor };
  });

  // Calculate default geometry based on variant
  const resolvedRadius = React.useMemo(() => {
    if (radius !== undefined) {
      return typeof radius === 'number' ? radius : theme.radii[radius];
    }
    switch (variant) {
      case 'circle':
        return theme.radii.full;
      case 'text':
        return theme.radii.sm;
      case 'rect':
      case 'card':
      default:
        return theme.radii.lg; // 12dp card geometry per specification
    }
  }, [radius, variant, theme.radii]);

  const resolvedWidth: DimensionValue = React.useMemo(() => {
    if (width !== undefined) return width;
    switch (variant) {
      case 'circle':
        return 40;
      case 'text':
      case 'card':
      case 'rect':
      default:
        return '100%';
    }
  }, [width, variant]);

  const resolvedHeight: DimensionValue = React.useMemo(() => {
    if (height !== undefined) return height;
    switch (variant) {
      case 'circle':
        return 40;
      case 'text':
        return 16;
      case 'card':
        return 120;
      case 'rect':
      default:
        return 48;
    }
  }, [height, variant]);

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        {
          width: resolvedWidth,
          height: resolvedHeight,
          borderRadius: resolvedRadius,
        },
        animatedStyle,
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});

export default VShimmer;

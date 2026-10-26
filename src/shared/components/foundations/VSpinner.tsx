import React, { useEffect } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme, ThemeColors } from '../../theme';

export type VSpinnerSize = 'sm' | 'md' | 'lg' | number;

export interface VSpinnerProps {
  /** Sizing scale: sm (16dp), md (24dp), lg (36dp) or custom dp number */
  size?: VSpinnerSize;
  /** Color token or hex value (defaults to theme.colors.brandPrimary) */
  color?: keyof ThemeColors | string;
  /** Background track color */
  trackColor?: string;
  /** Custom stroke width in dp */
  strokeWidth?: number;
  /** Animation driver mode: 'reanimated' (default, continuous GPU rotation) or 'native' */
  mode?: 'reanimated' | 'native';
  /** Style override */
  style?: StyleProp<ViewStyle>;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Test identifier */
  testID?: string;
}

export type SpinnerProps = VSpinnerProps;

const SIZE_MAP: Record<'sm' | 'md' | 'lg', { diameter: number; stroke: number }> = {
  sm: { diameter: 16, stroke: 2 },
  md: { diameter: 24, stroke: 2.5 },
  lg: { diameter: 36, stroke: 3.5 },
};

/**
 * Resolves color token key or string to valid color.
 */
function resolveSpinnerColor(
  colorKey: keyof ThemeColors | string | undefined,
  colors: ThemeColors
): string {
  if (!colorKey) {
    return colors.brandPrimary;
  }
  if (colorKey in colors) {
    const val = colors[colorKey as keyof ThemeColors];
    return typeof val === 'string' ? val : colors.brandPrimary;
  }
  return colorKey;
}

/**
 * VSpinner — Circular activity indicator themed to brandPrimary.
 *
 * Enforces:
 * - Precise sizes: sm (16dp), md (24dp), lg (36dp)
 * - Themed by default to `colors.brandPrimary`
 * - Smooth 60/120fps continuous rotation using Reanimated
 * - Optional native `ActivityIndicator` fallback
 * - Zero raw hex codes
 */
export const VSpinner: React.FC<VSpinnerProps> = ({
  size = 'md',
  color = 'brandPrimary',
  trackColor,
  strokeWidth: customStrokeWidth,
  mode = 'reanimated',
  style,
  accessibilityLabel = 'Loading',
  testID,
}) => {
  const theme = useTheme();

  // Compute dimensions
  const { diameter, stroke } = React.useMemo(() => {
    if (typeof size === 'number') {
      const computedStroke = customStrokeWidth ?? Math.max(2, size * 0.1);
      return { diameter: size, stroke: computedStroke };
    }
    const preset = SIZE_MAP[size] ?? SIZE_MAP.md;
    return {
      diameter: preset.diameter,
      stroke: customStrokeWidth ?? preset.stroke,
    };
  }, [size, customStrokeWidth]);

  const spinnerColor = resolveSpinnerColor(color, theme.colors);
  const resolvedTrackColor = trackColor ?? theme.colors.surfaceSubtle;

  // Reanimated continuous rotation loop
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (mode === 'reanimated') {
      rotation.value = withRepeat(
        withTiming(360, {
          duration: 850,
          easing: Easing.linear,
        }),
        -1,
        false
      );
    }
  }, [mode, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (mode === 'native') {
    return (
      <View
        testID={testID}
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.container,
          { width: diameter, height: diameter },
          style,
        ]}
      >
        <ActivityIndicator
          size={diameter <= 20 ? 'small' : 'large'}
          color={spinnerColor}
        />
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.container,
        { width: diameter, height: diameter },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            width: diameter,
            height: diameter,
            borderRadius: diameter / 2,
            borderWidth: stroke,
            borderColor: resolvedTrackColor,
            borderTopColor: spinnerColor,
            borderRightColor: spinnerColor,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default VSpinner;

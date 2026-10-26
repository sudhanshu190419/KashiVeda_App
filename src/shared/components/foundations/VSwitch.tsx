import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {
  useTheme,
  MIN_FONT_SIZE,
  getDevanagariTextStyle,
} from '../../theme';

export interface VSwitchProps {
  /** Current switch toggle state */
  value: boolean;
  /** Callback fired when switch is toggled */
  onToggle: (value: boolean) => void;
  /** Primary label displayed beside the switch */
  label?: string;
  /** Secondary explanatory sub-label displayed under primary label */
  subLabel?: string;
  /** Disables switch toggle and dims opacity */
  isDisabled?: boolean;
  /** Accessibility label for screen readers */
  accessibilityLabel?: string;
  /** Accessibility hint for screen readers */
  accessibilityHint?: string;
  /** Test identifier */
  testID?: string;
  /** Outer container style override */
  containerStyle?: StyleProp<ViewStyle>;
  /** Explicit Devanagari script override (auto-detected if undefined) */
  isDevanagari?: boolean;
}

export type SwitchProps = VSwitchProps;

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

const TRACK_WIDTH = 50;
const TRACK_HEIGHT = 28;
const THUMB_SIZE = 22;
const THUMB_PADDING = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_PADDING * 2; // 22dp

export const VSwitch: React.FC<VSwitchProps> = ({
  value,
  onToggle,
  label,
  subLabel,
  isDisabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID = 'v-switch',
  containerStyle,
  isDevanagari: isDevanagariProp,
}) => {
  const theme = useTheme();
  const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: value ? 1 : 0,
      duration: theme.motion.duration.fast,
      useNativeDriver: false,
    }).start();
  }, [value, animatedValue, theme.motion.duration.fast]);

  const hasDevanagari =
    isDevanagariProp ??
    (DEVANAGARI_REGEX.test(label || '') || DEVANAGARI_REGEX.test(subLabel || ''));

  const handleToggle = () => {
    if (!isDisabled) {
      onToggle(!value);
    }
  };

  // Interpolated colors and translation
  const inactiveTrackColor =
    theme.colorScheme === 'dark' ? theme.colors.borderDefault : theme.colors.surfaceSubtle;
  const activeTrackColor = theme.colors.brandPrimary;

  const trackBackgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveTrackColor, activeTrackColor],
  });

  const trackBorderColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.borderDefault, theme.colors.brandPrimary],
  });

  const thumbTranslateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, THUMB_TRAVEL],
  });

  const labelTypography = hasDevanagari
    ? getDevanagariTextStyle('titleSmall')
    : theme.typography.titleSmall;

  const subLabelTypography = hasDevanagari
    ? getDevanagariTextStyle('caption')
    : theme.typography.caption;

  const switchControl = (
    <View
      style={[
        styles.switchHitTarget,
        {
          minWidth: theme.spacing.touch,
          minHeight: theme.spacing.touch,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.track,
          {
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: theme.radii.full,
            backgroundColor: trackBackgroundColor,
            borderColor: trackBorderColor,
            borderWidth: 1.5,
            padding: THUMB_PADDING,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: theme.radii.full,
              backgroundColor: theme.colors.surfaceCard,
              transform: [{ translateX: thumbTranslateX }],
              ...theme.elevation.elevation1,
            },
          ]}
        />
      </Animated.View>
    </View>
  );

  const a11yLabel = accessibilityLabel || label || (value ? 'On' : 'Off');

  // If no label or subLabel, render standalone pressable
  if (!label && !subLabel) {
    return (
      <Pressable
        onPress={handleToggle}
        disabled={isDisabled}
        accessible
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled: isDisabled }}
        accessibilityLabel={a11yLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
        style={[
          styles.standaloneContainer,
          { opacity: isDisabled ? 0.5 : 1 },
          containerStyle,
        ]}
      >
        {switchControl}
      </Pressable>
    );
  }

  // Row layout with label and optional subLabel
  return (
    <Pressable
      onPress={handleToggle}
      disabled={isDisabled}
      accessible
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: isDisabled }}
      accessibilityLabel={a11yLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={[
        styles.rowContainer,
        {
          minHeight: theme.spacing.touch,
          opacity: isDisabled ? 0.5 : 1,
        },
        containerStyle,
      ]}
    >
      <View style={[styles.textContainer, { marginRight: theme.spacing.md }]}>
        {label ? (
          <Text
            style={[
              styles.labelText,
              {
                fontFamily: labelTypography.fontFamily,
                fontSize: Math.max(MIN_FONT_SIZE, labelTypography.fontSize),
                lineHeight: labelTypography.lineHeight,
                color: theme.colors.textPrimary,
              },
            ]}
          >
            {label}
          </Text>
        ) : null}

        {subLabel ? (
          <Text
            style={[
              styles.subLabelText,
              {
                fontFamily: subLabelTypography.fontFamily,
                fontSize: Math.max(MIN_FONT_SIZE, subLabelTypography.fontSize),
                lineHeight: subLabelTypography.lineHeight,
                color: theme.colors.textMuted,
                marginTop: theme.spacing.xxs,
              },
            ]}
          >
            {subLabel}
          </Text>
        ) : null}
      </View>

      {switchControl}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  standaloneContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  labelText: {
    letterSpacing: 0.1,
  },
  subLabelText: {
    letterSpacing: 0.25,
  },
  switchHitTarget: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  track: {
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    left: THUMB_PADDING,
  },
});

export const Switch = VSwitch;

export default VSwitch;

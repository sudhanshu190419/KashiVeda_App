import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  PanResponder,
  StyleSheet,
  StyleProp,
  ViewStyle,
  AccessibilityActionEvent,
} from 'react-native';
import {
  useTheme,
  MIN_FONT_SIZE,
  getDevanagariTextStyle,
} from '../../theme';

export interface VSliderProps {
  /** Current slider numerical value */
  value: number;
  /** Minimum slider value bound (e.g. 5) */
  min: number;
  /** Maximum slider value bound (e.g. 50) */
  max: number;
  /** Step increment interval (e.g. 5 for 5km increments) */
  step?: number;
  /** Callback fired continuously as slider value changes */
  onValueChange: (val: number) => void;
  /** Callback fired when the drag or interaction completes */
  onSlidingComplete?: (val: number) => void;
  /** Primary label displayed above track */
  label?: string;
  /** Custom formatter function for rendering numerical values */
  labelFormat?: (val: number) => string;
  /** Disables slider interaction and dims opacity */
  isDisabled?: boolean;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Accessibility hint */
  accessibilityHint?: string;
  /** Test identifier */
  testID?: string;
  /** Outer container style override */
  containerStyle?: StyleProp<ViewStyle>;
  /** Explicit Devanagari script override (auto-detected if undefined) */
  isDevanagari?: boolean;
}

export type SliderProps = VSliderProps;

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;
const TRACK_HEIGHT = 8;
const THUMB_SIZE = 24;
const THUMB_RADIUS = THUMB_SIZE / 2;

export const VSlider: React.FC<VSliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  onSlidingComplete,
  label,
  labelFormat = (val: number) => `${val} km`,
  isDisabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID = 'v-slider',
  containerStyle,
  isDevanagari: isDevanagariProp,
}) => {
  const theme = useTheme();

  const [trackWidth, setTrackWidth] = useState(0);
  const trackRef = useRef<any>(null);
  const trackPageX = useRef(0);
  const latestValueRef = useRef(value);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const propsRef = useRef({
    min,
    max,
    step,
    onValueChange,
    onSlidingComplete,
    isDisabled,
  });

  useEffect(() => {
    propsRef.current = {
      min,
      max,
      step,
      onValueChange,
      onSlidingComplete,
      isDisabled,
    };
  }, [min, max, step, onValueChange, onSlidingComplete, isDisabled]);

  // Compute clamped value and progress fraction
  const clampedValue = Math.min(max, Math.max(min, value));
  const range = max - min > 0 ? max - min : 1;
  const fraction = Math.max(0, Math.min(1, (clampedValue - min) / range));

  const hasDevanagari =
    isDevanagariProp ??
    (DEVANAGARI_REGEX.test(label || '') ||
      DEVANAGARI_REGEX.test(labelFormat(min)) ||
      DEVANAGARI_REGEX.test(labelFormat(max)));

  // Calculate value from absolute touch pageX coordinate
  const calculateValueFromPageX = (pageX: number) => {
    const { min: currentMin, max: currentMax, step: currentStep, onValueChange: cb } = propsRef.current;
    const currentRange = currentMax - currentMin > 0 ? currentMax - currentMin : 1;
    const relativeX = pageX - trackPageX.current;
    const boundedX = Math.max(0, Math.min(trackWidth, relativeX));
    const ratio = trackWidth > 0 ? boundedX / trackWidth : 0;
    const rawVal = currentMin + ratio * currentRange;

    let finalVal = rawVal;
    if (currentStep && currentStep > 0) {
      const stepped = Math.round((rawVal - currentMin) / currentStep) * currentStep + currentMin;
      finalVal = Math.min(currentMax, Math.max(currentMin, stepped));
    } else {
      finalVal = Math.min(currentMax, Math.max(currentMin, Math.round(rawVal * 10) / 10));
    }

    latestValueRef.current = finalVal;
    cb(finalVal);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !propsRef.current.isDisabled,
        onMoveShouldSetPanResponder: () => !propsRef.current.isDisabled,
        onPanResponderGrant: (evt) => {
          if (propsRef.current.isDisabled) return;
          trackRef.current?.measure(
            (_x: number, _y: number, _w: number, _h: number, pageX: number) => {
              trackPageX.current = pageX;
              calculateValueFromPageX(evt.nativeEvent.pageX);
            }
          );
        },
        onPanResponderMove: (evt) => {
          if (propsRef.current.isDisabled) return;
          calculateValueFromPageX(evt.nativeEvent.pageX);
        },
        onPanResponderRelease: () => {
          if (propsRef.current.isDisabled) return;
          propsRef.current.onSlidingComplete?.(latestValueRef.current);
        },
        onPanResponderTerminate: () => {
          if (propsRef.current.isDisabled) return;
          propsRef.current.onSlidingComplete?.(latestValueRef.current);
        },
      }),
    [trackWidth]
  );

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (isDisabled) return;
    const stepDelta = step || 1;
    let nextVal = clampedValue;
    if (event.nativeEvent.actionName === 'increment') {
      nextVal = Math.min(max, clampedValue + stepDelta);
    } else if (event.nativeEvent.actionName === 'decrement') {
      nextVal = Math.max(min, clampedValue - stepDelta);
    }
    onValueChange(nextVal);
    onSlidingComplete?.(nextVal);
  };

  const labelTypography = hasDevanagari
    ? getDevanagariTextStyle('labelMedium')
    : theme.typography.labelMedium;

  const captionTypography = hasDevanagari
    ? getDevanagariTextStyle('caption')
    : theme.typography.caption;

  // Center thumb on fraction along the track width
  const thumbLeft = Math.max(0, Math.min(trackWidth - THUMB_SIZE, fraction * trackWidth - THUMB_RADIUS));

  return (
    <View
      style={[
        styles.outerContainer,
        { opacity: isDisabled ? 0.5 : 1 },
        containerStyle,
      ]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel || label || 'Slider'}
      accessibilityHint={accessibilityHint}
      accessibilityValue={{ min, max, now: clampedValue }}
      accessibilityActions={[
        { name: 'increment', label: 'Increment' },
        { name: 'decrement', label: 'Decrement' },
      ]}
      onAccessibilityAction={handleAccessibilityAction}
      testID={testID}
    >
      {/* Header Row: Label & Current Value */}
      {label || labelFormat ? (
        <View style={[styles.headerRow, { marginBottom: theme.spacing.sm }]}>
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

          <Text
            style={[
              styles.valueText,
              {
                fontFamily: labelTypography.fontFamily,
                fontSize: Math.max(MIN_FONT_SIZE, labelTypography.fontSize),
                lineHeight: labelTypography.lineHeight,
                color: theme.colors.brandPrimary,
              },
            ]}
          >
            {labelFormat(clampedValue)}
          </Text>
        </View>
      ) : null}

      {/* Interactive Track Area with Universal 48dp Hit Floor */}
      <View
        ref={trackRef}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          setTrackWidth(width);
          trackRef.current?.measure(
            (_x: number, _y: number, _w: number, _h: number, pageX: number) => {
              trackPageX.current = pageX;
            }
          );
        }}
        {...panResponder.panHandlers}
        style={[
          styles.interactiveArea,
          {
            height: theme.spacing.touch,
          },
        ]}
      >
        {/* Inactive Track */}
        <View
          style={[
            styles.trackBase,
            {
              height: TRACK_HEIGHT,
              borderRadius: theme.radii.full,
              backgroundColor: theme.colors.borderDefault,
            },
          ]}
        >
          {/* Active Track */}
          <View
            style={[
              styles.activeTrack,
              {
                height: TRACK_HEIGHT,
                borderRadius: theme.radii.full,
                backgroundColor: theme.colors.brandPrimary,
                width: `${fraction * 100}%`,
              },
            ]}
          />
        </View>

        {/* Circular Thumb with Elevation */}
        {trackWidth > 0 ? (
          <View
            style={[
              styles.thumb,
              {
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                borderRadius: theme.radii.full,
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.brandPrimary,
                borderWidth: 2.5,
                left: thumbLeft,
                ...theme.elevation.elevation2,
              },
            ]}
          />
        ) : null}
      </View>

      {/* Scale Bounds (Min / Max) Labels */}
      <View style={[styles.scaleRow, { marginTop: theme.spacing.xs }]}>
        <Text
          style={[
            styles.scaleText,
            {
              fontFamily: captionTypography.fontFamily,
              fontSize: Math.max(MIN_FONT_SIZE, captionTypography.fontSize),
              lineHeight: captionTypography.lineHeight,
              color: theme.colors.textMuted,
            },
          ]}
        >
          {labelFormat(min)}
        </Text>

        <Text
          style={[
            styles.scaleText,
            {
              fontFamily: captionTypography.fontFamily,
              fontSize: Math.max(MIN_FONT_SIZE, captionTypography.fontSize),
              lineHeight: captionTypography.lineHeight,
              color: theme.colors.textMuted,
            },
          ]}
        >
          {labelFormat(max)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  labelText: {
    letterSpacing: 0.1,
  },
  valueText: {
    letterSpacing: 0.1,
  },
  interactiveArea: {
    width: '100%',
    justifyContent: 'center',
  },
  trackBase: {
    width: '100%',
    overflow: 'hidden',
  },
  activeTrack: {},
  thumb: {
    position: 'absolute',
  },
  scaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  scaleText: {
    letterSpacing: 0.25,
  },
});

export const Slider = VSlider;

export default VSlider;

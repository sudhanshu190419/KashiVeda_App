import React from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { VText } from '../foundations/VText';

export interface StepItem {
  title: string;
  titleHi?: string;
  subtitle?: string;
  subtitleHi?: string;
}

export interface StepProgressProps {
  steps?: (string | StepItem)[];
  currentStep?: number; // 0-indexed
  currentStepIndex?: number; // alias for currentStep (used in C-09)
  progress?: number; // 0 to 1 float for continuous sync progress (used in C-01)
  color?: string; // custom progress tint color
  onStepPress?: (step: number) => void;
  variant?: 'nodes' | 'linear' | 'subtle';
  style?: StyleProp<ViewStyle>;
}

/**
 * StepProgress — Multi-step workflow indicator for onboarding and ritual bookings.
 *
 * Enforces:
 * - 3 Visual variants: 'nodes' (numbered circles), 'linear' (segmented bar), and 'subtle' (continuous progress)
 * - State token styling: Success for completed steps, Temple Amber for active step, muted for upcoming
 * - 48dp minimum touch targets when steps are interactive (onStepPress)
 * - Devanagari vertical clearance and bilingual step labelling
 */
export const StepProgress: React.FC<StepProgressProps> = ({
  steps = [],
  currentStep = 0,
  currentStepIndex,
  progress,
  color,
  onStepPress,
  variant = 'nodes',
  style,
}) => {
  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();

  const activeIndex = currentStepIndex ?? currentStep ?? 0;

  const resolveStepTitle = (step: StepItem) =>
    language === 'hi' ? step.titleHi ?? step.title : step.title;

  // SUBTLE CONTINUOUS VARIANT (used in C-01 Splash synchronization)
  if (variant === 'subtle' || (progress !== undefined && steps.length === 0)) {
    const clampedProgress = Math.min(1, Math.max(0, progress ?? 0));
    const barColor = color ?? colors.brandPrimary;

    return (
      <View
        style={[
          styles.subtleContainer,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.borderDefault,
            borderRadius: radii.full,
          },
          style,
        ]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clampedProgress * 100) }}
      >
        <View
          style={[
            styles.subtleFill,
            {
              width: `${clampedProgress * 100}%`,
              backgroundColor: barColor,
              borderRadius: radii.full,
            },
          ]}
        />
      </View>
    );
  }

  // Normalize step item format
  const normalizedSteps: StepItem[] = steps.map((s) => {
    if (typeof s === 'string') {
      return { title: s };
    }
    return s;
  });

  const totalSteps = normalizedSteps.length;
  const activeStep = normalizedSteps[activeIndex] || normalizedSteps[0] || { title: '' };

  // LINEAR VARIANT
  if (variant === 'linear') {
    return (
      <View style={[styles.linearContainer, style]}>
        {/* Step status label */}
        <View style={[styles.linearLabelRow, { marginBottom: spacing.sm }]}>
          <VText variant="labelMedium" color="brandPrimary" weight="700">
            {`Step ${activeIndex + 1} of ${totalSteps}`}
          </VText>

          <VText variant="labelMedium" color="textPrimary" weight="600">
            {resolveStepTitle(activeStep)}
          </VText>
        </View>

        {/* Segmented bar */}
        <View style={[styles.segmentedTrack, { gap: spacing.xs }]}>
          {normalizedSteps.map((_, index) => {
            const isCompleted = index < activeIndex;
            const isCurrent = index === activeIndex;

            const segmentColor = isCompleted
              ? colors.statusActive
              : isCurrent
              ? (color ?? colors.brandPrimary)
              : colors.borderDefault;

            return (
              <Pressable
                key={`step-seg-${index}`}
                disabled={!onStepPress || index > activeIndex}
                onPress={() => onStepPress?.(index)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: segmentColor,
                    borderRadius: radii.full,
                  },
                ]}
                hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Step ${index + 1}: ${resolveStepTitle(normalizedSteps[index])}`}
              />
            );
          })}
        </View>
      </View>
    );
  }

  // NODES VARIANT (Default)
  return (
    <View style={[styles.nodesContainer, style]}>
      <View style={styles.nodesTrack}>
        {normalizedSteps.map((step, index) => {
          const isCompleted = index < activeIndex;
          const isCurrent = index === activeIndex;
          const isUpcoming = index > activeIndex;
          const isLast = index === totalSteps - 1;

          // Resolve node colors
          const nodeBg = isCompleted
            ? colors.statusActive
            : isCurrent
            ? (color ?? colors.brandPrimary)
            : colors.surfaceCard;

          const nodeBorderColor = isCompleted
            ? colors.statusActive
            : isCurrent
            ? (color ?? colors.brandPrimary)
            : colors.borderDefault;

          const lineBg = isCompleted
            ? colors.statusActive
            : isCurrent
            ? colors.surfaceSubtle
            : colors.borderDefault;

          return (
            <React.Fragment key={`step-node-${index}`}>
              <Pressable
                disabled={!onStepPress || isUpcoming}
                onPress={() => onStepPress?.(index)}
                style={styles.nodePressable}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityState={{ selected: isCurrent }}
                accessibilityLabel={`Step ${index + 1}: ${resolveStepTitle(step)}`}
              >
                {/* Outer halo ring for active node */}
                <View
                  style={[
                    styles.haloRing,
                    {
                      borderColor: isCurrent ? colors.surfaceSubtle : 'transparent',
                      borderRadius: radii.full,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.nodeCircle,
                      {
                        backgroundColor: nodeBg,
                        borderColor: nodeBorderColor,
                        borderRadius: radii.full,
                      },
                    ]}
                  >
                    {isCompleted ? (
                      <Ionicons name="checkmark" size={16} color={colors.textOnPrimary} />
                    ) : (
                      <VText
                        variant="caption"
                        color={isCurrent ? 'textOnPrimary' : 'textMuted'}
                        weight="700"
                        style={styles.stepNumberText}
                      >
                        {String(index + 1)}
                      </VText>
                    )}
                  </View>
                </View>

                {/* Step title label under node */}
                <View style={[styles.nodeLabelWrap, { marginTop: spacing.xs }]}>
                  <VText
                    variant="caption"
                    color={isCurrent ? 'brandPrimary' : isCompleted ? 'textPrimary' : 'textMuted'}
                    weight={isCurrent ? '700' : '600'}
                    align="center"
                    numberOfLines={2}
                  >
                    {resolveStepTitle(step)}
                  </VText>
                </View>
              </Pressable>

              {/* Connecting line between nodes */}
              {!isLast && (
                <View
                  style={[
                    styles.connectingLine,
                    {
                      backgroundColor: lineBg,
                      marginBottom: 28, // Align vertically with node circle centers
                    },
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
};

export default StepProgress;

const styles = StyleSheet.create({
  linearContainer: {
    width: '100%',
  },
  linearLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segmentedTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  segment: {
    flex: 1,
    height: 6,
  },
  nodesContainer: {
    width: '100%',
    paddingVertical: 8,
  },
  nodesTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  nodePressable: {
    alignItems: 'center',
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'flex-start',
    flex: 1,
  },
  haloRing: {
    padding: 3,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeCircle: {
    width: 28,
    height: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 12,
    lineHeight: 14,
    textAlign: 'center',
  },
  nodeLabelWrap: {
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  connectingLine: {
    height: 2,
    flex: 1,
    marginHorizontal: -4,
  },
  subtleContainer: {
    width: '100%',
    height: 6,
    overflow: 'hidden',
    borderWidth: 0.5,
  },
  subtleFill: {
    height: '100%',
  },
});

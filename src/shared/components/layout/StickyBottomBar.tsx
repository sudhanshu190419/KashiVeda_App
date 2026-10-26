import React from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { VButton } from '../foundations/VButton';

export interface StickyBottomBarProps {
  children?: React.ReactNode;
  primaryLabel?: string;
  onPrimaryPress?: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  summarySlot?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * StickyBottomBar — Fixed bottom CTA container grounded in safe-area insets.
 *
 * Enforces:
 * - Safe area bottom inset adaptation (never overlaps Android navigation bar or iOS home bar)
 * - 48dp minimum touch target floor on all action buttons
 * - Elevation and border styling anchored in design system tokens
 * - Optional summarySlot for escrow totals, date confirmation, or pricing breakdown
 */
export const StickyBottomBar: React.FC<StickyBottomBarProps> = ({
  children,
  primaryLabel,
  onPrimaryPress,
  primaryLoading = false,
  primaryDisabled = false,
  secondaryLabel,
  onSecondaryPress,
  summarySlot,
  style,
}) => {
  const { colors, spacing, elevation } = useTheme();
  const insets = useSafeAreaInsets();

  const hasButtons = Boolean(primaryLabel || secondaryLabel);
  const bottomPadding = Math.max(insets.bottom, spacing.md);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceCard,
          borderTopColor: colors.borderDefault,
          borderTopWidth: 1,
          paddingTop: spacing.md,
          paddingBottom: bottomPadding,
          paddingHorizontal: spacing.lg,
          ...elevation.elevation2,
        },
        style,
      ]}
    >
      {/* Summary Slot (e.g. Escrow advance amount, Dakshina total, or date preview) */}
      {summarySlot ? (
        <View style={[styles.summaryContainer, { marginBottom: hasButtons ? spacing.md : 0 }]}>
          {summarySlot}
        </View>
      ) : null}

      {/* Button Row */}
      {hasButtons && (
        <View style={styles.buttonRow}>
          {secondaryLabel && onSecondaryPress ? (
            <View style={[styles.buttonWrapper, { marginRight: primaryLabel ? spacing.md : 0 }]}>
              <VButton
                label={secondaryLabel}
                onPress={onSecondaryPress}
                variant="secondary"
                size="lg"
                fullWidth
              />
            </View>
          ) : null}

          {primaryLabel && onPrimaryPress ? (
            <View style={styles.buttonWrapper}>
              <VButton
                label={primaryLabel}
                onPress={onPrimaryPress}
                variant="primary"
                size="lg"
                isLoading={primaryLoading}
                isDisabled={primaryDisabled}
                fullWidth
              />
            </View>
          ) : null}
        </View>
      )}

      {/* Custom children if provided */}
      {children}
    </View>
  );
};

export default StickyBottomBar;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  summaryContainer: {
    width: '100%',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  buttonWrapper: {
    flex: 1,
    minHeight: 48,
  },
});

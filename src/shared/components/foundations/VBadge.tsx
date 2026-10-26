import React from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '../icons';
import { useTheme } from '../../theme';
import { VText } from './VText';

export type VBadgeVariant = 'dot' | 'counter' | 'verified' | 'status';
export type VBadgeColor = 'brand' | 'success' | 'alert' | 'muted';
export type VBadgeSize = 'sm' | 'md' | 'lg';

export interface VBadgeProps {
  /** Badge presentation variant */
  variant?: VBadgeVariant;
  /** Semantic palette theme */
  color?: VBadgeColor;
  /** Sizing scale */
  size?: VBadgeSize;
  /** Label text for status or verified pill */
  label?: string;
  /** Numerical value for counter variant */
  count?: number;
  /** Maximum counter value before showing 'maxCount+' */
  maxCount?: number;
  /** Whether to show the leading dot indicator in status variant (defaults to true) */
  showDot?: boolean;
  /** Explicitly enforce Devanagari typography for label */
  isDevanagari?: boolean;
  /** Container style override */
  style?: StyleProp<ViewStyle>;
  /** Text style override */
  textStyle?: StyleProp<TextStyle>;
  /** Optional custom children */
  children?: React.ReactNode;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Test identifier */
  testID?: string;
}

export type BadgeProps = VBadgeProps;

/**
 * VBadge — Semantic badge primitive for Kashi Veda mobile.
 *
 * Supports:
 * - Status pills with colored indicator dot
 * - Numerical counters with threshold clipping
 * - Sacred verified Pandit checkmark badges
 * - Dot indicators for live presence
 * Fully grounded in theme tokens (zero raw hex values).
 */
export const VBadge: React.FC<VBadgeProps> = ({
  variant = 'status',
  color = 'brand',
  size = 'md',
  label,
  count,
  maxCount = 99,
  showDot = true,
  isDevanagari,
  style,
  textStyle,
  children,
  accessibilityLabel,
  testID,
}) => {
  const theme = useTheme();

  // Color token resolution
  const colorScheme = React.useMemo(() => {
    switch (color) {
      case 'brand':
        return {
          bg: theme.colors.surfaceSubtle,
          border: theme.colors.borderAccent,
          fg: theme.colors.brandPrimary,
          solidBg: theme.colors.brandPrimary,
          solidFg: theme.colors.textOnPrimary,
        };
      case 'success':
        return {
          bg: theme.colors.successBg,
          border: theme.colors.statusActive,
          fg: theme.colors.statusActive,
          solidBg: theme.colors.statusActive,
          solidFg: theme.colors.textOnPrimary,
        };
      case 'alert':
        return {
          bg: theme.colors.errorBg,
          border: theme.colors.statusAlert,
          fg: theme.colors.statusAlert,
          solidBg: theme.colors.statusAlert,
          solidFg: theme.colors.textOnPrimary,
        };
      case 'muted':
      default:
        return {
          bg: theme.colors.surfaceCard,
          border: theme.colors.borderDefault,
          fg: theme.colors.textMuted,
          solidBg: theme.colors.surfaceSubtle,
          solidFg: theme.colors.textMuted,
        };
    }
  }, [color, theme.colors]);

  // Dot variant
  if (variant === 'dot') {
    const dotDimension = size === 'sm' ? 6 : size === 'lg' ? 10 : 8;
    return (
      <View
        testID={testID}
        accessibilityRole="none"
        accessibilityLabel={accessibilityLabel || `${color} status indicator`}
        style={[
          {
            width: dotDimension,
            height: dotDimension,
            borderRadius: theme.radii.full,
            backgroundColor: colorScheme.fg,
          },
          style,
        ]}
      />
    );
  }

  // Counter variant
  if (variant === 'counter') {
    const safeCount = count ?? 0;
    const formattedCount = safeCount > maxCount ? `${maxCount}+` : `${safeCount}`;
    const minWidth = size === 'sm' ? 18 : size === 'lg' ? 26 : 22;
    const height = size === 'sm' ? 18 : size === 'lg' ? 26 : 22;
    const paddingHorizontal = size === 'sm' ? theme.spacing.xxs : theme.spacing.xs;
    const typographyVariant = size === 'lg' ? 'labelMedium' : 'caption';

    return (
      <View
        testID={testID}
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel || `${formattedCount} notifications`}
        style={[
          styles.center,
          {
            minWidth,
            height,
            borderRadius: theme.radii.full,
            backgroundColor: colorScheme.solidBg,
            paddingHorizontal,
          },
          style,
        ]}
      >
        <VText
          variant={typographyVariant}
          color={colorScheme.solidFg}
          style={[styles.counterText, textStyle]}
        >
          {formattedCount}
        </VText>
      </View>
    );
  }

  // Verified sacred badge
  if (variant === 'verified') {
    const iconSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;
    const hasLabel = Boolean(label || children);

    if (!hasLabel) {
      return (
        <View
          testID={testID}
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel || 'Verified sacred seal'}
          style={[
            styles.row,
            {
              backgroundColor: colorScheme.bg,
              borderRadius: theme.radii.full,
              padding: theme.spacing.xxs,
              borderWidth: 1,
              borderColor: colorScheme.border,
            },
            style,
          ]}
        >
          <MaterialCommunityIcons
            name="check-decagram"
            size={iconSize}
            color={colorScheme.fg}
          />
        </View>
      );
    }

    const padV = size === 'sm' ? theme.spacing.xxs : theme.spacing.xs;
    const padH = size === 'sm' ? theme.spacing.sm : theme.spacing.md;
    const gap = theme.spacing.xs;

    return (
      <View
        testID={testID}
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel || label || 'Verified'}
        style={[
          styles.row,
          {
            backgroundColor: colorScheme.bg,
            borderRadius: theme.radii.full,
            borderWidth: 1,
            borderColor: colorScheme.border,
            paddingVertical: padV,
            paddingHorizontal: padH,
            gap,
          },
          style,
        ]}
      >
        <MaterialCommunityIcons
          name="check-decagram"
          size={iconSize}
          color={colorScheme.fg}
        />
        {label ? (
          <VText
            variant="labelMedium"
            color={colorScheme.fg}
            isDevanagari={isDevanagari}
            style={textStyle}
          >
            {label}
          </VText>
        ) : null}
        {children}
      </View>
    );
  }

  // Status pill variant (default)
  const padVertical = size === 'sm' ? theme.spacing.xxs : size === 'lg' ? theme.spacing.sm : theme.spacing.xs;
  const padHorizontal = size === 'sm' ? theme.spacing.sm : size === 'lg' ? theme.spacing.lg : theme.spacing.md;
  const dotSize = size === 'sm' ? 6 : size === 'lg' ? 8 : 7;
  const gap = size === 'lg' ? theme.spacing.sm : theme.spacing.xs;

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel || label || `${color} status`}
      style={[
        styles.row,
        {
          backgroundColor: colorScheme.bg,
          borderWidth: 1,
          borderColor: colorScheme.border,
          borderRadius: theme.radii.full,
          paddingVertical: padVertical,
          paddingHorizontal: padHorizontal,
          gap,
        },
        style,
      ]}
    >
      {showDot && (
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: theme.radii.full,
            backgroundColor: colorScheme.fg,
          }}
        />
      )}
      {label ? (
        <VText
          variant={size === 'lg' ? 'labelMedium' : 'caption'}
          color={colorScheme.fg}
          isDevanagari={isDevanagari}
          style={textStyle}
        >
          {label}
        </VText>
      ) : null}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  counterText: {
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
});

export default VBadge;

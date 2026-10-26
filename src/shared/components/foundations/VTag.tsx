import React from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme } from '../../theme';
import { VText } from './VText';

export type VTagVariant = 'filter' | 'specialty' | 'assist';

export interface VTagProps {
  /** Label text displayed in the tag */
  label: string;
  /** Functional variant: 'filter' (default), 'specialty', or 'assist' */
  variant?: VTagVariant;
  /** Active / selected toggle state */
  selected?: boolean;
  /** Primary press handler */
  onPress?: () => void;
  /** Remove / close button handler (displays close icon when provided) */
  onRemove?: () => void;
  /** Flag to explicitly show the remove icon */
  removable?: boolean;
  /** Leading icon node or Ionicons name string */
  icon?: React.ReactNode | string;
  /** Disabled interaction state */
  disabled?: boolean;
  /** Explicit Devanagari script indicator */
  isDevanagari?: boolean;
  /** Container style override */
  style?: StyleProp<ViewStyle>;
  /** Text style override */
  textStyle?: StyleProp<TextStyle>;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Test identifier */
  testID?: string;
}

export type ChipProps = VTagProps;

/**
 * VTag — Selection and filter chip with leading icon and removable action.
 *
 * Enforces:
 * - 48x48dp hit bounds / hitSlop for both the chip and remove button
 * - 3 variants: 'filter' | 'specialty' | 'assist'
 * - Active / selected visual states
 * - Bilingual typography with strict 12sp minimum floor
 * - Grounded in theme tokens (zero raw hex codes)
 */
export const VTag: React.FC<VTagProps> = ({
  label,
  variant = 'filter',
  selected = false,
  onPress,
  onRemove,
  removable,
  icon,
  disabled = false,
  isDevanagari,
  style,
  textStyle,
  accessibilityLabel,
  testID,
}) => {
  const theme = useTheme();

  // Show close icon if onRemove is provided or removable is true
  const showClose = Boolean(onRemove || removable);

  // Variant color definitions
  const colorScheme = React.useMemo(() => {
    switch (variant) {
      case 'specialty':
        if (selected) {
          return {
            bg: theme.colors.brandPrimary,
            border: theme.colors.brandPrimary,
            fg: theme.colors.textOnPrimary,
          };
        }
        return {
          bg: theme.colors.surfaceSubtle,
          border: theme.colors.borderAccent,
          fg: theme.colors.brandPrimary,
        };

      case 'assist':
        if (selected) {
          return {
            bg: theme.colors.surfaceSubtle,
            border: theme.colors.borderDefault,
            fg: theme.colors.textPrimary,
          };
        }
        return {
          bg: theme.colors.surfaceCard,
          border: theme.colors.borderDefault,
          fg: theme.colors.textMuted,
        };

      case 'filter':
      default:
        if (selected) {
          return {
            bg: theme.colors.surfaceSubtle,
            border: theme.colors.borderAccent,
            fg: theme.colors.brandPrimary,
          };
        }
        return {
          bg: theme.colors.surfaceCard,
          border: theme.colors.borderDefault,
          fg: theme.colors.textPrimary,
        };
    }
  }, [variant, selected, theme.colors]);

  // Leading icon renderer
  const renderIcon = () => {
    if (!icon) return null;
    if (typeof icon === 'string') {
      return (
        <Ionicons
          name={icon as any}
          size={14}
          color={colorScheme.fg}
          style={{ marginRight: theme.spacing.xs }}
        />
      );
    }
    return (
      <View style={{ marginRight: theme.spacing.xs }}>
        {icon}
      </View>
    );
  };

  // 48dp hitSlop calculation for visual height of 32dp
  // (48 - 32) / 2 = 8dp vertical padding
  const chipHitSlop = {
    top: 8,
    bottom: 8,
    left: 6,
    right: 6,
  };

  const removeHitSlop = {
    top: 15,
    bottom: 15,
    left: 15,
    right: 15,
  };

  const defaultA11yLabel = accessibilityLabel || `${label} ${selected ? 'selected' : ''}`.trim();

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled || !onPress}
      hitSlop={chipHitSlop}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={defaultA11yLabel}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colorScheme.bg,
          borderColor: colorScheme.border,
          borderRadius: theme.radii.full,
          paddingVertical: theme.spacing.xs,
          paddingLeft: icon ? theme.spacing.sm : theme.spacing.md,
          paddingRight: showClose ? theme.spacing.xs : theme.spacing.md,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {renderIcon()}

      <VText
        variant="labelMedium"
        color={colorScheme.fg}
        isDevanagari={isDevanagari}
        style={[styles.labelText, textStyle]}
      >
        {label}
      </VText>

      {showClose && (
        <Pressable
          onPress={disabled ? undefined : onRemove}
          hitSlop={removeHitSlop}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          style={({ pressed: closePressed }) => [
            styles.closeButton,
            {
              marginLeft: theme.spacing.xs,
              opacity: closePressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons
            name="close"
            size={14}
            color={colorScheme.fg}
          />
        </Pressable>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    minHeight: 32,
  },
  labelText: {
    fontWeight: '600',
    includeFontPadding: false,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
});

export default VTag;

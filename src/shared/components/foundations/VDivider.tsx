import React from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme, SpacingTokens } from '../../theme';
import { VText } from './VText';

export type VDividerVariant = 'default' | 'accent' | 'subtle';
export type VDividerOrientation = 'horizontal' | 'vertical';

export interface VDividerProps {
  /** Visual weight variant */
  variant?: VDividerVariant;
  /** Spatial axis orientation */
  orientation?: VDividerOrientation;
  /** Margin spacing token or raw dp value */
  spacing?: keyof SpacingTokens | number;
  /** Hairline thickness in dp (default 1) */
  thickness?: number;
  /** Optional centered text label for horizontal separators (e.g., 'अथवा' or 'OR') */
  label?: string;
  /** Explicit Devanagari script indicator for label text */
  isDevanagari?: boolean;
  /** Container style override */
  style?: StyleProp<ViewStyle>;
  /** Test identifier */
  testID?: string;
}

export type DividerProps = VDividerProps;

/**
 * VDivider — 1px hairline spatial divider with default, accent, subtle variants.
 *
 * Supports:
 * - Default (`colors.borderDefault`), Accent (`colors.borderAccent`), Subtle (`colors.surfaceSubtle`)
 * - Horizontal and vertical orientations
 * - Centered bilingual label support for horizontal dividers
 * - Fully grounded via theme spacing and color tokens
 */
export const VDivider: React.FC<VDividerProps> = ({
  variant = 'default',
  orientation = 'horizontal',
  spacing = 'md',
  thickness = 1,
  label,
  isDevanagari,
  style,
  testID,
}) => {
  const theme = useTheme();

  // Resolve divider color token
  const dividerColor = React.useMemo(() => {
    switch (variant) {
      case 'accent':
        return theme.colors.borderAccent;
      case 'subtle':
        return theme.colors.surfaceSubtle;
      case 'default':
      default:
        return theme.colors.borderDefault;
    }
  }, [variant, theme.colors]);

  // Resolve margin spacing
  const marginValue = typeof spacing === 'number'
    ? spacing
    : theme.spacing[spacing] ?? theme.spacing.md;

  if (orientation === 'vertical') {
    return (
      <View
        testID={testID}
        accessibilityRole="none"
        style={[
          styles.vertical,
          {
            width: thickness,
            backgroundColor: dividerColor,
            marginHorizontal: marginValue,
          },
          style,
        ]}
      />
    );
  }

  // Horizontal with label
  if (label) {
    return (
      <View
        testID={testID}
        accessibilityRole="none"
        style={[
          styles.labeledContainer,
          {
            marginVertical: marginValue,
          },
          style,
        ]}
      >
        <View
          style={[
            styles.line,
            {
              height: thickness,
              backgroundColor: dividerColor,
            },
          ]}
        />
        <VText
          variant="caption"
          color={theme.colors.textMuted}
          isDevanagari={isDevanagari}
          style={{
            paddingHorizontal: theme.spacing.sm,
          }}
        >
          {label}
        </VText>
        <View
          style={[
            styles.line,
            {
              height: thickness,
              backgroundColor: dividerColor,
            },
          ]}
        />
      </View>
    );
  }

  // Plain horizontal hairline
  return (
    <View
      testID={testID}
      accessibilityRole="none"
      style={[
        styles.horizontal,
        {
          height: thickness,
          backgroundColor: dividerColor,
          marginVertical: marginValue,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  horizontal: {
    width: '100%',
    alignSelf: 'stretch',
  },
  vertical: {
    height: '100%',
    alignSelf: 'stretch',
  },
  labeledContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flex: 1,
  },
});

export default VDivider;

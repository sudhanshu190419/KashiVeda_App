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
import {
  useTheme,
  MIN_FONT_SIZE,
  getDevanagariTextStyle,
} from '../../theme';

export interface VCheckboxProps {
  /** Whether the checkbox is currently checked */
  checked: boolean;
  /** Callback fired when the checkbox is pressed */
  onToggle: (checked: boolean) => void;
  /** Primary label text rendered beside the checkbox */
  label?: string;
  /** Secondary explanatory sub-label rendered under the primary label */
  subLabel?: string;
  /** Disables checkbox interactions and dims visual opacity */
  isDisabled?: boolean;
  /** Accessibility label for screen readers */
  accessibilityLabel?: string;
  /** Accessibility hint */
  accessibilityHint?: string;
  /** Test identifier */
  testID?: string;
  /** Explicit Devanagari script override (auto-detected if undefined) */
  isDevanagari?: boolean;
  /** Outer container style override */
  containerStyle?: StyleProp<ViewStyle>;
  /** Inner checkbox box style override */
  checkboxStyle?: StyleProp<ViewStyle>;
}

export type CheckboxProps = VCheckboxProps;

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;
const CHECKBOX_SIZE = 22;

export const VCheckbox: React.FC<VCheckboxProps> = ({
  checked,
  onToggle,
  label,
  subLabel,
  isDisabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID = 'v-checkbox',
  isDevanagari: isDevanagariProp,
  containerStyle,
  checkboxStyle,
}) => {
  const theme = useTheme();

  const hasDevanagari =
    isDevanagariProp ??
    (DEVANAGARI_REGEX.test(label || '') || DEVANAGARI_REGEX.test(subLabel || ''));

  const handlePress = () => {
    if (!isDisabled) {
      onToggle(!checked);
    }
  };

  const labelTypography = hasDevanagari
    ? getDevanagariTextStyle('bodyMedium')
    : theme.typography.bodyMedium;

  const subLabelTypography = hasDevanagari
    ? getDevanagariTextStyle('caption')
    : theme.typography.caption;

  const a11yLabel = accessibilityLabel || label || (checked ? 'Checked' : 'Unchecked');

  const boxElement = (
    <View
      style={[
        styles.box,
        {
          width: CHECKBOX_SIZE,
          height: CHECKBOX_SIZE,
          borderRadius: theme.radii.sm,
          borderWidth: 1.5,
          borderColor: checked ? theme.colors.brandPrimary : theme.colors.borderDefault,
          backgroundColor: checked ? theme.colors.brandPrimary : theme.colors.surfaceCard,
        },
        checkboxStyle,
      ]}
    >
      {checked ? (
        <Ionicons name="checkmark" size={16} color={theme.colors.textOnPrimary} />
      ) : null}
    </View>
  );

  // Standalone checkbox (without label) with guaranteed 48x48dp hit bounds
  if (!label && !subLabel) {
    return (
      <Pressable
        onPress={handlePress}
        disabled={isDisabled}
        accessible
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: isDisabled }}
        accessibilityLabel={a11yLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
        style={[
          styles.standaloneTouchTarget,
          {
            minWidth: theme.spacing.touch,
            minHeight: theme.spacing.touch,
            opacity: isDisabled ? 0.5 : 1,
          },
          containerStyle,
        ]}
      >
        {boxElement}
      </Pressable>
    );
  }

  // Row layout with label & subLabel with guaranteed 48dp minimum height
  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessible
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: isDisabled }}
      accessibilityLabel={a11yLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={[
        styles.rowContainer,
        {
          minHeight: theme.spacing.touch,
          opacity: isDisabled ? 0.5 : 1,
          paddingVertical: theme.spacing.xs,
        },
        containerStyle,
      ]}
    >
      <View
        style={[
          styles.boxWrapper,
          {
            minWidth: theme.spacing.touch,
            minHeight: theme.spacing.touch,
            marginRight: theme.spacing.xs,
          },
        ]}
      >
        {boxElement}
      </View>

      <View style={styles.textContainer}>
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
    </Pressable>
  );
};

const styles = StyleSheet.create({
  standaloneTouchTarget: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  boxWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  labelText: {
    letterSpacing: 0.2,
  },
  subLabelText: {
    letterSpacing: 0.25,
  },
});

export const Checkbox = VCheckbox;

export default VCheckbox;

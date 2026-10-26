import React from 'react';
import {
  View,
  Text,
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
import { VARANASI_GHATS, RITUAL_CHOICES } from '../../constants';
import { VCheckbox } from './VCheckbox';

export interface CheckboxGroupOption {
  /** Unique identifier for the option */
  id: string;
  /** Primary label text */
  label: string;
  /** Secondary explanatory sub-label text */
  subLabel?: string;
  /** Disables this specific option item */
  isDisabled?: boolean;
}

export interface VCheckboxGroupProps {
  /** Array of selectable option items */
  options: CheckboxGroupOption[];
  /** Array of currently selected option IDs */
  selectedIds: string[];
  /** Callback fired when an option is toggled */
  onToggle: (id: string) => void;
  /** Primary section title for the group */
  title?: string;
  /** Helper text displayed beneath group */
  helperText?: string;
  /** Error message displayed beneath group */
  errorMessage?: string;
  /** Disables entire group and dims opacity */
  isDisabled?: boolean;
  /** Custom container style */
  containerStyle?: StyleProp<ViewStyle>;
  /** Explicit Devanagari script override (auto-detected if undefined) */
  isDevanagari?: boolean;
  /** Accessibility label for screen readers */
  accessibilityLabel?: string;
  /** Test identifier */
  testID?: string;
}

export type CheckboxGroupProps = VCheckboxGroupProps;

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

/** Authentic Varanasi Ghats formatted as CheckboxGroupOptions */
export const VARANASI_GHAT_OPTIONS: CheckboxGroupOption[] = VARANASI_GHATS.map((ghat) => ({
  id: ghat.id,
  label: `${ghat.nameHi} (${ghat.nameEn})`,
  subLabel: ghat.significanceHi,
}));

/** Authentic Vedic ritual preference options */
export const RITUAL_CHOICE_OPTIONS: CheckboxGroupOption[] = RITUAL_CHOICES.map((choice) => ({
  id: choice.id,
  label: `${choice.nameHi} (${choice.nameEn})`,
}));

export const VCheckboxGroup: React.FC<VCheckboxGroupProps> = ({
  options,
  selectedIds,
  onToggle,
  title,
  helperText,
  errorMessage,
  isDisabled = false,
  containerStyle,
  isDevanagari: isDevanagariProp,
  accessibilityLabel,
  testID = 'v-checkbox-group',
}) => {
  const theme = useTheme();

  const hasDevanagari =
    isDevanagariProp ??
    (DEVANAGARI_REGEX.test(title || '') ||
      options.some((o) => DEVANAGARI_REGEX.test(o.label) || DEVANAGARI_REGEX.test(o.subLabel || '')));

  const hasError = Boolean(errorMessage);

  const titleTypography = hasDevanagari
    ? getDevanagariTextStyle('titleSmall')
    : theme.typography.titleSmall;

  const captionTypography = hasDevanagari
    ? getDevanagariTextStyle('caption')
    : theme.typography.caption;

  return (
    <View
      style={[styles.container, containerStyle]}
      accessible
      accessibilityRole="none"
      accessibilityLabel={accessibilityLabel || title}
      testID={testID}
    >
      {/* Title */}
      {title ? (
        <Text
          style={[
            styles.titleText,
            {
              fontFamily: titleTypography.fontFamily,
              fontSize: Math.max(MIN_FONT_SIZE, titleTypography.fontSize),
              lineHeight: titleTypography.lineHeight,
              color: hasError ? theme.colors.statusAlert : theme.colors.textPrimary,
              marginBottom: theme.spacing.sm,
            },
          ]}
        >
          {title}
        </Text>
      ) : null}

      {/* Options list */}
      <View style={styles.optionsList}>
        {options.map((option) => {
          const isChecked = selectedIds.includes(option.id);
          const itemDisabled = isDisabled || Boolean(option.isDisabled);

          return (
            <VCheckbox
              key={option.id}
              checked={isChecked}
              onToggle={() => onToggle(option.id)}
              label={option.label}
              subLabel={option.subLabel}
              isDisabled={itemDisabled}
              isDevanagari={hasDevanagari}
              containerStyle={{ marginBottom: theme.spacing.xs }}
              testID={`${testID}-option-${option.id}`}
            />
          );
        })}
      </View>

      {/* Error Feedback */}
      {hasError ? (
        <View style={[styles.feedbackRow, { marginTop: theme.spacing.xs }]}>
          <Ionicons
            name="alert-circle-outline"
            size={14}
            color={theme.colors.statusAlert}
            style={{ marginRight: theme.spacing.xxs }}
          />
          <Text
            style={[
              styles.feedbackText,
              {
                fontFamily: captionTypography.fontFamily,
                fontSize: Math.max(MIN_FONT_SIZE, captionTypography.fontSize),
                lineHeight: captionTypography.lineHeight,
                color: theme.colors.statusAlert,
              },
            ]}
          >
            {errorMessage}
          </Text>
        </View>
      ) : helperText ? (
        <View style={[styles.feedbackRow, { marginTop: theme.spacing.xs }]}>
          <Text
            style={[
              styles.feedbackText,
              {
                fontFamily: captionTypography.fontFamily,
                fontSize: Math.max(MIN_FONT_SIZE, captionTypography.fontSize),
                lineHeight: captionTypography.lineHeight,
                color: theme.colors.textMuted,
              },
            ]}
          >
            {helperText}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  titleText: {
    letterSpacing: 0.1,
  },
  optionsList: {
    width: '100%',
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feedbackText: {
    flexShrink: 1,
  },
});

export const CheckboxGroup = VCheckboxGroup;

export default VCheckboxGroup;

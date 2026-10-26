import React, { forwardRef, useState, useImperativeHandle, useRef, ComponentRef } from 'react';
import {
  View,
  Text,
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '../icons';
import {
  useTheme,
  MIN_FONT_SIZE,
  DEVANAGARI_VERTICAL_CLEARANCE,
  getDevanagariLineHeight,
  getDevanagariTextStyle,
} from '../../theme';

export interface VInputProps extends Omit<RNTextInputProps, 'style'> {
  /** Label displayed above the input field */
  label?: string;
  /** Current input value */
  value?: string;
  /** Callback triggered when value changes */
  onChangeText?: (text: string) => void;
  /** Placeholder hint text */
  placeholder?: string;
  /** Helper text displayed below the input */
  helperText?: string;
  /** Error message displayed below input, switches border to alert state */
  errorMessage?: string;
  /** Leading icon node rendered inside the left bounds */
  leadingIcon?: React.ReactNode;
  /** Trailing icon node rendered inside the right bounds */
  trailingIcon?: React.ReactNode;
  /** Success validity indicator */
  isValid?: boolean;
  /** Masks characters with secure password entry and appends eye toggle */
  isSecure?: boolean;
  /** Disables editing and dims visual opacity */
  isDisabled?: boolean;
  /** Renders clear text button when value is non-empty */
  allowClear?: boolean;
  /** Callback fired when clear button is pressed */
  onClear?: () => void;
  /** Explicit Devanagari script override (auto-detected if undefined) */
  isDevanagari?: boolean;
  /** Outer container style */
  containerStyle?: StyleProp<ViewStyle>;
  /** Input container (border box) style */
  inputContainerStyle?: StyleProp<ViewStyle>;
  /** Inner TextInput style */
  inputStyle?: StyleProp<TextStyle>;
  /** Label text style override */
  labelStyle?: StyleProp<TextStyle>;
  /** Helper or error message style override */
  helperStyle?: StyleProp<TextStyle>;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Accessibility hint */
  accessibilityHint?: string;
  /** Test identifier */
  testID?: string;
}

export type TextInputProps = VInputProps;

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

export const VInput = forwardRef<any, VInputProps>(function VInput(
  {
    label,
    value,
    onChangeText,
    placeholder,
    placeholderTextColor,
    helperText,
    errorMessage,
    leadingIcon,
    trailingIcon,
    isValid = false,
    isSecure = false,
    secureTextEntry,
    isDisabled = false,
    editable = true,
    allowClear = false,
    onClear,
    isDevanagari: isDevanagariProp,
    containerStyle,
    inputContainerStyle,
    inputStyle,
    labelStyle,
    helperStyle,
    onFocus,
    onBlur,
    multiline = false,
    numberOfLines,
    accessibilityLabel,
    accessibilityHint,
    testID,
    ...rest
  },
  ref
) {
  const theme = useTheme();
  const innerRef = useRef<ComponentRef<typeof RNTextInput>>(null);

  useImperativeHandle(ref, () => innerRef.current);

  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // Script detection
  const hasDevanagari =
    isDevanagariProp ??
    (DEVANAGARI_REGEX.test(label || '') ||
      DEVANAGARI_REGEX.test(placeholder || '') ||
      DEVANAGARI_REGEX.test(value || ''));

  const effectiveEditable = !isDisabled && editable;
  const effectiveSecure = (isSecure || secureTextEntry) && !isPasswordVisible;
  const hasError = Boolean(errorMessage);

  // Focus and Blur handlers
  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const handleClear = () => {
    onChangeText?.('');
    onClear?.();
    innerRef.current?.clear();
  };

  // Typography resolution
  const inputFontSize = Math.max(MIN_FONT_SIZE, theme.typography.bodyMedium.fontSize);
  const inputLineHeight = hasDevanagari
    ? getDevanagariLineHeight(inputFontSize)
    : theme.typography.bodyMedium.lineHeight;

  const inputFontFamily = hasDevanagari
    ? getDevanagariTextStyle('bodyMedium').fontFamily
    : theme.typography.bodyMedium.fontFamily;

  // Devanagari requires +4dp vertical clearance to avoid glyph/matra clipping
  const verticalPadding = hasDevanagari
    ? theme.spacing.sm + DEVANAGARI_VERTICAL_CLEARANCE
    : theme.spacing.sm;

  // Border and background state resolution
  let borderColor = theme.colors.borderDefault;
  let borderWidth = 1;
  if (hasError) {
    borderColor = theme.colors.statusAlert;
    borderWidth = 1.5;
  } else if (isFocused) {
    borderColor = theme.colors.borderAccent;
    borderWidth = 1.5;
  } else if (isValid) {
    borderColor = theme.colors.statusActive;
  }

  const labelTypography = hasDevanagari
    ? getDevanagariTextStyle('labelMedium')
    : theme.typography.labelMedium;

  const captionTypography = hasDevanagari
    ? getDevanagariTextStyle('caption')
    : theme.typography.caption;

  const labelColor = hasError
    ? theme.colors.statusAlert
    : isFocused
    ? theme.colors.borderAccent
    : theme.colors.textPrimary;

  return (
    <View style={[styles.outerContainer, containerStyle]}>
      {/* Label */}
      {label ? (
        <Text
          style={[
            styles.label,
            {
              fontFamily: labelTypography.fontFamily,
              fontSize: Math.max(MIN_FONT_SIZE, labelTypography.fontSize),
              lineHeight: labelTypography.lineHeight,
              color: labelColor,
              marginBottom: theme.spacing.xs,
            },
            labelStyle,
          ]}
        >
          {label}
        </Text>
      ) : null}

      {/* Input container box */}
      <Pressable
        onPress={() => innerRef.current?.focus()}
        accessible={false}
        style={[
          styles.inputContainer,
          {
            minHeight: theme.spacing.touch,
            backgroundColor: theme.colors.surfaceCard,
            borderColor,
            borderWidth,
            borderRadius: theme.radii.md,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: verticalPadding,
            opacity: effectiveEditable ? 1 : 0.5,
          },
          multiline && styles.multilineContainer,
          inputContainerStyle,
        ]}
      >
        {/* Leading icon */}
        {leadingIcon ? (
          <View style={[styles.iconWrapper, { marginRight: theme.spacing.sm }]}>
            {leadingIcon}
          </View>
        ) : null}

        {/* Core TextInput */}
        <RNTextInput
          ref={innerRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor ?? theme.colors.textMuted}
          editable={effectiveEditable}
          secureTextEntry={effectiveSecure}
          multiline={multiline}
          numberOfLines={numberOfLines}
          onFocus={handleFocus}
          onBlur={handleBlur}
          accessibilityLabel={accessibilityLabel || label || placeholder}
          accessibilityHint={accessibilityHint}
          testID={testID}
          style={[
            styles.textInput,
            {
              fontFamily: inputFontFamily,
              fontSize: inputFontSize,
              lineHeight: inputLineHeight,
              color: theme.colors.textPrimary,
              paddingVertical: 0,
            },
            multiline && { textAlignVertical: 'top' },
            inputStyle,
          ]}
          {...rest}
        />

        {/* Clear Button */}
        {allowClear && Boolean(value) && effectiveEditable ? (
          <Pressable
            onPress={handleClear}
            hitSlop={{
              top: theme.spacing.md,
              bottom: theme.spacing.md,
              left: theme.spacing.md,
              right: theme.spacing.md,
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear text"
            style={[styles.iconWrapper, { marginLeft: theme.spacing.xs }]}
          >
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}

        {/* Secure Text Entry Password Toggle */}
        {(isSecure || secureTextEntry) && effectiveEditable ? (
          <Pressable
            onPress={() => setIsPasswordVisible((prev) => !prev)}
            hitSlop={{
              top: theme.spacing.md,
              bottom: theme.spacing.md,
              left: theme.spacing.md,
              right: theme.spacing.md,
            }}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
            style={[styles.iconWrapper, { marginLeft: theme.spacing.xs }]}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.colors.textMuted}
            />
          </Pressable>
        ) : null}

        {/* Valid Checkmark Indicator */}
        {isValid && !trailingIcon && !isSecure && !secureTextEntry && !allowClear ? (
          <View style={[styles.iconWrapper, { marginLeft: theme.spacing.xs }]}>
            <Ionicons name="checkmark-circle" size={20} color={theme.colors.statusActive} />
          </View>
        ) : null}

        {/* Custom Trailing Icon */}
        {trailingIcon ? (
          <View style={[styles.iconWrapper, { marginLeft: theme.spacing.xs }]}>
            {trailingIcon}
          </View>
        ) : null}
      </Pressable>

      {/* Helper text or Error message */}
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
              styles.helperText,
              {
                fontFamily: captionTypography.fontFamily,
                fontSize: Math.max(MIN_FONT_SIZE, captionTypography.fontSize),
                lineHeight: captionTypography.lineHeight,
                color: theme.colors.statusAlert,
              },
              helperStyle,
            ]}
          >
            {errorMessage}
          </Text>
        </View>
      ) : helperText ? (
        <View style={[styles.feedbackRow, { marginTop: theme.spacing.xs }]}>
          <Text
            style={[
              styles.helperText,
              {
                fontFamily: captionTypography.fontFamily,
                fontSize: Math.max(MIN_FONT_SIZE, captionTypography.fontSize),
                lineHeight: captionTypography.lineHeight,
                color: theme.colors.textMuted,
              },
              helperStyle,
            ]}
          >
            {helperText}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
  },
  label: {
    letterSpacing: 0.1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  multilineContainer: {
    alignItems: 'flex-start',
  },
  textInput: {
    flex: 1,
    padding: 0,
    margin: 0,
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  helperText: {
    flexShrink: 1,
  },
});

export const TextInput = VInput;

export default VInput;

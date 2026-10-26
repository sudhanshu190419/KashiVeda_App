import React, { useRef, useState, useEffect, ComponentRef } from 'react';
import {
  View,
  Text,
  TextInput as RNTextInput,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme, MIN_FONT_SIZE } from '../../theme';

export interface OtpPinInputProps {
  /** Number of OTP PIN cells (default: 6) */
  length?: number;
  /** Current OTP value string */
  value: string;
  /** Callback fired whenever the OTP value changes */
  onChange: (otp: string) => void;
  /** Callback fired when all digits have been entered */
  onComplete?: (otp: string) => void;
  /** Flags input state as error */
  isError?: boolean;
  /** Optional error message displayed beneath the cells */
  errorMessage?: string;
  /** Disables input interactions and dims opacity */
  isDisabled?: boolean;
  /** Automatically focuses the first empty cell on mount */
  autoFocus?: boolean;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Test identifier */
  testID?: string;
  /** Optional container style override */
  containerStyle?: StyleProp<ViewStyle>;
}

export const OtpPinInput: React.FC<OtpPinInputProps> = ({
  length = 6,
  value = '',
  onChange,
  onComplete,
  isError = false,
  errorMessage,
  isDisabled = false,
  autoFocus = false,
  accessibilityLabel = '6-digit verification code',
  testID = 'otp-pin-input',
  containerStyle,
}) => {
  const theme = useTheme();
  const inputRefs = useRef<Array<ComponentRef<typeof RNTextInput> | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(autoFocus ? 0 : null);

  const hasError = isError || Boolean(errorMessage);

  // Split value into an array of individual digits up to target length
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  // Auto-focus on initial mount if enabled
  useEffect(() => {
    if (autoFocus && !isDisabled) {
      const firstEmptyIndex = digits.findIndex((d) => !d);
      const targetIndex = firstEmptyIndex === -1 ? 0 : firstEmptyIndex;
      inputRefs.current[targetIndex]?.focus();
      setFocusedIndex(targetIndex);
    }
  }, []);

  const handleCellChange = (text: string, index: number) => {
    if (isDisabled) return;

    // Handle paste of multi-character string
    const sanitized = text.replace(/\D/g, '');
    if (sanitized.length > 1) {
      const newDigits = [...digits];
      for (let k = 0; k < sanitized.length && index + k < length; k++) {
        newDigits[index + k] = sanitized[k];
      }
      const nextValue = newDigits.join('').slice(0, length);
      onChange(nextValue);

      if (nextValue.length === length) {
        onComplete?.(nextValue);
        inputRefs.current[length - 1]?.blur();
        setFocusedIndex(null);
      } else {
        const nextFocus = Math.min(index + sanitized.length, length - 1);
        inputRefs.current[nextFocus]?.focus();
        setFocusedIndex(nextFocus);
      }
      return;
    }

    // Handle single digit input
    const singleDigit = sanitized.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = singleDigit;
    const nextValue = newDigits.join('').slice(0, length);
    onChange(nextValue);

    if (singleDigit) {
      if (index < length - 1) {
        inputRefs.current[index + 1]?.focus();
        setFocusedIndex(index + 1);
      } else {
        // Last cell filled
        if (nextValue.length === length) {
          onComplete?.(nextValue);
        }
      }
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (isDisabled) return;

    if (e.nativeEvent.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Move back and clear previous cell
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        onChange(newDigits.join(''));
        inputRefs.current[index - 1]?.focus();
        setFocusedIndex(index - 1);
      } else {
        // Clear current cell
        const newDigits = [...digits];
        newDigits[index] = '';
        onChange(newDigits.join(''));
      }
    }
  };

  const captionTypography = theme.typography.caption;

  return (
    <View
      style={[styles.container, containerStyle]}
      accessibilityRole="none"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {/* Cells row */}
      <View style={styles.cellsRow}>
        {digits.map((digit, index) => {
          const isCellFocused = focusedIndex === index;
          const isCellFilled = Boolean(digit);

          let cellBorderColor = theme.colors.borderDefault;
          let cellBorderWidth = 1;

          if (hasError) {
            cellBorderColor = theme.colors.statusAlert;
            cellBorderWidth = 1.5;
          } else if (isCellFocused) {
            cellBorderColor = theme.colors.borderAccent;
            cellBorderWidth = 2;
          } else if (isCellFilled) {
            cellBorderColor = theme.colors.brandPrimary;
          }

          return (
            <Pressable
              key={`otp-cell-${index}`}
              onPress={() => {
                if (!isDisabled) {
                  inputRefs.current[index]?.focus();
                }
              }}
              hitSlop={{ top: 6, bottom: 6 }}
              style={[
                styles.cellWrapper,
                {
                  height: theme.spacing.touch,
                  borderRadius: theme.radii.md,
                  borderColor: cellBorderColor,
                  borderWidth: cellBorderWidth,
                  backgroundColor: theme.colors.surfaceCard,
                  marginHorizontal: theme.spacing.xxs,
                  opacity: isDisabled ? 0.5 : 1,
                },
              ]}
            >
              <RNTextInput
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                value={digit}
                onChangeText={(text) => handleCellChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => {
                  if (focusedIndex === index) {
                    setFocusedIndex(null);
                  }
                }}
                keyboardType="number-pad"
                maxLength={length}
                editable={!isDisabled}
                selectTextOnFocus
                textAlign="center"
                accessibilityLabel={`PIN digit ${index + 1} of ${length}`}
                style={[
                  styles.cellInput,
                  {
                    fontFamily: theme.typography.headlineMedium.fontFamily,
                    fontSize: Math.max(MIN_FONT_SIZE, theme.typography.headlineMedium.fontSize),
                    lineHeight: theme.typography.headlineMedium.lineHeight,
                    color: theme.colors.textPrimary,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {/* Error Feedback */}
      {hasError && errorMessage ? (
        <View style={[styles.feedbackRow, { marginTop: theme.spacing.sm }]}>
          <Ionicons
            name="alert-circle-outline"
            size={14}
            color={theme.colors.statusAlert}
            style={{ marginRight: theme.spacing.xxs }}
          />
          <Text
            style={[
              styles.errorText,
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
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  cellsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  cellWrapper: {
    flex: 1,
    maxWidth: 46,
    minWidth: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellInput: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    padding: 0,
    margin: 0,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    flexShrink: 1,
  },
});

export default OtpPinInput;

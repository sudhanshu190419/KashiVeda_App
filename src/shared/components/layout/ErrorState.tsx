import React from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { ERROR_STATE_MESSAGES } from '../../constants';
import { VText } from '../foundations/VText';
import { VButton } from '../foundations/VButton';

export interface ErrorStateProps {
  title?: string;
  titleHi?: string;
  message?: string;
  messageHi?: string;
  onRetry?: () => void;
  variant?: 'fullscreen' | 'inline';
  style?: StyleProp<ViewStyle>;
}

/**
 * ErrorState — Error recovery view with honest failure copy and retry trigger.
 *
 * Enforces:
 * - Authentic error copy derived from ERROR_STATE_MESSAGES in @/constants
 * - 2 Display variants: 'fullscreen' (for screen-level failures) and 'inline' (for widget/card failures)
 * - 48dp minimum touch bounds for retry triggers
 * - Zero raw hex codes — all borders and alerts bound to theme feedback tokens
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  title,
  titleHi,
  message,
  messageHi,
  onRetry,
  variant = 'fullscreen',
  style,
}) => {
  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();

  const retryButtonLabel =
    language === 'hi'
      ? ERROR_STATE_MESSAGES.retry.hi
      : ERROR_STATE_MESSAGES.retry.en;

  const hasCustomTitle = title !== undefined || titleHi !== undefined;
  const hasCustomMessage = message !== undefined || messageHi !== undefined;

  const resolvedTitle = language === 'hi'
    ? hasCustomTitle
      ? titleHi ?? title
      : variant === 'fullscreen'
        ? ERROR_STATE_MESSAGES.loadFailed.hi
        : undefined
    : hasCustomTitle
      ? title
      : variant === 'fullscreen'
        ? ERROR_STATE_MESSAGES.loadFailed.en
        : undefined;

  const resolvedMessage = language === 'hi'
    ? hasCustomMessage
      ? messageHi ?? message
      : ERROR_STATE_MESSAGES.networkError.hi
    : hasCustomMessage
      ? message
      : ERROR_STATE_MESSAGES.networkError.en;

  // INLINE VARIANT
  if (variant === 'inline') {
    return (
      <View
        style={[
          styles.inlineContainer,
          {
            backgroundColor: colors.errorBg,
            borderColor: colors.statusAlert,
            borderRadius: radii.md,
            padding: spacing.md,
          },
          style,
        ]}
      >
        <View style={styles.inlineHeaderRow}>
          <Ionicons
            name="alert-circle-outline"
            size={22}
            color={colors.errorFg}
            style={{ marginRight: spacing.sm }}
          />
          <View style={styles.inlineTextColumn}>
            {resolvedTitle ? (
              <VText variant="titleSmall" color="error" weight="700">
                {resolvedTitle}
              </VText>
            ) : null}
            {resolvedMessage ? (
              <VText
                variant="bodyMedium"
                color="error"
                style={{ marginTop: resolvedTitle ? spacing.xxs : 0 }}
              >
                {resolvedMessage}
              </VText>
            ) : null}
          </View>
        </View>

        {onRetry ? (
          <View style={[styles.inlineActionRow, { marginTop: spacing.md }]}>
            <VButton
              label={retryButtonLabel}
              onPress={onRetry}
              variant="destructive"
              size="sm"
            />
          </View>
        ) : null}
      </View>
    );
  }

  // FULLSCREEN VARIANT (Default)
  return (
    <View style={[styles.fullscreenContainer, { padding: spacing.xxl }, style]}>
      {/* Error Icon in tinted circle */}
      <View
        style={[
          styles.errorIconHalo,
          {
            backgroundColor: colors.errorBg,
            borderColor: colors.statusAlert,
            borderRadius: radii.full,
            marginBottom: spacing.lg,
          },
        ]}
      >
        <Ionicons name="alert-circle" size={40} color={colors.errorFg} />
      </View>

      {/* Error title */}
      <View style={[styles.textBlock, { marginBottom: spacing.sm }]}>
        {resolvedTitle ? (
          <VText
            variant="headlineSmall"
            color="textPrimary"
            align="center"
            style={styles.devanagariTitle}
          >
            {resolvedTitle}
          </VText>
        ) : null}
      </View>

      {/* Error message */}
      <View style={[styles.textBlock, { marginBottom: onRetry ? spacing.xxl : 0 }]}>
        {resolvedMessage ? (
          <VText variant="bodyMedium" color="textMuted" align="center">
            {resolvedMessage}
          </VText>
        ) : null}
      </View>

      {/* Retry Action */}
      {onRetry ? (
        <View style={styles.actionWrapper}>
          <VButton
            label={retryButtonLabel}
            onPress={onRetry}
            variant="secondary"
            size="lg"
          />
        </View>
      ) : null}
    </View>
  );
};

export const VErrorState = ErrorState;

export default ErrorState;

const styles = StyleSheet.create({
  fullscreenContainer: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIconHalo: {
    width: 80,
    height: 80,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignItems: 'center',
    maxWidth: 320,
  },
  devanagariTitle: {
    marginBottom: 4,
  },
  actionWrapper: {
    minWidth: 200,
  },
  inlineContainer: {
    width: '100%',
    borderWidth: 1,
  },
  inlineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  inlineTextColumn: {
    flex: 1,
  },
  inlineActionRow: {
    alignItems: 'flex-end',
  },
});

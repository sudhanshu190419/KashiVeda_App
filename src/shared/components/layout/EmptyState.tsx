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
import { VText } from '../foundations/VText';
import { VButton } from '../foundations/VButton';

export interface EmptyStateProps {
  icon?: string | React.ReactNode;
  title: string;
  titleHi?: string;
  subtitle?: string;
  subtitleHi?: string;
  /** Alias for subtitle for ergonomic DX */
  description?: string;
  /** Alias for subtitleHi for ergonomic DX */
  descriptionHi?: string;
  /** Alias for subtitle for ergonomic DX */
  message?: string;
  actionLabel?: string;
  actionLabelHi?: string;
  /** Alias for actionLabel for backwards compatibility */
  actionTitle?: string;
  onActionPress?: () => void;
  /** Alias for onActionPress for backwards compatibility */
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * EmptyState — Honest zero-data view with sacred Vedic ornament and action CTA.
 *
 * Enforces:
 * - Zero mock data policy: authentic bilingual messaging for empty bookings, reviews, kundlis
 * - Sacred halo iconography anchored in theme colors
 * - 48dp touch target on recovery/action button
 * - Bilingual typography with Devanagari line-height >= 1.5x
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'flower-outline',
  title,
  titleHi,
  subtitle,
  subtitleHi,
  description,
  descriptionHi,
  message,
  actionLabel,
  actionLabelHi,
  actionTitle,
  onActionPress,
  onAction,
  style,
}) => {
  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();

  const effectiveActionLabel = actionLabel ?? actionTitle;
  const effectiveActionPress = onActionPress ?? onAction;

  const resolvedSubtitle = subtitle ?? description ?? message;
  const resolvedTitle = language === 'hi' ? titleHi ?? title : title;
  const resolvedBody =
    language === 'hi'
      ? subtitleHi ?? descriptionHi ?? resolvedSubtitle
      : resolvedSubtitle;
  const resolvedAction =
    language === 'hi' ? actionLabelHi ?? effectiveActionLabel : effectiveActionLabel;

  // Render icon slot (either custom ReactNode or Ionicons glyph)
  const renderIcon = () => {
    if (React.isValidElement(icon)) {
      return icon;
    }
    const iconName = typeof icon === 'string' ? icon : 'flower-outline';
    return <Ionicons name={iconName} size={36} color={colors.brandPrimary} />;
  };

  return (
    <View style={[styles.container, { padding: spacing.xxl }, style]}>
      {/* Sacred Halo Icon Container */}
      <View
        style={[
          styles.haloContainer,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.borderDefault,
            borderRadius: radii.full,
            marginBottom: spacing.lg,
          },
        ]}
      >
        {renderIcon()}
      </View>

      {/* Title */}
      <View style={[styles.textBlock, { marginBottom: spacing.sm }]}>
        <VText
          variant="headlineSmall"
          color="textPrimary"
          align="center"
          style={styles.devanagariTitle}
        >
          {resolvedTitle}
        </VText>
      </View>

      {/* Supporting copy */}
      <View
        style={[
          styles.textBlock,
          { marginBottom: resolvedAction && effectiveActionPress ? spacing.xxl : 0 },
        ]}
      >
        {resolvedBody ? (
          <VText variant="bodyMedium" color="textMuted" align="center">
            {resolvedBody}
          </VText>
        ) : null}
      </View>

      {/* Primary Action Button */}
      {resolvedAction && effectiveActionPress ? (
        <View style={styles.actionWrapper}>
          <VButton
            label={resolvedAction}
            onPress={effectiveActionPress}
            variant="primary"
            size="lg"
          />
        </View>
      ) : null}
    </View>
  );
};

export const VEmptyState = EmptyState;

export default EmptyState;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloContainer: {
    width: 76,
    height: 76,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignItems: 'center',
    maxWidth: 320,
  },
  devanagariTitle: {
    marginBottom: 2,
  },
  actionWrapper: {
    minWidth: 180,
  },
});

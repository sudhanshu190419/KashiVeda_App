import React from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '../icons';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { VText } from '../foundations/VText';

export type BannerAlertType = 'escrow' | 'info' | 'warning' | 'success' | 'error';

export interface BannerAlertProps {
  /** Alert type category */
  type?: BannerAlertType;
  /** Optional alert title (English) */
  title?: string;
  /** Optional alert title (Devanagari Hindi) */
  titleHi?: string;
  /** Primary alert message (English or combined) */
  message: string;
  /** Optional alert message (Devanagari Hindi) */
  messageHi?: string;
  /** Optional action button label */
  actionLabel?: string;
  /** Optional action button label in Hindi */
  actionLabelHi?: string;
  /** Action button tap handler */
  onActionPress?: () => void;
  /** Optional dismiss handler */
  onDismiss?: () => void;
  /** Container styling overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

/**
 * BannerAlert — Sacred and Informational Context Banner
 *
 * Used extensively across Customer screens (C-02 Discovery Escrow, C-03 Rahukaal Alert,
 * C-06 Sankalp Accuracy, C-08 Escrow Model, C-19 Subscription Trial).
 *
 * Enforces:
 * - 5 Semantic types including dedicated 'escrow' guarantee styling
 * - 48x48dp minimum touch target floor on dismiss and action buttons
 * - Devanagari line-height >= 1.5x and vertical clearance
 * - Theme-grounded semantic tokens (Zero raw hex codes)
 */
export const BannerAlert: React.FC<BannerAlertProps> = ({
  type = 'info',
  title,
  titleHi,
  message,
  messageHi,
  actionLabel,
  actionLabelHi,
  onActionPress,
  onDismiss,
  style,
  testID = 'banner-alert',
}) => {
  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();

  const resolvedTitle = language === 'hi' ? titleHi ?? title : title;
  const resolvedMessage = language === 'hi' ? messageHi ?? message : message;

  // Resolve type tokens
  const typeTokens = (() => {
    switch (type) {
      case 'escrow':
        return {
          bg: colors.surfaceSubtle,
          border: colors.borderAccent,
          accent: colors.brandPrimary,
          iconFamily: 'mci' as const,
          iconName: 'shield-lock-outline',
          label: 'Escrow Guarantee',
        };
      case 'warning':
        return {
          bg: colors.warningBg,
          border: colors.warningFg,
          accent: colors.warningFg,
          iconFamily: 'ionicons' as const,
          iconName: 'warning-outline',
          label: 'Warning Alert',
        };
      case 'error':
        return {
          bg: colors.errorBg,
          border: colors.statusAlert,
          accent: colors.statusAlert,
          iconFamily: 'ionicons' as const,
          iconName: 'alert-circle-outline',
          label: 'Error Alert',
        };
      case 'success':
        return {
          bg: colors.successBg,
          border: colors.statusActive,
          accent: colors.statusActive,
          iconFamily: 'ionicons' as const,
          iconName: 'checkmark-circle-outline',
          label: 'Success Notification',
        };
      case 'info':
      default:
        return {
          bg: colors.infoBg,
          border: colors.infoFg,
          accent: colors.infoFg,
          iconFamily: 'ionicons' as const,
          iconName: 'information-circle-outline',
          label: 'Information Notice',
        };
    }
  })();

  const resolvedActionLabel =
    language === 'hi' ? actionLabelHi ?? actionLabel : actionLabel;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: typeTokens.bg,
          borderColor: typeTokens.border,
          borderRadius: radii.md,
          padding: spacing.md,
        },
        style,
      ]}
      testID={testID}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLabel={`${typeTokens.label}: ${resolvedTitle ? resolvedTitle + ' - ' : ''}${resolvedMessage}`}
    >
      <View style={styles.contentRow}>
        {/* Leading Semantic Icon */}
        <View
          style={[
            styles.iconWrapper,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: typeTokens.border,
              borderRadius: radii.full,
              marginRight: spacing.sm,
            },
          ]}
        >
          {typeTokens.iconFamily === 'mci' ? (
            <MaterialCommunityIcons
              name={typeTokens.iconName as any}
              size={18}
              color={typeTokens.accent}
            />
          ) : (
            <Ionicons
              name={typeTokens.iconName as any}
              size={18}
              color={typeTokens.accent}
            />
          )}
        </View>

        {/* Text Body */}
        <View style={styles.textColumn}>
          {/* Title */}
          {resolvedTitle ? (
            <VText
              variant="labelLarge"
              weight="700"
              color={type === 'escrow' ? 'brandPrimary' : 'textPrimary'}
            >
              {resolvedTitle}
            </VText>
          ) : null}

          {/* Primary Message */}
          <VText
            variant="bodyMedium"
            weight="500"
            color="textPrimary"
            style={{ marginTop: resolvedTitle ? spacing.xxs : 0 }}
          >
            {resolvedMessage}
          </VText>

          {/* Optional Inline Action Button */}
          {resolvedActionLabel && onActionPress ? (
            <Pressable
              onPress={onActionPress}
              style={[
                styles.actionButton,
                {
                  marginTop: spacing.xs,
                  paddingVertical: spacing.xxs,
                },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={resolvedActionLabel}
            >
              <VText
                variant="labelMedium"
                weight="700"
                color={typeTokens.accent === colors.brandPrimary ? 'brandPrimary' : 'textPrimary'}
              >
                {resolvedActionLabel}
              </VText>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={typeTokens.accent}
                style={{ marginLeft: 2 }}
              />
            </Pressable>
          ) : null}
        </View>

        {/* Optional Dismiss Button — 48x48dp Touch Target Floor */}
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            style={styles.dismissButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss alert"
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

export default BannerAlert;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderWidth: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  actionButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  dismissButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});

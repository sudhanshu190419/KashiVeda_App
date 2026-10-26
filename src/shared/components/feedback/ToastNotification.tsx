import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Animated,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Platform,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { VText } from '../foundations/VText';

export interface ToastNotificationProps {
  message: string;
  messageHi?: string;
  type?: 'success' | 'error' | 'info';
  isVisible: boolean;
  onDismiss: () => void;
  actionLabel?: string;
  actionLabelHi?: string;
  onActionPress?: () => void;
  durationMs?: number; // default 4000
  position?: 'top' | 'bottom';
  style?: StyleProp<ViewStyle>;
}

/**
 * ToastNotification — Auto-dismissing snackbar/toast for transient feedback.
 *
 * Grounded in Kashi Veda design system:
 * - 4000ms default auto-dismiss lifecycle
 * - Smooth slide & fade native-driven animation
 * - Accessible alert role & live region for screen readers
 * - Guaranteed 48x48dp touch bounds for dismiss & action triggers
 * - Single-locale typography resolved from the `*` / `*Hi` prop pairs
 * - Zero raw hex codes (fully themed via useTheme())
 */
export const ToastNotification: React.FC<ToastNotificationProps> = ({
  message,
  messageHi,
  type = 'info',
  isVisible,
  onDismiss,
  actionLabel,
  actionLabelHi,
  onActionPress,
  durationMs = 4000,
  position = 'bottom',
  style,
}) => {
  const { colors, spacing, radii, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  const resolvedMessage = isHi ? messageHi || message : message;
  const resolvedActionLabel = isHi ? actionLabelHi || actionLabel : actionLabel;

  // Internal state to keep DOM mounted while animating out
  const [isRendered, setIsRendered] = useState<boolean>(isVisible);

  const initialOffset = position === 'top' ? -120 : 120;
  const translateY = useRef(new Animated.Value(initialOffset)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isVisible) {
      setIsRendered(true);

      // Slide and fade in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 75,
          friction: 9,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      // Schedule auto-dismiss
      if (durationMs > 0) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          onDismiss();
        }, durationMs);
      }
    } else {
      // Clear any pending timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // Slide and fade out
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: position === 'top' ? -120 : 120,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setIsRendered(false);
        }
      });
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isVisible, durationMs, onDismiss, position, opacity, translateY]);

  if (!isRendered && !isVisible) {
    return null;
  }

  // Variant color mapping
  const variantTokens = (() => {
    switch (type) {
      case 'success':
        return {
          bg: colors.successBg,
          border: colors.statusActive,
          accent: colors.statusActive,
          iconName: 'checkmark-circle' as const,
          label: 'Success notification',
          labelHi: 'सफल सूचना',
        };
      case 'error':
        return {
          bg: colors.errorBg,
          border: colors.statusAlert,
          accent: colors.statusAlert,
          iconName: 'alert-circle' as const,
          label: 'Error notification',
          labelHi: 'त्रुटि सूचना',
        };
      case 'info':
      default:
        return {
          bg: colors.infoBg,
          border: colors.infoFg,
          accent: colors.infoFg,
          iconName: 'information-circle' as const,
          label: 'Information notification',
          labelHi: 'जानकारी सूचना',
        };
    }
  })();

  const topInset = Platform.OS === 'ios' ? spacing.xxxxl + spacing.xs : spacing.xxxl;
  const bottomInset = Platform.OS === 'ios' ? spacing.xxxl : spacing.xl;

  return (
    <View
      style={[
        styles.overlayWrapper,
        position === 'top' ? { top: topInset } : { bottom: bottomInset },
      ]}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[
          styles.toastCard,
          {
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderLeftColor: variantTokens.accent,
            borderRadius: radii.md,
            transform: [{ translateY }],
            opacity,
            ...elevation.elevation3,
          },
          style,
        ]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${isHi ? variantTokens.labelHi : variantTokens.label}: ${resolvedMessage}`}
      >
        {/* Leading Variant Icon */}
        <View
          style={[
            styles.iconWrapper,
            {
              backgroundColor: variantTokens.bg,
              borderRadius: radii.full,
              marginRight: spacing.sm,
            },
          ]}
        >
          <Ionicons
            name={variantTokens.iconName}
            size={22}
            color={variantTokens.accent}
          />
        </View>

        {/* Text Content Column */}
        <View style={styles.messageCol}>
          <VText
            variant="bodyMedium"
            weight="600"
            color="textPrimary"
            isDevanagari={isHi}
            numberOfLines={2}
          >
            {resolvedMessage}
          </VText>
        </View>

        {/* Optional Action Button */}
        {(actionLabel || actionLabelHi) && onActionPress ? (
          <Pressable
            onPress={onActionPress}
            style={[
              styles.actionButton,
              {
                marginHorizontal: spacing.xs,
                paddingHorizontal: spacing.sm,
              },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={resolvedActionLabel}
          >
            <VText
              variant="labelMedium"
              weight="700"
              color={variantTokens.accent}
              isDevanagari={isHi}
            >
              {resolvedActionLabel}
            </VText>
          </Pressable>
        ) : null}

        {/* Dismiss Icon Button (guaranteed 48x48dp touch bounds) */}
        <Pressable
          onPress={onDismiss}
          style={[styles.dismissButton, { marginLeft: spacing.xxs }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={isHi ? 'सूचना बंद करें' : 'Dismiss notification'}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </Animated.View>
    </View>
  );
};

export default ToastNotification;

const styles = StyleSheet.create({
  overlayWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
  },
  toastCard: {
    width: '92%',
    maxWidth: 440,
    minHeight: 52,
    borderWidth: 1,
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageCol: {
    flex: 1,
    justifyContent: 'center',
  },
  actionButton: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

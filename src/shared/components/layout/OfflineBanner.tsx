import React from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme } from '../../theme';
import { VText } from '../foundations/VText';

export interface OfflineBannerProps {
  isOffline?: boolean;
  message?: string;
  messageHi?: string;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * OfflineBanner — Contextual indicator informing that device is offline and cached SQLite data is active.
 *
 * Enforces:
 * - Clear honest explanation of offline SQLite cache operation
 * - 48x48dp minimum touch bounds for the dismiss trigger
 * - Subtle amber/sacred border warning aesthetic without harsh ungrounded alerts
 * - Bilingual support for English and Devanagari text
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  isOffline = true,
  message = 'Offline mode: Showing cached Vedic records.',
  messageHi = 'ऑफलाइन मोड: कैश्ड डेटा दिखाया जा रहा है।',
  onDismiss,
  style,
}) => {
  const { colors, spacing, radii } = useTheme();

  if (!isOffline) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceSubtle,
          borderColor: colors.borderAccent,
          borderRadius: radii.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginHorizontal: spacing.lg,
          marginVertical: spacing.sm,
        },
        style,
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`${messageHi} ${message}`}
    >
      <View style={styles.contentRow}>
        <View
          style={[
            styles.iconWrapper,
            {
              marginRight: spacing.sm,
            },
          ]}
        >
          <Ionicons name="cloud-offline-outline" size={20} color={colors.brandPrimary} />
        </View>

        <View style={styles.textColumn}>
          {messageHi ? (
            <VText variant="labelMedium" color="textPrimary" weight="600">
              {messageHi}
            </VText>
          ) : null}

          {message ? (
            <VText
              variant="caption"
              color="textMuted"
              style={{ marginTop: messageHi ? spacing.xxs : 0 }}
            >
              {message}
            </VText>
          ) : null}
        </View>

        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            style={styles.dismissButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss offline banner"
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

export default OfflineBanner;

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  dismissButton: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

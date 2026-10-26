import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '../icons';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { VText } from '../foundations/VText';
import { VButton } from '../foundations/VButton';
import { VDivider } from '../foundations/VDivider';

export interface ReceiptMetric {
  label: string;
  labelHi?: string;
  value: string;
}

export interface SuccessCelebrationProps {
  visible: boolean;
  onClose?: () => void;
  title: string;
  titleHi?: string;
  subtitle: string;
  subtitleHi?: string;
  bookingId?: string;
  metrics?: ReceiptMetric[];
  primaryActionLabel: string;
  primaryActionLabelHi?: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  secondaryActionLabelHi?: string;
  onSecondaryAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * SuccessCelebration — Celebratory view for completed rituals (Purnahuti) or confirmed bookings.
 *
 * Grounded in Kashi Veda design system:
 * - Sacred golden aesthetic with consecrated ॐ (Om) medallion & aura
 * - Summary receipt metrics card with clean key-value breakdowns
 * - Smooth entrance scale & pulse animation for the sacred seal
 * - Guaranteed 48x48dp touch bounds on every button
 * - Single-locale typography resolved from the `*` / `*Hi` prop pairs
 * - Zero raw hex codes (fully themed via useTheme())
 */
export const SuccessCelebration: React.FC<SuccessCelebrationProps> = ({
  visible,
  onClose,
  title,
  titleHi,
  subtitle,
  subtitleHi,
  bookingId,
  metrics,
  primaryActionLabel,
  primaryActionLabelHi,
  onPrimaryAction,
  secondaryActionLabel,
  secondaryActionLabelHi,
  onSecondaryAction,
  style,
}) => {
  const { colors, spacing, radii, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 70,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  const resolvedTitle = isHi ? titleHi || title : title;
  const resolvedSubtitle = isHi ? subtitleHi || subtitle : subtitle;

  const resolvedPrimaryLabel = isHi
    ? primaryActionLabelHi || primaryActionLabel
    : primaryActionLabel;

  const resolvedSecondaryLabel = secondaryActionLabel
    ? isHi
      ? secondaryActionLabelHi || secondaryActionLabel
      : secondaryActionLabel
    : undefined;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
      accessibilityRole="alert"
    >
      <View style={styles.overlayContainer}>
        {/* Backdrop Press Dismiss */}
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlayScrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={isHi ? 'बंद करें' : 'Dismiss celebration backdrop'}
        />

        {/* Sacred Celebration Card */}
        <Animated.View
          style={[
            styles.celebrationCard,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderAccent,
              borderRadius: radii.sheet,
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
              ...elevation.elevation4,
            },
            style,
          ]}
          accessibilityRole="alert"
          accessibilityLabel={`${resolvedTitle} - ${resolvedSubtitle}`}
        >
          {/* Optional Top Close Button */}
          {onClose ? (
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, { top: spacing.md, right: spacing.md }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={isHi ? 'संवाद बंद करें' : 'Close celebration'}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Sacred ॐ Medallion with Golden Halo Aura */}
            <View style={styles.motifContainer}>
              <View
                style={[
                  styles.auraOuterRing,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderAccent,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <LinearGradient
                  colors={[colors.brandButtonGradient[0], colors.brandButtonGradient[1]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.auraInnerCircle, { borderRadius: radii.full }]}
                >
                  <Text
                    style={[
                      styles.omSymbolText,
                      {
                        color: colors.textOnPrimary,
                        includeFontPadding: false,
                      },
                    ]}
                  >
                    ॐ
                  </Text>
                </LinearGradient>
              </View>

              {/* Decorative sacred spark stars */}
              <View
                style={[
                  styles.sparkleIcon,
                  styles.sparkleLeft,
                  { backgroundColor: colors.surfaceSubtle, borderRadius: radii.full },
                ]}
              >
                <MaterialCommunityIcons
                  name="star-four-points"
                  size={14}
                  color={colors.brandPrimary}
                />
              </View>

              <View
                style={[
                  styles.sparkleIcon,
                  styles.sparkleRight,
                  { backgroundColor: colors.surfaceSubtle, borderRadius: radii.full },
                ]}
              >
                <MaterialCommunityIcons
                  name="star-four-points"
                  size={14}
                  color={colors.brandPrimary}
                />
              </View>
            </View>

            {/* Title */}
            <VText
              variant="headlineLarge"
              weight="700"
              color="brandPrimary"
              align="center"
              isDevanagari={isHi}
              style={[styles.title, { marginTop: spacing.md }]}
            >
              {resolvedTitle}
            </VText>

            {/* Subtitle */}
            <VText
              variant="bodyMedium"
              color="textMuted"
              align="center"
              isDevanagari={isHi}
              style={[styles.subtitle, { marginTop: spacing.xs }]}
            >
              {resolvedSubtitle}
            </VText>

            {/* Booking ID Badge */}
            {bookingId ? (
              <View
                style={[
                  styles.bookingIdPill,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderAccent,
                    borderRadius: radii.full,
                    marginTop: spacing.md,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.xs,
                  },
                ]}
              >
                <VText
                  variant="caption"
                  weight="600"
                  color="brandPrimary"
                  align="center"
                >
                  {isHi ? `संदर्भ संख्या: ${bookingId}` : `Booking ID: ${bookingId}`}
                </VText>
              </View>
            ) : null}

            {/* Summary Receipt Metrics Breakdown */}
            {metrics && metrics.length > 0 ? (
              <View
                style={[
                  styles.receiptCard,
                  {
                    backgroundColor: colors.surfaceBase,
                    borderColor: colors.borderDefault,
                    borderRadius: radii.lg,
                    marginTop: spacing.lg,
                    padding: spacing.md,
                  },
                ]}
              >
                <View style={[styles.receiptHeaderRow, { marginBottom: spacing.xs }]}>
                  <MaterialCommunityIcons
                    name="receipt-text-outline"
                    size={16}
                    color={colors.brandPrimary}
                  />
                  <VText
                    variant="labelMedium"
                    weight="700"
                    color="brandPrimary"
                    style={{ marginLeft: spacing.xs }}
                  >
                    {isHi ? 'अनुष्ठान विवरण' : 'Receipt summary'}
                  </VText>
                </View>

                {metrics.map((metric, index) => (
                  <View key={`metric-${index}`}>
                    {index > 0 ? (
                      <VDivider variant="default" spacing="xs" />
                    ) : null}
                    <View style={styles.metricRow}>
                      <View style={styles.metricLabelCol}>
                        <VText
                          variant="bodyMedium"
                          weight="500"
                          color="textPrimary"
                        >
                          {isHi ? metric.labelHi || metric.label : metric.label}
                        </VText>
                      </View>

                      <VText
                        variant="titleSmall"
                        weight="700"
                        color="textPrimary"
                        align="right"
                      >
                        {metric.value}
                      </VText>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          {/* Action CTAs (Guaranteed 48dp height targets) */}
          <View
            style={[
              styles.actionsContainer,
              {
                marginTop: spacing.lg,
                gap: spacing.sm,
              },
            ]}
          >
            <VButton
              label={resolvedPrimaryLabel}
              onPress={onPrimaryAction}
              variant="primary"
              size="lg"
              fullWidth={true}
              accessibilityLabel={resolvedPrimaryLabel}
            />

            {resolvedSecondaryLabel && onSecondaryAction ? (
              <VButton
                label={resolvedSecondaryLabel}
                onPress={onSecondaryAction}
                variant="outline"
                size="lg"
                fullWidth={true}
                accessibilityLabel={resolvedSecondaryLabel}
              />
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default SuccessCelebration;

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  celebrationCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    borderWidth: 1.5,
    padding: 24,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  motifContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  auraOuterRing: {
    width: 80,
    height: 80,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auraInnerCircle: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  omSymbolText: {
    fontSize: 34,
    fontWeight: '700',
    textAlign: 'center',
  },
  sparkleIcon: {
    position: 'absolute',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleLeft: {
    top: 4,
    left: -12,
  },
  sparkleRight: {
    bottom: 4,
    right: -12,
  },
  title: {
    width: '100%',
  },
  titleHi: {
    width: '100%',
  },
  subtitle: {
    width: '100%',
  },
  subtitleHi: {
    width: '100%',
  },
  bookingIdPill: {
    borderWidth: 1,
    alignSelf: 'center',
  },
  receiptCard: {
    width: '100%',
    borderWidth: 1,
  },
  receiptHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  metricLabelCol: {
    flex: 1,
    paddingRight: 12,
  },
  actionsContainer: {
    width: '100%',
  },
});

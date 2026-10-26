import React from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
  ScrollView,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { VText } from '../foundations/VText';
import { VButton } from '../foundations/VButton';

export interface ActionDialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  titleHi?: string;
  description: string;
  descriptionHi?: string;
  children?: React.ReactNode;
  primaryLabel: string;
  primaryLabelHi?: string;
  onPrimaryPress: () => void;
  primaryVariant?: 'primary' | 'destructive';
  primaryLoading?: boolean;
  secondaryLabel?: string;
  secondaryLabelHi?: string;
  onSecondaryPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * ActionDialog — High-elevation focused modal dialog for crucial actions:
 * - Escrow advance payment terms & purnahuti release
 * - Cancellation policy disclosure with 24h refund & samagri deduction thresholds
 * - Dispute escalation & Shastric mediation agreements
 *
 * Grounded in Kashi Veda design system:
 * - High elevation (elevation4 / sacred dark border)
 * - Backdrop press dismissal
 * - Guaranteed 48x48dp touch bounds on every interactable
 * - Single-locale typography resolved from the `*` / `*Hi` prop pairs
 * - Zero raw hex codes (fully themed via useTheme())
 */
export const ActionDialog: React.FC<ActionDialogProps> = ({
  visible,
  onClose,
  title,
  titleHi,
  description,
  descriptionHi,
  children,
  primaryLabel,
  primaryLabelHi,
  onPrimaryPress,
  primaryVariant = 'primary',
  primaryLoading = false,
  secondaryLabel,
  secondaryLabelHi,
  onSecondaryPress,
  style,
}) => {
  const { colors, spacing, radii, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  const isDestructive = primaryVariant === 'destructive';

  // Resolve the active locale from each `*` / `*Hi` prop pair
  const resolvedTitle = isHi ? titleHi || title : title;
  const resolvedDescription = isHi ? descriptionHi || description : description;
  const resolvedPrimaryLabel = isHi ? primaryLabelHi || primaryLabel : primaryLabel;
  const resolvedSecondaryLabel = secondaryLabel
    ? isHi
      ? secondaryLabelHi || secondaryLabel
      : secondaryLabel
    : undefined;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
      accessibilityRole="alertdialog"
    >
      <View style={styles.overlayContainer}>
        {/* Backdrop Press Dismiss */}
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlayScrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={isHi ? 'संवाद बंद करें' : 'Close dialog backdrop'}
        />

        {/* High Elevation Dialog Container */}
        <View
          style={[
            styles.dialogCard,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderDefault,
              borderRadius: radii.xl,
              ...elevation.elevation4,
            },
            style,
          ]}
          accessibilityRole="alertdialog"
          accessibilityLabel={resolvedTitle}
        >
          {/* Header Row with Icon & 48dp Close Button */}
          <View style={[styles.headerRow, { marginBottom: spacing.md }]}>
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: isDestructive ? colors.errorBg : colors.surfaceSubtle,
                  borderColor: isDestructive ? colors.statusAlert : colors.borderAccent,
                  borderRadius: radii.full,
                },
              ]}
            >
              <Ionicons
                name={isDestructive ? 'warning-outline' : 'shield-checkmark-outline'}
                size={22}
                color={isDestructive ? colors.statusAlert : colors.brandPrimary}
              />
            </View>

            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={isHi ? 'संवाद बंद करें' : 'Close dialog'}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Title */}
            <VText
              variant="headlineMedium"
              weight="700"
              color="textPrimary"
              isDevanagari={isHi}
              style={styles.titleText}
            >
              {resolvedTitle}
            </VText>

            {/* Description */}
            <VText
              variant="bodyMedium"
              color="textMuted"
              isDevanagari={isHi}
              style={[styles.descText, { marginTop: spacing.sm }]}
            >
              {resolvedDescription}
            </VText>

            {/* Optional Custom Content (e.g., Refund breakdown, escrow disclosure) */}
            {children ? (
              <View style={[styles.customContent, { marginTop: spacing.md }]}>
                {children}
              </View>
            ) : null}
          </ScrollView>

          {/* Action Buttons Row / Stack (48dp height minimum) */}
          <View
            style={[
              styles.actionsContainer,
              {
                marginTop: spacing.xl,
                gap: spacing.sm,
              },
            ]}
          >
            {resolvedSecondaryLabel ? (
              <VButton
                label={resolvedSecondaryLabel}
                onPress={onSecondaryPress ?? onClose}
                variant="secondary"
                size="lg"
                fullWidth={true}
                accessibilityLabel={resolvedSecondaryLabel}
              />
            ) : null}

            <VButton
              label={resolvedPrimaryLabel}
              onPress={onPrimaryPress}
              variant={isDestructive ? 'destructive' : 'primary'}
              size="lg"
              isLoading={primaryLoading}
              fullWidth={true}
              accessibilityLabel={resolvedPrimaryLabel}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default ActionDialog;

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
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderWidth: 1,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 4,
  },
  titleText: {},
  titleHiText: {},
  descText: {},
  descHiText: {},
  customContent: {
    width: '100%',
  },
  actionsContainer: {
    width: '100%',
  },
});

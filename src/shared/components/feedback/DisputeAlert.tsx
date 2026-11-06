import React from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '../icons';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { ESCROW_CONFIG } from '../../constants/vedic';
import { VText } from '../foundations/VText';
import { VBadge } from '../foundations/VBadge';
import { VButton } from '../foundations/VButton';
import { VDivider } from '../foundations/VDivider';

export interface DisputeAlertProps {
  bookingId: string;
  disputeReason?: string;
  disputeReasonHi?: string;
  status?: 'pending_review' | 'under_investigation' | 'resolved';
  amountHeldInEscrowInr?: number;
  onContactSupport?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * DisputeAlert — Contextual banner/card for disputed bookings.
 *
 * Grounded in Kashi Veda design system & Vedic domain contracts:
 * - Details authentic 50% advance escrow freeze via ESCROW_CONFIG
 * - Outlines Dharmashastra & platform Nyaya mediation guidelines
 * - Status pills reflecting real mediation lifecycle
 * - 48dp contact support action button
 * - Single-locale typography resolved from the `*` / `*Hi` prop pairs
 * - Zero raw hex codes (fully themed via useTheme())
 */
export const DisputeAlert: React.FC<DisputeAlertProps> = ({
  bookingId,
  disputeReason,
  disputeReasonHi,
  status = 'pending_review',
  amountHeldInEscrowInr,
  onContactSupport,
  style,
}) => {
  const { colors, spacing, radii, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  // Status mapping
  const statusMeta = (() => {
    switch (status) {
      case 'resolved':
        return {
          label: isHi ? 'समाधान संपन्न' : 'Resolved',
          labelHi: 'समाधान संपन्न',
          badgeColor: 'success' as const,
          iconName: 'shield-checkmark' as const,
          alertBg: colors.successBg,
          borderColor: colors.statusActive,
          accentColor: colors.statusActive,
        };
      case 'under_investigation':
        return {
          label: isHi ? 'जाँच जारी' : 'Under investigation',
          labelHi: 'जाँच जारी',
          badgeColor: 'brand' as const,
          iconName: 'shield-alert' as const,
          alertBg: colors.warningBg,
          borderColor: colors.borderAccent,
          accentColor: colors.brandPrimary,
        };
      case 'pending_review':
      default:
        return {
          label: isHi ? 'समीक्षा लंबित' : 'Pending review',
          labelHi: 'समीक्षा लंबित',
          badgeColor: 'alert' as const,
          iconName: 'alert-circle' as const,
          alertBg: colors.errorBg,
          borderColor: colors.statusAlert,
          accentColor: colors.statusAlert,
        };
    }
  })();

  const formattedEscrowAmount = amountHeldInEscrowInr !== undefined
    ? `₹${amountHeldInEscrowInr.toLocaleString('en-IN')}`
    : `${ESCROW_CONFIG.advancePercent}%`;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: statusMeta.borderColor,
          borderRadius: radii.lg,
          ...elevation.elevation2,
        },
        style,
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`Dispute alert for booking ${bookingId}: ${statusMeta.label}`}
    >
      {/* Top Banner Accent Stripe */}
      <View
        style={[
          styles.accentStripe,
          {
            backgroundColor: statusMeta.accentColor,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
          },
        ]}
      />

      <View style={[styles.innerContent, { padding: spacing.lg }]}>
        {/* Header Row: Title, Booking ID & Status Badge */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeftCol}>
            <View style={styles.titleWithIcon}>
              <MaterialCommunityIcons
                name="scale-balance"
                size={22}
                color={statusMeta.accentColor}
              />
              <VText
                variant="titleMedium"
                weight="700"
                color="textPrimary"
                style={{ marginLeft: spacing.xs }}
              >
                {isHi ? 'विवाद एवं मध्यस्थता' : 'Dispute & mediation'}
              </VText>
            </View>

            <VText
              variant="caption"
              weight="500"
              color="textMuted"
              style={{ marginTop: spacing.xxs }}
            >
              {isHi ? `संदर्भ: ${bookingId}` : `Booking ID: ${bookingId}`}
            </VText>
          </View>

          <VBadge
            variant="status"
            color={statusMeta.badgeColor}
            size="md"
            label={statusMeta.label}
          />
        </View>

        {/* Dispute Reason Section (if specified) */}
        {(disputeReason || disputeReasonHi) ? (
          <View
            style={[
              styles.reasonContainer,
              {
                backgroundColor: colors.surfaceBase,
                borderColor: colors.borderDefault,
                borderRadius: radii.md,
                marginTop: spacing.md,
                padding: spacing.md,
              },
            ]}
          >
            <View style={styles.reasonHeader}>
              <Ionicons
                name="document-text-outline"
                size={16}
                color={colors.textMuted}
              />
              <VText
                variant="labelMedium"
                weight="600"
                color="textPrimary"
                style={{ marginLeft: spacing.xs }}
              >
                {isHi ? 'विवाद का कारण:' : 'Dispute reason:'}
              </VText>
            </View>

            <VText
              variant="bodyMedium"
              color="textPrimary"
              isDevanagari={isHi}
              style={{ marginTop: spacing.xs }}
            >
              {isHi ? disputeReasonHi || disputeReason : disputeReason || disputeReasonHi}
            </VText>
          </View>
        ) : null}

        {/* 50% Escrow Freeze Card */}
        <View
          style={[
            styles.escrowCard,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderAccent,
              borderRadius: radii.md,
              marginTop: spacing.md,
              padding: spacing.md,
            },
          ]}
        >
          <View style={styles.escrowHeaderRow}>
            <Ionicons
              name="lock-closed"
              size={18}
              color={colors.brandPrimary}
            />
            <VText
              variant="labelMedium"
              weight="700"
              color="brandPrimary"
              style={{ marginLeft: spacing.xs }}
            >
              {isHi
                ? `एस्क्रो सुरक्षा फ्रीज (${formattedEscrowAmount})`
                : `Escrow protection (${formattedEscrowAmount})`}
            </VText>
          </View>

          <VText
            variant="bodyMedium"
            color="textPrimary"
            style={{ marginTop: spacing.xs }}
          >
            {isHi
              ? `काशी वेद एस्क्रो नियमावली के अनुसार, ${formattedEscrowAmount} अग्रिम राशि निष्पक्ष समाधान तक सुरक्षित रखी गई है।`
              : `Per Kashi Veda escrow policy, ${formattedEscrowAmount} of the booking advance is held in escrow until dispute mediation completes.`}
          </VText>
        </View>

        {/* Shastric & Platform Mediation Policy Summary */}
        <View style={[styles.policyContainer, { marginTop: spacing.md }]}>
          <View style={styles.policyHeaderRow}>
            <Ionicons
              name="library-outline"
              size={16}
              color={colors.brandPrimary}
            />
            <VText
              variant="labelMedium"
              weight="600"
              color="brandPrimary"
              style={{ marginLeft: spacing.xs }}
            >
              {isHi ? 'शास्त्र-सम्मत न्याय नीति' : 'Shastric mediation policy'}
            </VText>
          </View>

          <VText
            variant="caption"
            color="textMuted"
            style={{ marginTop: spacing.xs }}
          >
            {isHi
              ? 'विवादों का समाधान काशी के पंडित जी परिषद द्वारा सत्य एवं संवाद के शास्त्रीय सिद्धांतों के आधार पर किया जाता है।'
              : 'Disputes are mediated per ancient Kashi Dharmashastra principles of Satya (truth) and Samvad (dialogue). Our Pandit Ji council reviews timestamps, ritual preparations and samagri verifications before issuing a ruling or escrow disbursement.'}
          </VText>
        </View>

        {/* Contact Support CTA (Guaranteed 48dp height touch target) */}
        {onContactSupport ? (
          <View style={{ marginTop: spacing.lg }}>
            <VDivider variant="default" spacing="sm" />
            <VButton
              label={isHi ? 'सहायता टीम से संपर्क करें' : 'Contact support'}
              onPress={onContactSupport}
              variant="secondary"
              size="lg"
              leadingIcon={
                <Ionicons
                  name="chatbubbles-outline"
                  size={18}
                  color={colors.textPrimary}
                />
              }
              fullWidth={true}
              accessibilityLabel={isHi ? 'सहायता टीम से संपर्क करें' : 'Contact dispute mediation support'}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default DisputeAlert;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderWidth: 1,
    overflow: 'hidden',
  },
  accentStripe: {
    height: 4,
    width: '100%',
  },
  innerContent: {},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeftCol: {
    flex: 1,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reasonContainer: {
    borderWidth: 1,
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  escrowCard: {
    borderWidth: 1,
  },
  escrowHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  policyContainer: {},
  policyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

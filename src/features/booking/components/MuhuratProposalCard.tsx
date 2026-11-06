// src/features/booking/components/MuhuratProposalCard.tsx
import React from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  Linking,
} from 'react-native';
import { VCard } from '../../../shared/components/layout/VCard.tsx';
import { VText } from '../../../shared/components/foundations/VText.tsx';
import { VAvatar } from '../../../shared/components/foundations/VAvatar.tsx';
import { useTheme } from '../../../shared/theme/index.ts';
import { useLanguage } from '../../../shared/i18n/index.ts';
import { formatCurrency } from '../../../shared/utils/formatters.ts';
import { Ionicons, MaterialCommunityIcons } from '../../../shared/components/icons/index.ts';

export interface MuhuratProposalCardProps {
  /** Officiating Pandit Ji name */
  panditName: string;
  /** Avatar image URI */
  panditAvatarUri?: string;
  /** Pandit lineage or Vedic specialization */
  specialization?: string;
  /** Original requested date/window by devotee */
  requestedDateText: string;
  /** New Shubh Muhurat proposed by Pandit Ji */
  recommendedMuhuratText: string;
  /** Astrological / Shastric rationale */
  astrologicalReason: string;
  /** Advance deposit held in escrow (e.g. 738) */
  advanceDepositAmount?: number;
  /** Pandit phone number for direct contact */
  panditPhone?: string;
  /** Devotee accepts the recommended slot */
  onAccept: () => void;
  /** Devotee requests another preferred date */
  onRequestAnotherDate: () => void;
  /** Devotee cancels booking with 100% refund */
  onCancelWithRefund: () => void;
  /** Devotee calls Pandit directly */
  onCallPandit?: () => void;
  /** Optional container style */
  style?: StyleProp<ViewStyle>;
  /** Test identifier */
  testID?: string;
}

/**
 * MuhuratProposalCard — Structured Action Card for Muhurat Adjustments.
 * Displayed when Pandit Ji calculates astrological conditions (e.g. Bhadra, Rahu Kaal)
 * and proposes an auspicious Shubh Muhurat with shastric rationale and 3 decisive actions.
 */
export const MuhuratProposalCard: React.FC<MuhuratProposalCardProps> = ({
  panditName,
  panditAvatarUri,
  specialization = 'Shukla Yajurveda • Shukla Paksha Specialist',
  requestedDateText,
  recommendedMuhuratText,
  astrologicalReason,
  advanceDepositAmount,
  panditPhone,
  onAccept,
  onRequestAnotherDate,
  onCancelWithRefund,
  onCallPandit,
  style,
  testID = 'muhurat-proposal-card',
}) => {
  const { colors, spacing, radii } = useTheme();
  const { pick } = useLanguage();

  const handlePhoneCall = () => {
    if (onCallPandit) {
      onCallPandit();
      return;
    }
    if (panditPhone) {
      Linking.openURL(`tel:${panditPhone}`);
    }
  };

  return (
    <VCard
      variant="default"
      elevation={2}
      style={[
        styles.card,
        {
          borderColor: colors.brandPrimary,
          borderWidth: 2,
          backgroundColor: colors.surfaceCard,
          borderRadius: radii.xl,
        },
        style,
      ]}
      testID={testID}
      accessibilityRole="summary"
    >
      {/* Header: Status Badge & Time */}
      <View style={styles.headerRow}>
        <View style={styles.badgeWrap}>
          <VText variant="overline" color="brandPrimary" weight="700">
            {pick('शुभ मुहूर्त प्रस्ताव', 'MUHURAT RECOMMENDATION')}
          </VText>
        </View>
        <VText variant="caption" color="textMuted">
          {pick('अभी प्राप्त', 'Just now')}
        </VText>
      </View>

      {/* Pandit Profile Details */}
      <View style={[styles.panditRow, { borderBottomColor: colors.borderDefault }]}>
        <VAvatar
          name={panditName}
          uri={panditAvatarUri}
          size="md"
          isVerified={true}
        />
        <View style={[styles.panditInfo, { marginLeft: spacing.sm }]}>
          <VText variant="titleMedium" color="textPrimary" weight="700">
            {panditName}
          </VText>
          <VText variant="caption" color="textMuted" numberOfLines={1}>
            {specialization}
          </VText>
        </View>
      </View>

      {/* Comparison Box: Requested vs Proposed */}
      <View
        style={[
          styles.comparisonBox,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.borderDefault,
            borderRadius: radii.md,
          },
        ]}
      >
        <View style={styles.comparisonRow}>
          <VText variant="caption" color="textMuted">
            {pick('आपका अनुरोधित समय:', 'Your Requested Date:')}
          </VText>
          <VText
            variant="bodySmall"
            color="textMuted"
            style={styles.strikethroughText}
          >
            {requestedDateText}
          </VText>
        </View>

        <View style={[styles.innerDivider, { backgroundColor: colors.borderDefault }]} />

        <View style={styles.comparisonRow}>
          <VText variant="caption" color="brandPrimary" weight="700">
            {pick('प्रस्तावित शुभ मुहूर्त:', 'Recommended Shubh Muhurat:')}
          </VText>
          <VText variant="bodyMedium" color="brandPrimary" weight="700">
            {recommendedMuhuratText}
          </VText>
        </View>
      </View>

      {/* Astrological Rationale Box */}
      <View
        style={[
          styles.rationaleBox,
          {
            backgroundColor: colors.surfaceBase,
            borderColor: colors.borderDefault,
            borderRadius: radii.md,
          },
        ]}
      >
        <View style={styles.rationaleHeader}>
          <MaterialCommunityIcons
            name="compass-rose"
            size={18}
            color={colors.brandPrimary}
            style={{ marginRight: 6 }}
          />
          <VText variant="labelMedium" color="textPrimary" weight="700">
            {pick('शास्त्र-सम्मत संशोधन का कारण', 'Shastra Reason for Adjustment')}
          </VText>
        </View>
        <VText variant="caption" color="textMuted" style={styles.rationaleText}>
          &ldquo;{astrologicalReason}&rdquo;
        </VText>
      </View>

      {/* Decisive Actions */}
      <View style={styles.actionsContainer}>
        {/* Action 1: Accept Recommended Muhurat */}
        <TouchableOpacity
          onPress={onAccept}
          activeOpacity={0.8}
          style={[styles.primaryActionBtn, { backgroundColor: colors.brandPrimary, borderRadius: radii.md }]}
          accessibilityRole="button"
          accessibilityLabel="Accept Recommended Muhurat"
          testID="accept-muhurat-btn"
        >
          <VText variant="titleSmall" color="textInverse" weight="700">
            {pick('प्रस्तावित शुभ मुहूर्त स्वीकार करें', 'Accept Recommended Muhurat')}
          </VText>
          <Ionicons name="arrow-forward" size={16} color={colors.textInverse} style={{ marginLeft: 6 }} />
        </TouchableOpacity>

        {/* Action 2: Request Another Date */}
        <TouchableOpacity
          onPress={onRequestAnotherDate}
          activeOpacity={0.8}
          style={[
            styles.secondaryActionBtn,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderDefault,
              borderRadius: radii.md,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Request Another Date"
          testID="request-another-date-btn"
        >
          <Ionicons name="calendar-outline" size={16} color={colors.textPrimary} style={{ marginRight: 6 }} />
          <VText variant="labelLarge" color="textPrimary" weight="600">
            {pick('अन्य तिथि का अनुरोध करें', 'Request Another Date')}
          </VText>
        </TouchableOpacity>

        {/* Bottom Row: Call Pandit Ji & 100% Refund Cancel */}
        <View style={styles.bottomActionsRow}>
          <TouchableOpacity
            onPress={handlePhoneCall}
            activeOpacity={0.8}
            style={[
              styles.callBtn,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderDefault,
                borderRadius: radii.md,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Call Pandit Ji"
            testID="call-pandit-btn"
          >
            <Ionicons name="call-outline" size={15} color={colors.brandPrimary} style={{ marginRight: 4 }} />
            <VText variant="labelMedium" color="brandPrimary" weight="600">
              {pick('पंडित जी से बात करें', 'Call Pandit Ji')}
            </VText>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onCancelWithRefund}
            activeOpacity={0.8}
            style={[
              styles.cancelBtn,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderRadius: radii.md,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="100% Refund Cancel"
            testID="cancel-refund-btn"
          >
            <VText variant="labelMedium" color="error" weight="600">
              {pick('100% वापसी सहित रद्द करें', '100% Refund Cancel')}
            </VText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Zero Penalty Guarantee Text */}
      <View style={styles.guaranteeRow}>
        <VText variant="caption" color="textMuted" align="center" style={styles.guaranteeText}>
          {pick(
            `शून्य कटौती गारंटी: यदि प्रस्तावित तिथि अनुकूल नहीं है, तो आपकी अग्रिम धरोहर राशि ${
              advanceDepositAmount ? formatCurrency(advanceDepositAmount) : ''
            } तुरंत आपके मूल भुगतान खाते में वापस कर दी जाएगी।`,
            `Zero Penalty Guarantee: If you decline the recommended date, your advance deposit ${
              advanceDepositAmount ? `(${formatCurrency(advanceDepositAmount)})` : ''
            } is refunded immediately to your original payment method.`
          )}
        </VText>
      </View>
    </VCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badgeWrap: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  panditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  panditInfo: {
    flex: 1,
  },
  comparisonBox: {
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  strikethroughText: {
    textDecorationLine: 'line-through',
  },
  innerDivider: {
    height: 1,
    width: '100%',
  },
  rationaleBox: {
    padding: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  rationaleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rationaleText: {
    lineHeight: 18,
    fontStyle: 'italic',
  },
  actionsContainer: {
    gap: 10,
  },
  primaryActionBtn: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryActionBtn: {
    minHeight: 48,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  bottomActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  callBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  guaranteeRow: {
    marginTop: 12,
    paddingTop: 8,
  },
  guaranteeText: {
    lineHeight: 16,
  },
});

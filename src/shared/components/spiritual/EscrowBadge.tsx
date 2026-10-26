import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { BookingStatus, FulfillmentStage, FULFILLMENT_STAGES } from '../../constants/vedic';

export interface EscrowBadgeProps {
  /** Macro Booking lifecycle state (defaults to 'confirmed') */
  status?: BookingStatus | string;
  /** Micro day-of-puja in-transit stage */
  fulfillmentStage?: FulfillmentStage;
  /** Total or escrow amount in INR */
  amountInr?: number;
  /** Optional custom escrow assurance message override */
  message?: string;
  /** Compact pill presentation vs full status breakdown card */
  compact?: boolean;
  /** Container style overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

interface StatusMeta {
  hi: string;
  en: string;
  colorKey: 'statusActive' | 'statusAlert' | 'brandPrimary' | 'warningFg' | 'infoFg' | 'textMuted';
  bgKey: 'successBg' | 'errorBg' | 'surfaceSubtle' | 'warningBg' | 'infoBg' | 'surfaceBase';
  icon: string;
}

const STATUS_METADATA: Record<string, StatusMeta> = {
  requested: {
    hi: 'अनुरोध भेजा गया',
    en: 'Requested',
    colorKey: 'infoFg',
    bgKey: 'infoBg',
    icon: 'send-clock-outline',
  },
  approved: {
    hi: 'पंडित जी द्वारा स्वीकृत',
    en: 'Approved',
    colorKey: 'statusActive',
    bgKey: 'successBg',
    icon: 'check-circle-outline',
  },
  payment_pending: {
    hi: 'एस्क्रो अग्रिम लंबित',
    en: 'Advance Escrow Pending',
    colorKey: 'warningFg',
    bgKey: 'warningBg',
    icon: 'alert-circle-outline',
  },
  confirmed: {
    hi: 'पुष्टि एवं एस्क्रो संरक्षित',
    en: 'Confirmed & Escrowed',
    colorKey: 'brandPrimary',
    bgKey: 'surfaceSubtle',
    icon: 'shield-lock-outline',
  },
  rescheduled: {
    hi: 'समय पुनर्निर्धारित',
    en: 'Rescheduled',
    colorKey: 'infoFg',
    bgKey: 'infoBg',
    icon: 'calendar-sync-outline',
  },
  cancelled: {
    hi: 'रद्द',
    en: 'Cancelled',
    colorKey: 'statusAlert',
    bgKey: 'errorBg',
    icon: 'close-circle-outline',
  },
  in_progress: {
    hi: 'अनुष्ठान प्रगति पर',
    en: 'In Progress',
    colorKey: 'brandPrimary',
    bgKey: 'surfaceSubtle',
    icon: 'progress-clock',
  },
  completed: {
    hi: 'अनुष्ठान संपन्न (सफल)',
    en: 'Ritual Completed',
    colorKey: 'statusActive',
    bgKey: 'successBg',
    icon: 'seal-variant',
  },
  disputed: {
    hi: 'विवादित (समीक्षाधीन)',
    en: 'Under Escrow Review',
    colorKey: 'statusAlert',
    bgKey: 'errorBg',
    icon: 'shield-alert-outline',
  },
  resolved: {
    hi: 'विवाद समाधानित',
    en: 'Dispute Resolved',
    colorKey: 'statusActive',
    bgKey: 'successBg',
    icon: 'check-decagram-outline',
  },
  expired: {
    hi: 'कालबाह्य',
    en: 'Expired',
    colorKey: 'textMuted',
    bgKey: 'surfaceBase',
    icon: 'clock-alert-outline',
  },
  declined: {
    hi: 'अस्वीकृत',
    en: 'Declined',
    colorKey: 'statusAlert',
    bgKey: 'errorBg',
    icon: 'close-box-outline',
  },
};

const STAGE_LABELS: Record<FulfillmentStage, { hi: string; en: string; icon: string }> = {
  samagri_dispatched: {
    hi: 'सामग्री प्रेषित',
    en: 'Samagri Sent',
    icon: 'truck-delivery-outline',
  },
  pandit_en_route: {
    hi: 'पंडित जी मार्ग में',
    en: 'En Route',
    icon: 'walk',
  },
  ritual_started: {
    hi: 'पूजा प्रारंभ',
    en: 'Ritual Started',
    icon: 'fire',
  },
  purnahuti: {
    hi: 'पूर्णाहुति',
    en: 'Purnahuti (Release)',
    icon: 'star-circle-outline',
  },
};

/**
 * EscrowBadge — Decoupled Macro Booking & Micro Fulfillment State Display
 *
 * Guarantees explicit presentation of 50% Advance Escrow Protection:
 * Advance dakshina is held safely until the sacred "पूर्णाहुति" (Purnahuti) marker.
 */
export const EscrowBadge: React.FC<EscrowBadgeProps> = ({
  status = 'confirmed',
  fulfillmentStage,
  amountInr,
  message,
  compact = false,
  style,
  testID = 'escrow-badge',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  const normalizedStatus = String(status || 'confirmed').toLowerCase().replace(/[-\s]/g, '_');
  const statusMeta = STATUS_METADATA[normalizedStatus] || STATUS_METADATA.confirmed;
  const statusColor = colors[statusMeta.colorKey];
  const statusBg = colors[statusMeta.bgKey];

  const isCompleted = normalizedStatus === 'completed' || fulfillmentStage === 'purnahuti';
  const isEscrowLocked =
    (normalizedStatus === 'confirmed' || normalizedStatus === 'in_progress') && !isCompleted;

  // Active stage index (0 to 3)
  const currentStageIndex = fulfillmentStage
    ? FULFILLMENT_STAGES.indexOf(fulfillmentStage)
    : -1;

  // Compact badge rendering
  if (compact) {
    return (
      <View
        style={[
          styles.compactContainer,
          {
            backgroundColor: statusBg,
            borderColor: statusColor,
            borderRadius: radii.full,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xxs,
          },
          style,
        ]}
        testID={testID}
        accessible={true}
        accessibilityRole="text"
        accessibilityLabel={isHi ? statusMeta.hi : statusMeta.en}
      >
        <MaterialCommunityIcons
          name={statusMeta.icon}
          size={14}
          color={statusColor}
          style={styles.compactIcon}
        />
        <Text
          style={[
            styles.compactText,
            {
              color: statusColor,
              fontFamily: typography.caption.fontFamily,
              fontSize: typography.caption.fontSize,
              lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
            },
          ]}
        >
          {isHi ? statusMeta.hi : statusMeta.en}
        </Text>
      </View>
    );
  }

  // Full detailed card
  return (
    <View
      style={[
        styles.fullCard,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: colors.borderDefault,
          borderRadius: radii.lg,
          padding: spacing.md,
        },
        elevation.elevation1,
        style,
      ]}
      testID={testID}
      accessible={true}
      accessibilityRole="none"
      accessibilityLabel={`${isHi ? 'एस्क्रो स्थिति' : 'Escrow status'}, ${isHi ? statusMeta.hi : statusMeta.en}`}
    >
      {/* Top Banner: 50% RBI Escrow Shield */}
      <View
        style={[
          styles.escrowHeader,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.borderAccent,
            borderRadius: radii.md,
            padding: spacing.sm,
            marginBottom: spacing.md,
          },
        ]}
      >
        <View style={styles.escrowTitleWrap}>
          <View
            style={[
              styles.shieldWrap,
              {
                backgroundColor: colors.surfaceCard,
                borderRadius: radii.full,
                marginRight: spacing.sm,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={isCompleted ? 'shield-check' : 'shield-lock'}
              size={20}
              color={isCompleted ? colors.statusActive : colors.brandPrimary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.escrowTitleHi,
                {
                  color: colors.brandPrimary,
                  fontFamily: typography.titleSmall.fontFamily,
                  fontSize: typography.titleSmall.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
                },
              ]}
            >
              {isHi ? '50% सुरक्षित एस्क्रो गारंटी' : '50% Secure Escrow Guarantee'}
            </Text>
            <Text
              style={[
                styles.escrowSubtitleEn,
                {
                  color: colors.textMuted,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                  lineHeight: typography.caption.lineHeight,
                },
              ]}
            >
              {message ||
                (isHi
                  ? `50% अग्रिम राशि एस्क्रो में सुरक्षित ${amountInr ? `(₹${Math.round(amountInr * 0.5)})` : ''}`
                  : `50% advance held in escrow ${amountInr ? `(₹${Math.round(amountInr * 0.5)})` : ''}`)}
            </Text>
          </View>
        </View>

        {/* Lock indicator */}
        <View
          style={[
            styles.lockStatusPill,
            {
              backgroundColor: isCompleted ? colors.successBg : colors.surfaceCard,
              borderColor: isCompleted ? colors.statusActive : colors.borderAccent,
              borderRadius: radii.full,
              paddingHorizontal: spacing.xs,
              paddingVertical: 2,
            },
          ]}
        >
          <Ionicons
            name={isCompleted ? 'checkmark-circle' : 'lock-closed'}
            size={12}
            color={isCompleted ? colors.statusActive : colors.brandPrimary}
            style={{ marginRight: 2 }}
          />
          <Text
            style={[
              styles.lockStatusText,
              {
                color: isCompleted ? colors.statusActive : colors.brandPrimary,
                fontFamily: isHi ? 'NotoSansDevanagari-SemiBold' : typography.caption.fontFamily,
                fontSize: typography.caption.fontSize,
                lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
              },
            ]}
          >
            {isCompleted
              ? isHi
                ? 'विमुक्त'
                : 'Released'
              : isHi
                ? 'पूर्णाहुति तक संरक्षित'
                : 'Locked until Purnahuti'}
          </Text>
        </View>
      </View>

      {/* Macro Lifecycle Badge */}
      <View style={[styles.macroStatusRow, { marginBottom: spacing.sm }]}>
        <Text
          style={[
            styles.metaLabel,
            {
              color: colors.textMuted,
              fontFamily: typography.caption.fontFamily,
              fontSize: typography.caption.fontSize,
              lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
            },
          ]}
        >
          {isHi ? 'बुकिंग स्थिति' : 'Booking status'}:
        </Text>
        <View
          style={[
            styles.macroBadge,
            {
              backgroundColor: statusBg,
              borderColor: statusColor,
              borderRadius: radii.full,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xxs,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={statusMeta.icon}
            size={14}
            color={statusColor}
            style={{ marginRight: spacing.xxs }}
          />
          <Text
            style={[
              styles.macroBadgeText,
              {
                color: statusColor,
                fontFamily: typography.caption.fontFamily,
                fontSize: typography.caption.fontSize,
                lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                fontWeight: '600',
              },
            ]}
          >
            {isHi ? statusMeta.hi : statusMeta.en}
          </Text>
        </View>
      </View>

      {/* Micro Fulfillment Stage Stepper (Active during In-Progress) */}
      {(status === 'in_progress' || status === 'confirmed' || status === 'completed') && (
        <View style={styles.fulfillmentSection}>
          <Text
            style={[
              styles.fulfillmentHeader,
              {
                color: colors.textPrimary,
                fontFamily: typography.titleSmall.fontFamily,
                fontSize: typography.titleSmall.fontSize,
                lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
                marginBottom: spacing.xs,
              },
            ]}
          >
            {isHi ? 'अनुष्ठान के चरण' : 'Ritual fulfillment stages'}:
          </Text>

          <View style={styles.stepperContainer}>
            {FULFILLMENT_STAGES.map((stageKey, idx) => {
              const stage = STAGE_LABELS[stageKey];
              const isPastOrCurrent = idx <= currentStageIndex;
              const isCurrent = idx === currentStageIndex;

              const stepColor = isPastOrCurrent ? colors.brandPrimary : colors.textMuted;
              const stepBg = isCurrent
                ? colors.surfaceSubtle
                : isPastOrCurrent
                ? colors.brandPrimary
                : colors.surfaceBase;

              return (
                <View key={stageKey} style={styles.stepItemWrap}>
                  <View style={styles.stepDotRow}>
                    <View
                      style={[
                        styles.stepDot,
                        {
                          backgroundColor: stepBg,
                          borderColor: stepColor,
                          borderRadius: radii.full,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={stage.icon}
                        size={12}
                        color={isPastOrCurrent && !isCurrent ? colors.surfaceCard : stepColor}
                      />
                    </View>
                    {idx < FULFILLMENT_STAGES.length - 1 && (
                      <View
                        style={[
                          styles.stepLine,
                          {
                            backgroundColor:
                              idx < currentStageIndex ? colors.brandPrimary : colors.borderDefault,
                          },
                        ]}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.stepTextHi,
                      {
                        color: isPastOrCurrent ? colors.textPrimary : colors.textMuted,
                        fontFamily: isHi
                          ? 'NotoSansDevanagari-Regular'
                          : typography.caption.fontFamily,
                        fontSize: typography.caption.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                        fontWeight: isCurrent ? '700' : '500',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {isHi ? stage.hi : stage.en}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Shastric Escrow Rule Footnote */}
      <Text
        style={[
          styles.footnoteText,
          {
            color: colors.textMuted,
            fontFamily: isHi
              ? 'NotoSansDevanagari-Regular'
              : typography.caption.fontFamily,
            fontSize: typography.caption.fontSize,
            lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
            marginTop: spacing.sm,
          },
        ]}
      >
        {isHi
          ? '* शास्त्रीय विधान: पूर्णाहुति के सत्यापन के पश्चात ही एस्क्रो से शेष 50% राशि पंडित जी को अंतरित की जाती है।'
          : '* Shastric rule: the remaining 50% is released to the pandit only after Purnahuti is verified.'}
      </Text>
    </View>
  );
};

export default EscrowBadge;

const styles = StyleSheet.create({
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  compactIcon: {
    marginRight: 4,
  },
  compactText: {
    fontWeight: '600',
  },
  fullCard: {
    borderWidth: 1,
  },
  escrowHeader: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  escrowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  shieldWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  escrowTitleHi: {
    fontWeight: '700',
  },
  escrowSubtitleEn: {
    marginTop: 1,
  },
  lockStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  lockStatusText: {
    fontWeight: '700',
  },
  macroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  metaLabel: {
    fontWeight: '500',
  },
  macroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  macroBadgeText: {
    marginLeft: 2,
  },
  fulfillmentSection: {
    marginTop: 4,
  },
  fulfillmentHeader: {
    fontWeight: '600',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  stepItemWrap: {
    flex: 1,
    alignItems: 'center',
  },
  stepDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepLine: {
    position: 'absolute',
    left: '50%',
    right: '-50%',
    height: 2,
    zIndex: 1,
  },
  stepTextHi: {
    textAlign: 'center',
  },
  footnoteText: {
    fontStyle: 'italic',
  },
});

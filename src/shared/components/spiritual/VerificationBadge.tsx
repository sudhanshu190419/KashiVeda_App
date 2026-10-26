import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { CREDENTIAL_INSTITUTIONS } from '../../constants/vedic';

export interface VerificationBadgeProps {
  /** Verification status of the Vedic scholar */
  status: 'verified' | 'pending' | 'rejected';
  /** Academic institution id (ssu, bhu_svdv, rashtriya_sanskrit, etc.) */
  institutionId?: string;
  /** Name of Sanskrit degree (English: e.g., 'Shastri (Veda)') */
  degreeName?: string;
  /** Name of Sanskrit degree in Devanagari (Hindi: e.g., 'शास्त्री (वेद)') */
  degreeNameHi?: string;
  /** Visual scale */
  size?: 'sm' | 'md' | 'lg';
  /** Whether tapping the badge opens an explanatory verification modal */
  showTooltip?: boolean;
  /** Container styling overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

/**
 * VerificationBadge — Verified Vedic Scholar Academic Credential Mark
 *
 * Grounded in authentic Varanasi Sanskrit academia (Sampurnanand Sanskrit Vishwavidyalaya,
 * BHU SVDV). Clicking opens an informational modal explaining the 3-step verification rigor.
 */
export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  status,
  institutionId,
  degreeName,
  degreeNameHi,
  size = 'md',
  showTooltip = true,
  style,
  testID = 'verification-badge',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language, pick } = useLanguage();
  const isHi = language === 'hi';
  const [modalVisible, setModalVisible] = useState(false);

  // Institution lookup
  const institution = useMemo(() => {
    if (!institutionId) return null;
    return CREDENTIAL_INSTITUTIONS.find((inst) => inst.id === institutionId) || null;
  }, [institutionId]);

  const isVerified = status === 'verified';
  const isPending = status === 'pending';

  const badgeColor = isVerified
    ? colors.statusActive
    : isPending
    ? colors.warningFg
    : colors.statusAlert;

  const badgeBg = isVerified
    ? colors.successBg
    : isPending
    ? colors.warningBg
    : colors.errorBg;

  const badgeLabel = isVerified
    ? pick('प्रमाणित वैदिक विद्वान', 'Verified Vedic Scholar')
    : isPending
    ? pick('प्रमाणीकरण प्रक्रियाधीन', 'Verification In Review')
    : pick('प्रमाणीकरण अस्वीकृत', 'Not Verified');

  // Sizing definitions
  const isSmall = size === 'sm';
  const isLarge = size === 'lg';

  const iconSize = isSmall ? 13 : isLarge ? 18 : 15;
  const fontSize = isSmall ? 11 : isLarge ? 13 : 12;

  const badgeContent = (
    <View
      style={[
        styles.badgeContainer,
        {
          backgroundColor: badgeBg,
          borderColor: badgeColor,
          borderRadius: radii.full,
          paddingHorizontal: isSmall ? spacing.xs : spacing.sm,
          paddingVertical: isSmall ? 2 : spacing.xxs,
        },
        style,
      ]}
      testID={testID}
      accessible={true}
      accessibilityRole={showTooltip ? 'button' : 'text'}
      accessibilityLabel={badgeLabel}
    >
      <Ionicons
        name={
          isVerified
            ? 'checkmark-circle'
            : isPending
            ? 'time-outline'
            : 'close-circle-outline'
        }
        size={iconSize}
        color={badgeColor}
        style={{ marginRight: 4 }}
      />
      <Text
        style={[
          styles.badgeLabel,
          {
            color: badgeColor,
            fontFamily: typography.caption.fontFamily,
            fontSize,
            lineHeight: getDevanagariLineHeight(fontSize),
          },
        ]}
        numberOfLines={1}
      >
        {badgeLabel}
      </Text>
    </View>
  );

  return (
    <>
      {showTooltip ? (
        <Pressable
          onPress={() => setModalVisible(true)}
          style={({ pressed }) => [
            styles.touchWrap,
            { opacity: pressed ? 0.85 : 1 },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={
            isHi
              ? 'विद्वान प्रमाणीकरण विवरण देखें'
              : 'View verification details'
          }
        >
          {badgeContent}
        </Pressable>
      ) : (
        badgeContent
      )}

      {/* Explanatory Verification Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlayScrim }]}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderRadius: radii.xl,
                padding: spacing.lg,
              },
              elevation.elevation3,
            ]}
          >
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalTitleWrap}>
                <View
                  style={[
                    styles.modalIconWrap,
                    {
                      backgroundColor: badgeBg,
                      borderRadius: radii.full,
                      marginRight: spacing.sm,
                    },
                  ]}
                >
                  <Ionicons
                    name={isVerified ? 'checkmark-circle' : 'shield-outline'}
                    size={22}
                    color={badgeColor}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.modalTitleHi,
                      {
                        color: colors.textPrimary,
                        fontFamily: isHi
                          ? 'NotoSansDevanagari-SemiBold'
                          : typography.titleMedium.fontFamily,
                        fontSize: typography.titleMedium.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.titleMedium.fontSize),
                      },
                    ]}
                  >
                    {badgeLabel}
                  </Text>
                </View>
              </View>

              {/* Close Button — 48dp Touch Target */}
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={isHi ? 'बंद करें' : 'Close'}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>

            {/* Academic Credential Summary Box */}
            {(institution || degreeNameHi || degreeName) && (
              <View
                style={[
                  styles.credentialInfoBox,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderAccent,
                    borderRadius: radii.md,
                    padding: spacing.md,
                    marginVertical: spacing.md,
                  },
                ]}
              >
                {(degreeNameHi || degreeName) && (
                  <View style={styles.infoLine}>
                    <Text
                      style={[
                        styles.infoLabel,
                        {
                          color: colors.textMuted,
                          fontFamily: typography.caption.fontFamily,
                          fontSize: typography.caption.fontSize,
                          lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                        },
                      ]}
                    >
                      {isHi ? 'उपाधि:' : 'Degree:'}
                    </Text>
                    <Text
                      style={[
                        styles.infoValue,
                        {
                          color: colors.brandPrimary,
                          fontFamily: isHi
                            ? 'NotoSansDevanagari-SemiBold'
                            : typography.titleSmall.fontFamily,
                          fontSize: typography.titleSmall.fontSize,
                        },
                      ]}
                    >
                      {isHi ? degreeNameHi ?? degreeName : degreeName ?? degreeNameHi}
                    </Text>
                  </View>
                )}

                {institution && (
                  <View style={[styles.infoLine, { marginTop: spacing.xs }]}>
                    <Text
                      style={[
                        styles.infoLabel,
                        {
                          color: colors.textMuted,
                          fontFamily: typography.caption.fontFamily,
                          fontSize: typography.caption.fontSize,
                          lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                        },
                      ]}
                    >
                      {isHi ? 'विश्वविद्यालय:' : 'Institution:'}
                    </Text>
                    <Text
                      style={[
                        styles.infoValue,
                        {
                          color: colors.textPrimary,
                          fontFamily: isHi
                            ? 'NotoSansDevanagari-Regular'
                            : typography.bodyMedium.fontFamily,
                          fontSize: typography.bodyMedium.fontSize,
                          lineHeight: getDevanagariLineHeight(typography.bodyMedium.fontSize),
                        },
                      ]}
                    >
                      {isHi ? institution.nameHi : institution.nameEn}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* 3-Step Verification Rigor Pillars */}
            <Text
              style={[
                styles.rigorHeading,
                {
                  color: colors.textPrimary,
                  fontFamily: typography.labelLarge.fontFamily,
                  fontSize: typography.labelLarge.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.labelLarge.fontSize),
                  marginTop: spacing.xs,
                  marginBottom: spacing.xs,
                },
              ]}
            >
              {isHi ? 'काशी वेद त्रिस्तरीय प्रमाणीकरण:' : 'Kashi Veda three-tier verification:'}
            </Text>

            <View style={styles.rigorList}>
              <View style={styles.rigorItem}>
                <MaterialCommunityIcons
                  name="certificate-outline"
                  size={18}
                  color={colors.brandPrimary}
                  style={{ marginRight: spacing.xs, marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.rigorTitle,
                      {
                        color: colors.textPrimary,
                        fontFamily: typography.labelMedium.fontFamily,
                        fontSize: 12,
                        lineHeight: getDevanagariLineHeight(12),
                      },
                    ]}
                  >
                    {isHi
                      ? '1. शैक्षणिक अभिलेख सत्यापन'
                      : '1. Academic record verification'}
                  </Text>
                  <Text
                    style={[
                      styles.rigorDesc,
                      {
                        color: colors.textMuted,
                        fontFamily: typography.caption.fontFamily,
                        fontSize: typography.caption.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                      },
                    ]}
                  >
                    {isHi
                      ? 'संपूर्णानंद अथवा बीएचयू से प्राप्त शास्त्री / आचार्य डिग्री की वास्तविक जाँच।'
                      : 'Genuine verification of Shastri or Acharya degrees from Sampurnanand or BHU.'}
                  </Text>
                </View>
              </View>

              <View style={styles.rigorItem}>
                <MaterialCommunityIcons
                  name="script-text-outline"
                  size={18}
                  color={colors.brandPrimary}
                  style={{ marginRight: spacing.xs, marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.rigorTitle,
                      {
                        color: colors.textPrimary,
                        fontFamily: typography.labelMedium.fontFamily,
                        fontSize: 12,
                        lineHeight: getDevanagariLineHeight(12),
                      },
                    ]}
                  >
                    {isHi
                      ? '2. वेदोक्त मंत्रोच्चार व विधि परीक्षण'
                      : '2. Chanting and ritual method assessment'}
                  </Text>
                  <Text
                    style={[
                      styles.rigorDesc,
                      {
                        color: colors.textMuted,
                        fontFamily: typography.caption.fontFamily,
                        fontSize: typography.caption.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                      },
                    ]}
                  >
                    {isHi
                      ? 'वरिष्ठ तीर्थ पुरोहितों द्वारा संस्कृत उच्चारण एवं शास्त्रीय कर्मकांड ज्ञान की मौखिक परीक्षा।'
                      : 'An oral examination of Sanskrit recitation and shastric ritual knowledge by senior Tirth Purohits.'}
                  </Text>
                </View>
              </View>

              <View style={styles.rigorItem}>
                <MaterialCommunityIcons
                  name="shield-account-outline"
                  size={18}
                  color={colors.brandPrimary}
                  style={{ marginRight: spacing.xs, marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.rigorTitle,
                      {
                        color: colors.textPrimary,
                        fontFamily: typography.labelMedium.fontFamily,
                        fontSize: 12,
                        lineHeight: getDevanagariLineHeight(12),
                      },
                    ]}
                  >
                    {isHi
                      ? '3. काशी तीर्थ पृष्ठभूमि प्रमाणीकरण'
                      : '3. Kashi lineage verification'}
                  </Text>
                  <Text
                    style={[
                      styles.rigorDesc,
                      {
                        color: colors.textMuted,
                        fontFamily: typography.caption.fontFamily,
                        fontSize: typography.caption.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                      },
                    ]}
                  >
                    {isHi
                      ? 'वाराणसी घाट एवं मंदिर परंपरा में प्रतिष्ठा व पहचान का विधिवत पुष्टीकरण।'
                      : 'Formal confirmation of standing within a Varanasi ghat and temple tradition.'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Bottom Close Button */}
            <Pressable
              onPress={() => setModalVisible(false)}
              style={({ pressed }) => [
                styles.modalDoneButton,
                {
                  backgroundColor: colors.brandPrimary,
                  borderRadius: radii.md,
                  marginTop: spacing.md,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={isHi ? 'समझ गए' : 'Understood'}
            >
              <Text
                style={[
                  styles.modalDoneText,
                  {
                    color: colors.textOnPrimary,
                    fontFamily: typography.labelLarge.fontFamily,
                    fontSize: typography.labelLarge.fontSize,
                  },
                ]}
              >
                {isHi ? 'अवगत हुए' : 'Understood'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default VerificationBadge;

const styles = StyleSheet.create({
  touchWrap: {
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeLabel: {
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  modalIconWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleHi: {
    fontWeight: '700',
  },
  modalTitleEn: {
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  credentialInfoBox: {
    borderWidth: 1,
  },
  infoLine: {},
  infoLabel: {
    fontWeight: '500',
  },
  infoValue: {
    fontWeight: '700',
    marginTop: 2,
  },
  infoSubvalue: {
    marginTop: 1,
  },
  rigorHeading: {
    fontWeight: '700',
  },
  rigorList: {
    marginTop: 4,
  },
  rigorItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  rigorTitle: {
    fontWeight: '700',
  },
  rigorDesc: {
    marginTop: 1,
  },
  modalDoneButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDoneText: {
    fontWeight: '700',
  },
});

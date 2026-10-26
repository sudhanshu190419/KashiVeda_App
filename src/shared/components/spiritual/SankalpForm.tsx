import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { GotraPickerDropdown } from '../foundations/GotraPickerDropdown';
import { VInput } from '../foundations/VInput';
import { VButton } from '../foundations/VButton';

export interface FamilyMemberItem {
  id: string;
  name: string;
  relation: string;
}

export interface SankalpFormProps {
  /** Devotee / Yajamana full legal name */
  devoteeName: string;
  /** Callback on devotee name change */
  onDevoteeNameChange: (val: string) => void;
  /** Selected Gotra identifier (references GOTRAS or GOTRA_FALLBACK) */
  selectedGotra: string;
  /** Callback on Gotra selection */
  onSelectGotra: (gotra: string) => void;
  /** Devotee's birth Nakshatra (optional) */
  nakshatra?: string;
  /** Callback on Nakshatra change */
  onNakshatraChange?: (val: string) => void;
  /** Family members included in the sacred Sankalp */
  familyMembers?: FamilyMemberItem[];
  /** Callback to add a family member */
  onAddFamilyMember?: (member: FamilyMemberItem) => void;
  /** Callback to remove a family member by id */
  onRemoveFamilyMember?: (id: string) => void;
  /** Sacred purpose or prayer of the Sankalp */
  sankalpPurpose?: string;
  /** Callback on Sankalp purpose change */
  onSankalpPurposeChange?: (val: string) => void;
  /** Final submit handler to lock the Sankalp */
  onSubmit?: () => void;
  /** Label for submit button (defaults to "संकल्प धारण करें / Take Sacred Vow") */
  submitLabel?: string;
  /** Loading state for submission */
  isLoading?: boolean;
  /** Container style overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

/**
 * SankalpForm — Sacred Vedic Ritual Vow Form (वैदिक संकल्प पत्र)
 *
 * Collects Yajamana (Devotee) lineage credentials for formal Shastric chanting:
 * Devotee Name, Gotra (with Kashyapa fallback), Nakshatra, Co-devotee Family Members,
 * and Auspicious Purpose.
 */
export const SankalpForm: React.FC<SankalpFormProps> = ({
  devoteeName,
  onDevoteeNameChange,
  selectedGotra,
  onSelectGotra,
  nakshatra = '',
  onNakshatraChange,
  familyMembers = [],
  onAddFamilyMember,
  onRemoveFamilyMember,
  sankalpPurpose = '',
  onSankalpPurposeChange,
  onSubmit,
  submitLabel,
  isLoading = false,
  style,
  testID = 'sankalp-form',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';
  const resolvedSubmitLabel =
    submitLabel ?? (isHi ? 'संकल्प धारण करें' : 'Take the sacred vow');

  // Local state for adding family member dialog
  const [isAddMemberModalVisible, setIsAddMemberModalVisible] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRelation, setNewMemberRelation] = useState('');

  const handleConfirmAddMember = () => {
    if (!newMemberName.trim()) return;
    const newMember: FamilyMemberItem = {
      id: `fam-${Date.now()}`,
      name: newMemberName.trim(),
      relation: newMemberRelation.trim() || (isHi ? 'पारिवारिक सदस्य' : 'Family member'),
    };
    onAddFamilyMember?.(newMember);
    setNewMemberName('');
    setNewMemberRelation('');
    setIsAddMemberModalVisible(false);
  };

  return (
    <View
      style={[
        styles.cardContainer,
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
      accessibilityLabel={
        isHi ? 'वैदिक संकल्प पत्र' : 'Sacred ritual vow form'
      }
    >
      {/* Header bar */}
      <View style={[styles.headerRow, { marginBottom: spacing.md }]}>
        <View style={styles.titleWrap}>
          <View
            style={[
              styles.iconWrapper,
              {
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.full,
                marginRight: spacing.sm,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="hands-pray"
              size={20}
              color={colors.brandPrimary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.titleHi,
                {
                  color: colors.textPrimary,
                  fontFamily: typography.titleMedium.fontFamily,
                  fontSize: typography.titleMedium.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.titleMedium.fontSize),
                },
              ]}
            >
              {isHi ? 'वैदिक संकल्प पत्र' : 'Sacred ritual vow'}
            </Text>
          </View>
        </View>
      </View>

      {/* Shastric Shloka Banner */}
      <View
        style={[
          styles.shlokaBanner,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.borderAccent,
            borderRadius: radii.md,
            padding: spacing.sm,
            marginBottom: spacing.md,
          },
        ]}
      >
        <Text
          style={[
            styles.shlokaText,
            {
              color: colors.brandPrimary,
              fontFamily: typography.bodyMedium.fontFamily,
              fontSize: 12,
              lineHeight: getDevanagariLineHeight(12),
              fontStyle: 'italic',
            },
          ]}
        >
          {isHi
            ? '"मम आत्मनः श्रुतिस्मृतिपुराणोक्त फलप्राप्त्यर्थं श्रीपरमेश्वरप्रीत्यर्थं..."'
            : '"For me to obtain the fruits promised in the shruti, smriti and puranas, for the pleasure of the Supreme Lord..."'}
        </Text>
        <Text
          style={[
            styles.shlokaSubtext,
            {
              color: colors.textMuted,
              fontFamily: typography.caption.fontFamily,
              fontSize: 10,
              lineHeight: 14,
              marginTop: 2,
            },
          ]}
        >
          {isHi
            ? 'प्रामाणिक वैदिक मंत्रों द्वारा ईश्वरीय कृपा एवं आध्यात्मिक पूर्णता की प्राप्ति हेतु।'
            : 'For the attainment of divine grace and spiritual fulfilment through authentic Vedic mantras.'}
        </Text>
      </View>

      {/* Field 1: Devotee Name */}
      <View style={{ marginBottom: spacing.md }}>
        <VInput
          label={isHi ? 'यजमान का नाम' : 'Devotee full name'}
          value={devoteeName}
          onChangeText={onDevoteeNameChange}
          placeholder={isHi ? 'उदा. अमित कुमार शर्मा' : 'e.g. Amit Kumar Sharma'}
          helperText={
            isHi
              ? 'जिसके नाम से मुख्य संकल्प पढ़ा जाएगा'
              : 'The name recited in the main Sankalp'
          }
          isDevanagari={true}
        />
      </View>

      {/* Field 2: Gotra Picker (with universal Kashyapa fallback) */}
      <View style={{ marginBottom: spacing.md }}>
        <GotraPickerDropdown
          selectedGotra={selectedGotra}
          onSelectGotra={onSelectGotra}
          label={isHi ? 'गोत्र' : 'Devotee gotra'}
          helperText={
            isHi
              ? 'अज्ञात गोत्र हेतु शास्त्रीय विधान अनुसार कश्यप गोत्र मान्य है'
              : 'Where the gotra is unknown, the shastras prescribe Kashyapa'
          }
        />
      </View>

      {/* Field 3: Nakshatra (Optional) */}
      {onNakshatraChange && (
        <View style={{ marginBottom: spacing.md }}>
          <VInput
            label={isHi ? 'जन्म नक्षत्र (वैकल्पिक)' : 'Birth nakshatra (optional)'}
            value={nakshatra}
            onChangeText={onNakshatraChange}
            placeholder={isHi ? 'उदा. रोहिणी, पुष्य, मघा...' : 'e.g. Rohini, Pushya, Magha...'}
            helperText={
              isHi
                ? 'पूजा के समय वैदिक वेदोक्त उच्चार हेतु'
                : 'For accurate Vedic recitation during the puja'
            }
            isDevanagari={true}
          />
        </View>
      )}

      {/* Field 4: Family Members Included in Sankalp */}
      <View style={{ marginBottom: spacing.md }}>
        <View style={styles.sectionHeaderRow}>
          <Text
            style={[
              styles.sectionTitleHi,
              {
                color: colors.textPrimary,
                fontFamily: typography.labelLarge.fontFamily,
                fontSize: typography.labelLarge.fontSize,
                lineHeight: getDevanagariLineHeight(typography.labelLarge.fontSize),
              },
            ]}
          >
            {isHi ? 'सह-संकल्प परिवारजन' : 'Co-devotees'}
          </Text>
          {onAddFamilyMember && (
            <Pressable
              onPress={() => setIsAddMemberModalVisible(true)}
              style={({ pressed }) => [
                styles.addMemberBtn,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.borderAccent,
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.sm,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={isHi ? 'परिवारजन जोड़ें' : 'Add family member'}
            >
              <Ionicons
                name="person-add-outline"
                size={14}
                color={colors.brandPrimary}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.addMemberBtnText,
                  {
                    color: colors.brandPrimary,
                    fontFamily: typography.caption.fontFamily,
                    fontSize: 12,
                    lineHeight: getDevanagariLineHeight(12),
                  },
                ]}
              >
                {isHi ? '+ सदस्य जोड़ें' : '+ Add member'}
              </Text>
            </Pressable>
          )}
        </View>

        {familyMembers.length === 0 ? (
          <Text
            style={[
              styles.noFamilyText,
              {
                color: colors.textMuted,
                fontFamily: typography.caption.fontFamily,
                fontSize: 12,
                lineHeight: getDevanagariLineHeight(12),
                marginTop: 4,
              },
            ]}
          >
            {isHi
              ? 'कोई अतिरिक्त परिवारजन नहीं जोड़े गए (वैकल्पिक)'
              : 'No additional family members added (optional)'}
          </Text>
        ) : (
          <View style={styles.familyChipsWrap}>
            {familyMembers.map((member) => (
              <View
                key={member.id}
                style={[
                  styles.familyChip,
                  {
                    backgroundColor: colors.surfaceBase,
                    borderColor: colors.borderDefault,
                    borderRadius: radii.md,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                    marginRight: spacing.xs,
                    marginBottom: spacing.xs,
                  },
                ]}
              >
                <View style={{ marginRight: spacing.xs }}>
                  <Text
                    style={[
                      styles.familyMemberName,
                      {
                        color: colors.textPrimary,
                        fontFamily: typography.labelMedium.fontFamily,
                        fontSize: 12,
                      },
                    ]}
                  >
                    {member.name}
                  </Text>
                  <Text
                    style={[
                      styles.familyMemberRelation,
                      {
                        color: colors.textMuted,
                        fontFamily: typography.caption.fontFamily,
                        fontSize: 10,
                      },
                    ]}
                  >
                    {member.relation}
                  </Text>
                </View>
                {onRemoveFamilyMember && (
                  <Pressable
                    onPress={() => onRemoveFamilyMember(member.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isHi ? `${member.name} हटाएं` : `Remove ${member.name}`
                    }
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={colors.textMuted}
                    />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Field 5: Sankalp Purpose */}
      {onSankalpPurposeChange && (
        <View style={{ marginBottom: spacing.md }}>
          <VInput
            label={isHi ? 'संकल्प उद्देश्य' : 'Purpose of the Sankalp'}
            value={sankalpPurpose}
            onChangeText={onSankalpPurposeChange}
            placeholder={
              isHi
                ? 'उदा. गृह सुख-शांति, स्वास्थ्य लाभ, दीर्घायु...'
                : 'e.g. peace at home, health, long life...'
            }
            helperText={
              isHi
                ? 'पंडित जी द्वारा उच्चारित विशिष्ट उद्देश्य'
                : 'The specific intention recited by Pandit Ji'
            }
            isDevanagari={true}
          />
        </View>
      )}

      {/* Submit Button */}
      {onSubmit && (
        <View style={{ marginTop: spacing.xs }}>
          <VButton
            label={resolvedSubmitLabel}
            onPress={onSubmit}
            variant="primary"
            size="lg"
            isLoading={isLoading}
            isDisabled={!devoteeName.trim() || isLoading}
            leadingIcon={
              <MaterialCommunityIcons
                name="seal-variant"
                size={18}
                color={colors.textOnPrimary}
              />
            }
          />
        </View>
      )}

      {/* Add Family Member Modal */}
      <Modal
        visible={isAddMemberModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsAddMemberModalVisible(false)}
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
            ]}
          >
            <Text
              style={[
                styles.modalTitleHi,
                {
                  color: colors.textPrimary,
                  fontFamily: typography.titleMedium.fontFamily,
                  fontSize: typography.titleMedium.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.titleMedium.fontSize),
                  marginBottom: spacing.md,
                },
              ]}
            >
              {isHi ? 'परिवारजन जोड़ें' : 'Add family member'}
            </Text>

            <View style={{ marginBottom: spacing.sm }}>
              <VInput
                label={isHi ? 'सदस्य का नाम' : 'Full name'}
                value={newMemberName}
                onChangeText={setNewMemberName}
                placeholder={isHi ? 'उदा. सुनीता शर्मा' : 'e.g. Sunita Sharma'}
                isDevanagari={true}
              />
            </View>

            <View style={{ marginBottom: spacing.md }}>
              <VInput
                label={isHi ? 'संबंध' : 'Relationship'}
                value={newMemberRelation}
                onChangeText={setNewMemberRelation}
                placeholder={isHi ? 'उदा. धर्मपत्नी, सुपुत्र, माता...' : 'e.g. wife, son, mother...'}
                isDevanagari={true}
              />
            </View>

            <View style={styles.modalActionsRow}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <VButton
                  label={isHi ? 'रद्द करें' : 'Cancel'}
                  variant="outline"
                  size="md"
                  onPress={() => setIsAddMemberModalVisible(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <VButton
                  label={isHi ? 'जोड़ें' : 'Add'}
                  variant="primary"
                  size="md"
                  isDisabled={!newMemberName.trim()}
                  onPress={handleConfirmAddMember}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default SankalpForm;

const styles = StyleSheet.create({
  cardContainer: {
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleHi: {
    fontWeight: '700',
  },
  subtitleEn: {
    marginTop: 1,
  },
  shlokaBanner: {
    borderWidth: 1,
  },
  shlokaText: {
    textAlign: 'center',
    fontWeight: '600',
  },
  shlokaSubtext: {
    textAlign: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleHi: {
    fontWeight: '700',
  },
  addMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 48,
  },
  addMemberBtnText: {
    fontWeight: '600',
  },
  noFamilyText: {
    fontStyle: 'italic',
  },
  familyChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  familyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  familyMemberName: {
    fontWeight: '600',
  },
  familyMemberRelation: {
    marginTop: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
  },
  modalTitleHi: {
    fontWeight: '700',
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

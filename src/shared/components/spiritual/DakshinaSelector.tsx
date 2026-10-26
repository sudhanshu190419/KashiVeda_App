import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { DAKSHINA_AMOUNTS } from '../../constants/vedic';

export interface DakshinaSelectorProps {
  /** Currently selected Dakshina amount in INR */
  selectedAmount?: number;
  /** Alias for selectedAmount (used in C-14 spec) */
  selected?: string | number;
  /** Callback fired when Dakshina amount is changed or custom-entered */
  onSelectAmount?: (amount: number) => void;
  /** Alias for onSelectAmount (used in C-14 spec) */
  onSelect?: (amount: number) => void;
  /** Auspicious preset tiers (defaults to DAKSHINA_AMOUNTS: [101, 251, 501, 1001, 2100]) */
  presetAmounts?: readonly number[];
  /** Alias for presetAmounts supporting string or number array (used in C-14 spec) */
  options?: readonly (string | number)[];
  /** Whether devotee can type a custom voluntary amount */
  allowCustom?: boolean;
  /** Container styling overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

const parseAmount = (val: string | number | undefined): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9]/g, '');
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * DakshinaSelector — Auspicious Voluntary Dakshina Tip Selector
 *
 * Grounded in the Vedic tradition of 'Shagun' (auspicious +1 rupee endings: 101, 251, 501, 1001, 2100).
 * Every interactable chip satisfies the 48dp universal touch target floor.
 */
export const DakshinaSelector: React.FC<DakshinaSelectorProps> = ({
  selectedAmount,
  selected,
  onSelectAmount,
  onSelect,
  presetAmounts = DAKSHINA_AMOUNTS,
  options,
  allowCustom = true,
  style,
  testID = 'dakshina-selector',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  const activePresets = options
    ? options.map(parseAmount).filter((n) => n > 0)
    : presetAmounts;

  const activeSelected = selectedAmount ?? parseAmount(selected);
  const handleSelectCallback = onSelectAmount ?? onSelect ?? (() => {});

  const [isCustomInputActive, setIsCustomInputActive] = useState(
    !activePresets.includes(activeSelected as (typeof activePresets)[number]) &&
      activeSelected > 0
  );
  const [customText, setCustomText] = useState(
    !activePresets.includes(activeSelected as (typeof activePresets)[number]) &&
      activeSelected > 0
      ? String(activeSelected)
      : ''
  );

  const handleSelectPreset = (amount: number) => {
    setIsCustomInputActive(false);
    setCustomText('');
    handleSelectCallback(amount);
  };

  const handleCustomChange = (text: string) => {
    // Only accept numeric digits
    const cleaned = text.replace(/[^0-9]/g, '');
    setCustomText(cleaned);
    const parsed = parseInt(cleaned, 10);
    handleSelectCallback(isNaN(parsed) ? 0 : parsed);
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
      accessibilityRole="radiogroup"
      accessibilityLabel={isHi ? 'स्वेच्छा दक्षिणा चयन' : 'Voluntary dakshina selection'}
    >
      {/* Header bar */}
      <View style={[styles.headerRow, { marginBottom: spacing.sm }]}>
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
              name="hand-coin-outline"
              size={18}
              color={colors.brandPrimary}
            />
          </View>
          <View>
            <Text
              style={[
                styles.titleHi,
                {
                  color: colors.textPrimary,
                  fontFamily: typography.titleSmall.fontFamily,
                  fontSize: typography.titleSmall.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
                },
              ]}
            >
              {isHi ? 'स्वेच्छा दक्षिणा (श्रद्धानुसार)' : 'Voluntary Dakshina'}
            </Text>
            <Text
              style={[
                styles.subtitleEn,
                {
                  color: colors.textMuted,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                  lineHeight: typography.caption.lineHeight,
                },
              ]}
            >
              {isHi
                ? 'सम्पूर्ण राशि सीधे पंडित जी को समर्पित'
                : '100% directly to Pandit Ji'}
            </Text>
          </View>
        </View>
      </View>

      {/* Preset Amount Chips (48dp Touch Targets) */}
      <View style={styles.chipsRow}>
        {activePresets.map((amount) => {
          const isSelected = activeSelected === amount && !isCustomInputActive;

          return (
            <Pressable
              key={amount}
              onPress={() => handleSelectPreset(amount)}
              style={({ pressed }) => [
                styles.chipButton,
                {
                  backgroundColor: isSelected
                    ? colors.surfaceSubtle
                    : colors.surfaceBase,
                  borderColor: isSelected
                    ? colors.brandPrimary
                    : colors.borderDefault,
                  borderRadius: radii.md,
                  borderWidth: isSelected ? 2 : 1,
                  paddingHorizontal: spacing.md,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={isHi ? `₹${amount} दक्षिणा` : `₹${amount} dakshina`}
            >
              <Text
                style={[
                  styles.chipAmountText,
                  {
                    color: isSelected
                      ? colors.brandPrimary
                      : colors.textPrimary,
                    fontFamily: typography.labelLarge.fontFamily,
                    fontSize: typography.labelLarge.fontSize,
                    lineHeight: typography.labelLarge.lineHeight,
                    fontWeight: isSelected ? '700' : '600',
                  },
                ]}
              >
                ₹{amount}
              </Text>
              <Text
                style={[
                  styles.shagunText,
                  {
                    color: isSelected
                      ? colors.brandPrimary
                      : colors.textMuted,
                    fontFamily: typography.caption.fontFamily,
                    fontSize: 9,
                    lineHeight: 11,
                  },
                ]}
              >
                {isHi ? 'शुभ शगुन' : 'Shagun'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Custom Amount Field */}
      {allowCustom && (
        <View style={[styles.customRow, { marginTop: spacing.sm }]}>
          <Pressable
            onPress={() => {
              setIsCustomInputActive(true);
            }}
            style={({ pressed }) => [
              styles.customToggleChip,
              {
                backgroundColor: isCustomInputActive
                  ? colors.surfaceSubtle
                  : colors.surfaceBase,
                borderColor: isCustomInputActive
                  ? colors.brandPrimary
                  : colors.borderDefault,
                borderRadius: radii.md,
                borderWidth: isCustomInputActive ? 2 : 1,
                paddingHorizontal: spacing.md,
                marginRight: spacing.sm,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={isHi ? 'अन्य राशि' : 'Custom amount'}
          >
            <Text
              style={[
                styles.customToggleText,
                {
                  color: isCustomInputActive
                    ? colors.brandPrimary
                    : colors.textPrimary,
                  fontFamily: typography.labelMedium.fontFamily,
                  fontSize: typography.labelMedium.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.labelMedium.fontSize),
                  fontWeight: isCustomInputActive ? '700' : '500',
                },
              ]}
            >
              {isHi ? 'अन्य राशि' : 'Custom'}
            </Text>
          </Pressable>

          {isCustomInputActive && (
            <View
              style={[
                styles.customInputWrapper,
                {
                  backgroundColor: colors.surfaceBase,
                  borderColor: colors.brandPrimary,
                  borderRadius: radii.md,
                  borderWidth: 1.5,
                  paddingHorizontal: spacing.sm,
                },
              ]}
            >
              <Text
                style={[
                  styles.currencyPrefix,
                  {
                    color: colors.brandPrimary,
                    fontFamily: typography.titleSmall.fontFamily,
                    fontSize: typography.titleSmall.fontSize,
                  },
                ]}
              >
                ₹
              </Text>
              <TextInput
                value={customText}
                onChangeText={handleCustomChange}
                placeholder={isHi ? 'उदा. 5001' : 'e.g. 5001'}
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                style={[
                  styles.customTextInput,
                  {
                    color: colors.textPrimary,
                    fontFamily: typography.titleSmall.fontFamily,
                    fontSize: typography.titleSmall.fontSize,
                  },
                ]}
                autoFocus={true}
                accessibilityLabel={isHi ? 'कस्टम दक्षिणा राशि इनपुट' : 'Custom dakshina amount input'}
              />
            </View>
          )}
        </View>
      )}

      {/* Shastric Shagun blessing notice */}
      <View
        style={[
          styles.shagunNotice,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.borderAccent,
            borderRadius: radii.sm,
            padding: spacing.xs,
            marginTop: spacing.sm,
          },
        ]}
      >
        <Text
          style={[
            styles.noticeTextHi,
            {
              color: colors.brandPrimary,
              fontFamily: typography.caption.fontFamily,
              fontSize: 11,
              lineHeight: getDevanagariLineHeight(11),
            },
          ]}
        >
          {isHi
            ? '* वैदिक परंपरा अनुसार दक्षिणा में ₹1 का शगुन सम्मिलित है। सम्पूर्ण राशि शत-प्रतिशत विद्वान को समर्पित होती है।'
            : '* Per Vedic custom, dakshina includes a ₹1 shagun. The full amount goes to the scholar.'}
        </Text>
      </View>
    </View>
  );
};

export const ChipGroup = DakshinaSelector;

export default DakshinaSelector;

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
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleHi: {
    fontWeight: '700',
  },
  subtitleEn: {
    marginTop: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipButton: {
    minHeight: 48,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipAmountText: {
    textAlign: 'center',
  },
  shagunText: {
    marginTop: 1,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customToggleChip: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customToggleText: {
    textAlign: 'center',
  },
  customInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  currencyPrefix: {
    fontWeight: '700',
    marginRight: 4,
  },
  customTextInput: {
    flex: 1,
    height: 48,
    padding: 0,
  },
  shagunNotice: {
    borderWidth: 1,
  },
  noticeTextHi: {
    fontStyle: 'italic',
  },
});

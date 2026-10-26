import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { GOTRAS, GOTRA_FALLBACK } from '../../constants';
import { VIconButton } from './VIconButton';

export interface GotraOption {
  id: string;
  nameDevanagari: string;
  nameEnglish: string;
  rishi?: string;
  pravara: string;
  isUniversalFallback?: boolean;
}

export interface GotraPickerDropdownProps {
  selectedGotra: string;
  onSelectGotra: (gotraId: string) => void;
  label?: string;
  helperText?: string;
  errorMessage?: string;
  isDisabled?: boolean;
  testID?: string;
}

export const GotraPickerDropdown: React.FC<GotraPickerDropdownProps> = ({
  selectedGotra,
  onSelectGotra,
  label,
  helperText,
  errorMessage,
  isDisabled = false,
  testID,
}) => {
  const { colors, spacing, radii, typography } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';
  const resolvedLabel = label ?? (isHi ? 'गोत्र' : 'Ancestral lineage');
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Find currently selected Gotra details
  const currentGotra = useMemo(() => {
    return GOTRAS.find((g) => g.id === selectedGotra);
  }, [selectedGotra]);

  // Filtered list based on search
  const filteredGotras = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return GOTRAS;
    }
    return GOTRAS.filter((item) => {
      return (
        item.nameHi.toLowerCase().includes(query) ||
        item.nameEn.toLowerCase().includes(query) ||
        item.pravara.toLowerCase().includes(query)
      );
    });
  }, [searchQuery]);

  const handleOpen = () => {
    if (!isDisabled) {
      setSearchQuery('');
      setModalVisible(true);
    }
  };

  const handleClose = () => {
    setModalVisible(false);
    setSearchQuery('');
  };

  const handleSelect = (gotraId: string) => {
    onSelectGotra(gotraId);
    handleClose();
  };

  const hasError = Boolean(errorMessage);

  return (
    <View style={styles.container} testID={testID}>
      {/* Label */}
      {label ? (
        <Text
          style={[
            styles.label,
            {
              color: hasError ? colors.statusAlert : colors.textPrimary,
              fontSize: typography.labelMedium.fontSize,
              lineHeight: getDevanagariLineHeight(typography.labelMedium.fontSize),
              marginBottom: spacing.xs,
            },
          ]}
        >
          {resolvedLabel}
        </Text>
      ) : null}

      {/* Trigger Box */}
      <Pressable
        onPress={handleOpen}
        disabled={isDisabled}
        accessibilityRole="combobox"
        accessibilityLabel={`${resolvedLabel}: ${currentGotra ? (isHi ? currentGotra.nameHi : currentGotra.nameEn) : isHi ? 'चयन करें' : 'Choose'}`}
        accessibilityHint="Opens Gotra selection sheet"
        accessibilityState={{ disabled: isDisabled, expanded: modalVisible }}
        style={[
          styles.triggerBox,
          {
            minHeight: spacing.touch,
            backgroundColor: isDisabled ? colors.surfaceBase : colors.surfaceCard,
            borderColor: hasError
              ? colors.statusAlert
              : modalVisible
              ? colors.borderAccent
              : colors.borderDefault,
            borderRadius: radii.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            opacity: isDisabled ? 0.45 : 1,
          },
        ]}
      >
        <View style={styles.triggerContent}>
          {currentGotra ? (
            <View style={styles.selectedInfo}>
              <Text
                style={[
                  styles.selectedTitle,
                  {
                    color: colors.textPrimary,
                    fontSize: typography.bodyMedium.fontSize,
                    lineHeight: getDevanagariLineHeight(typography.bodyMedium.fontSize),
                  },
                ]}
                numberOfLines={1}
              >
                {isHi ? currentGotra.nameHi : currentGotra.nameEn}
              </Text>
              <Text
                style={[
                  styles.selectedSubtitle,
                  {
                    color: colors.textMuted,
                    fontSize: typography.caption.fontSize,
                    lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                  },
                ]}
                numberOfLines={1}
              >
                {isHi ? 'प्रवर' : 'Pravara'}: {currentGotra.pravara}
              </Text>
            </View>
          ) : (
            <Text
              style={[
                styles.placeholder,
                {
                  color: colors.textMuted,
                  fontSize: typography.bodyMedium.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.bodyMedium.fontSize),
                },
              ]}
            >
              {isHi ? 'गोत्र चुनें' : 'Select gotra'}
            </Text>
          )}
        </View>

        <Ionicons
          name={modalVisible ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textMuted}
          style={styles.chevron}
        />
      </Pressable>

      {/* Helper / Error Text */}
      {hasError ? (
        <Text
          style={[
            styles.feedbackText,
            {
              color: colors.statusAlert,
              fontSize: typography.caption.fontSize,
              lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
              marginTop: spacing.xs,
            },
          ]}
        >
          {errorMessage}
        </Text>
      ) : helperText ? (
        <Text
          style={[
            styles.feedbackText,
            {
              color: colors.textMuted,
              fontSize: typography.caption.fontSize,
              lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
              marginTop: spacing.xs,
            },
          ]}
        >
          {helperText}
        </Text>
      ) : null}

      {/* Popover / Sheet Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalOverlay, { backgroundColor: colors.overlayScrim }]}
        >
          <Pressable style={styles.backdropDismiss} onPress={handleClose} />

          <SafeAreaView
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.surfaceCard,
                borderTopLeftRadius: radii.sheet,
                borderTopRightRadius: radii.sheet,
                borderColor: colors.borderDefault,
                borderTopWidth: 1,
              },
            ]}
          >
            {/* Header */}
            <View
              style={[
                styles.sheetHeader,
                {
                  paddingHorizontal: spacing.lg,
                  paddingTop: spacing.lg,
                  paddingBottom: spacing.sm,
                  borderBottomColor: colors.borderDefault,
                  borderBottomWidth: 1,
                },
              ]}
            >
              <View style={styles.headerTitles}>
                <Text
                  style={[
                    styles.sheetTitle,
                    {
                      color: colors.textPrimary,
                      fontSize: typography.headlineSmall.fontSize,
                      lineHeight: getDevanagariLineHeight(typography.headlineSmall.fontSize),
                    },
                  ]}
                >
                  {isHi ? 'गोत्र चयन' : 'Select gotra'}
                </Text>
                <Text
                  style={[
                    styles.sheetSubtitle,
                    {
                      color: colors.brandPrimary,
                      fontSize: typography.caption.fontSize,
                      lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                    },
                  ]}
                >
                  {isHi ? 'शास्त्रीय व्यवस्था एवं प्रवर कुल' : 'Shastric order and pravara lineage'}
                </Text>
              </View>

              <VIconButton
                icon={<Ionicons name="close" size={24} color={colors.textPrimary} />}
                onPress={handleClose}
                variant="ghost"
                size={40}
                accessibilityLabel="Close Gotra selector"
              />
            </View>

            {/* Search Input */}
            <View
              style={[
                styles.searchContainer,
                {
                  marginHorizontal: spacing.lg,
                  marginTop: spacing.md,
                  marginBottom: spacing.sm,
                  backgroundColor: colors.surfaceBase,
                  borderRadius: radii.md,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  paddingHorizontal: spacing.md,
                  minHeight: spacing.touch,
                },
              ]}
            >
              <Ionicons
                name="search"
                size={18}
                color={colors.textMuted}
                style={{ marginRight: spacing.sm }}
              />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={
                  isHi
                    ? 'गोत्र या प्रवर खोजें...'
                    : 'Search gotra or pravara...'
                }
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.searchInput,
                  {
                    color: colors.textPrimary,
                    fontSize: typography.bodyMedium.fontSize,
                  },
                ]}
                autoCorrect={false}
                returnKeyType="search"
              />
              {searchQuery ? (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {/* Pinned Universal Fallback: कश्यपो गोत्रम् */}
            <View
              style={[
                styles.pinnedFallbackContainer,
                {
                  marginHorizontal: spacing.lg,
                  marginBottom: spacing.sm,
                  backgroundColor: colors.surfaceSubtle,
                  borderRadius: radii.md,
                  borderColor: colors.borderAccent,
                  borderWidth: 1,
                  padding: spacing.md,
                },
              ]}
            >
              <View style={styles.pinnedHeaderRow}>
                <Ionicons
                  name="shield-checkmark"
                  size={16}
                  color={colors.brandPrimary}
                  style={{ marginRight: spacing.xs }}
                />
                <Text
                  style={[
                    styles.pinnedHeaderLabel,
                    {
                      color: colors.brandPrimary,
                      fontSize: typography.labelMedium.fontSize,
                      lineHeight: getDevanagariLineHeight(typography.labelMedium.fontSize),
                      fontWeight: '700',
                    },
                  ]}
                >
                  {isHi ? 'शास्त्रीय सर्वगोत्र विधान' : 'Universal shastric fallback'}
                </Text>
              </View>

              <Pressable
                onPress={() => handleSelect(GOTRA_FALLBACK.id)}
                accessibilityRole="button"
                accessibilityLabel={isHi ? GOTRA_FALLBACK.nameHi : GOTRA_FALLBACK.nameEn}
                style={[
                  styles.pinnedButton,
                  {
                    minHeight: spacing.touch,
                    marginTop: spacing.xs,
                  },
                ]}
              >
                <View style={styles.pinnedTextCol}>
                  <Text
                    style={[
                      styles.pinnedNameHi,
                      {
                        color: colors.textPrimary,
                        fontSize: typography.titleSmall.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {isHi ? GOTRA_FALLBACK.nameHi : GOTRA_FALLBACK.nameEn}
                  </Text>
                  <Text
                    style={[
                      styles.pinnedShastraRule,
                      {
                        color: colors.brandPrimary,
                        fontSize: typography.caption.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                        fontStyle: 'italic',
                      },
                    ]}
                  >
                    {isHi
                      ? '"गोत्रनाशे कश्यपो गोत्रम्" — अज्ञात वंश हेतु शास्त्रोक्त विधान'
                      : '"Gotranashe Kashyapo gotram" — Kashyapa lineage for unknown ancestry'}
                  </Text>
                </View>

                {selectedGotra === GOTRA_FALLBACK.id ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={colors.brandPrimary}
                    style={{ marginLeft: spacing.sm }}
                  />
                ) : (
                  <View
                    style={[
                      styles.selectionIndicator,
                      {
                        borderColor: colors.borderAccent,
                        borderRadius: radii.full,
                      },
                    ]}
                  />
                )}
              </Pressable>
            </View>

            {/* List of Gotras */}
            <FlatList
              data={filteredGotras}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.xxxl,
              }}
              ListEmptyComponent={
                <View style={[styles.emptyContainer, { paddingVertical: spacing.xxl }]}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={36}
                    color={colors.textMuted}
                    style={{ marginBottom: spacing.sm }}
                  />
                  <Text
                    style={[
                      styles.emptyTitle,
                      {
                        color: colors.textPrimary,
                        fontSize: typography.titleMedium.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.titleMedium.fontSize),
                        textAlign: 'center',
                      },
                    ]}
                  >
                    {isHi ? 'कोई गोत्र नहीं मिला' : 'No gotra found'}
                  </Text>
                  <Text
                    style={[
                      styles.emptySubtitle,
                      {
                        color: colors.textMuted,
                        fontSize: typography.caption.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                        textAlign: 'center',
                        marginTop: spacing.xs,
                      },
                    ]}
                  >
                    {isHi
                      ? 'यदि आपका गोत्र इस सूची में नहीं है, तो शास्त्रोक्त कश्यप गोत्र का चयन करें।'
                      : 'If your gotra is not listed, choose the shastric Kashyapa fallback.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = selectedGotra === item.id;
                return (
                  <Pressable
                    onPress={() => handleSelect(item.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${isHi ? item.nameHi : item.nameEn}, ${isHi ? 'प्रवर' : 'pravara'} ${item.pravara}`}
                    style={({ pressed }) => [
                      styles.gotraRow,
                      {
                        minHeight: spacing.touch,
                        paddingVertical: spacing.md,
                        borderBottomColor: colors.borderDefault,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        backgroundColor: pressed ? colors.surfaceBase : 'transparent',
                      },
                    ]}
                  >
                    <View style={styles.gotraTextCol}>
                      <View style={styles.gotraNameRow}>
                        <Text
                          style={[
                            styles.gotraNameHi,
                            {
                              color: colors.textPrimary,
                              fontSize: typography.bodyLarge.fontSize,
                              lineHeight: getDevanagariLineHeight(typography.bodyLarge.fontSize),
                              fontWeight: isSelected ? '700' : '600',
                            },
                          ]}
                        >
                          {isHi ? item.nameHi : item.nameEn}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.pravaraText,
                          {
                            color: colors.brandPrimary,
                            fontSize: typography.caption.fontSize,
                            lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                            marginTop: spacing.xxs,
                          },
                        ]}
                      >
                        {isHi ? 'प्रवर' : 'Pravara'}: {item.pravara}
                      </Text>
                    </View>

                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={colors.brandPrimary}
                        style={{ marginLeft: spacing.sm }}
                      />
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

export default GotraPickerDropdown;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontWeight: '600',
  },
  triggerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  triggerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  selectedInfo: {
    justifyContent: 'center',
  },
  selectedTitle: {
    fontWeight: '600',
  },
  selectedSubtitle: {},
  placeholder: {},
  chevron: {
    marginLeft: 8,
  },
  feedbackText: {},
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  modalSheet: {
    maxHeight: '85%',
    width: '100%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitles: {
    flex: 1,
  },
  sheetTitle: {
    fontWeight: '700',
  },
  sheetSubtitle: {
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    padding: 0,
  },
  pinnedFallbackContainer: {},
  pinnedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinnedHeaderLabel: {},
  pinnedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pinnedTextCol: {
    flex: 1,
  },
  pinnedNameHi: {},
  pinnedShastraRule: {
    marginTop: 2,
  },
  selectionIndicator: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
  },
  gotraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gotraTextCol: {
    flex: 1,
  },
  gotraNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gotraNameHi: {},
  gotraNameEn: {},
  pravaraText: {},
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontWeight: '600',
  },
  emptySubtitle: {
    paddingHorizontal: 24,
  },
});

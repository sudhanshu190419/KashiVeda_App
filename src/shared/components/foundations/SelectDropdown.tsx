import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { VIconButton } from './VIconButton';

export interface DropdownOption {
  id: string;
  label: string;
  subLabel?: string;
  icon?: React.ReactNode;
}

export type SelectOption = DropdownOption;

export interface SelectDropdownProps {
  label?: string;
  options: DropdownOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  helperText?: string;
  errorMessage?: string;
  isDisabled?: boolean;
  testID?: string;
}

export const SelectDropdown: React.FC<SelectDropdownProps> = ({
  label,
  options,
  selectedId,
  onSelect,
  placeholder,
  helperText,
  errorMessage,
  isDisabled = false,
  testID,
}) => {
  const { colors, spacing, radii, typography } = useTheme();
  const { language } = useLanguage();
  const resolvedPlaceholder =
    placeholder ?? (language === 'hi' ? 'चयन करें' : 'Select an option');
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.id === selectedId);
  }, [options, selectedId]);

  const showSearch = options.length > 6;

  const filteredOptions = useMemo(() => {
    if (!showSearch || !searchQuery.trim()) {
      return options;
    }
    const query = searchQuery.trim().toLowerCase();
    return options.filter((opt) => {
      return (
        opt.label.toLowerCase().includes(query) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(query))
      );
    });
  }, [options, searchQuery, showSearch]);

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

  const handleSelect = (id: string) => {
    onSelect(id);
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
          {label}
        </Text>
      ) : null}

      {/* Trigger Box */}
      <Pressable
        onPress={handleOpen}
        disabled={isDisabled}
        accessibilityRole="combobox"
        accessibilityLabel={`${label || (language === 'hi' ? 'चयन करें' : 'Select')}: ${selectedOption ? selectedOption.label : resolvedPlaceholder}`}
        accessibilityHint="Opens selection modal"
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
          {selectedOption ? (
            <View style={styles.selectedRow}>
              {selectedOption.icon ? (
                <View style={[styles.triggerIconSlot, { marginRight: spacing.sm }]}>
                  {selectedOption.icon}
                </View>
              ) : null}
              <View style={styles.textContainer}>
                <Text
                  style={[
                    styles.selectedLabel,
                    {
                      color: colors.textPrimary,
                      fontSize: typography.bodyMedium.fontSize,
                      lineHeight: getDevanagariLineHeight(typography.bodyMedium.fontSize),
                    },
                  ]}
                  numberOfLines={1}
                >
                  {selectedOption.label}
                </Text>
                {selectedOption.subLabel ? (
                  <Text
                    style={[
                      styles.selectedSubLabel,
                      {
                        color: colors.textMuted,
                        fontSize: typography.caption.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {selectedOption.subLabel}
                  </Text>
                ) : null}
              </View>
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
              numberOfLines={1}
            >
              {resolvedPlaceholder}
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

      {/* Helper / Error Message */}
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
                {label || (language === 'hi' ? 'चयन करें' : 'Select')}
              </Text>

              <VIconButton
                icon={<Ionicons name="close" size={24} color={colors.textPrimary} />}
                onPress={handleClose}
                variant="ghost"
                size={40}
                accessibilityLabel="Close selection sheet"
              />
            </View>

            {/* Optional Search Bar */}
            {showSearch ? (
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
                  placeholder={language === 'hi' ? 'खोजें' : 'Search...'}
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
            ) : null}

            {/* Options List */}
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.xxxl,
              }}
              ListEmptyComponent={
                <View style={[styles.emptyContainer, { paddingVertical: spacing.xxl }]}>
                  <Ionicons
                    name="information-circle-outline"
                    size={32}
                    color={colors.textMuted}
                    style={{ marginBottom: spacing.xs }}
                  />
                  <Text
                    style={[
                      styles.emptyText,
                      {
                        color: colors.textMuted,
                        fontSize: typography.bodyMedium.fontSize,
                        lineHeight: getDevanagariLineHeight(typography.bodyMedium.fontSize),
                        textAlign: 'center',
                      },
                    ]}
                  >
                    {language === 'hi' ? 'कोई विकल्प नहीं मिला' : 'No options found'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = selectedId === item.id;
                return (
                  <Pressable
                    onPress={() => handleSelect(item.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${item.label}${item.subLabel ? `, ${item.subLabel}` : ''}`}
                    style={({ pressed }) => [
                      styles.optionRow,
                      {
                        minHeight: spacing.touch,
                        paddingVertical: spacing.md,
                        borderBottomColor: colors.borderDefault,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        backgroundColor: pressed ? colors.surfaceBase : 'transparent',
                      },
                    ]}
                  >
                    {item.icon ? (
                      <View style={[styles.itemIconSlot, { marginRight: spacing.md }]}>
                        {item.icon}
                      </View>
                    ) : null}

                    <View style={styles.optionTextContainer}>
                      <Text
                        style={[
                          styles.optionLabel,
                          {
                            color: isSelected ? colors.brandPrimary : colors.textPrimary,
                            fontSize: typography.bodyLarge.fontSize,
                            lineHeight: getDevanagariLineHeight(typography.bodyLarge.fontSize),
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {item.label}
                      </Text>
                      {item.subLabel ? (
                        <Text
                          style={[
                            styles.optionSubLabel,
                            {
                              color: colors.textMuted,
                              fontSize: typography.caption.fontSize,
                              lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                              marginTop: spacing.xxs,
                            },
                          ]}
                        >
                          {item.subLabel}
                        </Text>
                      ) : null}
                    </View>

                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={colors.brandPrimary}
                        style={{ marginLeft: spacing.sm }}
                      />
                    ) : (
                      <View
                        style={[
                          styles.unselectedRing,
                          {
                            borderColor: colors.borderDefault,
                            borderRadius: radii.full,
                            marginLeft: spacing.sm,
                          },
                        ]}
                      />
                    )}
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

export default SelectDropdown;

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
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  triggerIconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  selectedLabel: {
    fontWeight: '600',
  },
  selectedSubLabel: {},
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
    maxHeight: '80%',
    width: '100%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontWeight: '700',
    flex: 1,
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
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemIconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {},
  optionSubLabel: {},
  unselectedRing: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {},
});

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { VIconButton } from './VIconButton';
import { VButton } from './VButton';

export interface DatePickerModalProps {
  isVisible: boolean;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  onClose: () => void;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  availableDates?: string[]; // Specific dates Pandit is available
  auspiciousDates?: string[]; // Auspicious dates (Shubh Muhurat)
  title?: string;
  testID?: string;
}

const MONTHS_BILINGUAL = [
  { hi: 'जनवरी', en: 'January' },
  { hi: 'फ़रवरी', en: 'February' },
  { hi: 'मार्च', en: 'March' },
  { hi: 'अप्रैल', en: 'April' },
  { hi: 'मई', en: 'May' },
  { hi: 'जून', en: 'June' },
  { hi: 'जुलाई', en: 'July' },
  { hi: 'अगस्त', en: 'August' },
  { hi: 'सितंबर', en: 'September' },
  { hi: 'अक्टूबर', en: 'October' },
  { hi: 'नवंबर', en: 'November' },
  { hi: 'दिसंबर', en: 'December' },
];

const WEEKDAYS_BILINGUAL = [
  { hi: 'रवि', en: 'Sun' },
  { hi: 'सोम', en: 'Mon' },
  { hi: 'मंगल', en: 'Tue' },
  { hi: 'बुध', en: 'Wed' },
  { hi: 'गुरु', en: 'Thu' },
  { hi: 'शुक्र', en: 'Fri' },
  { hi: 'शनि', en: 'Sat' },
];

export const DatePickerModal: React.FC<DatePickerModalProps> = ({
  isVisible,
  selectedDate,
  onSelectDate,
  onClose,
  minDate,
  maxDate,
  availableDates,
  auspiciousDates = [],
  title,
  testID,
}) => {
  const { colors, spacing, radii, typography } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';
  const resolvedTitle = title ?? (isHi ? 'पूजा तिथि चयन' : 'Select puja date');

  // Parse initial selected date or fallback to today
  const initialDate = useMemo(() => {
    if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      const [y, m, d] = selectedDate.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [selectedDate]);

  const [currentYear, setCurrentYear] = useState<number>(initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(initialDate.getMonth()); // 0-indexed
  const [tempDate, setTempDate] = useState<string>(selectedDate || '');

  // Keep internal state synced when modal becomes visible
  React.useEffect(() => {
    if (isVisible) {
      if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
        const [y, m, d] = selectedDate.split('-').map(Number);
        setCurrentYear(y);
        setCurrentMonth(m - 1);
        setTempDate(selectedDate);
      } else {
        const today = new Date();
        setCurrentYear(today.getFullYear());
        setCurrentMonth(today.getMonth());
      }
    }
  }, [isVisible, selectedDate]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Build calendar matrix
  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth + 1, 0).getDate();
  }, [currentYear, currentMonth]);

  const firstDayOfWeek = useMemo(() => {
    return new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun
  }, [currentYear, currentMonth]);

  const todayStr = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const calendarCells = useMemo(() => {
    const cells: Array<{
      dayNumber?: number;
      dateStr?: string;
      isDisabled: boolean;
      isAuspicious: boolean;
      isAvailable: boolean;
      isToday: boolean;
    }> = [];

    // Empty lead cells
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({
        isDisabled: true,
        isAuspicious: false,
        isAvailable: false,
        isToday: false,
      });
    }

    // Days of the month
    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(currentMonth + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${currentYear}-${monthStr}-${dayStr}`;

      let isDisabled = false;
      if (minDate && dateStr < minDate) {
        isDisabled = true;
      }
      if (maxDate && dateStr > maxDate) {
        isDisabled = true;
      }
      if (availableDates && availableDates.length > 0 && !availableDates.includes(dateStr)) {
        isDisabled = true;
      }

      const isAuspicious = auspiciousDates.includes(dateStr);
      const isAvailable = !availableDates || availableDates.includes(dateStr);
      const isToday = dateStr === todayStr;

      cells.push({
        dayNumber: d,
        dateStr,
        isDisabled,
        isAuspicious,
        isAvailable,
        isToday,
      });
    }

    return cells;
  }, [currentYear, currentMonth, daysInMonth, firstDayOfWeek, minDate, maxDate, availableDates, auspiciousDates, todayStr]);

  const handleSelectDay = (dateStr?: string, isDisabled?: boolean) => {
    if (!dateStr || isDisabled) {
      return;
    }
    setTempDate(dateStr);
  };

  const handleConfirm = () => {
    if (tempDate) {
      onSelectDate(tempDate);
      onClose();
    }
  };

  const monthInfo = MONTHS_BILINGUAL[currentMonth];

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlayScrim }]}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <SafeAreaView
          style={[
            styles.dialogContainer,
            {
              backgroundColor: colors.surfaceCard,
              borderRadius: radii.xl,
              borderColor: colors.borderDefault,
              borderWidth: 1,
              padding: spacing.lg,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTextCol}>
              <Text
                style={[
                  styles.title,
                  {
                    color: colors.textPrimary,
                    fontSize: typography.headlineSmall.fontSize,
                    lineHeight: getDevanagariLineHeight(typography.headlineSmall.fontSize),
                  },
                ]}
              >
                {resolvedTitle}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  {
                    color: colors.brandPrimary,
                    fontSize: typography.caption.fontSize,
                    lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                  },
                ]}
              >
                {isHi
                  ? 'शुभ मुहूर्त एवं पंचांग अनुकूलता'
                  : 'Vedic muhurat calendar'}
              </Text>
            </View>

            <VIconButton
              icon={<Ionicons name="close" size={24} color={colors.textPrimary} />}
              onPress={onClose}
              variant="ghost"
              size={40}
              accessibilityLabel="Close date picker"
            />
          </View>

          {/* Month / Year Navigation */}
          <View
            style={[
              styles.monthNavRow,
              {
                marginTop: spacing.md,
                paddingVertical: spacing.xs,
                borderBottomColor: colors.borderDefault,
                borderBottomWidth: 1,
                borderTopColor: colors.borderDefault,
                borderTopWidth: 1,
              },
            ]}
          >
            <VIconButton
              icon={<Ionicons name="chevron-back" size={22} color={colors.textPrimary} />}
              onPress={handlePrevMonth}
              variant="surface"
              size={36}
              accessibilityLabel="Previous Month"
            />

            <View style={styles.monthLabelCol}>
              <Text
                style={[
                  styles.monthName,
                  {
                    color: colors.textPrimary,
                    fontSize: typography.titleMedium.fontSize,
                    lineHeight: getDevanagariLineHeight(typography.titleMedium.fontSize),
                    fontWeight: '700',
                  },
                ]}
              >
                {language === 'hi' ? monthInfo.hi : monthInfo.en} {currentYear}
              </Text>
            </View>

            <VIconButton
              icon={<Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />}
              onPress={handleNextMonth}
              variant="surface"
              size={36}
              accessibilityLabel="Next Month"
            />
          </View>

          {/* Weekday Labels */}
          <View style={[styles.weekdaysRow, { marginTop: spacing.sm, marginBottom: spacing.xs }]}>
            {WEEKDAYS_BILINGUAL.map((day, idx) => (
              <View key={idx} style={styles.weekdayCell}>
                <Text
                  style={[
                    styles.weekdayTextHi,
                    {
                      color: idx === 0 ? colors.statusAlert : colors.textMuted,
                      fontSize: 12,
                      fontWeight: '600',
                    },
                  ]}
                >
                  {isHi ? day.hi : day.en}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid (48dp cell hit target) */}
          <View style={styles.gridContainer}>
            {calendarCells.map((cell, idx) => {
              if (!cell.dayNumber || !cell.dateStr) {
                return <View key={`empty-${idx}`} style={styles.dayCellContainer} />;
              }

              const isSelected = tempDate === cell.dateStr;

              return (
                <View key={cell.dateStr} style={styles.dayCellContainer}>
                  <Pressable
                    onPress={() => handleSelectDay(cell.dateStr, cell.isDisabled)}
                    disabled={cell.isDisabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected, disabled: cell.isDisabled }}
                    accessibilityLabel={`${cell.dayNumber} ${monthInfo.en} ${currentYear}${cell.isAuspicious ? ', Auspicious Shubh Muhurat' : ''}`}
                    style={[
                      styles.dayButton,
                      {
                        width: spacing.touch,
                        height: spacing.touch,
                        borderRadius: radii.full,
                        backgroundColor: isSelected
                          ? colors.brandPrimary
                          : cell.isAuspicious
                          ? colors.surfaceSubtle
                          : 'transparent',
                        borderColor: isSelected
                          ? colors.brandPrimary
                          : cell.isToday
                          ? colors.borderAccent
                          : 'transparent',
                        borderWidth: cell.isToday || isSelected ? 1.5 : 0,
                        opacity: cell.isDisabled ? 0.3 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumberText,
                        {
                          color: isSelected
                            ? colors.textOnPrimary
                            : cell.isAuspicious
                            ? colors.brandPrimary
                            : colors.textPrimary,
                          fontSize: typography.bodyMedium.fontSize,
                          fontWeight: isSelected || cell.isAuspicious ? '700' : '500',
                        },
                      ]}
                    >
                      {cell.dayNumber}
                    </Text>

                    {/* Auspicious Muhurat Indicator Dot */}
                    {cell.isAuspicious ? (
                      <View
                        style={[
                          styles.auspiciousDot,
                          {
                            backgroundColor: isSelected
                              ? colors.textOnPrimary
                              : colors.brandPrimary,
                            borderRadius: radii.full,
                          },
                        ]}
                      />
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* Legend */}
          <View
            style={[
              styles.legendRow,
              {
                marginTop: spacing.md,
                paddingVertical: spacing.xs,
              },
            ]}
          >
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: colors.brandPrimary, borderRadius: radii.full },
                ]}
              />
              <Text
                style={[
                  styles.legendText,
                  { color: colors.textMuted, fontSize: 12, marginLeft: spacing.xs },
                ]}
              >
                {isHi ? 'शुभ मुहूर्त' : 'Auspicious muhurat'}
              </Text>
            </View>

            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendBorderSample,
                  { borderColor: colors.borderAccent, borderRadius: radii.full },
                ]}
              />
              <Text
                style={[
                  styles.legendText,
                  { color: colors.textMuted, fontSize: 12, marginLeft: spacing.xs },
                ]}
              >
                {isHi ? 'आज' : 'Today'}
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View
            style={[
              styles.actionsRow,
              {
                marginTop: spacing.lg,
                gap: spacing.md,
              },
            ]}
          >
            <View style={styles.actionButtonWrapper}>
              <VButton
                label={isHi ? 'रद्द करें' : 'Cancel'}
                onPress={onClose}
                variant="ghost"
                size="md"
                fullWidth
              />
            </View>

            <View style={styles.actionButtonWrapper}>
              <VButton
                label={isHi ? 'तिथि पुष्टि करें' : 'Confirm date'}
                onPress={handleConfirm}
                variant="primary"
                size="md"
                isDisabled={!tempDate}
                fullWidth
              />
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

export default DatePickerModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  dialogContainer: {
    width: '100%',
    maxWidth: 380,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTextCol: {
    flex: 1,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    fontWeight: '500',
    marginTop: 2,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthLabelCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthName: {},
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayTextHi: {},
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCellContainer: {
    width: '14.285%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  dayButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberText: {},
  auspiciousDot: {
    width: 4,
    height: 4,
    position: 'absolute',
    bottom: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
  },
  legendBorderSample: {
    width: 10,
    height: 10,
    borderWidth: 1.5,
  },
  legendText: {},
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionButtonWrapper: {
    flex: 1,
  },
});

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { VIconButton } from './VIconButton';
import { VButton } from './VButton';

export interface TimePickerModalProps {
  isVisible: boolean;
  selectedTime: string; // HH:mm in 24-hour format (e.g. "14:30")
  onSelectTime: (time: string) => void;
  onClose: () => void;
  is24Hour?: boolean;
  title?: string;
  testID?: string;
}

// Authentic Vedic Muhurat Presets
const VEDIC_MUHURATS = [
  { id: 'brahma', nameHi: 'ब्रह्म मुहूर्त', nameEn: 'Brahma Muhurat', time24: '04:30' },
  { id: 'pratah', nameHi: 'प्रातःकाल', nameEn: 'Pratahkala', time24: '06:00' },
  { id: 'abhijeet', nameHi: 'अभिजीत मुहूर्त', nameEn: 'Abhijeet Muhurat', time24: '11:45' },
  { id: 'madhyahna', nameHi: 'मध्याह्न', nameEn: 'Madhyahna', time24: '12:30' },
  { id: 'godhuli', nameHi: 'गोधूलि मुहूर्त', nameEn: 'Godhuli Muhurat', time24: '18:15' },
  { id: 'pradosh', nameHi: 'प्रदोष काल', nameEn: 'Pradosh Kaal', time24: '19:00' },
  { id: 'nishita', nameHi: 'निशीथ काल', nameEn: 'Nishita Kaal', time24: '23:45' },
] as const;

const MINUTES_INTERVALS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export const TimePickerModal: React.FC<TimePickerModalProps> = ({
  isVisible,
  selectedTime,
  onSelectTime,
  onClose,
  is24Hour: initialIs24Hour = false,
  title,
  testID,
}) => {
  const { colors, spacing, radii, typography } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';
  const resolvedTitle =
    title ?? (isHi ? 'मुहूर्त समय चयन' : 'Select time');

  const [is24Hour, setIs24Hour] = useState<boolean>(initialIs24Hour);
  const [hour, setHour] = useState<number>(6); // 1-12 in 12h, 0-23 in 24h
  const [minute, setMinute] = useState<number>(0); // 0-59
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [activeTab, setActiveTab] = useState<'hour' | 'minute'>('hour');

  // Parse incoming 24h time string ("HH:mm")
  useEffect(() => {
    if (isVisible && selectedTime) {
      const parts = selectedTime.split(':');
      if (parts.length === 2) {
        const h24 = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h24) && !isNaN(m)) {
          setMinute(m);
          if (is24Hour) {
            setHour(h24);
          } else {
            if (h24 === 0) {
              setHour(12);
              setPeriod('AM');
            } else if (h24 === 12) {
              setHour(12);
              setPeriod('PM');
            } else if (h24 > 12) {
              setHour(h24 - 12);
              setPeriod('PM');
            } else {
              setHour(h24);
              setPeriod('AM');
            }
          }
        }
      }
    }
  }, [isVisible, selectedTime, is24Hour]);

  // Convert current state into standard 24h string "HH:mm"
  const formatted24hTime = useMemo(() => {
    let finalHour = hour;
    if (!is24Hour) {
      if (period === 'AM') {
        finalHour = hour === 12 ? 0 : hour;
      } else {
        finalHour = hour === 12 ? 12 : hour + 12;
      }
    }
    const hStr = String(finalHour).padStart(2, '0');
    const mStr = String(minute).padStart(2, '0');
    return `${hStr}:${mStr}`;
  }, [hour, minute, period, is24Hour]);

  // Display time for the top preview card
  const displayTime = useMemo(() => {
    const hStr = String(hour).padStart(2, '0');
    const mStr = String(minute).padStart(2, '0');
    if (is24Hour) {
      return `${hStr}:${mStr}`;
    }
    return `${hStr}:${mStr} ${period}`;
  }, [hour, minute, period, is24Hour]);

  const handleApplyPreset = (time24: string) => {
    const [hStr, mStr] = time24.split(':');
    const h24 = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    setMinute(m);
    if (is24Hour) {
      setHour(h24);
    } else {
      if (h24 === 0) {
        setHour(12);
        setPeriod('AM');
      } else if (h24 === 12) {
        setHour(12);
        setPeriod('PM');
      } else if (h24 > 12) {
        setHour(h24 - 12);
        setPeriod('PM');
      } else {
        setHour(h24);
        setPeriod('AM');
      }
    }
  };

  const handleConfirm = () => {
    onSelectTime(formatted24hTime);
    onClose();
  };

  // Generate available hours
  const hoursList = useMemo(() => {
    if (is24Hour) {
      return Array.from({ length: 24 }, (_, i) => i);
    }
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, [is24Hour]);

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
                  ? 'शुभ मुहूर्त एवं सटीक समय'
                  : 'Precise Vedic Muhurat'}
              </Text>
            </View>

            <VIconButton
              icon={<Ionicons name="close" size={24} color={colors.textPrimary} />}
              onPress={onClose}
              variant="ghost"
              size={40}
              accessibilityLabel="Close time picker"
            />
          </View>

          {/* Time Display & 12h/24h Toggle */}
          <View
            style={[
              styles.displayCard,
              {
                backgroundColor: colors.surfaceBase,
                borderColor: colors.borderDefault,
                borderRadius: radii.lg,
                padding: spacing.md,
                marginTop: spacing.md,
              },
            ]}
          >
            <View style={styles.timeSegmentsRow}>
              {/* Hour Segment */}
              <Pressable
                onPress={() => setActiveTab('hour')}
                accessibilityRole="button"
                accessibilityLabel={`Hour: ${hour}`}
                style={[
                  styles.segmentBox,
                  {
                    minHeight: spacing.touch,
                    minWidth: 56,
                    backgroundColor: activeTab === 'hour' ? colors.surfaceSubtle : 'transparent',
                    borderColor: activeTab === 'hour' ? colors.borderAccent : 'transparent',
                    borderWidth: 1,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: activeTab === 'hour' ? colors.brandPrimary : colors.textPrimary,
                      fontSize: 28,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {String(hour).padStart(2, '0')}
                </Text>
                <Text style={[styles.segmentLabel, { color: colors.textMuted, fontSize: 12, lineHeight: getDevanagariLineHeight(12) }]}>
                  {isHi ? 'घंटा' : 'HR'}
                </Text>
              </Pressable>

              <Text style={[styles.colonText, { color: colors.textPrimary, fontSize: 26 }]}>:</Text>

              {/* Minute Segment */}
              <Pressable
                onPress={() => setActiveTab('minute')}
                accessibilityRole="button"
                accessibilityLabel={`Minute: ${minute}`}
                style={[
                  styles.segmentBox,
                  {
                    minHeight: spacing.touch,
                    minWidth: 56,
                    backgroundColor: activeTab === 'minute' ? colors.surfaceSubtle : 'transparent',
                    borderColor: activeTab === 'minute' ? colors.borderAccent : 'transparent',
                    borderWidth: 1,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: activeTab === 'minute' ? colors.brandPrimary : colors.textPrimary,
                      fontSize: 28,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {String(minute).padStart(2, '0')}
                </Text>
                <Text style={[styles.segmentLabel, { color: colors.textMuted, fontSize: 12, lineHeight: getDevanagariLineHeight(12) }]}>
                  {isHi ? 'मिनट' : 'MIN'}
                </Text>
              </Pressable>

              {/* AM / PM or 24h indicator */}
              {!is24Hour ? (
                <View style={[styles.periodCol, { marginLeft: spacing.sm }]}>
                  <Pressable
                    onPress={() => setPeriod('AM')}
                    accessibilityRole="button"
                    accessibilityState={{ selected: period === 'AM' }}
                    hitSlop={{ top: 8, bottom: 2, left: 6, right: 6 }}
                    style={[
                      styles.periodButton,
                      {
                        backgroundColor: period === 'AM' ? colors.brandPrimary : colors.surfaceCard,
                        borderColor: colors.borderDefault,
                        borderWidth: 1,
                        borderRadius: radii.sm,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.periodText,
                        {
                          color: period === 'AM' ? colors.textOnPrimary : colors.textPrimary,
                          fontSize: 12,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      AM
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setPeriod('PM')}
                    accessibilityRole="button"
                    accessibilityState={{ selected: period === 'PM' }}
                    hitSlop={{ top: 2, bottom: 8, left: 6, right: 6 }}
                    style={[
                      styles.periodButton,
                      {
                        backgroundColor: period === 'PM' ? colors.brandPrimary : colors.surfaceCard,
                        borderColor: colors.borderDefault,
                        borderWidth: 1,
                        borderRadius: radii.sm,
                        marginTop: 4,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.periodText,
                        {
                          color: period === 'PM' ? colors.textOnPrimary : colors.textPrimary,
                          fontSize: 12,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      PM
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* 12h / 24h Toggle Pill */}
            <Pressable
              onPress={() => setIs24Hour(!is24Hour)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="switch"
              accessibilityLabel={`Switch to ${is24Hour ? '12-hour' : '24-hour'} format`}
              style={[
                styles.formatTogglePill,
                {
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  borderWidth: 1,
                  marginTop: spacing.sm,
                },
              ]}
            >
              <Text
                style={[
                  styles.formatToggleText,
                  {
                    color: colors.brandPrimary,
                    fontSize: 12,
                    fontWeight: '600',
                  },
                ]}
              >
                {isHi
                  ? is24Hour
                    ? '12-घंटे (AM/PM) प्रारूप अपनाएं'
                    : '24-घंटे प्रारूप अपनाएं'
                  : is24Hour
                  ? 'Switch to 12-hour (AM/PM)'
                  : 'Switch to 24-hour'}
              </Text>
            </Pressable>
          </View>

          {/* Selector Grid (Hour or Minute) */}
          <View style={[styles.selectorSection, { marginTop: spacing.md }]}>
            <Text
              style={[
                styles.selectorHeading,
                {
                  color: colors.textMuted,
                  fontSize: 12,
                  marginBottom: spacing.xs,
                  fontWeight: '600',
                },
              ]}
            >
              {activeTab === 'hour'
                ? isHi
                  ? `घंटा चुनें (${is24Hour ? '00-23' : '01-12'})`
                  : `Select hour (${is24Hour ? '00-23' : '01-12'})`
                : isHi
                ? 'मिनट चुनें'
                : 'Select minutes'}
            </Text>

            <ScrollView
              style={styles.gridScroll}
              contentContainerStyle={styles.gridWrap}
              showsVerticalScrollIndicator={false}
            >
              {activeTab === 'hour'
                ? hoursList.map((h) => {
                    const isSelected = hour === h;
                    return (
                      <Pressable
                        key={h}
                        onPress={() => {
                          setHour(h);
                          setActiveTab('minute'); // Auto-advance to minute
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        style={[
                          styles.gridItem,
                          {
                            minWidth: 48,
                            minHeight: spacing.touch,
                            borderRadius: radii.md,
                            backgroundColor: isSelected ? colors.brandPrimary : colors.surfaceBase,
                            borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                            borderWidth: 1,
                            margin: 3,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.gridItemText,
                            {
                              color: isSelected ? colors.textOnPrimary : colors.textPrimary,
                              fontSize: 15,
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                        >
                          {String(h).padStart(2, '0')}
                        </Text>
                      </Pressable>
                    );
                  })
                : MINUTES_INTERVALS.map((mStr) => {
                    const mVal = parseInt(mStr, 10);
                    const isSelected = minute === mVal;
                    return (
                      <Pressable
                        key={mStr}
                        onPress={() => setMinute(mVal)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        style={[
                          styles.gridItem,
                          {
                            minWidth: 48,
                            minHeight: spacing.touch,
                            borderRadius: radii.md,
                            backgroundColor: isSelected ? colors.brandPrimary : colors.surfaceBase,
                            borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                            borderWidth: 1,
                            margin: 3,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.gridItemText,
                            {
                              color: isSelected ? colors.textOnPrimary : colors.textPrimary,
                              fontSize: 15,
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                        >
                          {mStr}
                        </Text>
                      </Pressable>
                    );
                  })}
            </ScrollView>
          </View>

          {/* Quick Vedic Muhurat Presets */}
          <View style={[styles.presetsSection, { marginTop: spacing.md }]}>
            <Text
              style={[
                styles.presetsHeading,
                {
                  color: colors.textMuted,
                  fontSize: 12,
                  marginBottom: spacing.xs,
                  fontWeight: '600',
                },
              ]}
            >
              {isHi
                ? 'शास्त्रोक्त मुहूर्त क्विक प्रेसेट'
                : 'Auspicious muhurat presets'}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.xs, paddingVertical: 2 }}
            >
              {VEDIC_MUHURATS.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => handleApplyPreset(item.time24)}
                  accessibilityRole="button"
                  accessibilityLabel={`${isHi ? item.nameHi : item.nameEn} at ${item.time24}`}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  style={[
                    styles.presetChip,
                    {
                      minHeight: 36,
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.borderAccent,
                      borderWidth: 1,
                      borderRadius: radii.full,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.presetTextHi,
                      {
                        color: colors.brandPrimary,
                        fontSize: 12,
                        fontWeight: '600',
                      },
                    ]}
                  >
                    {isHi ? item.nameHi : item.nameEn} ({item.time24})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
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
                label={isHi ? `समय पुष्टि (${displayTime})` : `Confirm ${displayTime}`}
                onPress={handleConfirm}
                variant="primary"
                size="md"
                fullWidth
              />
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

export default TimePickerModal;

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
  displayCard: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeSegmentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  segmentText: {},
  segmentLabel: {
    marginTop: 2,
    fontWeight: '600',
  },
  colonText: {
    marginHorizontal: 8,
    fontWeight: '700',
  },
  periodCol: {
    justifyContent: 'center',
  },
  periodButton: {
    minWidth: 40,
    minHeight: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  periodText: {},
  formatTogglePill: {
    alignSelf: 'center',
  },
  formatToggleText: {},
  selectorSection: {},
  selectorHeading: {},
  gridScroll: {
    maxHeight: 120,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  gridItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridItemText: {},
  presetsSection: {},
  presetsHeading: {},
  presetChip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetTextHi: {},
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionButtonWrapper: {
    flex: 1,
  },
});

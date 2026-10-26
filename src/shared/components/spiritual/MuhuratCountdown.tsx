import React, { useState, useEffect, useMemo, useRef } from 'react';
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

export interface MuhuratCountdownProps {
  /** Target ritual date/time (ISO string or Date object) */
  targetDateTime: string | Date;
  /** Optional Rahukaal window (HH:mm format, e.g. { start: '10:30', end: '12:00' }) */
  rahukaalWindow?: { start: string; end: string };
  /** Callback fired when countdown reaches zero */
  onExpire?: () => void;
  /** Container style overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

const calculateTimeRemaining = (targetDate: Date): TimeRemaining => {
  const now = new Date().getTime();
  const diff = targetDate.getTime() - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }

  const seconds = Math.floor((diff / 1000) % 60);
  const minutes = Math.floor((diff / 1000 / 60) % 60);
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  return { days, hours, minutes, seconds, totalMs: diff };
};

/**
 * Checks whether the target time falls within the Rahukaal window (HH:mm to HH:mm)
 */
const checkRahukaalConflict = (
  targetDate: Date,
  window?: { start: string; end: string }
): boolean => {
  if (!window || !window.start || !window.end) return false;

  try {
    const [startH, startM] = window.start.split(':').map((v) => parseInt(v, 10));
    const [endH, endM] = window.end.split(':').map((v) => parseInt(v, 10));

    const targetH = targetDate.getHours();
    const targetM = targetDate.getMinutes();

    const targetMinutes = targetH * 60 + targetM;
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);

    return targetMinutes >= startMinutes && targetMinutes <= endMinutes;
  } catch {
    return false;
  }
};

/**
 * MuhuratCountdown — Real-Time Sacred Ritual Timer
 *
 * Displays a live countdown to the ritual Muhurat in sacred temple gold styling,
 * checking for Rahukaal overlap and alerting devotees per Vedic astronomy.
 */
export const MuhuratCountdown: React.FC<MuhuratCountdownProps> = ({
  targetDateTime,
  rahukaalWindow,
  onExpire,
  style,
  testID = 'muhurat-countdown',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  const targetDate = useMemo(() => {
    return typeof targetDateTime === 'string'
      ? new Date(targetDateTime)
      : targetDateTime;
  }, [targetDateTime]);

  const [remaining, setRemaining] = useState<TimeRemaining>(() =>
    calculateTimeRemaining(targetDate)
  );

  const hasExpiredRef = useRef(false);

  useEffect(() => {
    // Reset expiration tracker on target change
    hasExpiredRef.current = false;

    const tick = () => {
      const currentRemaining = calculateTimeRemaining(targetDate);
      setRemaining(currentRemaining);

      if (currentRemaining.totalMs <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onExpire?.();
      }
    };

    tick();
    const timerId = setInterval(tick, 1000);

    return () => clearInterval(timerId);
  }, [targetDate, onExpire]);

  const isRahukaalConflict = useMemo(() => {
    return checkRahukaalConflict(targetDate, rahukaalWindow);
  }, [targetDate, rahukaalWindow]);

  const isExpired = remaining.totalMs <= 0;

  const timeBlocks = [
    { labelHi: 'दिन', labelEn: 'Days', value: remaining.days },
    { labelHi: 'घंटे', labelEn: 'Hours', value: remaining.hours },
    { labelHi: 'मिनट', labelEn: 'Mins', value: remaining.minutes },
    { labelHi: 'सेकंड', labelEn: 'Secs', value: remaining.seconds },
  ];

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
      accessibilityRole="timer"
      accessibilityLabel={
        isHi
          ? `शुभ मुहूर्त उलटी गिनती, ${remaining.days} दिन ${remaining.hours} घंटे ${remaining.minutes} मिनट`
          : `Auspicious muhurat countdown, ${remaining.days} days ${remaining.hours} hours ${remaining.minutes} minutes`
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
              name="clock-outline"
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
              {isHi ? 'शुभ मुहूर्त उलटी गिनती' : 'Auspicious Muhurat Countdown'}
            </Text>
          </View>
        </View>

        {/* Auspicious flame glyph */}
        <MaterialCommunityIcons
          name="fire"
          size={20}
          color={isExpired ? colors.statusActive : colors.brandPrimary}
        />
      </View>

      {/* Rahukaal Conflict Banner */}
      {isRahukaalConflict && (
        <View
          style={[
            styles.alertBanner,
            {
              backgroundColor: colors.errorBg,
              borderColor: colors.statusAlert,
              borderRadius: radii.md,
              padding: spacing.sm,
              marginBottom: spacing.md,
            },
          ]}
        >
          <Ionicons
            name="warning-outline"
            size={18}
            color={colors.statusAlert}
            style={{ marginRight: spacing.xs }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.alertTextHi,
                {
                  color: colors.statusAlert,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                },
              ]}
            >
              {isHi
                ? `राहुकाल सतर्कता: यह समय राहुकाल (${rahukaalWindow?.start} - ${rahukaalWindow?.end}) में पड़ता है।`
                : `Rahukaal alert: this time falls within Rahukaal (${rahukaalWindow?.start} - ${rahukaalWindow?.end}).`}
            </Text>
          </View>
        </View>
      )}

      {/* Timer Digits Display */}
      {isExpired ? (
        <View
          style={[
            styles.expiredBox,
            {
              backgroundColor: colors.successBg,
              borderColor: colors.statusActive,
              borderRadius: radii.md,
              padding: spacing.md,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="bell-ring-outline"
            size={24}
            color={colors.statusActive}
            style={{ marginBottom: spacing.xs }}
          />
          <Text
            style={[
              styles.expiredTextHi,
              {
                color: colors.statusActive,
                fontFamily: typography.titleMedium.fontFamily,
                fontSize: typography.titleMedium.fontSize,
                lineHeight: getDevanagariLineHeight(typography.titleMedium.fontSize),
              },
            ]}
          >
            {isHi
              ? 'शुभ मुहूर्त प्रारंभ हो चुका है'
              : 'The auspicious muhurat has begun'}
          </Text>
        </View>
      ) : (
        <View style={styles.digitsRow}>
          {timeBlocks.map((block, idx) => (
            <React.Fragment key={block.labelEn}>
              <View
                style={[
                  styles.digitBox,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderAccent,
                    borderRadius: radii.md,
                    paddingVertical: spacing.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.digitValue,
                    {
                      color: colors.brandPrimary,
                      fontFamily: typography.headlineMedium.fontFamily,
                      fontSize: 22,
                      lineHeight: 28,
                    },
                  ]}
                >
                  {String(block.value).padStart(2, '0')}
                </Text>
                <Text
                  style={[
                    styles.digitLabelHi,
                    {
                      color: colors.textPrimary,
                      fontFamily: typography.caption.fontFamily,
                      fontSize: 10,
                      lineHeight: 14,
                    },
                  ]}
                >
                  {isHi ? block.labelHi : block.labelEn}
                </Text>
              </View>
              {idx < timeBlocks.length - 1 && (
                <Text
                  style={[
                    styles.colonSeparator,
                    {
                      color: colors.brandPrimary,
                      fontFamily: typography.headlineMedium.fontFamily,
                    },
                  ]}
                >
                  :
                </Text>
              )}
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
};

export default MuhuratCountdown;

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
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  alertTextHi: {
    fontWeight: '600',
  },
  digitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  digitBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 64,
  },
  colonSeparator: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  digitValue: {
    fontWeight: '800',
  },
  digitLabelHi: {
    fontWeight: '600',
    marginTop: 2,
  },
  expiredBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  expiredTextHi: {
    fontWeight: '700',
    textAlign: 'center',
  },
});

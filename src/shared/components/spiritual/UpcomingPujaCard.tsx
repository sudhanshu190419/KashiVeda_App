// src/shared/components/spiritual/UpcomingPujaCard.tsx
import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { VCard } from '../layout/VCard.tsx';
import { VText } from '../foundations/VText.tsx';
import { VButton } from '../foundations/VButton.tsx';
import { LiveStatusPill } from './LiveStatusPill.tsx';
import { useTheme } from '../../theme/index.ts';
import { useLanguage } from '../../i18n/index.ts';
import { MaterialCommunityIcons } from '../icons/index.ts';

export interface UpcomingPujaCardProps {
  /** Name of the puja ritual, e.g. "Rudrabhishek Puja" */
  pujaName: string;
  /** Temple location or address string */
  location?: string;
  /** Scheduled date string, e.g. "Kartik Purnima" or "Tomorrow" */
  dateString?: string;
  /** Scheduled time string, e.g. "06:30 PM" */
  timeString?: string;
  /** Service delivery mode */
  serviceMode?: 'home' | 'temple' | 'remote';
  /** Status of the ritual, e.g. "confirmed", "in_progress", "upcoming" */
  status?: string;
  /** Optional dedication / Gotra name */
  sankalpName?: string;
  /** Name of assigned Pandit */
  panditName?: string;
  /** Primary card press handler */
  onPress?: () => void;
  /** Primary action button handler */
  onActionPress?: () => void;
  /** Label for primary action button */
  actionLabel?: string;
  /** Container style overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

const SERIF_FONT = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});

/**
 * UpcomingPujaCard — Serene, human-designed card for active and scheduled rituals.
 * Simple, clear language: "Upcoming Puja" or "Upcoming Ritual".
 * Zero AI slop, zero emojis, full 48dp touch targets.
 */
export const UpcomingPujaCard: React.FC<UpcomingPujaCardProps> = ({
  pujaName,
  location,
  dateString,
  timeString,
  serviceMode,
  status = 'confirmed',
  sankalpName,
  panditName,
  onPress,
  onActionPress,
  actionLabel,
  style,
  testID = 'upcoming-puja-card',
}) => {
  const { colors, spacing, radii } = useTheme();
  const { pick } = useLanguage();

  const defaultActionLabel =
    actionLabel ||
    (serviceMode === 'remote'
      ? pick('लाइव स्ट्रीम में जुड़ें', 'Join Live Stream')
      : pick('विवरण देखें', 'View Booking Details'));

  const modeIcon =
    serviceMode === 'remote'
      ? 'video-outline'
      : serviceMode === 'temple'
      ? 'temple-hindu'
      : 'home-outline';

  const modeText =
    serviceMode === 'remote'
      ? pick('लाइव दर्शन', 'Live Stream')
      : serviceMode === 'temple'
      ? pick('मंदिर गर्भगृह', 'Temple Visit')
      : pick('गृह प्रवेश / घर पर', 'At Home');

  return (
    <VCard
      variant="default"
      elevation={1}
      onPress={onPress}
      style={[styles.container, style]}
      testID={testID}
    >
      {/* Top Meta Row: Section context & Live Status */}
      <View style={styles.topRow}>
        <View style={styles.badgeGroup}>
          <MaterialCommunityIcons
            name={modeIcon}
            size={16}
            color={colors.brandPrimary}
            style={styles.modeIcon}
          />
          <VText variant="labelSmall" color="brandPrimary" weight="600">
            {modeText}
          </VText>
        </View>
        <LiveStatusPill status={status} />
      </View>

      {/* Main Ritual Title */}
      <VText
        variant="headlineSmall"
        color="textPrimary"
        weight="600"
        style={[styles.title, { fontFamily: SERIF_FONT }]}
      >
        {pujaName}
      </VText>

      {/* Location & Time Subtitles */}
      {(location || dateString || timeString) && (
        <View style={styles.metaContainer}>
          {location ? (
            <VText variant="bodySmall" color="textMuted" numberOfLines={1}>
              {location}
            </VText>
          ) : null}
          {(dateString || timeString) && (
            <VText variant="caption" color="textMuted" style={styles.timeText}>
              {[dateString, timeString].filter(Boolean).join(' • ')}
            </VText>
          )}
        </View>
      )}

      {/* Consecrated Gotra / Sankalp Dedication Line */}
      {sankalpName ? (
        <View
          style={[
            styles.sankalpContainer,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderDefault,
            },
          ]}
        >
          <VText variant="caption" color="textPrimary" weight="500">
            {pick('संकल्प:', 'Sankalp:')} {sankalpName}
          </VText>
        </View>
      ) : null}

      {/* Pandit Name (if assigned) */}
      {panditName ? (
        <View style={styles.panditRow}>
          <VText variant="caption" color="textMuted">
            {pick('पंडित जी:', 'Pandit Ji:')}{' '}
            <VText variant="caption" color="textPrimary" weight="600">
              {panditName}
            </VText>
          </VText>
        </View>
      ) : null}

      {/* Single Decisive 48dp CTA Button */}
      {onActionPress || onPress ? (
        <View style={styles.actionContainer}>
          <VButton
            label={defaultActionLabel}
            variant="primary"
            size="md"
            fullWidth
            onPress={onActionPress || onPress}
            testID={`${testID}-action`}
          />
        </View>
      ) : null}
    </VCard>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    borderRadius: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeIcon: {
    marginRight: 4,
  },
  title: {
    fontFamily: SERIF_FONT,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 4,
  },
  metaContainer: {
    marginBottom: 8,
  },
  timeText: {
    marginTop: 2,
  },
  sankalpContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 8,
  },
  panditRow: {
    marginBottom: 12,
  },
  actionContainer: {
    marginTop: 4,
  },
});

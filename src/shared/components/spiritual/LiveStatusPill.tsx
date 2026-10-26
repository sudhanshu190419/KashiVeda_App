import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { FulfillmentStage } from '../../constants/vedic';

export type LiveStatusType =
  | 'available'
  | 'busy'
  | 'offline'
  | FulfillmentStage
  | 'in_progress'
  | 'live'
  | 'confirmed'
  | 'requested'
  | 'approved'
  | 'completed'
  | string;

export interface LiveStatusPillProps {
  /** Pandit presence state or ritual fulfillment transit stage */
  status: LiveStatusType;
  /** Optional custom label override in English */
  customLabel?: string;
  /** Optional custom label override in Devanagari Hindi */
  customLabelHi?: string;
  /** Whether to animate an expanding radar pulse halo */
  showRadarPulse?: boolean;
  /** Container style overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

interface StatusMeta {
  hi: string;
  en: string;
  colorKey: 'statusActive' | 'warningFg' | 'statusAlert' | 'samagriDispatched' | 'enRoutePandit' | 'brandPrimary' | 'textMuted';
  bgKey: 'successBg' | 'warningBg' | 'errorBg' | 'surfaceSubtle' | 'surfaceBase';
  isPulseActive: boolean;
}

const STATUS_METADATA: Record<string, StatusMeta> = {
  available: {
    hi: 'आज उपलब्ध',
    en: 'Available Today',
    colorKey: 'statusActive',
    bgKey: 'successBg',
    isPulseActive: true,
  },
  busy: {
    hi: 'वर्तमान में व्यस्त',
    en: 'Busy',
    colorKey: 'warningFg',
    bgKey: 'warningBg',
    isPulseActive: false,
  },
  offline: {
    hi: 'ऑफलाइन',
    en: 'Offline',
    colorKey: 'textMuted',
    bgKey: 'surfaceBase',
    isPulseActive: false,
  },
  samagri_dispatched: {
    hi: 'सामग्री प्रेषित',
    en: 'Samagri Sent',
    colorKey: 'samagriDispatched',
    bgKey: 'surfaceSubtle',
    isPulseActive: true,
  },
  pandit_en_route: {
    hi: 'पंडित जी मार्ग में',
    en: 'En Route',
    colorKey: 'enRoutePandit',
    bgKey: 'surfaceSubtle',
    isPulseActive: true,
  },
  ritual_started: {
    hi: 'पूजा प्रारंभ (लाइव)',
    en: 'Ritual Live',
    colorKey: 'brandPrimary',
    bgKey: 'surfaceSubtle',
    isPulseActive: true,
  },
  purnahuti: {
    hi: 'पूर्णाहुति संपन्न',
    en: 'Purnahuti',
    colorKey: 'statusActive',
    bgKey: 'successBg',
    isPulseActive: false,
  },
};

/**
 * Normalizes input status across lifecycle constants and display variants
 */
const resolveStatusMeta = (rawStatus: string): StatusMeta => {
  const normalized = String(rawStatus || '').toLowerCase().replace(/[-\s]/g, '_');

  if (normalized === 'in_progress' || normalized === 'live') {
    return STATUS_METADATA.ritual_started;
  }
  if (normalized === 'en_route') {
    return STATUS_METADATA.pandit_en_route;
  }
  if (normalized === 'completed') {
    return STATUS_METADATA.purnahuti;
  }
  if (normalized === 'confirmed' || normalized === 'approved') {
    return STATUS_METADATA.available;
  }

  return STATUS_METADATA[normalized] || STATUS_METADATA.available;
};

/**
 * LiveStatusPill — Real-Time Presence & Transit Indicator
 *
 * Renders verified live availability or day-of-puja micro-fulfillment state
 * with an authentic pulsating radar beacon.
 */
export const LiveStatusPill: React.FC<LiveStatusPillProps> = ({
  status,
  customLabel,
  customLabelHi,
  showRadarPulse = true,
  style,
  testID = 'live-status-pill',
}) => {
  const { colors, spacing, radii, typography } = useTheme();
  const { language } = useLanguage();

  const meta = resolveStatusMeta(status);
  const statusColor = colors[meta.colorKey];
  const statusBg = colors[meta.bgKey];

  // Radar pulse animation
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  const shouldPulse = showRadarPulse && meta.isPulseActive;

  useEffect(() => {
    if (!shouldPulse) {
      pulseScale.setValue(1);
      pulseOpacity.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.parallel([
        Animated.timing(pulseScale, {
          toValue: 2.2,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [shouldPulse, pulseScale, pulseOpacity]);

  const displayHi = customLabelHi || meta.hi;
  const displayEn = customLabel || meta.en;
  const displayLabel = language === 'hi' ? displayHi : displayEn;

  return (
    <View
      style={[
        styles.pillContainer,
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
      accessibilityLabel={
        language === 'hi' ? `स्थिति: ${displayLabel}` : `Status: ${displayLabel}`
      }
    >
      {/* Radar Dot Beacon */}
      <View style={styles.beaconWrap}>
        {shouldPulse && (
          <Animated.View
            style={[
              styles.pulseHalo,
              {
                backgroundColor: statusColor,
                borderRadius: radii.full,
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />
        )}
        <View
          style={[
            styles.coreDot,
            {
              backgroundColor: statusColor,
              borderRadius: radii.full,
            },
          ]}
        />
      </View>

      {/* Bilingual Text */}
      <Text
        style={[
          styles.statusText,
          {
            color: statusColor,
            fontFamily: typography.caption.fontFamily,
            fontSize: typography.caption.fontSize,
            lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
          },
        ]}
        numberOfLines={1}
      >
        {displayLabel}
      </Text>
    </View>
  );
};

export const BookingStatusChip = LiveStatusPill;
export const AvailabilityIndicator = LiveStatusPill;

export default LiveStatusPill;

const styles = StyleSheet.create({
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    alignSelf: 'flex-start',
    minHeight: 28,
  },
  beaconWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    position: 'relative',
  },
  pulseHalo: {
    position: 'absolute',
    width: 10,
    height: 10,
  },
  coreDot: {
    width: 8,
    height: 8,
  },
  statusText: {
    fontWeight: '700',
  },
});

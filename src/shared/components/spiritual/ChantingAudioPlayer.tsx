import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';

export interface ChantingAudioPlayerProps {
  /** Public audio stream/file URL for Vedic mantra sample */
  audioUrl?: string;
  /** Alias for audioUrl (used in C-05 spec) */
  sampleUrl?: string;
  /** Primary mantra title in English (e.g., 'Shri Rudram Laghunyasa') */
  mantraTitle?: string;
  /** Mantra title in authentic Devanagari script (e.g., 'श्रीरुद्रम् लघुन्यासः') */
  mantraTitleHi?: string;
  /** Label alias for mantraTitle (used in C-05 spec) */
  label?: string;
  /** Scholar's full name */
  panditName?: string;
  /** Scholar's Hindi name with title (e.g., 'आचार्य विद्याधर शास्त्री') */
  panditNameHi?: string;
  /** Total audio duration in seconds (default: 60) */
  durationSeconds?: number;
  /** Container styling overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

const formatSeconds = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

/**
 * ChantingAudioPlayer — Compact Vedic Mantra Chant Proof Player
 *
 * Devotees can hear authentic Vedic pronunciation samples directly from
 * verified Varanasi Shastris. Features 48dp play/pause target, progress track,
 * and pulsating sacred waveform bars.
 */
export const ChantingAudioPlayer: React.FC<ChantingAudioPlayerProps> = ({
  audioUrl,
  sampleUrl,
  mantraTitle,
  mantraTitleHi,
  label,
  panditName,
  panditNameHi,
  durationSeconds = 60,
  style,
  testID = 'chanting-audio-player',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  const activeAudioUrl = audioUrl || sampleUrl;
  const fallbackTitle = isHi ? 'वैदिक मंगलाचरण' : 'Vedic Invocation';
  const activeMantraTitle = mantraTitle || label || fallbackTitle;
  const displayTitle = isHi
    ? mantraTitleHi || activeMantraTitle
    : mantraTitle || label || 'Vedic Invocation';
  const displayPanditName = isHi
    ? panditNameHi || panditName
    : panditName || panditNameHi;

  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Waveform bars animation values
  const barAnims = useRef(
    Array.from({ length: 12 }, () => new Animated.Value(0.3))
  ).current;

  // Audio timer simulation for UI demonstration
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isPlaying) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => {
          if (prev >= durationSeconds) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);

      // Animate waveform bars
      const animations = barAnims.map((anim, index) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 0.3 + ((index % 4) + 1) * 0.18,
              duration: 250 + (index % 5) * 80,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.2 + (index % 3) * 0.1,
              duration: 250 + (index % 5) * 80,
              useNativeDriver: true,
            }),
          ])
        )
      );

      animations.forEach((a) => a.start());

      return () => {
        if (interval) clearInterval(interval);
        barAnims.forEach((anim) => anim.stopAnimation());
      };
    } else {
      barAnims.forEach((anim) =>
        Animated.timing(anim, {
          toValue: 0.3,
          duration: 200,
          useNativeDriver: true,
        }).start()
      );
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, durationSeconds, barAnims]);

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const progressPercent = durationSeconds > 0 ? (elapsedSeconds / durationSeconds) * 100 : 0;

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
        isHi ? `वैदिक मंत्र पाठ, ${displayTitle}` : `Vedic chant, ${displayTitle}`
      }
    >
      {/* Top Header: Mantra and Scholar Credentials */}
      <View style={styles.topRow}>
        <View style={styles.titleContainer}>
          <Text
            style={[
              styles.mantraTitleHi,
              {
                color: colors.textPrimary,
                fontFamily: isHi
                  ? 'NotoSansDevanagari-SemiBold'
                  : typography.titleSmall.fontFamily,
                fontSize: typography.titleSmall.fontSize,
                lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
              },
            ]}
            numberOfLines={1}
          >
            {displayTitle}
          </Text>
        </View>

        {/* Vedic Audio Proof Tag */}
        <View
          style={[
            styles.proofTag,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderAccent,
              borderRadius: radii.full,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xxs,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="record-rec"
            size={12}
            color={isPlaying ? colors.statusAlert : colors.brandPrimary}
            style={{ marginRight: 3 }}
          />
          <Text
            style={[
              styles.proofTagText,
              {
                color: isPlaying ? colors.statusAlert : colors.brandPrimary,
                fontFamily: typography.caption.fontFamily,
                fontSize: typography.caption.fontSize,
                lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
              },
            ]}
          >
            {isPlaying
              ? isHi
                ? 'लाइव वाचन'
                : 'Live recitation'
              : isHi
                ? 'मंत्र प्रमाण'
                : 'Chant proof'}
          </Text>
        </View>
      </View>

      {/* Pandit Credit */}
      {(panditNameHi || panditName) && (
        <View style={[styles.panditRow, { marginVertical: spacing.xs }]}>
          <MaterialCommunityIcons
            name="account-tie-voice"
            size={14}
            color={colors.brandPrimary}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.panditText,
              {
                color: colors.textMuted,
                fontFamily: typography.caption.fontFamily,
                fontSize: typography.caption.fontSize,
                lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
              },
            ]}
            numberOfLines={1}
          >
            {isHi ? `स्वर: ${displayPanditName}` : `Recited by ${displayPanditName}`}
          </Text>
        </View>
      )}

      {/* Waveform Visualization Bars */}
      <View style={[styles.waveformContainer, { marginVertical: spacing.xs }]}>
        {barAnims.map((anim, idx) => (
          <Animated.View
            key={idx}
            style={[
              styles.waveBar,
              {
                backgroundColor: isPlaying ? colors.brandPrimary : colors.borderAccent,
                transform: [{ scaleY: anim }],
              },
            ]}
          />
        ))}
      </View>

      {/* Audio Controls & Progress Row */}
      <View style={styles.controlsRow}>
        {/* Play/Pause Button — 48x48dp Touch Target */}
        <Pressable
          onPress={togglePlay}
          style={({ pressed }) => [
            styles.playButton,
            {
              backgroundColor: colors.brandPrimary,
              borderRadius: radii.full,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={
            isPlaying
              ? isHi ? 'रोकें' : 'Pause'
              : isHi ? 'मंत्र सुनें' : 'Play Mantra'
          }
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={22}
            color={colors.textOnPrimary}
            style={{ marginLeft: isPlaying ? 0 : 2 }}
          />
        </Pressable>

        {/* Progress Track & Elapsed Time */}
        <View style={styles.progressContainer}>
          <View
            style={[
              styles.progressTrack,
              {
                backgroundColor: colors.surfaceBase,
                borderColor: colors.borderDefault,
                borderRadius: radii.full,
              },
            ]}
          >
            <View
              style={[
                styles.progressBar,
                {
                  width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                  backgroundColor: colors.brandPrimary,
                  borderRadius: radii.full,
                },
              ]}
            />
          </View>
          <View style={styles.timeRow}>
            <Text
              style={[
                styles.timeText,
                {
                  color: colors.textMuted,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                  lineHeight: typography.caption.lineHeight,
                },
              ]}
            >
              {formatSeconds(elapsedSeconds)}
            </Text>
            <Text
              style={[
                styles.timeText,
                {
                  color: colors.textMuted,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                  lineHeight: typography.caption.lineHeight,
                },
              ]}
            >
              {formatSeconds(durationSeconds)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export const AudioChantPlayer = ChantingAudioPlayer;

export default ChantingAudioPlayer;

const styles = StyleSheet.create({
  cardContainer: {
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    flex: 1,
    paddingRight: 8,
  },
  mantraTitleHi: {
    fontWeight: '700',
  },
  mantraTitleEn: {
    marginTop: 1,
  },
  proofTag: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  proofTagText: {
    fontWeight: '700',
  },
  panditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  panditText: {
    fontWeight: '500',
    flex: 1,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 28,
    paddingHorizontal: 8,
  },
  waveBar: {
    width: 3.5,
    height: 24,
    borderRadius: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  playButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    flex: 1,
    marginLeft: 12,
  },
  progressTrack: {
    height: 6,
    width: '100%',
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeText: {
    fontWeight: '500',
  },
});

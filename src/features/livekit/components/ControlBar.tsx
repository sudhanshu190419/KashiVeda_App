/**
 * ControlBar
 *
 * Media controls for Kashi Veda Live Puja Sanctum sessions.
 *
 * Provides:
 * - Toggle microphone (mute / unmute)
 * - Toggle camera (on / off)
 * - Switch camera (front / back)
 * - Leave session
 *
 * @module features/livekit/components/ControlBar
 */

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../shared/theme/index.ts';
import { useLanguage } from '../../../shared/i18n/index.ts';

interface ControlBarProps {
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
  isFrontCamera?: boolean;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
  onSwitchCamera?: () => void;
  onLeave: () => void;
  disabled?: boolean;
}

export default function ControlBar({
  isCameraEnabled,
  isMicrophoneEnabled,
  isFrontCamera = true,
  onToggleCamera,
  onToggleMicrophone,
  onSwitchCamera,
  onLeave,
  disabled = false,
}: ControlBarProps): React.JSX.Element {
  const { colors, radii, spacing } = useTheme();
  const { pick } = useLanguage();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceCard,
          borderTopColor: colors.borderDefault,
          borderRadius: radii.md,
          borderColor: colors.borderDefault,
        },
      ]}
    >
      <View style={styles.controlsRow}>
        {/* Microphone Toggle */}
        <TouchableOpacity
          style={[
            styles.button,
            {
              backgroundColor: isMicrophoneEnabled ? colors.surfaceSubtle : colors.errorBg,
              borderColor: isMicrophoneEnabled ? colors.borderAccent : colors.statusAlert,
              borderRadius: radii.sm,
            },
          ]}
          onPress={onToggleMicrophone}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isMicrophoneEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          <Text style={styles.buttonIcon}>
            {isMicrophoneEnabled ? '🎤' : '🔇'}
          </Text>
          <Text
            style={[
              styles.buttonLabel,
              { color: isMicrophoneEnabled ? colors.brandPrimary : colors.statusAlert },
            ]}
          >
            {isMicrophoneEnabled ? pick('म्यूट', 'Mute') : pick('अनम्यूट', 'Unmute')}
          </Text>
        </TouchableOpacity>

        {/* Camera Toggle */}
        <TouchableOpacity
          style={[
            styles.button,
            {
              backgroundColor: isCameraEnabled ? colors.surfaceSubtle : colors.errorBg,
              borderColor: isCameraEnabled ? colors.borderAccent : colors.statusAlert,
              borderRadius: radii.sm,
            },
          ]}
          onPress={onToggleCamera}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isCameraEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          <Text style={styles.buttonIcon}>
            {isCameraEnabled ? '📹' : '🚫'}
          </Text>
          <Text
            style={[
              styles.buttonLabel,
              { color: isCameraEnabled ? colors.brandPrimary : colors.statusAlert },
            ]}
          >
            {isCameraEnabled ? pick('कैमरा बंद', 'Stop Cam') : pick('कैमरा चालू', 'Start Cam')}
          </Text>
        </TouchableOpacity>

        {/* Switch Camera (Flip) */}
        {onSwitchCamera && (
          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderAccent,
                borderRadius: radii.sm,
              },
            ]}
            onPress={onSwitchCamera}
            disabled={disabled || !isCameraEnabled}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Switch Camera"
          >
            <Text style={styles.buttonIcon}>🔄</Text>
            <Text style={[styles.buttonLabel, { color: colors.brandPrimary }]}>
              {isFrontCamera ? pick('सामने', 'Front') : pick('पीछे', 'Back')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Leave Room Action (48dp height minimum touch target) */}
      <TouchableOpacity
        style={[
          styles.leaveButton,
          {
            backgroundColor: colors.statusAlert,
            borderRadius: radii.md,
          },
        ]}
        onPress={onLeave}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Leave Live Sanctum"
      >
        <Text style={styles.leaveIcon}>🚪</Text>
        <Text style={[styles.leaveLabel, { color: colors.surfaceCard }]}>
          Leave Live Sanctum
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 8,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    minHeight: 48,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  buttonIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  buttonLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 2,
  },
  leaveIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  leaveLabel: {
    fontWeight: '700',
    fontSize: 13,
  },
});

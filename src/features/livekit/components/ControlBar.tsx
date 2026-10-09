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
import { colors, radius, spacing } from '../../../shared/theme/index.ts';

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
  return (
    <View style={styles.container}>
      <View style={styles.controlsRow}>
        {/* Microphone Toggle */}
        <TouchableOpacity
          style={[
            styles.button,
            !isMicrophoneEnabled ? styles.buttonAlert : styles.buttonNormal,
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
              { color: isMicrophoneEnabled ? colors.textPrimary : colors.error },
            ]}
          >
            {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
          </Text>
        </TouchableOpacity>

        {/* Camera Toggle */}
        <TouchableOpacity
          style={[
            styles.button,
            !isCameraEnabled ? styles.buttonAlert : styles.buttonNormal,
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
              { color: isCameraEnabled ? colors.textPrimary : colors.error },
            ]}
          >
            {isCameraEnabled ? 'Stop Cam' : 'Start Cam'}
          </Text>
        </TouchableOpacity>

        {/* Switch Camera (Flip) */}
        {onSwitchCamera && (
          <TouchableOpacity
            style={[styles.button, styles.buttonNormal]}
            onPress={onSwitchCamera}
            disabled={disabled || !isCameraEnabled}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Switch Camera"
          >
            <Text style={styles.buttonIcon}>🔄</Text>
            <Text style={[styles.buttonLabel, { color: colors.textPrimary }]}>
              {isFrontCamera ? 'Front' : 'Back'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Leave Room Action */}
      <TouchableOpacity
        style={styles.leaveButton}
        onPress={onLeave}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Leave Live Sanctum"
      >
        <Text style={styles.leaveIcon}>🚪</Text>
        <Text style={styles.leaveLabel}>Leave Live Sanctum</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    minWidth: 70,
  },
  buttonNormal: {
    backgroundColor: '#F3F4F6',
  },
  buttonAlert: {
    backgroundColor: '#FEE2E2',
  },
  buttonIcon: {
    fontSize: 22,
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
    gap: spacing.xs,
    backgroundColor: '#EF4444',
    borderRadius: radius.sm,
    paddingVertical: spacing.xs + 2,
    marginTop: 2,
  },
  leaveIcon: {
    fontSize: 16,
  },
  leaveLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});

// src/features/booking/screens/CustomerLiveSessionScreen.tsx
import React, { useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { Header, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import {
  useLiveKit,
  useMediaPermissions,
  LiveKitVideoView,
  ControlBar,
} from "../../livekit/index.ts";

type CustomerLiveSessionRouteProp = RouteProp<
  {
    params: {
      bookingId: string;
      roomName: string;
      token: string;
      serverUrl: string;
      pujaName: string;
      panditName: string;
    };
  },
  "params"
>;

export const CustomerLiveSessionScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<CustomerLiveSessionRouteProp>();

  const {
    roomName = "Live Sanctum Room",
    token = "",
    serverUrl = "",
    pujaName = "Sacred Vedic Ritual",
    panditName = "Officiating Priest",
  } = route.params || {};

  const {
    roomState,
    room,
    isFrontCamera,
    connect,
    disconnect,
    toggleCamera,
    toggleMicrophone,
    switchCamera,
  } = useLiveKit();

  const { permissions, requestPermissions } = useMediaPermissions();
  const connectionAttemptedRef = useRef(false);

  const handleLeaveRoom = useCallback(() => {
    disconnect();
    navigation.goBack();
  }, [disconnect, navigation]);

  // Connect on mount once permissions are granted
  useEffect(() => {
    if (connectionAttemptedRef.current) return;
    if (!serverUrl || !token) {
      Alert.alert(
        "Invalid Session",
        "Live session credentials were not provided. Please return to booking details.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
      return;
    }

    connectionAttemptedRef.current = true;

    async function initSession() {
      try {
        const perms = await requestPermissions();
        if (!perms.camera && !perms.microphone) {
          // Attempt connection in viewer mode if permissions denied
          await connect(serverUrl, token, { autoPublish: false });
        } else {
          await connect(serverUrl, token, { autoPublish: true });
        }
      } catch (err: any) {
        console.error("[CustomerLiveSession] Join failed:", err);
      }
    }

    initSession();

    return () => {
      disconnect();
    };
  }, [serverUrl, token, requestPermissions, connect, disconnect, navigation]);

  const remoteParticipants = roomState.participants.filter((p) => !p.isLocal);
  const localParticipant = roomState.participants.find((p) => p.isLocal);
  const primaryRemote = remoteParticipants[0];

  const isConnecting = roomState.connectionState === "connecting";
  const isReconnecting = roomState.connectionState === "reconnecting";
  const isConnected = roomState.connectionState === "connected";
  const isError = roomState.connectionState === "error" || (roomState.error !== null && !isConnected);

  return (
    <ScreenContainer padded style={styles.container}>
      <Header
        title="Live Video Sanctum"
        subtitle={pujaName}
        onBack={handleLeaveRoom}
      />

      {/* Main Viewport Container */}
      <View style={styles.videoViewport}>
        {/* Reconnecting banner indicator */}
        {isReconnecting && (
          <View style={styles.reconnectingBanner}>
            <ActivityIndicator size="small" color="#F59E0B" />
            <Text variant="captionMedium" color="#F59E0B">
              Reconnecting to Live Sanctum...
            </Text>
          </View>
        )}

        {/* Loading / Connecting View */}
        {isConnecting && (
          <View style={styles.centerOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text variant="body" color={colors.surface} style={styles.loadingText}>
              Entering Live Sanctum...
            </Text>
            <Text variant="caption" color={colors.surfaceSubtle}>
              Connecting to {roomName}
            </Text>
          </View>
        )}

        {/* Error View */}
        {isError && (
          <View style={styles.centerOverlay}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text variant="h3" color={colors.surface} style={styles.errorTitle}>
              Connection Interrupted
            </Text>
            <Text variant="caption" color={colors.surfaceSubtle} style={styles.errorText}>
              {roomState.error || "Unable to maintain connection with Live Sanctum."}
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => connect(serverUrl, token, { autoPublish: true })}
            >
              <Text variant="captionMedium" color="#FFFFFF">
                Retry Connection
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Connected Primary View */}
        {isConnected && (
          <>
            {primaryRemote && room ? (
              <LiveKitVideoView
                key={primaryRemote.sid}
                room={room}
                participantIdentity={primaryRemote.identity}
                displayName={panditName}
                isLocal={false}
                style={styles.fullVideo}
              />
            ) : (
              <View style={styles.waitingContainer}>
                <Text style={styles.omWatermark}>🕉️</Text>
                <Text variant="h3" color={colors.surface} style={styles.waitingTitle}>
                  Waiting for Acharya to join
                </Text>
                <Text variant="caption" color={colors.surfaceSubtle} style={styles.waitingSub}>
                  {panditName} will appear here as soon as they enter the Sanctum.
                </Text>
                <View style={styles.liveIndicator}>
                  <Text style={styles.liveDot}>🟢</Text>
                  <Text variant="captionMedium" color={colors.surface}>
                    ROOM ACTIVE • {roomName}
                  </Text>
                </View>
              </View>
            )}

            {/* Self-view mini PiP */}
            {localParticipant && room && (
              <View style={styles.selfPipContainer}>
                <LiveKitVideoView
                  key={localParticipant.sid}
                  room={room}
                  participantIdentity={localParticipant.identity}
                  displayName="You (Devotee)"
                  isLocal={true}
                  style={styles.selfPipVideo}
                />
              </View>
            )}
          </>
        )}
      </View>

      {/* Permission warning banner if permissions denied */}
      {(!permissions.camera || !permissions.microphone) && isConnected && (
        <TouchableOpacity
          style={styles.permissionWarning}
          onPress={requestPermissions}
          activeOpacity={0.8}
        >
          <Text style={styles.permIcon}>⚠️</Text>
          <Text variant="caption" color="#FDE047" style={styles.permText}>
            Camera/Mic permissions missing. Tap here to enable two-way audio & video.
          </Text>
        </TouchableOpacity>
      )}

      {/* LiveKit Media Control Bar */}
      <ControlBar
        isCameraEnabled={roomState.isCameraEnabled}
        isMicrophoneEnabled={roomState.isMicrophoneEnabled}
        isFrontCamera={isFrontCamera}
        onToggleCamera={toggleCamera}
        onToggleMicrophone={toggleMicrophone}
        onSwitchCamera={switchCamera}
        onLeave={handleLeaveRoom}
        disabled={isConnecting}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#111827",
  },
  videoViewport: {
    flex: 1,
    minHeight: 360,
    backgroundColor: "#1F2937",
    borderRadius: radius.md,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    marginBottom: spacing.sm,
  },
  fullVideo: {
    width: "100%",
    height: "100%",
  },
  centerOverlay: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    marginBottom: 4,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: spacing.xs,
  },
  errorTitle: {
    marginBottom: 4,
  },
  errorText: {
    textAlign: "center",
    marginBottom: spacing.md,
  },
  retryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  reconnectingBanner: {
    position: "absolute",
    top: 10,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  waitingContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  omWatermark: {
    fontSize: 54,
    marginBottom: spacing.xs,
  },
  waitingTitle: {
    marginBottom: 4,
    textAlign: "center",
  },
  waitingSub: {
    textAlign: "center",
    marginBottom: spacing.md,
    maxWidth: 280,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#15803D",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xs,
    gap: spacing.xs,
  },
  liveDot: {
    fontSize: 10,
  },
  selfPipContainer: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.sm,
    width: 110,
    height: 145,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    backgroundColor: "#374151",
  },
  selfPipVideo: {
    width: "100%",
    height: "100%",
  },
  permissionWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#422006",
    borderColor: "#CA8A04",
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  permIcon: {
    fontSize: 16,
  },
  permText: {
    flex: 1,
  },
});

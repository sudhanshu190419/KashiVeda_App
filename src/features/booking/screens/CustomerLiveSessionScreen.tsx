// src/features/booking/screens/CustomerLiveSessionScreen.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Pressable,
  StatusBar,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import {
  useLiveKit,
  useMediaPermissions,
  LiveKitVideoView,
  ControlBar,
} from "../../livekit/index.ts";
import { LiveStatusPill } from "../../../shared/components/spiritual/LiveStatusPill.tsx";
import { SolarBrandGlyph } from "../../../shared/components/foundations/SolarBrandGlyph.tsx";
import { ActionDialog } from "../../../shared/components/feedback/ActionDialog.tsx";
import { Ionicons, MaterialCommunityIcons } from "../../../shared/components/icons/index.ts";
import { Text } from "../../../shared/components/ui/index.ts";

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
  const insets = useSafeAreaInsets();
  const { colors, radii, spacing, typography } = useTheme();
  const { language, pick } = useLanguage();
  const isHi = language === "hi";

  const {
    roomName = "Live Sanctum Room",
    token = "",
    serverUrl = "",
    pujaName = "Maha Rudrabhishek Puja",
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

  // Screen UI state
  const [isMantraExpanded, setIsMantraExpanded] = useState(false);
  const [pipCornerIndex, setPipCornerIndex] = useState(0); // 0: bottom-right, 1: bottom-left, 2: top-left, 3: top-right
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showPurnahutiConfirm, setShowPurnahutiConfirm] = useState(false);
  const [isPurnahutiReached, setIsPurnahutiReached] = useState(false);
  const [isPurnahutiConfirming, setIsPurnahutiConfirming] = useState(false);

  const handleLeaveRoom = useCallback(() => {
    disconnect();
    navigation.goBack();
  }, [disconnect, navigation]);

  const handleConfirmLeave = useCallback(() => {
    setShowLeaveDialog(false);
    handleLeaveRoom();
  }, [handleLeaveRoom]);

  const handleConfirmPurnahuti = useCallback(() => {
    if (isPurnahutiConfirming) return;
    setIsPurnahutiConfirming(true);
    setShowPurnahutiConfirm(false);
    setIsPurnahutiReached(true);
    setTimeout(() => {
      setIsPurnahutiConfirming(false);
    }, 600);
  }, [isPurnahutiConfirming]);

  const cyclePipCorner = useCallback(() => {
    setPipCornerIndex((prev) => (prev + 1) % 4);
  }, []);

  // PiP Corner Position Style
  const getPipPositionStyle = () => {
    switch (pipCornerIndex) {
      case 1:
        return { bottom: 180, left: 16 };
      case 2:
        return { top: 96, left: 16 };
      case 3:
        return { top: 96, right: 16 };
      case 0:
      default:
        return { bottom: 180, right: 16 };
    }
  };

  // Connect on mount once credentials are provided
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
  const isError =
    roomState.connectionState === "error" ||
    (roomState.error !== null && !isConnected);

  return (
    <View style={[styles.container, { backgroundColor: colors.obsidianVoid }]}>
      <StatusBar barStyle="light-content" />

      {/* Main Viewport Container */}
      <View
        style={[
          styles.videoViewport,
          {
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
          },
        ]}
      >
        {/* Reconnecting banner indicator */}
        {isReconnecting && (
          <View
            style={[
              styles.reconnectingBanner,
              {
                backgroundColor: colors.overlayScrim,
                borderColor: colors.warningFg,
                borderRadius: radii.sm,
              },
            ]}
          >
            <ActivityIndicator size="small" color={colors.warningFg} />
            <Text variant="captionMedium" color={colors.warningFg}>
              {pick("लाइव गर्भगृह से पुनः जुड़ रहे हैं...", "Reconnecting to Live Sanctum...")}
            </Text>
          </View>
        )}

        {/* Loading / Connecting View */}
        {isConnecting && (
          <View style={styles.centerOverlay}>
            <SolarBrandGlyph size={72} showOm={true} tint={colors.brandPrimary} />
            <ActivityIndicator
              size="large"
              color={colors.brandPrimary}
              style={{ marginTop: spacing.md }}
            />
            <Text
              variant="body"
              color={colors.textPrimary}
              style={styles.loadingText}
            >
              {pick("पवित्र गर्भगृह में प्रवेश कर रहे हैं...", "Entering Live Sanctum...")}
            </Text>
            <Text variant="caption" color={colors.textMuted}>
              {pick(`कक्ष से जुड़ रहे हैं: ${roomName}`, `Connecting to ${roomName}`)}
            </Text>
          </View>
        )}

        {/* Error View */}
        {isError && (
          <View style={styles.centerOverlay}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text
              variant="h3"
              color={colors.textPrimary}
              style={styles.errorTitle}
            >
              {pick("संपर्क बाधित हुआ", "Connection Interrupted")}
            </Text>
            <Text
              variant="caption"
              color={colors.textMuted}
              style={styles.errorText}
            >
              {roomState.error ||
                pick(
                  "लाइव गर्भगृह से संपर्क बनाए रखने में असमर्थ।",
                  "Unable to maintain connection with Live Sanctum."
                )}
            </Text>
            <TouchableOpacity
              style={[
                styles.retryBtn,
                {
                  backgroundColor: colors.brandPrimary,
                  borderRadius: radii.sm,
                },
              ]}
              onPress={() => connect(serverUrl, token, { autoPublish: true })}
            >
              <Text variant="captionMedium" color={colors.surfaceCard}>
                {pick("पुनः प्रयास करें", "Retry Connection")}
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
                <SolarBrandGlyph size={96} showOm={true} tint={colors.brandPrimary} />
                <Text
                  variant="h3"
                  color={colors.textPrimary}
                  style={styles.waitingTitle}
                >
                  {pick("आचार्य जी के जुड़ने की प्रतीक्षा", "Waiting for Acharya to join")}
                </Text>
                <Text
                  variant="caption"
                  color={colors.textMuted}
                  style={styles.waitingSub}
                >
                  {pick(
                    `${panditName} गर्भगृह में प्रवेश करते ही यहाँ दिखाई देंगे।`,
                    `${panditName} will appear here as soon as they enter the Sanctum.`
                  )}
                </Text>
                <View
                  style={[
                    styles.liveIndicator,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.statusActive,
                      borderRadius: radii.sm,
                    },
                  ]}
                >
                  <Text style={styles.liveDot}>🟢</Text>
                  <Text variant="captionMedium" color={colors.statusActive}>
                    ROOM ACTIVE • {roomName}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      {/* Top Sacred Controls Overlay Bar */}
      <View
        style={[
          styles.topControlsBar,
          {
            paddingTop: insets.top > 0 ? insets.top : spacing.sm,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        {/* Back / Exit Button (48dp touch target) */}
        <TouchableOpacity
          style={[
            styles.topIconButton,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderDefault,
              borderRadius: radii.full,
            },
          ]}
          onPress={() => setShowLeaveDialog(true)}
          accessibilityRole="button"
          accessibilityLabel={isHi ? "कक्ष से बाहर जाएं" : "Leave room"}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* Center Channel Info & Status Pill */}
        <View style={styles.centerChannelInfo}>
          <LiveStatusPill
            status="live"
            showRadarPulse={true}
            customLabel="LIVE RITUAL"
            customLabelHi="लाइव अनुष्ठान"
          />
          <Text
            variant="captionMedium"
            color={colors.textPrimary}
            style={styles.sanctumTitleText}
          >
            Live Video Sanctum
          </Text>
          <Text
            variant="caption"
            color={colors.brandPrimary}
            numberOfLines={1}
            style={styles.pujaNameSub}
          >
            {pujaName}
          </Text>
        </View>

        {/* Flip Camera Button (48dp touch target) */}
        <TouchableOpacity
          style={[
            styles.topIconButton,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderDefault,
              borderRadius: radii.full,
            },
          ]}
          onPress={switchCamera}
          accessibilityRole="button"
          accessibilityLabel="Switch Camera"
        >
          <Ionicons name="camera-reverse-outline" size={22} color={colors.brandPrimary} />
        </TouchableOpacity>
      </View>

      {/* Movable Picture-in-Picture Devotee Feed (Tap to cycle corner) */}
      {isConnected && (
        <Pressable
          onPress={cyclePipCorner}
          style={[
            styles.selfPipContainer,
            getPipPositionStyle(),
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderAccent,
              borderRadius: radii.md,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={pick(
            "यजमान कैमरा दृश्य (स्थान बदलने हेतु टैप करें)",
            "Devotee camera preview (tap to change position)"
          )}
        >
          {roomState.isCameraEnabled && localParticipant && room ? (
            <LiveKitVideoView
              key={localParticipant.sid}
              room={room}
              participantIdentity={localParticipant.identity}
              displayName="You (Devotee)"
              isLocal={true}
              style={styles.selfPipVideo}
            />
          ) : (
            <View style={styles.pipCameraOffView}>
              <Ionicons name="videocam-off" size={24} color={colors.textMuted} />
              <Text variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>
                {pick("कैमरा बंद", "Camera off")}
              </Text>
            </View>
          )}

          {/* Devotee Badge on PiP */}
          <View
            style={[
              styles.pipBadgeRow,
              {
                backgroundColor: colors.overlayScrim,
                borderRadius: radii.sm,
              },
            ]}
          >
            <Text variant="caption" color={colors.textPrimary} style={{ fontSize: 10 }}>
              {pick("यजमान", "Devotee")}
            </Text>
            {!roomState.isMicrophoneEnabled && (
              <Ionicons
                name="mic-off"
                size={11}
                color={colors.statusAlert}
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
        </Pressable>
      )}

      {/* Sanskrit Sankalp Recitation Overlay Card & Purnahuti Trigger */}
      <View style={[styles.mantraOverlayWrapper, { paddingHorizontal: spacing.md }]}>
        <Pressable
          onPress={() => setIsMantraExpanded((prev) => !prev)}
          style={[
            styles.mantraCard,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderAccent,
              borderRadius: radii.md,
              padding: spacing.sm,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isHi ? "संकल्प मंत्र विस्तार" : "Expand sankalp mantra"}
        >
          <View style={styles.mantraHeaderRow}>
            <MaterialCommunityIcons name="om" size={20} color={colors.brandPrimary} />
            <Text
              variant="captionMedium"
              color={colors.brandPrimary}
              style={{ marginLeft: spacing.xs, flex: 1, fontWeight: "700" }}
            >
              {isHi ? "रुद्राभिषेक संकल्प मंत्रोच्चार" : "Sacred Sankalp Recitation"}
            </Text>
            <Ionicons
              name={isMantraExpanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.brandPrimary}
            />
          </View>

          <Text
            variant="caption"
            color={colors.textPrimary}
            style={{
              marginTop: spacing.xs,
              fontStyle: "italic",
              lineHeight: 18,
            }}
          >
            {isMantraExpanded
              ? pick(
                  "ॐ विष्णुर्विष्णुर्विष्णुः श्रीमद्भगवतो महापुरुषस्य विष्णोराज्ञया प्रवर्तमानस्य अद्य श्रीब्रह्मणो द्वितीयपरार्धे श्रीश्वेतवाराहकल्पे वैवस्वतमन्वन्तरे अष्टाविंशतितमे युगे कलियुगे कलिप्रथमचरणे जम्बूद्वीपे भारतवर्षे आर्यावर्तैकदेशे श्रीकाशीक्षेत्रे... मम आत्मनः श्रुतिस्मृतिपुराणोक्त फलप्राप्त्यर्थं श्रीपरमेश्वरप्रीत्यर्थं सर्वकामसिद्ध्यर्थं श्रीरुद्राभिषेक पूजनं अहं करिष्ये।",
                  "Om Vishnur Vishnur Vishnuh Shrimad Bhagavato Mahapurushasya Vishnor-ajnaya pravartamanasya adya Shri Brahmano dvitiya-parardhe Shri Shveta-varaha-kalpe Vaivasvata-manvantare ashtavimshatitame yuge kaliyuge kali-prathama-charane Jambu-dvipe Bharata-varshe Aryavartaika-deshe Shri Kashi-kshetre... mama atmanah shruti-smriti-puranokta phala-praptyartham Shri Parameshvara-prityartham sarva-kama-siddhyartham Shri Rudrabhisheka pujanam aham karishye."
                )
              : pick(
                  "ॐ विष्णुर्विष्णुर्विष्णुः श्रीमद्भगवतो महापुरुषस्य विष्णोराज्ञया प्रवर्तमानस्य... मम आत्मनः श्रुतिस्मृतिपुराणोक्त फलप्राप्त्यर्थं श्रीपरमेश्वरप्रीत्यर्थं...",
                  "Om Vishnur Vishnur Vishnuh Shrimad Bhagavato Mahapurushasya Vishnor-ajnaya pravartamanasya... mama atmanah shruti-smriti-puranokta phala-praptyartham Shri Parameshvara-prityartham..."
                )}
          </Text>

          <Text variant="caption" color={colors.textMuted} style={{ marginTop: 2, fontSize: 11 }}>
            {pick(
              "(भावार्थ: समस्त पापों के क्षय एवं मनोकामना सिद्धि हेतु भगवान शिव का पावन अभिषेक)",
              "(Meaning: Sacred abhisheka of Lord Shiva for dissolution of sins and fulfilment of wishes)"
            )}
          </Text>
        </Pressable>

        {/* Purnahuti Marker Trigger Button (48dp height minimum) */}
        <TouchableOpacity
          onPress={() => setShowPurnahutiConfirm(true)}
          style={[
            styles.purnahutiMarkerButton,
            {
              backgroundColor: isPurnahutiReached ? colors.statusActive : colors.surfaceSubtle,
              borderColor: colors.brandPrimary,
              borderRadius: radii.md,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={pick(
            "पूर्णाहुति संपन्न करें (50% एस्क्रो विमुक्ति)",
            "Mark purnahuti complete (50% escrow release)"
          )}
        >
          <MaterialCommunityIcons
            name={isPurnahutiReached ? "fire" : "fire-alert"}
            size={22}
            color={isPurnahutiReached ? colors.surfaceCard : colors.brandPrimary}
          />
          <Text
            variant="captionMedium"
            color={isPurnahutiReached ? colors.surfaceCard : colors.brandPrimary}
            style={{ marginLeft: spacing.xs, flex: 1, fontWeight: "700" }}
          >
            {isPurnahutiReached
              ? isHi
                ? "पूर्णाहुति संपन्न — 50% एस्क्रो विमुक्त"
                : "Purnahuti complete — 50% escrow released"
              : isHi
              ? "पूर्णाहुति संपन्न करें (50% एस्क्रो विमुक्ति)"
              : "Mark purnahuti complete (50% escrow release)"}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={isPurnahutiReached ? colors.surfaceCard : colors.brandPrimary}
          />
        </TouchableOpacity>
      </View>

      {/* Permission warning banner if permissions denied */}
      {(!permissions.camera || !permissions.microphone) && isConnected && (
        <TouchableOpacity
          style={[
            styles.permissionWarning,
            {
              backgroundColor: colors.warningBg,
              borderColor: colors.warningFg,
              borderRadius: radii.sm,
            },
          ]}
          onPress={requestPermissions}
          activeOpacity={0.8}
        >
          <Text style={styles.permIcon}>⚠️</Text>
          <Text variant="caption" color={colors.warningFg} style={styles.permText}>
            {pick(
              "कैमरा/माइक अनुमति गायब है। दोतरफा ऑडियो और वीडियो चालू करने हेतु यहाँ टैप करें।",
              "Camera/Mic permissions missing. Tap here to enable two-way audio & video."
            )}
          </Text>
        </TouchableOpacity>
      )}

      {/* LiveKit Media Control Dock (48dp Touch Targets Floor) */}
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

      {/* Leave Room Confirmation ActionDialog */}
      <ActionDialog
        visible={showLeaveDialog}
        title={isHi ? "पवित्र अनुष्ठान से प्रस्थान?" : "Leave the sacred ritual?"}
        titleHi={isHi ? "अनुष्ठान कक्ष से बाहर जाएं?" : undefined}
        description={
          isHi
            ? "क्या आप वास्तव में लाइव संकल्प अनुष्ठान कक्ष से बाहर जाना चाहते हैं? आप बुकिंग विवरण से पुनः जुड़ सकते हैं।"
            : "Do you really want to leave the live sankalp ritual room? You can rejoin from the booking details."
        }
        primaryLabel={isHi ? "हाँ, बाहर जाएं" : "Yes, leave"}
        primaryVariant="destructive"
        onPrimaryPress={handleConfirmLeave}
        secondaryLabel={isHi ? "कक्ष में रहें" : "Stay in the room"}
        onSecondaryPress={() => setShowLeaveDialog(false)}
        onClose={() => setShowLeaveDialog(false)}
      />

      {/* Purnahuti 50% Escrow Release Confirmation ActionDialog */}
      <ActionDialog
        visible={showPurnahutiConfirm}
        title={
          isHi
            ? "पूर्णाहुति सत्यापन एवं एस्क्रो विमुक्ति"
            : "Purnahuti Verification & Escrow Release"
        }
        titleHi="पूर्णाहुति सत्यापन एवं 50% एस्क्रो विमुक्ति"
        description={
          isHi
            ? "पवित्र अनुष्ठान की पूर्णाहुति (अंतिम आहुति) संपन्न होने के बाद, बैंक एस्क्रो में सुरक्षित शेष 50% दक्षिणा पंडित जी के खाते में हस्तांतरित कर दी जाएगी।"
            : "Once the final purnahuti offering is complete, the remaining 50% dakshina held in bank escrow is released to the priest's account."
        }
        primaryLabel={isHi ? "हाँ, पुष्टि करें" : "Confirm Purnahuti"}
        primaryLoading={isPurnahutiConfirming}
        onPrimaryPress={handleConfirmPurnahuti}
        secondaryLabel={isHi ? "रद्द करें" : "Cancel"}
        onSecondaryPress={() => setShowPurnahutiConfirm(false)}
        onClose={() => setShowPurnahutiConfirm(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  videoViewport: {
    flex: 1,
    minHeight: 360,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    borderWidth: 1,
  },
  fullVideo: {
    width: "100%",
    height: "100%",
  },
  centerOverlay: {
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  loadingText: {
    marginTop: 12,
    marginBottom: 4,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  errorTitle: {
    marginBottom: 4,
  },
  errorText: {
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  reconnectingBanner: {
    position: "absolute",
    top: 70,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
  },
  waitingContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  waitingTitle: {
    marginTop: 12,
    marginBottom: 4,
    textAlign: "center",
  },
  waitingSub: {
    textAlign: "center",
    marginBottom: 16,
    maxWidth: 280,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    gap: 6,
  },
  liveDot: {
    fontSize: 10,
  },
  topControlsBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topIconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  centerChannelInfo: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 8,
  },
  sanctumTitleText: {
    marginTop: 2,
    fontWeight: "700",
  },
  pujaNameSub: {
    fontSize: 11,
    marginTop: 1,
  },
  selfPipContainer: {
    position: "absolute",
    width: 110,
    height: 145,
    borderWidth: 1.5,
    overflow: "hidden",
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    zIndex: 25,
  },
  selfPipVideo: {
    width: "100%",
    height: "100%",
  },
  pipCameraOffView: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pipBadgeRow: {
    position: "absolute",
    bottom: 4,
    left: 4,
    right: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  mantraOverlayWrapper: {
    position: "absolute",
    bottom: 125,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  mantraCard: {
    borderWidth: 1,
  },
  mantraHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  purnahutiMarkerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  permissionWarning: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 6,
    gap: 8,
  },
  permIcon: {
    fontSize: 16,
  },
  permText: {
    flex: 1,
  },
});

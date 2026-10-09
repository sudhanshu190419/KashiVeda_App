/**
 * useLiveKit
 *
 * Core hook for managing a LiveKit room connection in Kashi Veda.
 *
 * Responsibilities:
 * - Creates and manages a `Room` instance from `livekit-client`
 * - Connects to LiveKit Cloud / self-hosted server using the authoritative session token
 * - Configures VoIP audio routing via @livekit/react-native AudioSession and InCallManager
 * - Tracks local and remote participant state & track publications
 * - Manages camera, microphone, and camera-switch toggles
 * - Handles auto-reconnect and safe disconnect cleanup without race conditions
 *
 * @module features/livekit/hooks/useLiveKit
 */

import '../polyfills.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  type RoomConnectOptions,
  type RemoteParticipant,
  type Participant,
  Track,
  type TrackPublication,
  type LocalVideoTrack,
  ConnectionState as LKConnectionState,
} from 'livekit-client';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import InCallManager from 'react-native-incall-manager';
import type {
  LiveKitRoomState,
  ConnectionState,
  ParticipantInfo,
} from '../types/index.ts';

const CONNECTION_TIMEOUT_MS = 30_000;

function toParticipantInfo(
  participant: Participant,
  isLocal: boolean,
): ParticipantInfo {
  const cameraPublication: TrackPublication | undefined =
    participant.getTrackPublication(Track.Source.Camera);
  const micPublication: TrackPublication | undefined =
    participant.getTrackPublication(Track.Source.Microphone);
  const screenSharePublication: TrackPublication | undefined =
    participant.getTrackPublication(Track.Source.ScreenShare);

  const isCameraEnabled = cameraPublication?.isEnabled ?? false;
  const isScreenShareEnabled = screenSharePublication?.track !== undefined;

  return {
    sid: participant.sid,
    identity: participant.identity,
    isLocal,
    isSpeaking: participant.isSpeaking,
    isCameraEnabled,
    isMicrophoneEnabled: micPublication?.isEnabled ?? false,
    isScreenShareEnabled,
  };
}

function mapConnectionState(state: LKConnectionState): ConnectionState {
  switch (state) {
    case LKConnectionState.Connecting:
      return 'connecting';
    case LKConnectionState.Connected:
      return 'connected';
    case LKConnectionState.Reconnecting:
      return 'reconnecting';
    case LKConnectionState.Disconnected:
      return 'disconnected';
    default:
      return 'disconnected';
  }
}

const INITIAL_STATE: LiveKitRoomState = {
  connectionState: 'disconnected',
  participants: [],
  isCameraEnabled: false,
  isMicrophoneEnabled: false,
  error: null,
};

export function useLiveKit() {
  const [roomState, setRoomState] = useState<LiveKitRoomState>(INITIAL_STATE);
  const [isFrontCamera, setIsFrontCamera] = useState<boolean>(true);

  const roomRef = useRef<Room | null>(null);
  const isMountedRef = useRef(true);
  const disconnectRequestedRef = useRef(false);

  // Participant & Room Event Handlers
  const handleParticipantConnected = useCallback(
    (participant: RemoteParticipant) => {
      if (!isMountedRef.current) return;
      setRoomState((prev) => ({
        ...prev,
        participants: [
          ...prev.participants.filter((p) => p.sid !== participant.sid),
          toParticipantInfo(participant, false),
        ],
      }));
    },
    [],
  );

  const handleParticipantDisconnected = useCallback(
    (participant: RemoteParticipant) => {
      if (!isMountedRef.current) return;
      setRoomState((prev) => ({
        ...prev,
        participants: prev.participants.filter(
          (p) => p.sid !== participant.sid,
        ),
      }));
    },
    [],
  );

  const handleConnectionStateChanged = useCallback(
    (state: LKConnectionState) => {
      if (!isMountedRef.current) return;
      const mapped = mapConnectionState(state);
      setRoomState((prev) => ({ ...prev, connectionState: mapped }));

      if (state === LKConnectionState.Disconnected) {
        setRoomState((prev) => ({
          ...INITIAL_STATE,
          participants: prev.participants.filter((p) => p.isLocal),
        }));
      }
    },
    [],
  );

  const handleTrackSubscribed = useCallback(
    (
      _track: Track,
      _publication: TrackPublication,
      participant: Participant,
    ) => {
      if (!isMountedRef.current) return;
      setRoomState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.sid === participant.sid
            ? toParticipantInfo(participant, participant.isLocal)
            : p,
        ),
      }));
    },
    [],
  );

  const handleTrackUnsubscribed = useCallback(
    (
      _track: Track,
      _publication: TrackPublication,
      participant: Participant,
    ) => {
      if (!isMountedRef.current) return;
      setRoomState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.sid === participant.sid
            ? toParticipantInfo(participant, participant.isLocal)
            : p,
        ),
      }));
    },
    [],
  );

  const handleTrackMutedOrUnmuted = useCallback(
    (publication: TrackPublication, participant: Participant) => {
      if (!isMountedRef.current) return;
      if (publication.source !== Track.Source.Camera && publication.source !== Track.Source.Microphone) {
        return;
      }
      setRoomState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.sid === participant.sid
            ? toParticipantInfo(participant, participant.isLocal)
            : p,
        ),
      }));
    },
    [],
  );

  const handleActiveSpeakersChanged = useCallback(
    (speakers: Participant[]) => {
      if (!isMountedRef.current) return;
      const speakerSids = new Set(speakers.map((s) => s.sid));
      setRoomState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) => ({
          ...p,
          isSpeaking: speakerSids.has(p.sid),
        })),
      }));
    },
    [],
  );

  const handleParticipantAttributesChanged = useCallback(
    (
      _changedAttributes: Record<string, string>,
      participant: Participant,
    ) => {
      if (!isMountedRef.current) return;
      setRoomState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.sid === participant.sid
            ? toParticipantInfo(participant, participant.isLocal)
            : p,
        ),
      }));
    },
    [],
  );

  // Initialize Room instance
  useEffect(() => {
    isMountedRef.current = true;
    disconnectRequestedRef.current = false;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.TrackMuted, handleTrackMutedOrUnmuted);
    room.on(RoomEvent.TrackUnmuted, handleTrackMutedOrUnmuted);
    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
    room.on(RoomEvent.ParticipantAttributesChanged, handleParticipantAttributesChanged);

    roomRef.current = room;

    return () => {
      isMountedRef.current = false;
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.off(RoomEvent.TrackMuted, handleTrackMutedOrUnmuted);
      room.off(RoomEvent.TrackUnmuted, handleTrackMutedOrUnmuted);
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
      room.off(RoomEvent.ParticipantAttributesChanged, handleParticipantAttributesChanged);

      try {
        InCallManager.stop();
      } catch {
        // quiet catch
      }

      if (
        !disconnectRequestedRef.current &&
        room.state !== LKConnectionState.Disconnected
      ) {
        try {
          room.disconnect();
        } catch (discErr) {
          console.warn('[LiveKit] Error disconnecting on unmount:', discErr);
        }
      }
      roomRef.current = null;
    };
  }, [
    handleParticipantConnected,
    handleParticipantDisconnected,
    handleConnectionStateChanged,
    handleTrackSubscribed,
    handleTrackUnsubscribed,
    handleTrackMutedOrUnmuted,
    handleActiveSpeakersChanged,
    handleParticipantAttributesChanged,
  ]);

  /**
   * Connect to the LiveKit room.
   */
  const connect = useCallback(
    async (
      url: string,
      token: string,
      options?: { autoPublish?: boolean; diagnosticRequestId?: string },
    ): Promise<void> => {
      const room = roomRef.current;
      if (!room) {
        throw new Error('LiveKit room not initialized.');
      }

      if (room.state === LKConnectionState.Connected) {
        return;
      }

      let serverHost = 'unknown';
      let serverScheme = 'unknown';
      try {
        const parsed = new URL(url);
        serverHost = parsed.host;
        serverScheme = parsed.protocol.replace(':', '');
      } catch {
        const match = url.match(/^(wss?|https?):\/\/([^/:]+(?::\d+)?)/i);
        if (match) {
          serverScheme = match[1];
          serverHost = match[2];
        }
      }

      const diagnosticRequestId = options?.diagnosticRequestId ?? 'unspecified';

      console.info('[LiveKit Client Diagnostic] Connection attempt initiated', {
        serverHost,
        serverScheme,
        hasToken: Boolean(token),
        tokenLength: token ? token.length : 0,
        diagnosticRequestId,
        autoPublish: options?.autoPublish !== false,
      });

      setRoomState((prev) => ({
        ...prev,
        connectionState: 'connecting',
        error: null,
      }));

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Connection timed out after 30 seconds.')),
          CONNECTION_TIMEOUT_MS,
        ),
      );

      let connectionStage:
        | 'audio_session_configuration'
        | 'websocket_signal_handshake'
        | 'media_publishing' = 'audio_session_configuration';

      try {
        // Configure native audio session for VoIP quality communication
        await AudioSession.configureAudio({
          android: {
            preferredOutputList: [
              'speaker',
              'bluetooth',
              'headset',
              'earpiece',
            ],
            audioTypeOptions: AndroidAudioTypePresets.communication,
          },
        });

        await AudioSession.startAudioSession();

        try {
          InCallManager.start({ media: 'video' });
          InCallManager.setForceSpeakerphoneOn(true);
          InCallManager.setKeepScreenOn(true);
        } catch (audioErr) {
          console.warn('[LiveKit] InCallManager setup warning:', audioErr);
        }

        const connectOptions: RoomConnectOptions = {
          autoSubscribe: true,
        };

        // Transition to websocket signal handshake stage
        connectionStage = 'websocket_signal_handshake';

        // Race connection against timeout
        await Promise.race([
          room.connect(url, token, connectOptions),
          timeoutPromise,
        ]);

        // Transition to media publishing stage
        connectionStage = 'media_publishing';

        const autoPublish = options?.autoPublish !== false;

        if (autoPublish) {
          await room.localParticipant.enableCameraAndMicrophone();

          const localInfo = toParticipantInfo(
            room.localParticipant as Participant,
            true,
          );

          setRoomState({
            connectionState: 'connected',
            participants: [localInfo],
            isCameraEnabled: true,
            isMicrophoneEnabled: true,
            error: null,
          });
        } else {
          const localInfo = toParticipantInfo(
            room.localParticipant as Participant,
            true,
          );

          setRoomState({
            connectionState: 'connected',
            participants: [localInfo],
            isCameraEnabled: false,
            isMicrophoneEnabled: false,
            error: null,
          });
        }

        // Add any existing remote participants
        const remoteParticipants: ParticipantInfo[] = [];
        room.remoteParticipants.forEach(
          (participant: RemoteParticipant) => {
            remoteParticipants.push(
              toParticipantInfo(participant as Participant, false),
            );
          },
        );

        if (remoteParticipants.length > 0) {
          setRoomState((prev) => ({
            ...prev,
            participants: [...prev.participants, ...remoteParticipants],
          }));
        }

        console.info('[LiveKit Client Diagnostic] Room connected successfully', {
          serverHost,
          serverScheme,
          diagnosticRequestId,
          roomName: room.name,
          participantSid: room.localParticipant?.sid,
          participantIdentity: room.localParticipant?.identity,
          connectionState: 'connected',
        });
      } catch (error) {
        const errorName = error instanceof Error ? error.name : 'UnknownError';
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to connect to Live Sanctum room.';

        console.error('[LiveKit Client Diagnostic] Connection failed', {
          serverHost,
          serverScheme,
          diagnosticRequestId,
          failureStage: connectionStage,
          errorName,
          errorMessage,
          roomState: room.state,
        });

        try {
          if (room.state !== LKConnectionState.Disconnected) {
            room.disconnect();
          }
        } catch {
          // quiet catch
        }
        try {
          InCallManager.stop();
        } catch {
          // quiet catch
        }
        setRoomState({
          ...INITIAL_STATE,
          error: errorMessage,
        });
        throw error;
      }
    },
    [],
  );

  /**
   * Disconnect from the room.
   */
  const disconnect = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;

    disconnectRequestedRef.current = true;

    try {
      InCallManager.stop();
    } catch {
      // quiet catch
    }

    try {
      room.disconnect();
    } catch (err) {
      console.warn('[LiveKit] Disconnect error:', err);
    }

    setRoomState(INITIAL_STATE);
  }, []);

  /**
   * Toggle camera enable/disable.
   */
  const toggleCamera = useCallback(async (): Promise<boolean> => {
    const room = roomRef.current;
    if (!room || room.state !== LKConnectionState.Connected) {
      return false;
    }

    try {
      const targetState = !roomState.isCameraEnabled;
      await room.localParticipant.setCameraEnabled(targetState);

      setRoomState((prev) => ({
        ...prev,
        isCameraEnabled: targetState,
        participants: prev.participants.map((p) =>
          p.isLocal ? { ...p, isCameraEnabled: targetState } : p,
        ),
      }));

      return targetState;
    } catch (error) {
      console.error('[LiveKit] Camera toggle failed:', error);
      return roomState.isCameraEnabled;
    }
  }, [roomState.isCameraEnabled]);

  /**
   * Toggle microphone enable/disable (mute/unmute).
   */
  const toggleMicrophone = useCallback(async (): Promise<boolean> => {
    const room = roomRef.current;
    if (!room || room.state !== LKConnectionState.Connected) {
      return false;
    }

    try {
      const targetState = !roomState.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(targetState);

      setRoomState((prev) => ({
        ...prev,
        isMicrophoneEnabled: targetState,
        participants: prev.participants.map((p) =>
          p.isLocal ? { ...p, isMicrophoneEnabled: targetState } : p,
        ),
      }));

      return targetState;
    } catch (error) {
      console.error('[LiveKit] Microphone toggle failed:', error);
      return roomState.isMicrophoneEnabled;
    }
  }, [roomState.isMicrophoneEnabled]);

  /**
   * Switch between front and back cameras.
   */
  const switchCamera = useCallback(async (): Promise<boolean> => {
    const room = roomRef.current;
    if (!room || room.state !== LKConnectionState.Connected) {
      return isFrontCamera;
    }

    try {
      const cameraPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      const videoTrack = cameraPub?.videoTrack as LocalVideoTrack | undefined;

      if (videoTrack && typeof (videoTrack as any).switchCamera === 'function') {
        await (videoTrack as any).switchCamera();
        const nextFront = !isFrontCamera;
        setIsFrontCamera(nextFront);
        return nextFront;
      }
      return isFrontCamera;
    } catch (error) {
      console.error('[LiveKit] Switch camera failed:', error);
      return isFrontCamera;
    }
  }, [isFrontCamera]);

  return {
    roomState,
    room: roomRef.current,
    isFrontCamera,
    connect,
    disconnect,
    toggleCamera,
    toggleMicrophone,
    switchCamera,
  } as const;
}

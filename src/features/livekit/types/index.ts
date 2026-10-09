/**
 * LiveKit Types for Kashi Veda Remote Puja & Live Sanctum.
 *
 * @module features/livekit/types
 */

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface ParticipantInfo {
  sid: string;
  identity: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
  isScreenShareEnabled: boolean;
}

export interface LiveKitRoomState {
  connectionState: ConnectionState;
  participants: ParticipantInfo[];
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
  error: string | null;
}

export interface MediaPermissionResult {
  camera: boolean;
  microphone: boolean;
  error: string | null;
}

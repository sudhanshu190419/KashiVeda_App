/**
 * LiveKitVideoView
 *
 * Renders a participant's video stream, or a Vedic fallback avatar when video is off.
 *
 * Direct low-level LiveKit rendering without requiring Context providers.
 *
 * @module features/livekit/components/LiveKitVideoView
 */

import '../polyfills.ts';
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { VideoTrack } from '@livekit/react-native';
import {
  Track,
  ParticipantEvent,
  type Room,
  type Participant,
  type TrackPublication,
} from 'livekit-client';

interface LiveKitVideoViewProps {
  /** The livekit-client Room instance. */
  room: Room;
  /** The participant's identity string. */
  participantIdentity: string;
  /** Whether this is the local participant. */
  isLocal: boolean;
  /** Which track source to render (defaults to Camera). */
  source?: Track.Source;
  /** Video scaling mode: 'cover' | 'contain'. */
  objectFit?: 'cover' | 'contain';
  /** Whether to hide the participant name overlay. */
  hideOverlay?: boolean;
  /** Display label override (e.g. Pandit name or Devotee name). */
  displayName?: string;
  /** Custom container style. */
  style?: StyleProp<ViewStyle>;
}

export default function LiveKitVideoView({
  room,
  participantIdentity,
  isLocal,
  source = Track.Source.Camera,
  objectFit = 'cover',
  hideOverlay = false,
  displayName,
  style,
}: LiveKitVideoViewProps): React.JSX.Element {
  // Resolve participant from the Room
  const participant = useMemo<Participant | undefined>(() => {
    if (isLocal) {
      return room.localParticipant;
    }
    // Try by identity, then by SID
    const byIdentity = room.remoteParticipants.get(participantIdentity);
    if (byIdentity) return byIdentity;

    for (const [, p] of room.remoteParticipants) {
      if (p.identity === participantIdentity || p.sid === participantIdentity) {
        return p;
      }
    }
    return undefined;
  }, [room, participantIdentity, isLocal]);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [publication, setPublication] = useState<TrackPublication | undefined>(undefined);

  useEffect(() => {
    if (!participant) return;

    const onIsSpeakingChanged = () => {
      setIsSpeaking(participant.isSpeaking);
    };

    const refreshPublication = () => {
      setPublication(participant.getTrackPublication(source));
    };

    participant
      .on(ParticipantEvent.IsSpeakingChanged, onIsSpeakingChanged)
      .on(ParticipantEvent.TrackPublished, refreshPublication)
      .on(ParticipantEvent.TrackUnpublished, refreshPublication)
      .on(ParticipantEvent.TrackSubscribed, refreshPublication)
      .on(ParticipantEvent.TrackUnsubscribed, refreshPublication)
      .on(ParticipantEvent.TrackMuted, refreshPublication)
      .on(ParticipantEvent.TrackUnmuted, refreshPublication);

    setIsSpeaking(participant.isSpeaking);
    refreshPublication();

    return () => {
      participant
        .off(ParticipantEvent.IsSpeakingChanged, onIsSpeakingChanged)
        .off(ParticipantEvent.TrackPublished, refreshPublication)
        .off(ParticipantEvent.TrackUnpublished, refreshPublication)
        .off(ParticipantEvent.TrackSubscribed, refreshPublication)
        .off(ParticipantEvent.TrackUnsubscribed, refreshPublication)
        .off(ParticipantEvent.TrackMuted, refreshPublication)
        .off(ParticipantEvent.TrackUnmuted, refreshPublication);
    };
  }, [participant, source]);

  const hasTrack = publication?.track !== undefined && !publication?.isMuted;

  const trackRef = useMemo(() => {
    if (!participant || !publication || !hasTrack) return undefined;
    return {
      participant,
      publication,
      source,
    };
  }, [participant, publication, hasTrack, source]);

  const shownName = displayName || participantIdentity || (isLocal ? 'You' : 'Participant');

  // Deterministic avatar color based on name
  const avatarColor = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < shownName.length; i++) {
      hash = (hash * 31 + shownName.charCodeAt(i)) % 360;
    }
    const hue = Math.abs(hash);
    return `hsl(${hue}, 60%, 35%)`;
  }, [shownName]);

  return (
    <View style={[styles.container, style]}>
      {trackRef ? (
        <VideoTrack
          trackRef={trackRef}
          style={styles.video}
          objectFit={objectFit}
          mirror={isLocal}
          zOrder={isLocal ? 1 : 0}
        />
      ) : (
        <View style={[styles.fallback, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>
            {shownName.charAt(0).toUpperCase()}
          </Text>
          <Text style={styles.cameraOffText}>Camera Paused</Text>
        </View>
      )}

      {!hideOverlay && (
        <View style={styles.overlay}>
          <View style={styles.nameBadge}>
            <Text style={styles.nameText} numberOfLines={1}>
              {shownName}
              {isLocal ? ' (You)' : ''}
            </Text>
          </View>
          {isSpeaking && <View style={styles.speakingIndicator} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111827',
    position: 'relative',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  fallback: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 44,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cameraOffText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '85%',
  },
  nameText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  speakingIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
  },
});

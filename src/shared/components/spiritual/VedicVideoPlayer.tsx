// src/shared/components/spiritual/VedicVideoPlayer.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "../icons/index.ts";
import { VText } from "../foundations/VText.tsx";
import { useTheme } from "../../theme/index.ts";
import { useLanguage } from "../../i18n/index.ts";

export interface VedicVideoItem {
  id?: string;
  title: string;
  titleHi?: string;
  durationLabel?: string;
  durationSeconds?: number;
  posterUrl?: string;
  videoUrl?: string;
}

export interface VedicVideoPlayerProps {
  videos?: VedicVideoItem[];
  panditName?: string;
  panditNameHi?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const formatSeconds = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

export const VedicVideoPlayer: React.FC<VedicVideoPlayerProps> = ({
  videos,
  panditName,
  panditNameHi,
  style,
  testID = "vedic-video-player",
}) => {
  const { colors, spacing, radii, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const [activeIdx, setActiveIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Strict no-mock-data rule: hide if no videos
  if (!videos || videos.length === 0) {
    return null;
  }

  const activeVideo = videos[activeIdx] || videos[0];
  const maxDuration = activeVideo.durationSeconds || 45;
  const totalDurationLabel = activeVideo.durationLabel || formatSeconds(maxDuration);

  // Playback timer simulation for visual review / player controls
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => {
          if (prev >= maxDuration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, maxDuration]);

  const handleSelectVideo = (idx: number) => {
    setActiveIdx(idx);
    setIsPlaying(false);
    setElapsedSeconds(0);
  };

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const progressPct = maxDuration > 0 ? (elapsedSeconds / maxDuration) * 100 : 0;
  const activeTitle = isHi ? activeVideo.titleHi || activeVideo.title : activeVideo.title;

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
      accessibilityLabel={isHi ? `वैदिक मंत्रोच्चार वीडियो, ${activeTitle}` : `Vedic recitation video, ${activeTitle}`}
    >
      {/* Header Row */}
      <View style={styles.headerRow}>
        <VText
          variant="labelLarge"
          color="textPrimary"
          weight="700"
          style={{ textTransform: "uppercase", letterSpacing: 0.8 }}
        >
          {isHi ? "वैदिक मंत्रोच्चार वीडियो" : "Vedic Recitation Video"}
        </VText>
        <View
          style={[
            styles.activeBadge,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderDefault,
              borderRadius: radii.full,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
            },
          ]}
        >
          <VText variant="caption" color="brandPrimary" weight="600" style={{ fontSize: 10 }}>
            {`${activeTitle} • ${totalDurationLabel}`}
          </VText>
        </View>
      </View>

      {/* Main 16:9 Video Player Container */}
      <View style={[styles.playerContainer, { borderRadius: radii.md, borderColor: colors.borderDefault }]}>
        {activeVideo.posterUrl ? (
          <Image
            source={{ uri: activeVideo.posterUrl }}
            style={styles.posterImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.posterFallback, { backgroundColor: "#1E1B18" }]}>
            <MaterialCommunityIcons name="temple-hindu" size={40} color={colors.brandPrimary} style={{ opacity: 0.4 }} />
          </View>
        )}

        {/* Gradient Scrims */}
        <View style={styles.topScrim} />
        <View style={styles.bottomScrim} />

        {/* Top-Left Pill: Vedic Video Proof */}
        <View style={styles.proofBadge}>
          <Ionicons name="videocam" size={13} color="#FBBF24" style={{ marginRight: 4 }} />
          <VText variant="caption" color="white" weight="700" style={{ fontSize: 10 }}>
            {isHi ? "वैदिक वीडियो प्रमाण" : "Vedic Video Proof"}
          </VText>
        </View>

        {/* Center 48dp Play/Pause Button */}
        <View style={styles.centerButtonWrap}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={togglePlay}
            style={[styles.playButton, { backgroundColor: colors.brandPrimary }]}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? (isHi ? "रोकें" : "Pause") : (isHi ? "चलाएं" : "Play")}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={22}
              color="#FFFFFF"
              style={{ marginLeft: isPlaying ? 0 : 2 }}
            />
          </TouchableOpacity>
        </View>

        {/* Bottom Overlay: Only Clean Recitation Title + Time (Zero Clutter) */}
        <View style={styles.bottomOverlay}>
          <View style={styles.bottomMetaRow}>
            <VText variant="titleSmall" color="white" weight="700" numberOfLines={1} style={{ flex: 1 }}>
              {activeTitle}
            </VText>
            <VText variant="caption" color="white" weight="600" style={{ fontFamily: "monospace", fontSize: 11, marginLeft: 8 }}>
              {`${formatSeconds(elapsedSeconds)} / ${totalDurationLabel}`}
            </VText>
          </View>

          {/* Progress Bar Track */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${progressPct}%`, backgroundColor: colors.brandPrimary }]} />
          </View>
        </View>
      </View>

      {/* Up to 3 Videos Quick Switcher Strip */}
      {videos.length > 1 ? (
        <View style={[styles.switcherContainer, { borderTopColor: colors.borderDefault }]}>
          <VText variant="caption" color="textMuted" weight="600" style={{ textTransform: "uppercase", fontSize: 10, marginBottom: spacing.xs }}>
            {isHi ? "मंत्र पाठ चुनें" : "Select Recitation Sample"}
          </VText>

          <View style={styles.switcherGrid}>
            {videos.slice(0, 3).map((video, idx) => {
              const isSelected = activeIdx === idx;
              const title = isHi ? video.titleHi || video.title : video.title;
              const duration = video.durationLabel || (video.durationSeconds ? formatSeconds(video.durationSeconds) : "");

              return (
                <TouchableOpacity
                  key={video.id || `video-${idx}`}
                  activeOpacity={0.75}
                  onPress={() => handleSelectVideo(idx)}
                  style={[
                    styles.videoChip,
                    {
                      backgroundColor: isSelected ? colors.surfaceSubtle : colors.surfaceCard,
                      borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                      borderWidth: isSelected ? 1.5 : 1,
                      borderRadius: radii.sm,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${idx + 1}. ${title}, ${duration}`}
                >
                  <VText
                    variant="caption"
                    color={isSelected ? "textPrimary" : "textMuted"}
                    weight={isSelected ? "700" : "500"}
                    numberOfLines={1}
                    style={{ fontSize: 11 }}
                  >
                    {`${idx + 1}. ${title}`}
                  </VText>
                  {duration ? (
                    <VText
                      variant="caption"
                      color={isSelected ? "brandPrimary" : "textMuted"}
                      weight="600"
                      style={{ fontSize: 10, marginTop: 2 }}
                    >
                      {duration}
                    </VText>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    width: "100%",
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  activeBadge: {
    borderWidth: 1,
  },
  playerContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#1E1B18",
    borderWidth: 1,
  },
  posterImage: {
    width: "100%",
    height: "100%",
  },
  posterFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  topScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 48,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  bottomScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  proofBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(139, 37, 0, 0.88)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  centerButtonWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.35)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  bottomOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 8,
  },
  bottomMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressTrack: {
    width: "100%",
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 2,
  },
  switcherContainer: {
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 10,
  },
  switcherGrid: {
    flexDirection: "row",
    gap: 6,
  },
  videoChip: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: "center",
  },
});

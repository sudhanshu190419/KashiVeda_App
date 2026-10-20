// src/features/astrology/screens/AstrologyContentDetailScreen.tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  Card,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, spacing, radius } from "../../../shared/theme/index.ts";
import { astrologyService } from "../services/astrologyService.ts";
import { AstrologyContent } from "../types/astrology.types.ts";

export const AstrologyContentDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const contentId = route.params?.contentId;

  const [content, setContent] = useState<AstrologyContent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const activeRequestIdRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  const fetchContent = useCallback(async () => {
    // Prevent duplicate detail requests from rapid repeated Retry taps
    if (inFlightRef.current) {
      return;
    }

    if (!contentId) {
      setError("Content identifier is missing.");
      setLoading(false);
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const data = await astrologyService.getContentById(contentId);
      if (!isMountedRef.current || requestId !== activeRequestIdRef.current) {
        return;
      }

      if (!data) {
        setError("The requested astrology insight was not found.");
        setContent(null);
      } else {
        setContent(data);
        setError(null);
      }
    } catch (err: any) {
      if (!isMountedRef.current || requestId !== activeRequestIdRef.current) {
        return;
      }
      setError(err?.message || "Failed to load insight details.");
      setContent(null);
    } finally {
      if (isMountedRef.current && requestId === activeRequestIdRef.current) {
        setLoading(false);
        inFlightRef.current = false;
      }
    }
  }, [contentId]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchContent();

    return () => {
      isMountedRef.current = false;
      inFlightRef.current = false;
    };
  }, [fetchContent]);

  if (loading) {
    return (
      <ScreenContainer>
        <Header title="Astrology Insight" onBack={() => navigation.goBack()} />
        <LoadingState message="Loading insight..." />
      </ScreenContainer>
    );
  }

  if (error || !content) {
    return (
      <ScreenContainer>
        <Header title="Astrology Insight" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Insight Not Available"
          message={error || "Could not retrieve planetary insight."}
          onRetry={fetchContent}
        />
      </ScreenContainer>
    );
  }

  const publishDate = new Date(content.publish_at).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const isWhatsApp = content.channel === "whatsapp";

  return (
    <ScreenContainer scrollable padded>
      <Header title="Astrology Insight" onBack={() => navigation.goBack()} />

      <Card variant="elevated" style={styles.card}>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.channelBadge,
              {
                backgroundColor: isWhatsApp
                  ? colors.secondaryLight
                  : colors.primaryLight,
              },
            ]}
          >
            <Text
              variant="captionMedium"
              color={isWhatsApp ? colors.secondaryDark : colors.primaryDark}
            >
              {isWhatsApp ? "WhatsApp Broadcast" : "Daily In-App"}
            </Text>
          </View>
          <Text variant="caption" color={colors.textTertiary}>
            {publishDate}
          </Text>
        </View>

        <Text variant="h1" style={styles.title}>
          {content.title || "Daily Planetary Guidance"}
        </Text>

        <View style={styles.divider} />

        <Text variant="body" style={styles.bodyText}>
          {content.body}
        </Text>
      </Card>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.xl,
  },
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  channelBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  title: {
    color: colors.textPrimary,
    lineHeight: 28,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  bodyText: {
    lineHeight: 26,
    color: colors.textPrimary,
  },
});

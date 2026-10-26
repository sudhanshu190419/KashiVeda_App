// src/features/astrology/components/DailyRashiInsightCard.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import {
  VButton,
  VCard,
  VText,
  VBadge,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../../shared/components/index.ts";
import { useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { formatIndianDisplayDate, getIndianCalendarDate } from "../../../shared/utils/date.ts";
import { DailyRashiInsight, RashiDefinition, getRashiById } from "../types/rashi.types.ts";

export function isSubscriptionNotice(error?: string | null): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes("subscription is required") ||
    lower.includes("active vedic astrology subscription")
  );
}

interface DailyRashiInsightCardProps {
  rashi: RashiDefinition;
  insight: DailyRashiInsight | null;
  loading: boolean;
  isEntitled: boolean;
  isUnverifiedOffline?: boolean;
  error?: string | null;
  onSubscribePress?: () => void;
  onRetry?: () => void;
}

export const DailyRashiInsightCard: React.FC<DailyRashiInsightCardProps> = ({
  rashi: propRashi,
  insight,
  loading,
  isEntitled,
  isUnverifiedOffline = false,
  error,
  onSubscribePress,
  onRetry,
}) => {
  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const rashi = propRashi || getRashiById(1);
  const todayFormatted = formatIndianDisplayDate(insight?.insight_date || getIndianCalendarDate());

  // 1. Loading State
  if (loading) {
    return (
      <VCard variant="default" elevation={1} style={[styles.card, { padding: spacing.md, marginVertical: spacing.xs }]}>
        <LoadingState message={`Reading cosmic planetary transits for ${rashi.vedicName}...`} />
      </VCard>
    );
  }

  // 2. Genuine Retrieval Failure (Backend, database, or network error)
  if (error && !isSubscriptionNotice(error) && !isUnverifiedOffline && !insight) {
    return (
      <VCard variant="outlined" elevation={0} style={[styles.card, { padding: spacing.md, marginVertical: spacing.xs }]}>
        <ErrorState
          title={`Unable to Load Daily Guidance for ${rashi.vedicName}`}
          message={error}
          onRetry={onRetry}
        />
      </VCard>
    );
  }

  // 3. Empty Insight Handling
  if (!insight) {
    // If user is unentitled and has no content to show
    if (!isEntitled) {
      if (isUnverifiedOffline) {
        return (
          <VCard
            variant="default"
            elevation={1}
            style={[
              styles.card,
              {
                padding: spacing.md,
                marginVertical: spacing.xs,
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
              },
            ]}
          >
            <View style={[styles.lockedHeader, { marginBottom: spacing.xs }]}>
              <VText style={styles.lockedIcon}>📡</VText>
              <VBadge variant="status" color="muted" label="Offline Mode" />
            </View>

            <VText variant="headlineMedium" weight="600" color="textPrimary" style={styles.lockedTitle}>
              Daily Horoscope for {rashi.fullName}
            </VText>
            <VText
              variant="bodyMedium"
              color="textMuted"
              style={[
                styles.lockedDesc,
                {
                  lineHeight: getDevanagariLineHeight(15),
                  marginVertical: spacing.xs,
                },
              ]}
            >
              Unable to verify subscription status while offline. Please connect to the internet to load today's astrological guidance.
            </VText>

            {onRetry && (
              <VButton
                title="Retry Connection 🔄"
                variant="outline"
                size="md"
                onPress={onRetry}
                style={[styles.subscribeBtn, { marginTop: spacing.sm }]}
              />
            )}
          </VCard>
        );
      }

      return (
        <VCard
          variant="default"
          elevation={1}
          style={[
            styles.card,
            {
              padding: spacing.md,
              marginVertical: spacing.xs,
              backgroundColor: colors.surfaceCard,
              borderColor: colors.borderAccent,
            },
          ]}
        >
          <View style={[styles.lockedHeader, { marginBottom: spacing.xs }]}>
            <VText style={styles.lockedIcon}>🔒</VText>
            <VBadge variant="status" color="brand" label="Paid Vedic Guidance" />
          </View>

          <VText variant="headlineMedium" weight="600" color="textPrimary" style={styles.lockedTitle}>
            Daily Horoscope for {rashi.fullName}
          </VText>
          <VText
            variant="bodyMedium"
            color="textMuted"
            style={[
              styles.lockedDesc,
              {
                lineHeight: getDevanagariLineHeight(15),
                marginVertical: spacing.xs,
              },
            ]}
          >
            Subscribe to Kashi Veda Astrology to unlock personalized daily Jyotish insights,
            career guidance, financial outlook, and auspicious transit timings calculated by certified scholars.
          </VText>

          <View style={[styles.lockedFeatureList, { marginVertical: spacing.sm, gap: spacing.xxs }]}>
            <VText variant="caption" color="textPrimary">
              ✓ Daily 12-Rashi Transit Analysis
            </VText>
            <VText variant="caption" color="textPrimary">
              ✓ Career, Finance, Love & Health Guidance
            </VText>
            <VText variant="caption" color="textPrimary">
              ✓ Daily Auspicious Colors & Lucky Numbers
            </VText>
          </View>

          {onSubscribePress && (
            <VButton
              title="Unlock Daily Astrological Insights ✨"
              variant="primary"
              size="md"
              onPress={onSubscribePress}
              style={[styles.subscribeBtn, { marginTop: spacing.sm }]}
            />
          )}
        </VCard>
      );
    }

    // Entitled user but content not published yet
    return (
      <VCard variant="outlined" elevation={0} style={[styles.card, { padding: spacing.md, marginVertical: spacing.xs }]}>
        <EmptyState
          title={`No Insight for ${rashi.vedicName} Today`}
          description={`Today's astrological guidance for ${rashi.fullName} is currently being prepared by Vedic scholars in Varanasi. Please check back shortly.`}
          actionTitle={onRetry ? (isHi ? "पुनः जांचें" : "Check Again") : undefined}
          onAction={onRetry}
        />
      </VCard>
    );
  }

  // 4. Render Daily Insight (Full entitled content or free preview)
  return (
    <VCard
      variant="default"
      elevation={1}
      style={[
        styles.card,
        {
          padding: spacing.md,
          marginVertical: spacing.xs,
          backgroundColor: colors.surfaceCard,
          borderColor: colors.borderDefault,
        },
      ]}
    >
      {/* Header Banner */}
      <View
        style={[
          styles.insightHeader,
          {
            borderBottomColor: colors.borderDefault,
            paddingBottom: spacing.sm,
            marginBottom: spacing.sm,
          },
        ]}
      >
        <View style={styles.rashiTitleRow}>
          <View
            style={[
              styles.symbolCircle,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                borderRadius: 22,
                marginRight: spacing.sm,
              },
            ]}
          >
            <VText style={styles.symbolText}>{rashi.symbol}</VText>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <VText variant="headlineMedium" weight="700" color="brandPrimary">
                {rashi.vedicName}
              </VText>
              <VText variant="bodyMedium" color="textMuted">
                {" "}({rashi.westernName})
              </VText>
              <VText variant="caption" color="brandPrimary" style={styles.sanskritTag}>
                ॥ {rashi.sanskritName} ॥
              </VText>
            </View>
            <VText variant="caption" color="textMuted">
              {todayFormatted} • {rulerText(rashi)}
            </VText>
          </View>
        </View>
      </View>

      {/* Auspicious Attributes Strip */}
      {(insight.auspicious_color || insight.auspicious_number !== null) && (
        <View
          style={[
            styles.auspiciousStrip,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderDefault,
              borderRadius: radii.md,
              padding: spacing.sm,
              marginBottom: spacing.md,
            },
          ]}
        >
          {insight.auspicious_color ? (
            <View style={styles.attributeItem}>
              <VText variant="caption" color="textMuted" style={{ fontSize: 10 }}>
                Auspicious Color
              </VText>
              <VText variant="caption" weight="600" color="brandPrimary">
                🎨 {insight.auspicious_color}
              </VText>
            </View>
          ) : null}

          {insight.auspicious_number !== null && insight.auspicious_number !== undefined ? (
            <View style={styles.attributeItem}>
              <VText variant="caption" color="textMuted" style={{ fontSize: 10 }}>
                Lucky Number
              </VText>
              <VText variant="caption" weight="600" color="brandPrimary">
                🔢 {insight.auspicious_number}
              </VText>
            </View>
          ) : null}

          <View style={styles.attributeItem}>
            <VText variant="caption" color="textMuted" style={{ fontSize: 10 }}>
              Element
            </VText>
            <VText variant="caption" weight="600" color="textPrimary">
              {elementIcon(rashi.element)} {rashi.element}
            </VText>
          </View>
        </View>
      )}

      {/* Section 1: General Cosmic Outlook */}
      <View style={[styles.sectionContainer, { marginBottom: spacing.md }]}>
        <View style={[styles.sectionHeaderRow, { marginBottom: spacing.xxs }]}>
          <VText style={styles.sectionIcon}>🌟</VText>
          <VText variant="titleMedium" weight="600" color="textPrimary">
            General Cosmic Outlook
          </VText>
        </View>
        <VText
          variant="bodyMedium"
          color="textPrimary"
          style={[styles.sectionBody, { lineHeight: getDevanagariLineHeight(15) }]}
        >
          {insight.general_outlook}
        </VText>
      </View>

      {/* Premium Guidance Sections */}
      {isEntitled && (
        <>
          {insight.career_business ? (
            <View style={[styles.sectionContainer, { marginBottom: spacing.md }]}>
              <View style={[styles.sectionHeaderRow, { marginBottom: spacing.xxs }]}>
                <VText style={styles.sectionIcon}>💼</VText>
                <VText variant="titleMedium" weight="600" color="textPrimary">
                  Career & Profession
                </VText>
              </View>
              <VText
                variant="bodyMedium"
                color="textMuted"
                style={[styles.sectionBody, { lineHeight: getDevanagariLineHeight(15) }]}
              >
                {insight.career_business}
              </VText>
            </View>
          ) : null}

          {insight.finance_wealth ? (
            <View style={[styles.sectionContainer, { marginBottom: spacing.md }]}>
              <View style={[styles.sectionHeaderRow, { marginBottom: spacing.xxs }]}>
                <VText style={styles.sectionIcon}>💰</VText>
                <VText variant="titleMedium" weight="600" color="textPrimary">
                  Wealth & Finance
                </VText>
              </View>
              <VText
                variant="bodyMedium"
                color="textMuted"
                style={[styles.sectionBody, { lineHeight: getDevanagariLineHeight(15) }]}
              >
                {insight.finance_wealth}
              </VText>
            </View>
          ) : null}

          {insight.love_relationships ? (
            <View style={[styles.sectionContainer, { marginBottom: spacing.md }]}>
              <View style={[styles.sectionHeaderRow, { marginBottom: spacing.xxs }]}>
                <VText style={styles.sectionIcon}>❤️</VText>
                <VText variant="titleMedium" weight="600" color="textPrimary">
                  Love & Relationships
                </VText>
              </View>
              <VText
                variant="bodyMedium"
                color="textMuted"
                style={[styles.sectionBody, { lineHeight: getDevanagariLineHeight(15) }]}
              >
                {insight.love_relationships}
              </VText>
            </View>
          ) : null}

          {insight.health_wellbeing ? (
            <View style={[styles.sectionContainer, { marginBottom: spacing.md }]}>
              <View style={[styles.sectionHeaderRow, { marginBottom: spacing.xxs }]}>
                <VText style={styles.sectionIcon}>🌿</VText>
                <VText variant="titleMedium" weight="600" color="textPrimary">
                  Health & Vitality
                </VText>
              </View>
              <VText
                variant="bodyMedium"
                color="textMuted"
                style={[styles.sectionBody, { lineHeight: getDevanagariLineHeight(15) }]}
              >
                {insight.health_wellbeing}
              </VText>
            </View>
          ) : null}
        </>
      )}

      {/* When unentitled */}
      {!isEntitled && (
        isUnverifiedOffline ? (
          <View
            style={[
              styles.lockedOfflineNotice,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderDefault,
                borderRadius: radii.md,
                padding: spacing.sm,
                marginTop: spacing.xs,
              },
            ]}
          >
            <View style={styles.lockedNoticeHeader}>
              <VText style={styles.lockedNoticeIcon}>📡</VText>
              <VText variant="caption" weight="600" color="brandPrimary">
                Offline Mode — Subscription Unverified
              </VText>
            </View>
            <VText variant="caption" color="textMuted" style={{ marginTop: spacing.xxs }}>
              Unable to verify your active subscription while offline. Connect to the internet to unlock personalized career, finance, love, and health guidance.
            </VText>
            {onRetry && (
              <VButton
                title="Retry Connection 🔄"
                variant="outline"
                size="sm"
                onPress={onRetry}
                style={{ marginTop: spacing.xs, minHeight: 48 }}
              />
            )}
          </View>
        ) : (
          <View
            style={[
              styles.lockedInlineContainer,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderDefault,
                borderRadius: radii.md,
                padding: spacing.sm,
                marginTop: spacing.xs,
              },
            ]}
          >
            <View style={styles.lockedNoticeHeader}>
              <VText style={styles.lockedNoticeIcon}>🔒</VText>
              <VText variant="caption" weight="600" color="brandPrimary">
                Detailed Vedic Guidance (Paid)
              </VText>
            </View>
            <VText variant="caption" color="textMuted" style={{ marginTop: spacing.xxs }}>
              Subscribe to Kashi Veda Astrology to unlock personalized career, finance, love, and health transits.
            </VText>
            {onSubscribePress && (
              <VButton
                title="Unlock Full Jyotish Guidance ✨"
                variant="primary"
                size="sm"
                onPress={onSubscribePress}
                style={{ marginTop: spacing.xs, minHeight: 48 }}
              />
            )}
          </View>
        )
      )}
    </VCard>
  );
};

function rulerText(rashi: RashiDefinition): string {
  return `Lord: ${rashi.ruler}`;
}

function elementIcon(element: string): string {
  switch (element) {
    case "Fire":
      return "🔥";
    case "Earth":
      return "⛰️";
    case "Air":
      return "💨";
    case "Water":
      return "🌊";
    default:
      return "✨";
  }
}

const styles = StyleSheet.create({
  card: {},
  insightHeader: {
    borderBottomWidth: 1,
  },
  rashiTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  symbolCircle: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  symbolText: {
    fontSize: 22,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  sanskritTag: {
    marginLeft: 6,
  },
  auspiciousStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
  },
  attributeItem: {
    alignItems: "center",
    flex: 1,
  },
  sectionContainer: {},
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  sectionBody: {},
  lockedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lockedIcon: {
    fontSize: 22,
  },
  lockedTitle: {},
  lockedDesc: {},
  lockedFeatureList: {},
  subscribeBtn: {
    minHeight: 48,
  },
  lockedOfflineNotice: {
    borderWidth: 1,
  },
  lockedInlineContainer: {
    borderWidth: 1,
  },
  lockedNoticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  lockedNoticeIcon: {
    fontSize: 16,
  },
});

// src/features/astrology/components/DailyRashiInsightCard.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
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
  const rashi = propRashi || getRashiById(1);
  const todayFormatted = formatIndianDisplayDate(insight?.insight_date || getIndianCalendarDate());

  // 1. Loading State
  if (loading) {
    return (
      <Card variant="elevated" style={styles.card}>
        <LoadingState message={`Reading cosmic planetary transits for ${rashi.vedicName}...`} />
      </Card>
    );
  }

  // 2. Genuine Retrieval Failure (Backend, database, or unexpected error)
  if (error && !isSubscriptionNotice(error) && !isUnverifiedOffline && !insight) {
    return (
      <Card variant="outlined" style={styles.card}>
        <ErrorState
          title={`Unable to Load Daily Guidance for ${rashi.vedicName}`}
          message={error}
          onRetry={onRetry}
        />
      </Card>
    );
  }

  // 3. Empty Insight Handling
  if (!insight) {
    // If user is unentitled and has no content to show
    if (!isEntitled) {
      if (isUnverifiedOffline) {
        return (
          <Card variant="elevated" style={[styles.card, styles.lockedCard]}>
            <View style={styles.lockedHeader}>
              <Text style={styles.lockedIcon}>📡</Text>
              <View style={[styles.lockedBadge, { backgroundColor: colors.surfaceSubtle }]}>
                <Text variant="overline" color={colors.textSecondary}>
                  Offline Mode
                </Text>
              </View>
            </View>

            <Text variant="h2" style={styles.lockedTitle}>
              Daily Horoscope for {rashi.fullName}
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.lockedDesc}>
              Unable to verify subscription status while offline. Please connect to the internet to load today's astrological guidance.
            </Text>

            {onRetry && (
              <Button
                title="Retry Connection 🔄"
                variant="outline"
                size="md"
                onPress={onRetry}
                style={styles.subscribeBtn}
              />
            )}
          </Card>
        );
      }

      return (
        <Card variant="elevated" style={[styles.card, styles.lockedCard]}>
          <View style={styles.lockedHeader}>
            <Text style={styles.lockedIcon}>🔒</Text>
            <View style={styles.lockedBadge}>
              <Text variant="overline" color={colors.secondaryDark}>
                Paid Vedic Guidance
              </Text>
            </View>
          </View>

          <Text variant="h2" style={styles.lockedTitle}>
            Daily Horoscope for {rashi.fullName}
          </Text>
          <Text variant="body" color={colors.textSecondary} style={styles.lockedDesc}>
            Subscribe to Kashi Veda Astrology to unlock personalized daily Jyotish insights,
            career guidance, financial outlook, and auspicious transit timings calculated by certified scholars.
          </Text>

          <View style={styles.lockedFeatureList}>
            <Text variant="caption" color={colors.textPrimary}>
              ✓ Daily 12-Rashi Transit Analysis
            </Text>
            <Text variant="caption" color={colors.textPrimary}>
              ✓ Career, Finance, Love & Health Guidance
            </Text>
            <Text variant="caption" color={colors.textPrimary}>
              ✓ Daily Auspicious Colors & Lucky Numbers
            </Text>
          </View>

          {onSubscribePress && (
            <Button
              title="Unlock Daily Astrological Insights ✨"
              variant="primary"
              size="md"
              onPress={onSubscribePress}
              style={styles.subscribeBtn}
            />
          )}
        </Card>
      );
    }

    // Entitled user but content not published yet
    return (
      <Card variant="outlined" style={styles.card}>
        <EmptyState
          title={`No Insight for ${rashi.vedicName} Today`}
          description={`Today's astrological guidance for ${rashi.fullName} is currently being prepared by Vedic scholars in Varanasi. Please check back shortly.`}
          actionTitle={onRetry ? "Check Again" : undefined}
          onAction={onRetry}
        />
      </Card>
    );
  }

  // 3. Render Daily Insight (Free preview or full entitled content)
  return (
    <Card variant="elevated" style={styles.card}>
      {/* Header Banner */}
      <View style={styles.insightHeader}>
        <View style={styles.rashiTitleRow}>
          <View style={styles.symbolCircle}>
            <Text style={styles.symbolText}>{rashi.symbol}</Text>
          </View>
          <View>
            <View style={styles.nameRow}>
              <Text variant="h2" color={colors.primaryDark}>
                {rashi.vedicName}
              </Text>
              <Text variant="body" color={colors.textSecondary}>
                {" "}({rashi.westernName})
              </Text>
              <Text variant="captionMedium" color={colors.secondaryDark} style={styles.sanskritTag}>
                ॥ {rashi.sanskritName} ॥
              </Text>
            </View>
            <Text variant="caption" color={colors.textTertiary}>
              {todayFormatted} • {rulerText(rashi)}
            </Text>
          </View>
        </View>
      </View>

      {/* Auspicious Attributes Strip (Free attribute) */}
      {(insight.auspicious_color || insight.auspicious_number) && (
        <View style={styles.auspiciousStrip}>
          {insight.auspicious_color ? (
            <View style={styles.attributeItem}>
              <Text variant="overline" color={colors.textSecondary}>
                Auspicious Color
              </Text>
              <Text variant="captionMedium" color={colors.primaryDark}>
                🎨 {insight.auspicious_color}
              </Text>
            </View>
          ) : null}

          {insight.auspicious_number !== null && insight.auspicious_number !== undefined ? (
            <View style={styles.attributeItem}>
              <Text variant="overline" color={colors.textSecondary}>
                Lucky Number
              </Text>
              <Text variant="captionMedium" color={colors.secondaryDark}>
                🔢 {insight.auspicious_number}
              </Text>
            </View>
          ) : null}

          <View style={styles.attributeItem}>
            <Text variant="overline" color={colors.textSecondary}>
              Element
            </Text>
            <Text variant="captionMedium" color={colors.textPrimary}>
              {elementIcon(rashi.element)} {rashi.element}
            </Text>
          </View>
        </View>
      )}

      {/* Section 1: General Cosmic Outlook (Free Content) */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionIcon}>🌟</Text>
          <Text variant="h3" color={colors.textPrimary}>
            General Cosmic Outlook
          </Text>
        </View>
        <Text variant="body" color={colors.textPrimary} style={styles.sectionBody}>
          {insight.general_outlook}
        </Text>
      </View>

      {/* Entitlement Enforcement: Premium Guidance Sections ONLY rendered if verified entitled */}
      {isEntitled && (
        <>
          {/* Section 2: Career & Business */}
          {insight.career_business ? (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionIcon}>💼</Text>
                <Text variant="h3" color={colors.textPrimary}>
                  Career & Profession
                </Text>
              </View>
              <Text variant="body" color={colors.textSecondary} style={styles.sectionBody}>
                {insight.career_business}
              </Text>
            </View>
          ) : null}

          {/* Section 3: Finance & Wealth */}
          {insight.finance_wealth ? (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionIcon}>💰</Text>
                <Text variant="h3" color={colors.textPrimary}>
                  Wealth & Finance
                </Text>
              </View>
              <Text variant="body" color={colors.textSecondary} style={styles.sectionBody}>
                {insight.finance_wealth}
              </Text>
            </View>
          ) : null}

          {/* Section 4: Love & Relationships */}
          {insight.love_relationships ? (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionIcon}>❤️</Text>
                <Text variant="h3" color={colors.textPrimary}>
                  Love & Relationships
                </Text>
              </View>
              <Text variant="body" color={colors.textSecondary} style={styles.sectionBody}>
                {insight.love_relationships}
              </Text>
            </View>
          ) : null}

          {/* Section 5: Health & Wellbeing */}
          {insight.health_wellbeing ? (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionIcon}>🌿</Text>
                <Text variant="h3" color={colors.textPrimary}>
                  Health & Vitality
                </Text>
              </View>
              <Text variant="body" color={colors.textSecondary} style={styles.sectionBody}>
                {insight.health_wellbeing}
              </Text>
            </View>
          ) : null}
        </>
      )}

      {/* When unentitled: Render locked premium guidance teaser / offline unverified notice */}
      {!isEntitled && (
        isUnverifiedOffline ? (
          <View style={styles.lockedOfflineNotice}>
            <View style={styles.lockedNoticeHeader}>
              <Text style={styles.lockedNoticeIcon}>📡</Text>
              <Text variant="captionMedium" color={colors.secondaryDark}>
                Offline Mode — Subscription Unverified
              </Text>
            </View>
            <Text variant="caption" color={colors.textSecondary}>
              Unable to verify your active subscription while offline. Connect to the internet to unlock personalized career, finance, love, and health guidance.
            </Text>
            {onRetry && (
              <Button
                title="Retry Connection 🔄"
                variant="outline"
                size="sm"
                onPress={onRetry}
                style={{ marginTop: spacing.xs }}
              />
            )}
          </View>
        ) : (
          <View style={styles.lockedInlineContainer}>
            <View style={styles.lockedNoticeHeader}>
              <Text style={styles.lockedNoticeIcon}>🔒</Text>
              <Text variant="captionMedium" color={colors.secondaryDark}>
                Detailed Vedic Guidance (Paid)
              </Text>
            </View>
            <Text variant="caption" color={colors.textSecondary}>
              Subscribe to Kashi Veda Astrology to unlock personalized career, finance, love, and health transits.
            </Text>
            {onSubscribePress && (
              <Button
                title="Unlock Full Jyotish Guidance ✨"
                variant="primary"
                size="sm"
                onPress={onSubscribePress}
                style={{ marginTop: spacing.xs }}
              />
            )}
          </View>
        )
      )}
    </Card>
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
  card: {
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  insightHeader: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  rashiTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  symbolCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
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
    marginLeft: spacing.xs,
  },
  auspiciousStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  attributeItem: {
    alignItems: "center",
    flex: 1,
  },
  sectionContainer: {
    marginBottom: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  sectionIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  sectionBody: {
    lineHeight: 22,
  },
  lockedCard: {
    backgroundColor: colors.surface,
    borderColor: colors.secondaryLight,
    borderWidth: 1,
  },
  lockedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  lockedIcon: {
    fontSize: 24,
  },
  lockedBadge: {
    backgroundColor: colors.secondaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  lockedTitle: {
    marginVertical: spacing.xs,
  },
  lockedDesc: {
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  lockedFeatureList: {
    gap: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  subscribeBtn: {
    marginTop: spacing.xs,
  },
  lockedInlineContainer: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.secondaryLight,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  lockedOfflineNotice: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  lockedNoticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  lockedNoticeIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
});


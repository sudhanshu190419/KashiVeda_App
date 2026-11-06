// src/features/discovery/components/PujaCard.tsx
import React, { useState } from "react";
import { Image, Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { PujaService } from "../types/discovery.ts";
import { MaterialCommunityIcons } from "../../../shared/components/icons/index.ts";

interface PujaCardProps {
  puja: PujaService;
  onPress: () => void;
  onBookPress?: () => void;
  imageUrl?: string;
  testID?: string;
}

const SERIF_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "serif",
});

export const DEFAULT_PUJA_IMAGES: Record<string, string> = {
  rudra: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&h=300&q=80",
  shiva: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&h=300&q=80",
  mahamrityunjaya: "https://images.unsplash.com/photo-1620766182966-c6eb5ed2b788?auto=format&fit=crop&w=600&h=300&q=80",
  havan: "https://images.unsplash.com/photo-1620766182966-c6eb5ed2b788?auto=format&fit=crop&w=600&h=300&q=80",
  ganesh: "https://images.unsplash.com/photo-1567591414240-e2b2600d8328?auto=format&fit=crop&w=600&h=300&q=80",
  lakshmi: "https://images.unsplash.com/photo-1567591414240-e2b2600d8328?auto=format&fit=crop&w=600&h=300&q=80",
  navgraha: "https://images.unsplash.com/photo-1608658826588-e9f85c4bfdbd?auto=format&fit=crop&w=600&h=300&q=80",
  griha: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=600&h=300&q=80",
  vastu: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=600&h=300&q=80",
};

export function resolvePujaImage(puja: PujaService, customImage?: string): string {
  if (customImage) return customImage;
  const nameLower = (puja.name || "").toLowerCase();
  for (const [key, url] of Object.entries(DEFAULT_PUJA_IMAGES)) {
    if (nameLower.includes(key)) {
      return url;
    }
  }
  return DEFAULT_PUJA_IMAGES.rudra;
}

export const PujaCard: React.FC<PujaCardProps> = ({
  puja,
  onPress,
  onBookPress,
  imageUrl,
  testID,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedUrl = resolvePujaImage(puja, imageUrl);
  const isHomeOnly =
    puja.allowed_modes?.length === 1 && puja.allowed_modes[0] === "home";
  const duration = puja.default_duration_minutes || 60;
  const categoryLabel =
    puja.category?.name?.toUpperCase() || "VEDIC PUJA";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.touchable}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`View ${puja.name}`}
    >
      <Card style={styles.card}>
        {/* Top Horizontal Banner Image (Design A) */}
        <View style={styles.bannerContainer}>
          {!imgFailed ? (
            <Image
              source={{ uri: resolvedUrl }}
              style={styles.bannerImage}
              resizeMode="cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <View style={styles.bannerFallback}>
              <MaterialCommunityIcons
                name="temple-hindu"
                size={40}
                color={colors.primary}
                style={{ opacity: 0.4 }}
              />
            </View>
          )}

          {/* Floating Category Badge */}
          <View style={styles.badgeRow}>
            <View style={styles.categoryBadge}>
              <Text variant="overline" color={colors.primary} style={styles.badgeText}>
                {categoryLabel}
              </Text>
            </View>
            {isHomeOnly ? (
              <View style={styles.homeOnlyBadge}>
                <Text variant="overline" color={colors.primary} style={styles.badgeText}>
                  HOME ONLY
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Card Body */}
        <View style={styles.body}>
          <Text
            variant="h3"
            style={[
              styles.title,
              {
                fontFamily: SERIF_FONT,
                fontSize: 18,
                fontWeight: "600",
              },
            ]}
            numberOfLines={1}
          >
            {puja.name}
          </Text>

          {/* Metadata & 48dp Action Row */}
          <View style={styles.footerRow}>
            <View style={styles.metadataWrap}>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={15}
                  color={colors.primary}
                  style={styles.metaIcon}
                />
                <Text variant="caption" color={colors.textSecondary}>
                  {duration} mins
                </Text>
              </View>
              <View style={styles.metaDot} />
              <View style={styles.metaItem}>
                <MaterialCommunityIcons
                  name="account-outline"
                  size={15}
                  color={colors.primary}
                  style={styles.metaIcon}
                />
                <Text variant="caption" color={colors.textSecondary}>
                  1 Pandit
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onBookPress || onPress}
              activeOpacity={0.8}
              style={styles.bookButton}
              accessibilityRole="button"
              accessibilityLabel={`Book ${puja.name}`}
            >
              <Text variant="captionMedium" color="#FFFFFF" style={styles.bookText}>
                Book Puja
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={16}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    minHeight: 48,
    marginBottom: spacing.md,
  },
  card: {
    padding: 0,
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: "#FFFFFF",
  },
  bannerContainer: {
    height: 140,
    width: "100%",
    position: "relative",
    backgroundColor: "#FAF5EF",
    overflow: "hidden",
  },
  bannerImage: {
    width: "100%",
    height: 140,
  },
  bannerFallback: {
    width: "100%",
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAF5EF",
  },
  badgeRow: {
    position: "absolute",
    top: spacing.xs,
    left: spacing.xs,
    flexDirection: "row",
    gap: spacing.xxs,
  },
  categoryBadge: {
    backgroundColor: "#FFFDF9",
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  homeOnlyBadge: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  body: {
    padding: spacing.sm,
  },
  title: {
    fontFamily: SERIF_FONT,
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  metadataWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaIcon: {
    marginRight: 4,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.borderLight,
    marginHorizontal: 6,
  },
  bookButton: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: spacing.sm,
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bookText: {
    fontWeight: "600",
    fontSize: 13,
  },
});

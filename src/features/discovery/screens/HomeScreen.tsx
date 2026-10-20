// src/features/discovery/screens/HomeScreen.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { useAuth } from "../../auth/AuthContext.tsx";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { CategoryCard } from "../components/CategoryCard.tsx";
import { PanditCard } from "../components/PanditCard.tsx";
import { usePujaCategories } from "../hooks/usePujaCategories.ts";
import { usePanditDirectory } from "../hooks/usePanditDirectory.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const { profile } = useAuth();

  const {
    categories,
    loading: catLoading,
    error: catError,
    refresh: refreshCategories,
  } = usePujaCategories();

  const {
    pandits,
    loading: panditLoading,
    error: panditError,
    refresh: refreshPandits,
  } = usePanditDirectory({ limit: 3 });

  const isLoading = catLoading && panditLoading;
  const hasError = catError && panditError;

  if (isLoading && categories.length === 0 && pandits.length === 0) {
    return <LoadingState message="Connecting to the holy city of Kashi..." />;
  }

  if (hasError && categories.length === 0 && pandits.length === 0) {
    return (
      <ErrorState
        title="Unable to load KashiVeda Catalog"
        message={catError || panditError || "Please check your network and try again."}
        onRetry={() => {
          refreshCategories();
          refreshPandits();
        }}
      />
    );
  }

  return (
    <ScreenContainer scrollable padded>
      {/* Header Blessing */}
      <View style={styles.header}>
        <Text variant="captionMedium" color={colors.primary}>
          ॥ श्री काशीविश्वनाथो विजयते ॥
        </Text>
        <Text variant="h1">
          Namaste, {profile?.display_name || "Devotee"}
        </Text>
        <Text variant="body" color={colors.textSecondary}>
          Experience authentic Vedic rituals, verified Pandits, and sacred blessings of Kashi.
        </Text>
      </View>

      {/* Cosmic Insights & Vedic Astrology Entry Point */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => navigation.navigate("Astrology" as any)}
        accessibilityRole="button"
        accessibilityLabel="Cosmic Insights & Vedic Astrology"
        style={styles.cosmicQuickEntryWrapper}
      >
        <Card variant="elevated" style={styles.cosmicQuickCard}>
          <View style={styles.cosmicQuickRow}>
            <View style={styles.cosmicIconCircle}>
              <Text style={styles.cosmicIconText}>🪐</Text>
            </View>
            <View style={styles.cosmicQuickContent}>
              <View style={styles.cosmicBadgeRow}>
                <Text variant="h3" style={styles.cosmicQuickTitle}>
                  Cosmic Insights
                </Text>
                <View style={styles.cosmicTag}>
                  <Text variant="overline" color={colors.primary}>
                    Daily Guidance
                  </Text>
                </View>
              </View>
              <Text variant="caption" color={colors.textSecondary} style={styles.cosmicQuickDesc}>
                Explore daily planetary transits, auspicious timings, and Vedic Jyotish guidance.
              </Text>
            </View>
            <View style={styles.cosmicActionChevron}>
              <Text variant="bodyMedium" color={colors.primary}>
                ›
              </Text>
            </View>
          </View>
        </Card>
      </TouchableOpacity>

      {/* Service Mode Experience Entry Points */}
      <View style={styles.modeSectionHeader}>
        <Text variant="h2" style={styles.modeSectionTitle}>
          How would you like to perform your puja?
        </Text>
        <Text variant="body" color={colors.textSecondary} style={styles.modeSectionSubtitle}>
          Choose the experience that works best for you.
        </Text>
      </View>

      <View style={styles.modeCardsContainer}>
        {/* Card 1: Home Puja */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() =>
            navigation.navigate("PujaList", {
              serviceMode: "home",
              modeTitle: "Home Pujas",
            })
          }
          style={styles.modeCardWrapper}
          accessibilityRole="button"
          accessibilityLabel="Explore Home Pujas"
        >
          <Card variant="elevated" style={[styles.modeCard, styles.homeCard]}>
            <View style={styles.modeCardHeader}>
              <View style={[styles.modeIconCircle, styles.homeIconCircle]}>
                <Text style={styles.modeIconText}>🪔</Text>
              </View>
              <View style={styles.homeBadge}>
                <Text variant="overline" color={colors.primary}>
                  At Residence
                </Text>
              </View>
            </View>
            <Text variant="h3" style={styles.modeCardTitle}>
              Home Puja
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.modeCardDesc}>
              Book a Pandit to perform your puja at home.
            </Text>
            <View style={styles.modeCardActionRow}>
              <Text variant="captionMedium" color={colors.primary} style={styles.modeActionText}>
                Explore Home Pujas ›
              </Text>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Card 2: Online Puja */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() =>
            navigation.navigate("PujaList", {
              serviceMode: "remote",
              modeTitle: "Online Pujas",
            })
          }
          style={styles.modeCardWrapper}
          accessibilityRole="button"
          accessibilityLabel="Explore Online Pujas"
        >
          <Card variant="elevated" style={[styles.modeCard, styles.onlineCard]}>
            <View style={styles.modeCardHeader}>
              <View style={[styles.modeIconCircle, styles.onlineIconCircle]}>
                <Text style={styles.modeIconText}>🌐</Text>
              </View>
              <View style={styles.onlineBadge}>
                <Text variant="overline" color="#0284C7">
                  Live Video
                </Text>
              </View>
            </View>
            <Text variant="h3" style={styles.modeCardTitle}>
              Online Puja
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.modeCardDesc}>
              Connect with a Pandit through a live video session.
            </Text>
            <View style={styles.modeCardActionRow}>
              <Text variant="captionMedium" color={colors.primary} style={styles.modeActionText}>
                Explore Online Pujas ›
              </Text>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Card 3: Temple Puja */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() =>
            navigation.navigate("PujaList", {
              serviceMode: "temple",
              modeTitle: "Temple Pujas",
            })
          }
          style={styles.modeCardWrapper}
          accessibilityRole="button"
          accessibilityLabel="Explore Temple Pujas"
        >
          <Card variant="elevated" style={[styles.modeCard, styles.templeCard]}>
            <View style={styles.modeCardHeader}>
              <View style={[styles.modeIconCircle, styles.templeIconCircle]}>
                <Text style={styles.modeIconText}>🏛️</Text>
              </View>
              <View style={styles.templeBadge}>
                <Text variant="overline" color="#D97706">
                  Temple Sanctum
                </Text>
              </View>
            </View>
            <Text variant="h3" style={styles.modeCardTitle}>
              Temple Puja
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.modeCardDesc}>
              Choose a temple and find Pandits who serve there.
            </Text>
            <View style={styles.modeCardActionRow}>
              <Text variant="captionMedium" color={colors.primary} style={styles.modeActionText}>
                Explore Temple Pujas ›
              </Text>
            </View>
          </Card>
        </TouchableOpacity>
      </View>

      {/* Browse All Pujas Secondary Entry Point */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => navigation.navigate("PujaList")}
        accessibilityRole="button"
        accessibilityLabel="Browse All Pujas"
      >
        <Card variant="outlined" style={styles.browseAllCard}>
          <View style={styles.browseAllRow}>
            <View style={styles.browseAllInfo}>
              <Text variant="h3" style={styles.browseAllTitle}>
                Browse All Pujas
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                Choose your puja first, then decide how you want to perform it.
              </Text>
            </View>
            <View style={styles.browseAllAction}>
              <Text variant="captionMedium" color={colors.primary}>
                View All ›
              </Text>
            </View>
          </View>
        </Card>
      </TouchableOpacity>

      {/* Featured Ritual Offering */}
      <Card variant="elevated" style={styles.bannerCard}>
        <Text variant="overline" color={colors.secondaryDark}>
          Featured Offering
        </Text>
        <Text variant="h2" style={styles.bannerTitle}>
          Kashi Vishwanath Rudrabhishek
        </Text>
        <Text variant="body" color={colors.textSecondary} style={styles.bannerDesc}>
          Sacred Abhishek and Vedic chanting performed in Varanasi with itemized Samagri.
        </Text>
        <Button
          title="Explore Featured Ritual"
          variant="primary"
          size="sm"
          onPress={() => navigation.navigate("PujaList")}
          style={styles.bannerButton}
        />
      </Card>

      {/* Sacred Puja Categories */}
      <View style={styles.sectionHeader}>
        <Text variant="h3">Ritual Categories</Text>
        <TouchableOpacity onPress={() => navigation.navigate("PujaCategoryList")}>
          <Text variant="captionMedium" color={colors.primary}>
            View All ›
          </Text>
        </TouchableOpacity>
      </View>

      {categories.length > 0 ? (
        categories.slice(0, 3).map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            onPress={() =>
              navigation.navigate("PujaList", {
                categoryId: category.id,
                categoryName: category.name,
              })
            }
          />
        ))
      ) : (
        <EmptyState
          title="No Categories Available"
          description="Check back shortly as catalog categories are updated."
          actionTitle="Retry"
          onAction={refreshCategories}
        />
      )}

      {/* Verified Pandits of Kashi */}
      <View style={[styles.sectionHeader, styles.sectionTopMargin]}>
        <Text variant="h3">Verified Vedic Pandits</Text>
        <TouchableOpacity onPress={() => navigation.navigate("PanditDirectory")}>
          <Text variant="captionMedium" color={colors.primary}>
            Find Pandit ›
          </Text>
        </TouchableOpacity>
      </View>

      {pandits.length > 0 ? (
        pandits.slice(0, 2).map((pandit) => (
          <PanditCard
            key={pandit.id}
            pandit={pandit}
            onPress={() =>
              navigation.navigate("PanditDetail", {
                panditId: pandit.id,
                panditName: pandit.display_name,
              })
            }
          />
        ))
      ) : (
        <Card style={styles.emptyPanditCard}>
          <Text variant="body" color={colors.textSecondary} align="center">
            Verified Pandits directory available for all Vedic rituals.
          </Text>
          <Button
            title="Explore Pandits"
            variant="outline"
            size="sm"
            onPress={() => navigation.navigate("PanditDirectory")}
            style={styles.explorePanditsBtn}
          />
        </Card>
      )}

      {/* Sacred Pillars */}
      <View style={[styles.sectionHeader, styles.sectionTopMargin]}>
        <Text variant="h3">Sacred Pillars</Text>
      </View>

      <Card style={styles.pillarCard}>
        <Text variant="h3">🪔 Vedic Ritual Marketplace</Text>
        <Text variant="caption" color={colors.textSecondary}>
          Home Puja, Temple Rituals, and Live Remote Puja with transparent itemized Samagri.
        </Text>
      </Card>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate("Astrology" as any)}
        accessibilityRole="button"
        accessibilityLabel="Vedic Astrology and Insights"
      >
        <Card style={styles.pillarCard}>
          <Text variant="h3">🪐 Vedic Astrology & Insights</Text>
          <Text variant="caption" color={colors.textSecondary}>
            Daily cosmic guidance, planetary transits, and membership plans rooted in Vedic Jyotish.
          </Text>
        </Card>
      </TouchableOpacity>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    marginVertical: spacing.md,
  },
  modeSectionHeader: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  modeSectionTitle: {
    marginBottom: spacing.xxs,
  },
  modeSectionSubtitle: {
    marginBottom: spacing.sm,
  },
  modeCardsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  modeCardWrapper: {
    width: "100%",
  },
  modeCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  homeCard: {
    backgroundColor: "#FFFDF9",
    borderColor: "#FDE68A",
  },
  onlineCard: {
    backgroundColor: "#F0F9FF",
    borderColor: "#BAE6FD",
  },
  templeCard: {
    backgroundColor: "#FEFCE8",
    borderColor: "#FDE047",
  },
  modeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  modeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  homeIconCircle: {
    backgroundColor: colors.primaryLight,
  },
  onlineIconCircle: {
    backgroundColor: "#E0F2FE",
  },
  templeIconCircle: {
    backgroundColor: "#FEF3C7",
  },
  modeIconText: {
    fontSize: 20,
  },
  homeBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  onlineBadge: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  templeBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  modeCardTitle: {
    marginBottom: spacing.xxs,
  },
  modeCardDesc: {
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  modeCardActionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  modeActionText: {
    fontWeight: "700",
  },
  browseAllCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.md,
  },
  browseAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  browseAllInfo: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  browseAllTitle: {
    marginBottom: 2,
  },
  browseAllAction: {
    paddingLeft: spacing.xs,
  },
  bannerCard: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primarySubtle,
    borderWidth: 1,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  bannerTitle: {
    marginVertical: spacing.xs,
  },
  bannerDesc: {
    marginBottom: spacing.md,
  },
  bannerButton: {
    alignSelf: "flex-start",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionTopMargin: {
    marginTop: spacing.lg,
  },
  pillarCard: {
    marginBottom: spacing.md,
  },
  emptyPanditCard: {
    padding: spacing.md,
    alignItems: "center",
  },
  explorePanditsBtn: {
    marginTop: spacing.sm,
  },
  cosmicQuickEntryWrapper: {
    width: "100%",
    marginBottom: spacing.md,
  },
  cosmicQuickCard: {
    backgroundColor: "#FDF8F0",
    borderColor: "#FDE68A",
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  cosmicQuickRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cosmicIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  cosmicIconText: {
    fontSize: 22,
  },
  cosmicQuickContent: {
    flex: 1,
  },
  cosmicBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xxs,
  },
  cosmicQuickTitle: {
    color: colors.textPrimary,
  },
  cosmicTag: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  cosmicQuickDesc: {
    lineHeight: 16,
  },
  cosmicActionChevron: {
    paddingLeft: spacing.xs,
  },
});

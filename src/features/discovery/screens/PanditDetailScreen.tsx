// src/features/discovery/screens/PanditDetailScreen.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Button,
  Card,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { ReviewCard } from "../components/ReviewCard.tsx";
import { usePanditDetail } from "../hooks/usePanditDetail.ts";

type PanditDetailRouteProp = RouteProp<CustomerStackParamList, "PanditDetail">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const PanditDetailScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<PanditDetailRouteProp>();
  const { panditId, panditName } = route.params;

  const { pandit, offerings, reviews, loading, error, refresh } = usePanditDetail(panditId);

  if (loading) {
    return (
      <ScreenContainer padded>
        <Header title={panditName || "Acharya Profile"} onBack={() => navigation.goBack()} />
        <LoadingState message="Loading Acharya profile..." />
      </ScreenContainer>
    );
  }

  if (error || !pandit) {
    return (
      <ScreenContainer padded>
        <Header title={panditName || "Acharya Profile"} onBack={() => navigation.goBack()} />
        <ErrorState
          title="Pandit Not Found"
          message={error || "Could not find profile information for this priest."}
          onRetry={refresh}
        />
      </ScreenContainer>
    );
  }

  const ratingText = pandit.rating_avg
    ? `★ ${Number(pandit.rating_avg).toFixed(1)} (${pandit.rating_count || 0} reviews)`
    : "★ New Acharya (No reviews yet)";

  return (
    <ScreenContainer scrollable padded>
      <Header
        title={pandit.display_name || "Vedic Acharya"}
        subtitle="Verified Priest of Kashi"
        onBack={() => navigation.goBack()}
      />

      {/* Main Profile Card */}
      <Card variant="elevated" style={styles.profileCard}>
        <View style={styles.topRow}>
          <View style={styles.avatar}>
            <Text variant="display" color={colors.primary}>
              🕉️
            </Text>
          </View>
          <View style={styles.profileHeader}>
            <Text variant="h2">{pandit.display_name || "Vedic Acharya"}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.verifiedBadge}>
                <Text variant="overline" color={colors.success}>
                  ✓ Verified Acharya
                </Text>
              </View>
              <View style={styles.statusBadge}>
                <Text variant="overline" color={colors.primary}>
                  ● {pandit.public_status || "available"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text variant="caption" color={colors.textSecondary}>
              Experience
            </Text>
            <Text variant="bodyMedium">
              {pandit.years_experience != null ? `${pandit.years_experience} Years` : "Vedic Lineage"}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text variant="caption" color={colors.textSecondary}>
              Rating
            </Text>
            <Text variant="bodyMedium" color={colors.secondary}>
              {ratingText}
            </Text>
          </View>
        </View>

        {pandit.bio ? (
          <Text variant="body" color={colors.textSecondary} style={styles.bio}>
            {pandit.bio}
          </Text>
        ) : null}

        {pandit.languages && pandit.languages.length > 0 ? (
          <View style={styles.languagesBox}>
            <Text variant="captionMedium" color={colors.textSecondary}>
              Languages: {pandit.languages.join(", ")}
            </Text>
          </View>
        ) : null}
      </Card>

      {/* Ritual Offerings & Dakshina */}
      <View style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          Ritual Services & Dakshina
        </Text>
        {offerings.length > 0 ? (
          offerings.map((offering) => (
            <TouchableOpacity
              key={offering.id}
              activeOpacity={0.7}
              onPress={() =>
                navigation.navigate("BookingWizard", {
                  pujaId: offering.puja_service_id,
                  pujaName: offering.puja_service?.name,
                  panditId: pandit.id,
                })
              }
            >
              <Card style={styles.offeringCard}>
                <View style={styles.offeringRow}>
                  <View style={styles.offeringInfo}>
                    <Text variant="h3">{offering.puja_service?.name || "Sacred Ritual"}</Text>
                    {offering.duration_minutes || offering.puja_service?.default_duration_minutes ? (
                      <Text variant="caption" color={colors.textSecondary}>
                        ⏱ {offering.duration_minutes || offering.puja_service?.default_duration_minutes} mins
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.offeringPrice}>
                    {offering.home_price != null && (
                      <Text variant="caption" color={colors.textSecondary}>
                        🪔 Home: <Text variant="captionMedium" color={colors.primary}>{formatCurrency(offering.home_price)}</Text>
                      </Text>
                    )}
                    {offering.temple_price != null && (
                      <Text variant="caption" color={colors.textSecondary}>
                        🏛️ Temple: <Text variant="captionMedium" color={colors.primary}>{formatCurrency(offering.temple_price)}</Text>
                      </Text>
                    )}
                    {offering.remote_price != null && (
                      <Text variant="caption" color={colors.textSecondary}>
                        🌐 Remote: <Text variant="captionMedium" color={colors.primary}>{formatCurrency(offering.remote_price)}</Text>
                      </Text>
                    )}
                    {!offering.home_price && !offering.temple_price && !offering.remote_price && (
                      <Text variant="bodyMedium" color={colors.primary}>
                        {formatCurrency(offering.price)}
                      </Text>
                    )}
                    <Text variant="caption" color={colors.primary} style={styles.bookText}>
                      Book &gt;
                    </Text>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <Text variant="body" color={colors.textSecondary} align="center">
              Standard Vedic Dakshina applies according to ceremony scale.
            </Text>
          </Card>
        )}
      </View>

      {/* Handwritten Kundli Service */}
      {pandit.kundli_enabled && pandit.kundli_price != null ? (
        <View style={styles.section}>
          <Text variant="h3" style={styles.sectionTitle}>
            Handwritten Kundli Service
          </Text>
          <Card style={styles.offeringCard}>
            <View style={styles.offeringRow}>
              <View style={styles.offeringInfo}>
                <Text variant="h3">📜 Handwritten Vedic Kundli</Text>
                <Text variant="caption" color={colors.textSecondary}>
                  Personalized birth chart analysis with remedies
                </Text>
              </View>
              <View style={styles.offeringPrice}>
                <Text variant="bodyMedium" color={colors.primary}>
                  {formatCurrency(pandit.kundli_price)}
                </Text>
              </View>
            </View>
          </Card>
        </View>
      ) : null}

      {/* Devotee Reviews */}
      <View style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          Devotee Reviews ({reviews.length})
        </Text>
        {reviews.length > 0 ? (
          reviews.map((rev) => <ReviewCard key={rev.id} review={rev} />)
        ) : (
          <Card style={styles.emptyCard}>
            <Text variant="body" color={colors.textSecondary} align="center">
              No written reviews yet. Devotee reviews will appear after completed rituals.
            </Text>
          </Card>
        )}
      </View>

      {/* Booking Action */}
      <View style={styles.actionContainer}>
        <Button
          title={offerings.length > 0 ? "Schedule Ritual with Acharya" : "Browse Rituals"}
          variant="primary"
          size="lg"
          onPress={() => {
            if (offerings.length > 0) {
              navigation.navigate("BookingWizard", {
                pujaId: offerings[0].puja_service_id,
                pujaName: offerings[0].puja_service?.name,
                panditId: pandit.id,
              });
            } else {
              navigation.navigate("PujaList");
            }
          }}
        />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  profileCard: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  profileHeader: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  verifiedBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  statusBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  statsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: spacing.sm,
    marginVertical: spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.borderLight,
  },
  bio: {
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  languagesBox: {
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  offeringCard: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  offeringRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  offeringInfo: {
    flex: 1,
  },
  offeringPrice: {
    alignItems: "flex-end",
  },
  emptyCard: {
    padding: spacing.md,
  },
  actionContainer: {
    marginVertical: spacing.xl,
  },
  bookText: {
    marginTop: 2,
  },
});

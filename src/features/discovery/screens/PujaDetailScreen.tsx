// src/features/discovery/screens/PujaDetailScreen.tsx
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
import { usePujaDetail } from "../hooks/usePujaDetail.ts";
import { ServiceMode } from "../types/discovery.ts";

type PujaDetailRouteProp = RouteProp<CustomerStackParamList, "PujaDetail">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const PujaDetailScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<PujaDetailRouteProp>();
  const { pujaId, pujaName, serviceMode: initialMode } = route.params;

  const [selectedMode, setSelectedMode] = React.useState<ServiceMode | undefined>(initialMode);

  const {
    puja,
    modePrices,
    loading,
    error,
    refresh,
  } = usePujaDetail(pujaId);

  if (loading) {
    return (
      <ScreenContainer padded>
        <Header title={pujaName || "Ritual Details"} onBack={() => navigation.goBack()} />
        <LoadingState message="Loading ritual details..." />
      </ScreenContainer>
    );
  }

  if (error || !puja) {
    return (
      <ScreenContainer padded>
        <Header title={pujaName || "Ritual Details"} onBack={() => navigation.goBack()} />
        <ErrorState
          title="Ritual Not Found"
          message={error || "Could not find details for this ritual."}
          onRetry={refresh}
        />
      </ScreenContainer>
    );
  }

  const effectiveMode =
    selectedMode && puja.allowed_modes?.includes(selectedMode)
      ? selectedMode
      : initialMode && puja.allowed_modes?.includes(initialMode)
      ? initialMode
      : puja.allowed_modes?.length === 1
      ? puja.allowed_modes[0]
      : undefined;

  return (
    <ScreenContainer scrollable padded>
      <Header
        title={puja.name}
        subtitle={puja.category?.name || "Vedic Ritual"}
        onBack={() => navigation.goBack()}
      />

      {/* Main Info Card */}
      <Card variant="elevated" style={styles.mainCard}>
        <View style={styles.badgesRow}>
          {puja.category?.name ? (
            <View style={styles.badge}>
              <Text variant="captionMedium" color={colors.primary}>
                {puja.category.name}
              </Text>
            </View>
          ) : null}
          {puja.default_duration_minutes ? (
            <View style={styles.durationBadge}>
              <Text variant="caption" color={colors.textSecondary}>
                ⏱ Approx. {puja.default_duration_minutes} Minutes
              </Text>
            </View>
          ) : null}
        </View>

        <Text variant="h2" style={styles.title}>
          {puja.name}
        </Text>

        <Text variant="body" color={colors.textSecondary} style={styles.description}>
          {puja.description || "Authentic Vedic ritual performed by verified priests according to sacred Sanatan scriptures."}
        </Text>
      </Card>

      {/* Allowed Modes */}
      <View style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          Available Service Formats
        </Text>
        <Card style={styles.sectionCard}>
          {(puja.allowed_modes && puja.allowed_modes.length > 0) ? (
            puja.allowed_modes.map((mode) => {
              const modeDetails =
                mode === "home"
                  ? { icon: "🪔", title: "Home Puja", desc: "Pandit visits your residence with complete Samagri." }
                  : mode === "temple"
                  ? { icon: "🏛️", title: "Temple Puja", desc: "Performed directly at consecrated temple sanctums in Kashi." }
                  : { icon: "🌐", title: "Online Puja", desc: "Connect with a Pandit through a live video session." };

              const formatPrice =
                mode === "home"
                  ? modePrices?.home
                  : mode === "temple"
                  ? modePrices?.temple
                  : modePrices?.remote;

              const isModeSelected = effectiveMode === mode;

              return (
                <TouchableOpacity
                  key={mode}
                  activeOpacity={0.7}
                  onPress={() => setSelectedMode(mode)}
                  style={[
                    styles.modeItem,
                    isModeSelected && styles.modeItemSelected,
                  ]}
                >
                  <Text variant="h3" style={styles.modeIcon}>
                    {modeDetails.icon}
                  </Text>
                  <View style={styles.modeInfo}>
                    <View style={styles.modeTitleRow}>
                      <Text variant="bodyMedium" style={{ fontWeight: isModeSelected ? "700" : "600" }}>
                        {modeDetails.title}
                      </Text>
                      {isModeSelected && (
                        <View style={styles.selectedPill}>
                          <Text variant="overline" color={colors.primary}>
                            Selected
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text variant="caption" color={colors.textSecondary}>
                      {modeDetails.desc}
                    </Text>
                    <Text variant="captionMedium" color={colors.primary} style={styles.modePriceText}>
                      {formatPrice ? `Starting from ${formatCurrency(formatPrice)}` : "Contact Acharya for Dakshina"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <Text variant="caption" color={colors.textSecondary}>
              No service formats are currently configured for this ritual.
            </Text>
          )}
        </Card>
      </View>

      {/* Booking Action */}
      <View style={styles.actionContainer}>
        <Button
          title={
            effectiveMode === "remote"
              ? "Schedule Online Ritual Now"
              : effectiveMode === "home"
              ? "Schedule Home Puja Now"
              : effectiveMode === "temple"
              ? "Schedule Temple Puja Now"
              : "Schedule Ritual Now"
          }
          variant="primary"
          size="lg"
          onPress={() =>
            navigation.navigate("BookingWizard", {
              pujaId: puja.id,
              pujaName: puja.name,
              serviceMode: effectiveMode,
            })
          }
        />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  mainCard: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  badgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  badge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  durationBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  title: {
    marginBottom: spacing.xs,
  },
  description: {
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  sectionCard: {
    padding: spacing.md,
  },
  modeItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: spacing.xs,
  },
  modeItemSelected: {
    borderColor: colors.primary,
    backgroundColor: "#FFF8F6",
  },
  modeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectedPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  modeIcon: {
    marginRight: spacing.md,
    fontSize: 24,
  },
  modeInfo: {
    flex: 1,
  },
  modePriceText: {
    marginTop: 2,
  },
  actionContainer: {
    marginVertical: spacing.xl,
  },
});


// src/features/discovery/screens/PujaListScreen.tsx
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  EmptyState,
  ErrorState,
  Header,
  Input,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { PujaCard } from "../components/PujaCard.tsx";
import { usePujaList } from "../hooks/usePujaList.ts";
import { ServiceMode } from "../types/discovery.ts";

type PujaListRouteProp = RouteProp<CustomerStackParamList, "PujaList">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const PujaListScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<PujaListRouteProp>();
  const { categoryId, categoryName, serviceMode: initialMode, modeTitle } = route.params || {};

  const [search, setSearch] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<ServiceMode | undefined>(initialMode);

  const { pujas, loading, error, refresh } = usePujaList({
    categoryId,
    search,
    serviceMode: selectedMode,
  });

  const modes: { label: string; value: ServiceMode | undefined }[] = [
    { label: "All Formats", value: undefined },
    { label: "🪔 Home", value: "home" },
    { label: "🌐 Online", value: "remote" },
    { label: "🏛️ Temple", value: "temple" },
  ];

  const headerTitle =
    modeTitle ||
    categoryName ||
    (selectedMode === "home"
      ? "Home Pujas"
      : selectedMode === "remote"
      ? "Online Pujas"
      : selectedMode === "temple"
      ? "Temple Pujas"
      : "Vedic Rituals Catalog");

  const headerSubtitle =
    selectedMode === "home"
      ? "Book a Pandit to perform your sacred puja at home"
      : selectedMode === "remote"
      ? "Connect with verified Pandits through live video sessions"
      : selectedMode === "temple"
      ? "Sacred ceremonies performed in consecrated sanctums of Kashi"
      : "Authentic pujas performed according to Vedic Shastras";

  const getEmptyDescription = () => {
    if (search) {
      return `No pujas match "${search}". Try searching for another ritual name.`;
    }
    if (selectedMode === "home") {
      return "No pujas are currently available for Home service.";
    }
    if (selectedMode === "remote") {
      return "No online pujas are currently available.";
    }
    if (selectedMode === "temple") {
      return "No temple pujas are currently available.";
    }
    return "No active pujas are available in this selection.";
  };

  return (
    <ScreenContainer scrollable padded>
      <Header
        title={headerTitle}
        subtitle={headerSubtitle}
        onBack={() => navigation.goBack()}
      />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Input
          placeholder="Search pujas (e.g. Rudrabhishek, Havan)..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Mode Filters */}
      <View style={styles.filterRow}>
        {modes.map((m) => {
          const isSelected = selectedMode === m.value;
          return (
            <TouchableOpacity
              key={m.label}
              onPress={() => setSelectedMode(m.value)}
              style={[
                styles.filterPill,
                isSelected && styles.filterPillSelected,
              ]}
            >
              <Text
                variant="captionMedium"
                color={isSelected ? colors.textInverse : colors.textSecondary}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Puja List */}
      <View style={styles.listContainer}>
        {loading ? (
          <LoadingState message="Loading sacred rituals..." />
        ) : error ? (
          <ErrorState
            title="Failed to load rituals"
            message={error}
            onRetry={refresh}
          />
        ) : pujas.length === 0 ? (
          <EmptyState
            title="No Rituals Found"
            description={getEmptyDescription()}
            actionTitle="Reset Filters"
            onAction={() => {
              setSearch("");
              setSelectedMode(undefined);
              refresh();
            }}
          />
        ) : (
          pujas.map((puja) => (
            <PujaCard
              key={puja.id}
              puja={puja}
              onPress={() =>
                navigation.navigate("PujaDetail", {
                  pujaId: puja.id,
                  pujaName: puja.name,
                  serviceMode: selectedMode,
                })
              }
            />
          ))
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  searchContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  filterPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  listContainer: {
    marginTop: spacing.xs,
  },
});

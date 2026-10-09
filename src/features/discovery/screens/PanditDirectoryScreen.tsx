import React, { useEffect, useState } from "react";
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
import { bookingService } from "../../booking/services/bookingService.ts";
import { PanditCard } from "../components/PanditCard.tsx";
import { usePanditDirectory } from "../hooks/usePanditDirectory.ts";
import { ServiceMode } from "../types/discovery.ts";

type PanditDirectoryRouteProp = RouteProp<CustomerStackParamList, "PanditDirectory">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const PanditDirectoryScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<PanditDirectoryRouteProp>();
  const { pujaServiceId, pujaName, serviceMode: initialMode } = route.params || {};

  const [search, setSearch] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<ServiceMode | undefined>(initialMode);
  const [userCoords, setUserCoords] = useState<{ latitude?: number; longitude?: number }>({});

  useEffect(() => {
    let isMounted = true;
    bookingService
      .fetchCustomerAddresses()
      .then((addresses) => {
        if (!isMounted) return;
        if (addresses && addresses.length > 0) {
          const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];
          if (defaultAddr.latitude && defaultAddr.longitude) {
            setUserCoords({ latitude: defaultAddr.latitude, longitude: defaultAddr.longitude });
            return;
          }
        }
        // Fallback to canonical Kashi / Varanasi center coordinates (same as BookingLocationSelector)
        setUserCoords({ latitude: 25.3176, longitude: 82.9739 });
      })
      .catch(() => {
        if (isMounted) {
          setUserCoords({ latitude: 25.3176, longitude: 82.9739 });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const { pandits, loading, error, refresh } = usePanditDirectory({
    pujaServiceId,
    serviceMode: selectedMode,
    latitude: selectedMode === "home" ? userCoords.latitude : undefined,
    longitude: selectedMode === "home" ? userCoords.longitude : undefined,
    limit: 50,
  });

  const filteredPandits = pandits.filter((p) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const nameMatch = p.display_name?.toLowerCase().includes(query);
    const langMatch = (p.languages || []).some((l) => l.toLowerCase().includes(query));
    const offeringMatch = (p.offering_names || []).some((o) => o.toLowerCase().includes(query));
    return nameMatch || langMatch || offeringMatch;
  });

  const modes: { label: string; value: ServiceMode | undefined }[] = [
    { label: "All Formats", value: undefined },
    { label: "🪔 Home", value: "home" },
    { label: "🏛️ Temple", value: "temple" },
    { label: "🌐 Remote", value: "remote" },
  ];

  return (
    <ScreenContainer scrollable padded>
      <Header
        title={pujaName ? `Pandits for ${pujaName}` : "Vedic Pandits Directory"}
        subtitle="Verified priests with authentic ritual lineage in Kashi"
        onBack={() => navigation.goBack()}
      />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Input
          placeholder="Search by Acharya name or language (Hindi, Sanskrit)..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Service Mode Filters */}
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

      {/* Pandit List */}
      <View style={styles.listContainer}>
        {loading ? (
          <LoadingState message="Finding verified Pandits in Kashi..." />
        ) : error ? (
          <ErrorState
            title="Failed to load pandits"
            message={error}
            onRetry={refresh}
          />
        ) : filteredPandits.length === 0 ? (
          <EmptyState
            title="No Pandits Found"
            description={
              search
                ? `No pandits found matching "${search}". Try clearing search filters.`
                : "No verified pandits are currently available for this selection."
            }
            actionTitle="Reset Filters"
            onAction={() => {
              setSearch("");
              setSelectedMode(undefined);
              refresh();
            }}
          />
        ) : (
          filteredPandits.map((pandit) => (
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

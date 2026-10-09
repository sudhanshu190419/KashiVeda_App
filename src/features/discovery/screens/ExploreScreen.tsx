// src/features/discovery/screens/ExploreScreen.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { CategoryCard } from "../components/CategoryCard.tsx";
import { usePujaCategories } from "../hooks/usePujaCategories.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const ExploreScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const { categories, loading, error, refresh } = usePujaCategories();

  return (
    <ScreenContainer scrollable padded>
      <View style={styles.header}>
        <Text variant="h1">Explore Rituals & Pandits</Text>
        <Text variant="body" color={colors.textSecondary}>
          Discover authentic Sanatan traditions, Vedic rituals, and verified priests of Kashi.
        </Text>
      </View>

      {/* Quick Action Navigation Cards */}
      <TouchableOpacity
        onPress={() => navigation.navigate("PujaList")}
        activeOpacity={0.75}
      >
        <Card style={styles.exploreBanner}>
          <Text variant="h3">🪔 Complete Rituals Catalog</Text>
          <Text variant="caption" color={colors.textSecondary}>
            Ganga Aarti, Rudrabhishek, Mahamrityunjaya Jaap, Pind Daan, Navgrah Shanti, and Sanskars.
          </Text>
        </Card>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate("PanditDirectory")}
        activeOpacity={0.75}
      >
        <Card style={styles.exploreBanner}>
          <Text variant="h3">🕉 Verified Vedic Pandits</Text>
          <Text variant="caption" color={colors.textSecondary}>
            Verified priests in Varanasi with authentic Vedic lineage and clear availability.
          </Text>
        </Card>
      </TouchableOpacity>

      {/* Categories Grid / List */}
      <View style={styles.sectionHeader}>
        <Text variant="h3">Browse by Category</Text>
      </View>

      {loading ? (
        <LoadingState message="Loading categories..." />
      ) : error ? (
        <ErrorState
          title="Could not load categories"
          message={error}
          onRetry={refresh}
        />
      ) : categories.length === 0 ? (
        <EmptyState
          title="Catalog Updating"
          description="Categories will appear here shortly."
          actionTitle="Refresh"
          onAction={refresh}
        />
      ) : (
        categories.map((category) => (
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
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    marginVertical: spacing.md,
  },
  exploreBanner: {
    marginBottom: spacing.md,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primarySubtle,
  },
  sectionHeader: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
});

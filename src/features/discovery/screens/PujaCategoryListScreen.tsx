// src/features/discovery/screens/PujaCategoryListScreen.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  EmptyState,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
} from "../../../shared/components/ui/index.ts";
import { spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { CategoryCard } from "../components/CategoryCard.tsx";
import { usePujaCategories } from "../hooks/usePujaCategories.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const PujaCategoryListScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const { categories, loading, error, refresh } = usePujaCategories();

  return (
    <ScreenContainer scrollable padded>
      <Header
        title="Puja Categories"
        subtitle="Vedic rituals organized by tradition"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.container}>
        {loading ? (
          <LoadingState message="Loading ritual categories..." />
        ) : error ? (
          <ErrorState
            title="Failed to load categories"
            message={error}
            onRetry={refresh}
          />
        ) : categories.length === 0 ? (
          <EmptyState
            title="No Categories Available"
            description="Our ritual catalog is currently being updated. Please check back shortly."
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
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
});

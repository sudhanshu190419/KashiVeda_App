// src/features/astrology/screens/AstrologyDeliveriesScreen.tsx
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  EmptyState,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
} from "../../../shared/components/ui/index.ts";
import { colors, spacing } from "../../../shared/theme/index.ts";
import { AstrologyDeliveryCard } from "../components/AstrologyDeliveryCard.tsx";
import { useAstrologyDeliveries } from "../hooks/useAstrologyDeliveries.ts";

export const AstrologyDeliveriesScreen: React.FC = () => {
  const navigation = useNavigation();

  const {
    deliveries,
    loading,
    refreshing,
    hasMore,
    error,
    loadMore,
    refresh,
  } = useAstrologyDeliveries({ pageSize: 10 });

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  if (loading && deliveries.length === 0) {
    return (
      <ScreenContainer>
        <Header title="Delivery Journal" onBack={() => navigation.goBack()} />
        <LoadingState message="Fetching astrology delivery journal..." />
      </ScreenContainer>
    );
  }

  if (error && deliveries.length === 0) {
    return (
      <ScreenContainer>
        <Header title="Delivery Journal" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Unable to Load Deliveries"
          message={error}
          onRetry={refresh}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Header title="Delivery Journal" onBack={() => navigation.goBack()} />

      <FlatList
        data={deliveries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AstrologyDeliveryCard delivery={item} />}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <EmptyState
            title="No Delivery History"
            description="No astrology delivery records have been dispatched to your subscription yet."
          />
        }
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  footerLoader: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
});

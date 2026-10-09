// src/features/kundli/screens/KundliOrdersScreen.tsx
import React from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Button,
  EmptyState,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { KundliOrderCard } from "../components/KundliOrderCard.tsx";
import { useKundliOrders } from "../hooks/useKundliOrders.ts";
import { KundliOrder } from "../types/kundli.types.ts";

type OrdersNavProp = NativeStackNavigationProp<CustomerStackParamList>;

export const KundliOrdersScreen: React.FC = () => {
  const navigation = useNavigation<OrdersNavProp>();
  const { orders, loading, refreshing, error, refresh, fetchNextPage } = useKundliOrders();

  const handleSelectOrder = (order: KundliOrder) => {
    navigation.navigate("KundliDetail", { orderId: order.id });
  };

  const handleCreateNew = () => {
    navigation.navigate("KundliWizard", undefined);
  };

  return (
    <ScreenContainer scrollable={false} padded={false}>
      <Header
        title="My Kundli Orders"
        onBack={() => navigation.goBack()}
        rightAction={
          <Button
            title="+ New"
            size="sm"
            variant="outline"
            onPress={handleCreateNew}
          />
        }
      />

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={styles.listContent}
        onEndReached={fetchNextPage}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <KundliOrderCard
            order={item}
            onPress={handleSelectOrder}
            viewerRole="customer"
          />
        )}
        ListEmptyComponent={
          loading ? (
            <LoadingState message="Loading your Kundli orders..." />
          ) : error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <View style={styles.emptyContainer}>
              <EmptyState
                title="No Kundli Orders Yet"
                description="You haven't requested any handwritten Vedic Kundlis. Select an astrologer to get started."
              />
              <Button
                title="Request Handwritten Kundli"
                onPress={handleCreateNew}
                style={styles.emptyCta}
              />
            </View>
          )
        }
        ListFooterComponent={
          orders.length > 0 ? (
            <View style={styles.footer}>
              <Text variant="caption" color={colors.textTertiary} style={styles.footerText}>
                Showing {orders.length} order{orders.length === 1 ? "" : "s"}
              </Text>
            </View>
          ) : undefined
        }
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  emptyCta: {
    marginTop: spacing.lg,
    width: "80%",
  },
  footer: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  footerText: {
    textAlign: "center",
  },
});

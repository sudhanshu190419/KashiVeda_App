// src/features/kundli/screens/KundliOrdersScreen.tsx
import React from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VText,
  VButton,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { KundliOrderCard } from "../components/KundliOrderCard.tsx";
import { useKundliOrders } from "../hooks/useKundliOrders.ts";
import { KundliOrder } from "../types/kundli.types.ts";

type OrdersNavProp = NativeStackNavigationProp<CustomerStackParamList>;

export const KundliOrdersScreen: React.FC = () => {
  const navigation = useNavigation<OrdersNavProp>();
  const { colors, spacing } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const { orders, loading, refreshing, error, refresh, fetchNextPage } = useKundliOrders();

  const handleSelectOrder = (order: KundliOrder) => {
    navigation.navigate("KundliDetail", { orderId: order.id });
  };

  const handleCreateNew = () => {
    navigation.navigate("KundliWizard", undefined);
  };

  return (
    <ScreenWrapper
      headerComponent={
        <AppBar
          title="My Kundli Orders"
          titleHi="मेरे कुण्डली आदेश"
          showBackButton
          onBackPress={() => navigation.goBack()}
          rightComponent={
            <VButton
              title={isHi ? "+ नया" : "+ New"}
              size="sm"
              variant="outline"
              onPress={handleCreateNew}
              style={styles.newButton}
            />
          }
        />
      }
    >
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[colors.brandPrimary]}
            tintColor={colors.brandPrimary}
          />
        }
        contentContainerStyle={[styles.listContent, { padding: spacing.md, paddingBottom: 40 }]}
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
            <View style={[styles.emptyContainer, { padding: spacing.md }]}>
              <EmptyState
                title="No Kundli Orders Yet"
                description="You haven't requested any handwritten Vedic Kundlis. Select an astrologer to get started."
              />
              <VButton
                title={isHi ? "हस्तलिखित कुण्डली आवेदन करें" : "Request Handwritten Kundli"}
                variant="primary"
                onPress={handleCreateNew}
                style={[styles.emptyCta, { marginTop: spacing.md, minHeight: 48 }]}
              />
            </View>
          )
        }
        ListFooterComponent={
          orders.length > 0 ? (
            <View style={[styles.footer, { paddingVertical: spacing.md }]}>
              <VText variant="caption" color="textMuted" align="center">
                Showing {orders.length} order{orders.length === 1 ? "" : "s"}
              </VText>
            </View>
          ) : undefined
        }
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  listContent: {},
  newButton: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
  },
  emptyCta: {
    width: "100%",
  },
  footer: {},
});

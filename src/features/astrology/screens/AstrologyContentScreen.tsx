// src/features/astrology/screens/AstrologyContentScreen.tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  EmptyState,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, spacing, radius } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { AstrologyContentCard } from "../components/AstrologyContentCard.tsx";
import { useAstrologyContent } from "../hooks/useAstrologyContent.ts";
import { AstrologyChannel } from "../types/astrology.types.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const AstrologyContentScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const [selectedChannel, setSelectedChannel] = useState<AstrologyChannel | undefined>(undefined);

  const {
    content,
    loading,
    refreshing,
    hasMore,
    error,
    loadMore,
    refresh,
  } = useAstrologyContent({
    pageSize: 10,
    channel: selectedChannel,
  });

  const renderHeader = () => (
    <View style={styles.filterContainer}>
      <TouchableOpacity
        style={[
          styles.filterChip,
          selectedChannel === undefined && styles.filterChipActive,
        ]}
        onPress={() => setSelectedChannel(undefined)}
        accessibilityRole="button"
        accessibilityLabel="All insights"
      >
        <Text
          variant="captionMedium"
          color={selectedChannel === undefined ? colors.textInverse : colors.textPrimary}
        >
          All Insights
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.filterChip,
          selectedChannel === "in_app" && styles.filterChipActive,
        ]}
        onPress={() => setSelectedChannel("in_app")}
        accessibilityRole="button"
        accessibilityLabel="Daily In-App insights"
      >
        <Text
          variant="captionMedium"
          color={selectedChannel === "in_app" ? colors.textInverse : colors.textPrimary}
        >
          Daily In-App
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.filterChip,
          selectedChannel === "whatsapp" && styles.filterChipActive,
        ]}
        onPress={() => setSelectedChannel("whatsapp")}
        accessibilityRole="button"
        accessibilityLabel="WhatsApp Broadcasts"
      >
        <Text
          variant="captionMedium"
          color={selectedChannel === "whatsapp" ? colors.textInverse : colors.textPrimary}
        >
          WhatsApp Broadcasts
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  if (loading && content.length === 0) {
    return (
      <ScreenContainer>
        <Header title="Cosmic Insights" onBack={() => navigation.goBack()} />
        <LoadingState message="Fetching published Vedic insights..." />
      </ScreenContainer>
    );
  }

  if (error && content.length === 0) {
    return (
      <ScreenContainer>
        <Header title="Cosmic Insights" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Unable to Load Insights"
          message={error}
          onRetry={refresh}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Header title="Cosmic Insights" onBack={() => navigation.goBack()} />

      <FlatList
        data={content}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AstrologyContentCard
            content={item}
            onPress={(selectedItem) =>
              navigation.navigate("AstrologyContentDetail" as any, {
                contentId: selectedItem.id,
              })
            }
          />
        )}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <EmptyState
            title="No Insights Available"
            description="No astrology insights have been published for this channel yet. Check back daily for new cosmic updates."
            actionTitle="Refresh Insights"
            onAction={refresh}
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
  filterContainer: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  footerLoader: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
});

// src/features/discovery/screens/ExploreScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VText,
  VEmptyState as EmptyState,
  VSpinner,
} from "../../../shared/components/index.ts";
import { Ionicons } from "../../../shared/components/icons/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList, CustomerTabParamList } from "../../../shared/types/navigation.ts";
import { usePujaCategories } from "../hooks/usePujaCategories.ts";
import { usePujaList } from "../hooks/usePujaList.ts";
import { usePanditDirectory } from "../hooks/usePanditDirectory.ts";
import { PujaCard } from "../components/PujaCard.tsx";
import { PanditCard } from "../components/PanditCard.tsx";
import { ServiceMode } from "../types/discovery.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;
type ExploreRouteProp = RouteProp<CustomerTabParamList, "Explore">;

type SortOption = "nearest" | "experience" | "rating";

export const ExploreScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<ExploreRouteProp>();
  const { colors, spacing, radii, isDark } = useTheme();
  const { language, pick } = useLanguage();
  const isHi = language === "hi";

  const initialTab = route.params?.initialTab || "pujas";
  const initialMode = route.params?.serviceMode;

  const [activeSubtab, setActiveSubtab] = useState<"pujas" | "pandits">(initialTab);
  const [selectedMode, setSelectedMode] = useState<ServiceMode | undefined>(initialMode);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [pujaSearch, setPujaSearch] = useState<string>("");

  const [panditSearch, setPanditSearch] = useState<string>("");
  const [selectedSort, setSelectedSort] = useState<SortOption>("nearest");
  const [sortModalVisible, setSortModalVisible] = useState<boolean>(false);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync route params when navigated with deep links/params
  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveSubtab(route.params.initialTab);
    }
    if (route.params?.serviceMode !== undefined) {
      setSelectedMode(route.params.serviceMode);
    }
  }, [route.params?.initialTab, route.params?.serviceMode]);

  // Categories query
  const { categories, refresh: refreshCategories } = usePujaCategories();

  // Pujas query
  const {
    pujas,
    loading: pujasLoading,
    refresh: refreshPujas,
  } = usePujaList({
    categoryId: selectedCategoryId,
    search: pujaSearch,
    serviceMode: selectedMode,
    limit: 50,
  });

  // Pandits query
  const {
    pandits,
    loading: panditsLoading,
    refresh: refreshPandits,
  } = usePanditDirectory({
    serviceMode: selectedMode,
    limit: 50,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshCategories(), refreshPujas(), refreshPandits()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter and sort pandits client-side for UI responsiveness
  const filteredPandits = useMemo(() => {
    let result = [...pandits];
    if (panditSearch.trim()) {
      const q = panditSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.display_name?.toLowerCase().includes(q) ||
          p.bio?.toLowerCase().includes(q) ||
          p.offering_names?.some((o) => o.toLowerCase().includes(q))
      );
    }

    if (selectedSort === "rating") {
      result.sort((a, b) => (b.rating_avg || 0) - (a.rating_avg || 0));
    } else if (selectedSort === "experience") {
      result.sort((a, b) => (b.years_experience || 0) - (a.years_experience || 0));
    }
    return result;
  }, [pandits, panditSearch, selectedSort]);

  const serviceModes: { label: string; labelHi: string; value: ServiceMode | undefined }[] = [
    { label: "All Formats", labelHi: "समस्त पद्धतियां", value: undefined },
    { label: "Home Puja", labelHi: "गृह पूजा", value: "home" },
    { label: "Online Puja", labelHi: "लाइव दर्शन", value: "remote" },
    { label: "Temple Puja", labelHi: "मंदिर अनुष्ठान", value: "temple" },
  ];

  return (
    <ScreenWrapper
      safeArea="top"
      background="surfaceBase"
      testID="c-03-explore-screen"
    >
      {/* Clean AppBar with zero eyebrows */}
      <AppBar
        title="Pujas & Pandits"
        titleHi="पूजा एवं पुरोहित"
        locationBadge={isHi ? "वाराणसी" : "Varanasi"}
        includeSafeArea={false}
      />

      {/* Top Segmented Tabs [ All Pujas | Verified Pandits ] */}
      <View
        style={[
          styles.tabBarContainer,
          {
            backgroundColor: isDark ? colors.surfaceCard : "#FAF2ED",
            borderColor: colors.borderDefault,
            marginHorizontal: spacing.md,
            marginTop: spacing.xs,
            marginBottom: spacing.sm,
            borderRadius: radii.lg,
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveSubtab("pujas")}
          style={[
            styles.segmentButton,
            activeSubtab === "pujas" && [
              styles.segmentButtonActive,
              { backgroundColor: colors.surfaceCard },
            ],
          ]}
          accessibilityRole="button"
          accessibilityLabel="All Pujas"
        >
          <VText
            variant="labelMedium"
            weight={activeSubtab === "pujas" ? "700" : "500"}
            color={activeSubtab === "pujas" ? "brandPrimary" : "textMuted"}
          >
            {pick("समस्त पूजाएं", "All Pujas")}
          </VText>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveSubtab("pandits")}
          style={[
            styles.segmentButton,
            activeSubtab === "pandits" && [
              styles.segmentButtonActive,
              { backgroundColor: colors.surfaceCard },
            ],
          ]}
          accessibilityRole="button"
          accessibilityLabel="Verified Pandits"
        >
          <VText
            variant="labelMedium"
            weight={activeSubtab === "pandits" ? "700" : "500"}
            color={activeSubtab === "pandits" ? "brandPrimary" : "textMuted"}
          >
            {pick("सत्यापित पुरोहित", "Verified Pandits")}
          </VText>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.xs,
          paddingBottom: spacing.xxl,
        }}
        refreshControl={
          typeof (globalThis as any).process !== "undefined" &&
          (globalThis as any).process?.env?.NODE_ENV === "test"
            ? undefined
            : (
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.brandPrimary}
                colors={[colors.brandPrimary]}
              />
            )
        }
      >
        {/* ======================================================== */}
        {/* SUBTAB 1: ALL PUJAS                                      */}
        {/* ======================================================== */}
        {activeSubtab === "pujas" && (
          <View style={{ gap: spacing.md }}>
            {/* Search Input */}
            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderRadius: radii.md,
                },
              ]}
            >
              <Ionicons
                name="search-outline"
                size={18}
                color={colors.textMuted}
                style={{ marginRight: spacing.xs }}
              />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder={isHi ? "पूजा खोजें (जैसे रुद्राभिषेक, हवन)..." : "Search Rudrabhishek, Havan, Jaap..."}
                placeholderTextColor={colors.textMuted}
                value={pujaSearch}
                onChangeText={setPujaSearch}
              />
              {pujaSearch.length > 0 && (
                <TouchableOpacity onPress={() => setPujaSearch("")}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Puja Service Mode Pills */}
            <View>
              <VText variant="labelSmall" weight="700" color="textMuted" style={styles.sectionLabel}>
                {pick("पूजा पद्धति", "PUJA MODE")}
              </VText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.xs, paddingTop: 4 }}
              >
                {serviceModes.map((mode) => {
                  const isSelected = selectedMode === mode.value;
                  return (
                    <TouchableOpacity
                      key={mode.label}
                      onPress={() => setSelectedMode(mode.value)}
                      activeOpacity={0.8}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: isSelected ? colors.brandPrimary : colors.surfaceCard,
                          borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                          borderRadius: radii.md,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={mode.label}
                    >
                      <VText
                        variant="caption"
                        weight={isSelected ? "700" : "500"}
                        color={isSelected ? "textOnPrimary" : "textSecondary"}
                      >
                        {isHi ? mode.labelHi : mode.label}
                      </VText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Categories Carousel */}
            {categories.length > 0 && (
              <View>
                <VText variant="labelSmall" weight="700" color="textMuted" style={styles.sectionLabel}>
                  {pick("श्रेणी", "CATEGORIES")}
                </VText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.xs, paddingTop: 4 }}
                >
                  <TouchableOpacity
                    onPress={() => setSelectedCategoryId(undefined)}
                    activeOpacity={0.8}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: selectedCategoryId === undefined ? (isDark ? colors.surfaceCard : "#FAF2ED") : colors.surfaceCard,
                        borderColor: selectedCategoryId === undefined ? colors.brandPrimary : colors.borderDefault,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    <VText
                      variant="caption"
                      weight={selectedCategoryId === undefined ? "700" : "500"}
                      color={selectedCategoryId === undefined ? "brandPrimary" : "textSecondary"}
                    >
                      {pick("समस्त श्रेणियां", "All Categories")}
                    </VText>
                  </TouchableOpacity>

                  {categories.map((cat) => {
                    const isSelected = selectedCategoryId === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => setSelectedCategoryId(cat.id)}
                        activeOpacity={0.8}
                        style={[
                          styles.filterChip,
                          {
                            backgroundColor: isSelected ? (isDark ? colors.surfaceCard : "#FAF2ED") : colors.surfaceCard,
                            borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                            borderRadius: radii.md,
                          },
                        ]}
                      >
                        <VText
                          variant="caption"
                          weight={isSelected ? "700" : "500"}
                          color={isSelected ? "brandPrimary" : "textSecondary"}
                        >
                          {cat.name}
                        </VText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Pujas List */}
            <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
              {pujasLoading && !isRefreshing ? (
                <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
                  <VSpinner size="large" />
                </View>
              ) : pujas.length === 0 ? (
                <EmptyState
                  title={isHi ? "कोई पूजा नहीं मिली" : "No Pujas Found"}
                  description={
                    pujaSearch
                      ? pick(`"${pujaSearch}" से मेल खाती कोई पूजा नहीं मिली।`, `No pujas match "${pujaSearch}". Try another name.`)
                      : pick("इस चयन में वर्तमान में कोई पूजा उपलब्ध नहीं है।", "No active pujas are available for this selection.")
                  }
                  actionLabel={pick("फ़िल्टर रीसेट करें", "Reset Filters")}
                  onActionPress={() => {
                    setPujaSearch("");
                    setSelectedMode(undefined);
                    setSelectedCategoryId(undefined);
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
          </View>
        )}

        {/* ======================================================== */}
        {/* SUBTAB 2: VERIFIED PANDITS (SEARCH & SORT ROW ONLY)       */}
        {/* ======================================================== */}
        {activeSubtab === "pandits" && (
          <View style={{ gap: spacing.md }}>
            {/* Search & Sort Row */}
            <View style={styles.searchSortRow}>
              {/* Search Bar */}
              <View
                style={[
                  styles.searchBox,
                  {
                    flex: 1,
                    backgroundColor: colors.surfaceCard,
                    borderColor: colors.borderDefault,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <Ionicons
                  name="search-outline"
                  size={18}
                  color={colors.textMuted}
                  style={{ marginRight: spacing.xs }}
                />
                <TextInput
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  placeholder={isHi ? "पुरोहित जी का नाम खोजें..." : "Search Pandit Ji name..."}
                  placeholderTextColor={colors.textMuted}
                  value={panditSearch}
                  onChangeText={setPanditSearch}
                />
                {panditSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setPanditSearch("")}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Sort Button */}
              <TouchableOpacity
                onPress={() => setSortModalVisible(true)}
                activeOpacity={0.8}
                style={[
                  styles.sortButton,
                  {
                    backgroundColor: colors.surfaceCard,
                    borderColor: colors.borderDefault,
                    borderRadius: radii.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Sort Pandits"
              >
                <Ionicons name="filter-outline" size={16} color={colors.brandPrimary} />
                <VText variant="caption" weight="700" color="brandPrimary" style={{ marginLeft: 4 }}>
                  {pick("क्रम", "Sort")}
                </VText>
              </TouchableOpacity>
            </View>

            {/* Pandits List */}
            <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              {panditsLoading && !isRefreshing ? (
                <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
                  <VSpinner size="large" />
                </View>
              ) : filteredPandits.length === 0 ? (
                <EmptyState
                  title={isHi ? "कोई पुरोहित नहीं मिले" : "No Pandits Found"}
                  description={
                    panditSearch
                      ? pick(`"${panditSearch}" से मेल खाते कोई पुरोहित नहीं मिले।`, `No Pandits match "${panditSearch}".`)
                      : pick("समस्त वैदिक अनुष्ठानों हेतु विद्वान पुरोहित उपलब्ध हैं।", "Verified Vedic Pandits are available for all traditional pujas.")
                  }
                  actionLabel={pick("खोज साफ़ करें", "Clear Search")}
                  onActionPress={() => setPanditSearch("")}
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
          </View>
        )}
      </ScrollView>

      {/* Clean Sort Selection Modal */}
      <Modal
        visible={sortModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSortModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSortModalVisible(false)}
        >
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderRadius: radii.lg,
              },
            ]}
          >
            <VText variant="titleMedium" weight="700" color="textPrimary" style={{ marginBottom: spacing.sm }}>
              {pick("क्रमबद्ध करें", "Sort Pandits")}
            </VText>

            <TouchableOpacity
              style={styles.sortOptionRow}
              onPress={() => {
                setSelectedSort("nearest");
                setSortModalVisible(false);
              }}
            >
              <VText
                variant="bodyMedium"
                weight={selectedSort === "nearest" ? "700" : "500"}
                color={selectedSort === "nearest" ? "brandPrimary" : "textPrimary"}
              >
                {pick("निकटतम (Proximity)", "Nearest (Proximity)")}
              </VText>
              {selectedSort === "nearest" && (
                <Ionicons name="checkmark" size={18} color={colors.brandPrimary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sortOptionRow}
              onPress={() => {
                setSelectedSort("experience");
                setSortModalVisible(false);
              }}
            >
              <VText
                variant="bodyMedium"
                weight={selectedSort === "experience" ? "700" : "500"}
                color={selectedSort === "experience" ? "brandPrimary" : "textPrimary"}
              >
                {pick("अनुभव (Experience)", "Experience")}
              </VText>
              {selectedSort === "experience" && (
                <Ionicons name="checkmark" size={18} color={colors.brandPrimary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sortOptionRow}
              onPress={() => {
                setSelectedSort("rating");
                setSortModalVisible(false);
              }}
            >
              <VText
                variant="bodyMedium"
                weight={selectedSort === "rating" ? "700" : "500"}
                color={selectedSort === "rating" ? "brandPrimary" : "textPrimary"}
              >
                {pick("रेटिंग (Highest Rated)", "Rating")}
              </VText>
              {selectedSort === "rating" && (
                <Ionicons name="checkmark" size={18} color={colors.brandPrimary} />
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    flexDirection: "row",
    padding: 3,
    borderWidth: 1,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  segmentButtonActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    minHeight: 44,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  searchSortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  sectionLabel: {
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    padding: 16,
  },
  modalSheet: {
    padding: 20,
    borderWidth: 1,
    gap: 12,
  },
  sortOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
});

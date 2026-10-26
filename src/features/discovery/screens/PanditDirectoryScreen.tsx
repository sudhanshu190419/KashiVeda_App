// src/features/discovery/screens/PanditDirectoryScreen.tsx
import React, { useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VInput,
  VTag,
  VCard,
  VAvatar,
  VText,
  VButton,
  RatingStars,
  VerificationBadge,
  VEmptyState as EmptyState,
} from "../../../shared/components/index.ts";
import { Ionicons } from "../../../shared/components/icons/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { bookingService } from "../../booking/services/bookingService.ts";
import { usePanditDirectory } from "../hooks/usePanditDirectory.ts";
import { ServiceMode } from "../types/discovery.ts";

type PanditDirectoryRouteProp = RouteProp<CustomerStackParamList, "PanditDirectory">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const PanditDirectoryScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<PanditDirectoryRouteProp>();
  const { pujaServiceId, pujaName, serviceMode: initialMode } = route.params || {};

  const { colors, spacing, radii } = useTheme();
  const { language, pick } = useLanguage();
  const isHi = language === "hi";

  const [search, setSearch] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<ServiceMode | undefined>(initialMode);
  const [selectedInstitution, setSelectedInstitution] = useState<string>("all");
  const [userCoords, setUserCoords] = useState<{ latitude?: number; longitude?: number }>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

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
        // Fallback to canonical Kashi / Varanasi center coordinates
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredPandits = pandits.filter((p) => {
    // Institution filter
    if (selectedInstitution !== "all") {
      const bioLower = (p.bio || "").toLowerCase();
      if (selectedInstitution === "ssu" && !bioLower.includes("sampurnanand") && !bioLower.includes("ssu") && !bioLower.includes("सम्पूर्णानंद")) {
        return false;
      }
      if (selectedInstitution === "bhu" && !bioLower.includes("bhu") && !bioLower.includes("बीएचयू") && !bioLower.includes("काशी हिन्दू")) {
        return false;
      }
    }

    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const nameMatch = p.display_name?.toLowerCase().includes(query);
    const langMatch = (p.languages || []).some((l) => l.toLowerCase().includes(query));
    const offeringMatch = (p.offering_names || []).some((o) => o.toLowerCase().includes(query));
    return nameMatch || langMatch || offeringMatch;
  });

  const modes: { label: string; labelHi: string; value: ServiceMode | undefined }[] = [
    { label: "All Formats", labelHi: "सभी प्रारूप", value: undefined },
    { label: "🪔 Home", labelHi: "🪔 गृह पूजा", value: "home" },
    { label: "🏛️ Temple", labelHi: "🏛️ मंदिर", value: "temple" },
    { label: "🌐 Remote", labelHi: "🌐 ऑनलाइन", value: "remote" },
  ];

  const screenTitle = pujaName
    ? isHi
      ? `${pujaName} हेतु पुरोहित`
      : `Pandits for ${pujaName}`
    : isHi
    ? "वैदिक पुरोहित निर्देशिका"
    : "Vedic Pandits Directory";

  const screenSubtitle = isHi
    ? "काशी के सत्यापित विद्वान पुरोहित"
    : "Verified priests with authentic ritual lineage in Kashi";

  return (
    <ScreenWrapper
      safeArea="top"
      background="surfaceBase"
      testID="c-04-pandit-directory"
    >
      <AppBar
        title={screenTitle}
        subtitle={screenSubtitle}
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        locationBadge={isHi ? "वाराणसी" : "Varanasi"}
        includeSafeArea={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
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
        {/* Search Input Bar */}
        <View style={{ marginBottom: spacing.sm }}>
          <VInput
            placeholder={
              isHi
                ? "आचार्य का नाम, भाषा (हिंदी, संस्कृत) या अनुष्ठान खोजें..."
                : "Search by Acharya name, language (Hindi, Sanskrit)..."
            }
            value={search}
            onChangeText={setSearch}
            leadingIcon={
              <Ionicons name="search" size={20} color={colors.textMuted} />
            }
            allowClear={true}
            onClear={() => setSearch("")}
          />
        </View>

        {/* Service Mode Filter Chips */}
        <View style={{ marginBottom: spacing.xs }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.xs, paddingVertical: spacing.xxs }}
          >
            {modes.map((m) => {
              const isSelected = selectedMode === m.value;
              return (
                <VTag
                  key={m.label}
                  label={isHi ? m.labelHi : m.label}
                  variant="filter"
                  selected={isSelected}
                  onPress={() => setSelectedMode(m.value)}
                />
              );
            })}
          </ScrollView>
        </View>

        {/* Varanasi Institution Filter Chips */}
        <View style={{ marginBottom: spacing.md }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.xs, paddingVertical: spacing.xxs }}
          >
            <VTag
              label={isHi ? "सभी संस्थान" : "All Institutions"}
              variant="filter"
              selected={selectedInstitution === "all"}
              onPress={() => setSelectedInstitution("all")}
            />
            <VTag
              label="संपूर्णानंद संस्कृत (SSU)"
              variant="filter"
              selected={selectedInstitution === "ssu"}
              onPress={() => setSelectedInstitution(selectedInstitution === "ssu" ? "all" : "ssu")}
            />
            <VTag
              label="BHU धर्म विज्ञान (SVDV)"
              variant="filter"
              selected={selectedInstitution === "bhu"}
              onPress={() => setSelectedInstitution(selectedInstitution === "bhu" ? "all" : "bhu")}
            />
          </ScrollView>
        </View>

        {/* Results Counter */}
        <View style={{ marginBottom: spacing.sm, flexDirection: "row", justifyContent: "space-between" }}>
          <VText variant="labelMedium" color="textMuted">
            {isHi
              ? `${filteredPandits.length} विद्वान पुरोहित उपलब्ध`
              : `${filteredPandits.length} verified scholars available`}
          </VText>
        </View>

        {/* Pandit List */}
        {filteredPandits.length === 0 ? (
          <EmptyState
            icon="person-outline"
            title="No Pandits Found"
            titleHi="कोई पुरोहित नहीं मिले"
            description={
              search
                ? `No pandits found matching "${search}". Try clearing search filters.`
                : "No verified pandits are currently available for this selection."
            }
            descriptionHi={
              search
                ? `"${search}" हेतु कोई पुरोहित नहीं मिले। कृपया अन्य शब्द खोजें।`
                : "इस चयन हेतु वर्तमान में कोई पुरोहित उपलब्ध नहीं हैं।"
            }
            actionLabel="Reset Filters"
            actionLabelHi="फ़िल्टर रीसेट करें"
            onActionPress={() => {
              setSearch("");
              setSelectedMode(undefined);
              setSelectedInstitution("all");
              refresh();
            }}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {filteredPandits.map((pandit) => (
              <VCard
                key={pandit.id}
                elevation={1}
                onPress={() =>
                  navigation.navigate("PanditDetail", {
                    panditId: pandit.id,
                    panditName: pandit.display_name,
                  })
                }
                style={{
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  padding: spacing.md,
                  borderRadius: radii.lg,
                }}
              >
                <View style={styles.cardHeader}>
                  <VAvatar
                    uri={pandit.avatar_url || undefined}
                    name={pandit.display_name}
                    size="lg"
                    isVerified={true}
                  />
                  <View style={[styles.headerInfo, { marginLeft: spacing.md }]}>
                    <VText variant="titleMedium" color="textPrimary" weight="700">
                      {pandit.display_name}
                    </VText>
                    <View style={{ marginTop: spacing.xxs }}>
                      <VerificationBadge status="verified" size="sm" showTooltip={false} />
                    </View>
                    {pandit.rating_avg ? (
                      <View style={{ marginTop: spacing.xxs }}>
                        <RatingStars
                          rating={Number(pandit.rating_avg)}
                          reviewCount={pandit.rating_count || 0}
                          size={14}
                          showNumber
                        />
                      </View>
                    ) : null}
                  </View>
                </View>

                {pandit.bio ? (
                  <VText
                    variant="caption"
                    color="textMuted"
                    numberOfLines={2}
                    style={{ marginTop: spacing.xs }}
                  >
                    {pandit.bio}
                  </VText>
                ) : null}

                {pandit.languages && pandit.languages.length > 0 ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: spacing.xs }}>
                    {pandit.languages.map((lang) => (
                      <VTag key={lang} label={lang} variant="assist" />
                    ))}
                  </View>
                ) : null}

                <View
                  style={[
                    styles.cardFooter,
                    {
                      borderTopColor: colors.borderDefault,
                      borderTopWidth: 1,
                      paddingTop: spacing.xs,
                      marginTop: spacing.sm,
                    },
                  ]}
                >
                  <View>
                    <VText variant="caption" color="textMuted">
                      {isHi ? "प्रारंभिक दक्षिणा" : "Starting Dakshina"}
                    </VText>
                    <VText variant="labelLarge" color="brandPrimary" weight="700">
                      {formatCurrency(pandit.puja_price || 2100)}
                    </VText>
                  </View>
                  <VButton
                    label={isHi ? "प्रोफ़ाइल देखें" : "View Profile"}
                    size="sm"
                    variant="primary"
                    onPress={() =>
                      navigation.navigate("PanditDetail", {
                        panditId: pandit.id,
                        panditName: pandit.display_name,
                      })
                    }
                  />
                </View>
              </VCard>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerInfo: {
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});

// src/features/kundli/free/screens/FreeKundliWizardScreen.tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  VButton,
  VBadge,
  VInput,
} from "../../../../shared/components/index.ts";
import { useTheme, getDevanagariLineHeight } from "../../../../shared/theme/index.ts";
import { useLanguage } from "../../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../../shared/types/navigation.ts";
import { CityLocation, resolveCityLocation, searchCities } from "../data/indianCities.ts";
import { freeKundliService } from "../services/freeKundliService.ts";

type NavigationProp = NativeStackNavigationProp<CustomerStackParamList, "FreeKundliWizard">;

export const FreeKundliWizardScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const [name, setName] = useState<string>("");
  const [dateOfBirth, setDateOfBirth] = useState<string>("");
  const [timeOfBirth, setTimeOfBirth] = useState<string>("");
  const [cityQuery, setCityQuery] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<CityLocation | null>(null);
  const [citySuggestions, setCitySuggestions] = useState<CityLocation[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCityChange = (text: string) => {
    setCityQuery(text);
    setSelectedCity(null);
    if (text.trim().length >= 2) {
      const results = searchCities(text, 5);
      setCitySuggestions(results);
      setShowSuggestions(true);
    } else {
      setCitySuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectCity = (city: CityLocation) => {
    setSelectedCity(city);
    setCityQuery(`${city.name}, ${city.state}`);
    setShowSuggestions(false);
  };

  const validateForm = (): boolean => {
    if (!dateOfBirth.trim()) {
      setFormError("Date of Birth is required (YYYY-MM-DD).");
      return false;
    }
    const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dobRegex.test(dateOfBirth.trim())) {
      setFormError("Date of Birth must be in YYYY-MM-DD format (e.g. 1995-08-15).");
      return false;
    }

    if (!timeOfBirth.trim()) {
      setFormError("Time of Birth is required (HH:MM in 24-hr format).");
      return false;
    }
    const tobRegex = /^\d{1,2}:\d{2}(:\d{2})?$/;
    if (!tobRegex.test(timeOfBirth.trim())) {
      setFormError("Time of Birth must be in HH:MM format (e.g. 14:30 for 2:30 PM).");
      return false;
    }

    if (!cityQuery.trim()) {
      setFormError("Place of Birth is required.");
      return false;
    }

    const city = selectedCity || resolveCityLocation(cityQuery.trim());
    if (!city) {
      setFormError("Please select a recognized city from the suggestions.");
      return false;
    }

    setFormError(null);
    return true;
  };

  const handleCalculate = async () => {
    if (loading) return;
    if (!validateForm()) return;

    const city = selectedCity || resolveCityLocation(cityQuery.trim())!;

    try {
      setLoading(true);
      setFormError(null);

      const kundliData = await freeKundliService.calculateFreeKundli({
        name: name.trim() || undefined,
        birthDate: dateOfBirth.trim(),
        birthTime: timeOfBirth.trim(),
        birthPlace: `${city.name}, ${city.state}, ${city.country}`,
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: city.timezone || "Asia/Kolkata",
      });

      navigation.navigate("FreeKundliResult", { kundliData });
    } catch (err: any) {
      const msg = err?.message || "Calculation failed. Please check your inputs and try again.";
      setFormError(msg);
      Alert.alert("Calculation Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper
      scrollable
      keyboardAvoiding
      headerComponent={
        <AppBar
          title="Free Vedic Kundli"
          showBackButton
          onBackPress={() => navigation.goBack()}
        />
      }
      contentContainerStyle={[styles.scrollContent, { padding: spacing.md, gap: spacing.md }]}
    >
      <VCard
        variant="default"
        elevation={2}
        style={[
          styles.introCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderAccent,
            borderWidth: 1,
          },
        ]}
      >
        <View style={[styles.badgeRow, { gap: spacing.sm, marginBottom: spacing.xs }]}>
          <View
            style={[
              styles.omBadge,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                borderRadius: 16,
              },
            ]}
          >
            <VText style={styles.omText}>🕉️</VText>
          </View>
          <VBadge
            variant="status"
            color="brand"
            label="100% Free • Pure Vedic Lahiri"
          />
        </View>

        <VText variant="headlineMedium" weight="700" color="brandPrimary" style={{ marginBottom: spacing.xxs }}>
          Instant Vedic Kundli
        </VText>
        <VText
          variant="bodyMedium"
          color="textMuted"
          style={{ lineHeight: getDevanagariLineHeight(15) }}
        >
          Generate your authentic birth horoscope, Lagna, Moon sign (Rashi), Nakshatra Pada,
          planetary degrees, Whole-Sign houses, and Vimshottari Dasha timeline.
        </VText>
      </VCard>

      <VCard
        variant="default"
        elevation={1}
        style={[
          styles.formCard,
          {
            padding: spacing.md,
            gap: spacing.sm,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        ]}
      >
        {formError ? (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.errorFg,
                borderWidth: 1,
                padding: spacing.sm,
                borderRadius: radii.sm,
              },
            ]}
          >
            <VText variant="caption" color="error">
              ⚠️ {formError}
            </VText>
          </View>
        ) : null}

        <VInput
          label="Devotee Name (Optional)"
          placeholder="e.g. Aditya Sharma"
          value={name}
          onChangeText={setName}
        />

        <VInput
          label="Date of Birth *"
          placeholder="YYYY-MM-DD (e.g. 1995-08-15)"
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          autoCapitalize="none"
        />

        <VInput
          label="Time of Birth (24-Hour) *"
          placeholder="HH:MM (e.g. 14:30 for 2:30 PM)"
          value={timeOfBirth}
          onChangeText={setTimeOfBirth}
          autoCapitalize="none"
        />

        <VInput
          label="Place of Birth *"
          placeholder="Type city (e.g. Varanasi, Delhi, Mumbai)"
          value={cityQuery}
          onChangeText={handleCityChange}
        />

        {showSuggestions && citySuggestions.length > 0 ? (
          <View
            style={[
              styles.suggestionsContainer,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderRadius: radii.md,
              },
            ]}
          >
            {citySuggestions.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.suggestionItem,
                  {
                    borderBottomColor: colors.borderDefault,
                    padding: spacing.sm,
                  },
                ]}
                onPress={() => handleSelectCity(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.state}`}
              >
                <VText variant="bodyMedium" weight="600" color="brandPrimary">
                  📍 {item.name}
                </VText>
                <VText variant="caption" color="textMuted">
                  {item.state}, {item.country}
                </VText>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {selectedCity ? (
          <View
            style={[
              styles.cityConfirmedBox,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.successFg,
                borderWidth: 1,
                padding: spacing.sm,
                borderRadius: radii.sm,
              },
            ]}
          >
            <VText variant="caption" color="success">
              ✓ Coordinates: {selectedCity.latitude.toFixed(2)}°N, {selectedCity.longitude.toFixed(2)}°E • {selectedCity.timezone}
            </VText>
          </View>
        ) : null}

        <View style={[styles.ctaWrapper, { marginTop: spacing.sm }]}>
          <VButton
            title={loading ? "Calculating Positions..." : "Calculate Sacred Kundli 🔮"}
            variant="primary"
            size="lg"
            onPress={handleCalculate}
            disabled={loading}
          />
        </View>

        {loading ? (
          <View style={[styles.loadingBox, { gap: spacing.sm, marginTop: spacing.sm }]}>
            <ActivityIndicator size="small" color={colors.brandPrimary} />
            <VText variant="caption" color="textMuted" align="center">
              Computing sidereal planetary longitudes and Vimshottari Dasha...
            </VText>
          </View>
        ) : null}
      </VCard>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  introCard: {},
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  omBadge: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  omText: {
    fontSize: 18,
  },
  formCard: {},
  errorBox: {},
  suggestionsContainer: {
    borderWidth: 1,
    overflow: "hidden",
    marginTop: -4,
    marginBottom: 8,
  },
  suggestionItem: {
    borderBottomWidth: 1,
    minHeight: 48,
    justifyContent: "center",
  },
  cityConfirmedBox: {},
  ctaWrapper: {},
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});

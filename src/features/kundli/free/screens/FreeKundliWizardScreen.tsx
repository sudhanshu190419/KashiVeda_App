// src/features/kundli/free/screens/FreeKundliWizardScreen.tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Button,
  Card,
  Header,
  Input,
  ScreenContainer,
  Text,
} from "../../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../../shared/types/navigation.ts";
import { CityLocation, resolveCityLocation, searchCities } from "../data/indianCities.ts";
import { freeKundliService } from "../services/freeKundliService.ts";

type NavigationProp = NativeStackNavigationProp<CustomerStackParamList, "FreeKundliWizard">;

export const FreeKundliWizardScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

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
    <ScreenContainer scrollable={false} padded={false}>
      <Header title="Free Vedic Kundli" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Card variant="elevated" style={styles.introCard}>
            <View style={styles.badgeRow}>
              <View style={styles.omBadge}>
                <Text style={styles.omText}>🕉️</Text>
              </View>
              <View style={styles.badgeTag}>
                <Text variant="caption" color={colors.primary}>
                  100% Free • Pure Vedic Lahiri
                </Text>
              </View>
            </View>
            <Text variant="h2" style={styles.title}>
              Instant Vedic Kundli
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
              Generate your authentic birth horoscope, Lagna, Moon sign (Rashi), Nakshatra Pada,
              planetary degrees, Whole-Sign houses, and Vimshottari Dasha timeline.
            </Text>
          </Card>

          <Card variant="outlined" style={styles.formCard}>
            {formError ? (
              <View style={styles.errorBox}>
                <Text variant="caption" color={colors.error}>
                  ⚠️ {formError}
                </Text>
              </View>
            ) : null}

            <Input
              label="Devotee Name (Optional)"
              placeholder="e.g. Aditya Sharma"
              value={name}
              onChangeText={setName}
            />

            <Input
              label="Date of Birth *"
              placeholder="YYYY-MM-DD (e.g. 1995-08-15)"
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
            />

            <Input
              label="Time of Birth (24-Hour) *"
              placeholder="HH:MM (e.g. 14:30 for 2:30 PM)"
              value={timeOfBirth}
              onChangeText={setTimeOfBirth}
            />

            <Input
              label="Place of Birth *"
              placeholder="Type city (e.g. Varanasi, Delhi, Mumbai)"
              value={cityQuery}
              onChangeText={handleCityChange}
            />

            {showSuggestions && citySuggestions.length > 0 ? (
              <View style={styles.suggestionsContainer}>
                {citySuggestions.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.suggestionItem}
                    onPress={() => handleSelectCity(item)}
                  >
                    <Text variant="bodyMedium" color={colors.primary}>
                      📍 {item.name}
                    </Text>
                    <Text variant="caption" color={colors.textSecondary}>
                      {item.state}, {item.country}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {selectedCity ? (
              <View style={styles.cityConfirmedBox}>
                <Text variant="caption" color={colors.success}>
                  ✓ Coordinates: {selectedCity.latitude.toFixed(2)}°N, {selectedCity.longitude.toFixed(2)}°E • {selectedCity.timezone}
                </Text>
              </View>
            ) : null}

            <View style={styles.ctaWrapper}>
              <Button
                title={loading ? "Calculating Positions..." : "Calculate Sacred Kundli 🔮"}
                variant="primary"
                size="lg"
                onPress={handleCalculate}
                disabled={loading}
              />
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text variant="caption" color={colors.textSecondary} align="center">
                  Computing sidereal planetary longitudes and Vimshottari Dasha...
                </Text>
              </View>
            ) : null}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  introCard: {
    padding: spacing.lg,
    backgroundColor: "#FFFBF7",
    borderColor: colors.borderLight,
    borderWidth: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  omBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  omText: {
    fontSize: 18,
  },
  badgeTag: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  title: {
    marginBottom: spacing.xxs,
    color: colors.primary,
  },
  subtitle: {
    lineHeight: 20,
  },
  formCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  errorBox: {
    backgroundColor: "#FFEBEE",
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  suggestionsContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  suggestionItem: {
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  cityConfirmedBox: {
    backgroundColor: "#E8F5E9",
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xxs,
  },
  ctaWrapper: {
    marginTop: spacing.md,
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});

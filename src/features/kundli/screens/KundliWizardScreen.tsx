// src/features/kundli/screens/KundliWizardScreen.tsx
import React, { useEffect, useState } from "react";
import {
  Alert,
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
  VCard,
  VText,
  VButton,
  VBadge,
  VInput,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../../shared/components/index.ts";
import { useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency } from "../../../shared/utils/formatters.ts";
import { useKundliPandits } from "../hooks/useKundliPandits.ts";
import { kundliService } from "../services/kundliService.ts";
import { KundliPandit } from "../types/kundli.types.ts";

type WizardRouteProp = RouteProp<CustomerStackParamList, "KundliWizard">;
type WizardNavProp = NativeStackNavigationProp<CustomerStackParamList, "KundliWizard">;

export const KundliWizardScreen: React.FC = () => {
  const route = useRoute<WizardRouteProp>();
  const navigation = useNavigation<WizardNavProp>();

  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const { pandits, loading: loadingPandits, error: panditsError } = useKundliPandits();

  const [selectedPandit, setSelectedPandit] = useState<KundliPandit | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState<string>("");
  const [timeOfBirth, setTimeOfBirth] = useState<string>("");
  const [placeOfBirth, setPlaceOfBirth] = useState<string>("");
  const [additionalNotes, setAdditionalNotes] = useState<string>("");

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-select pandit from route params or first available
  useEffect(() => {
    if (pandits.length > 0) {
      if (route.params?.panditId) {
        const found = pandits.find((p) => p.id === route.params?.panditId);
        if (found) {
          setSelectedPandit(found);
          return;
        }
      }
      if (!selectedPandit) {
        setSelectedPandit(pandits[0]);
      }
    }
  }, [pandits, route.params?.panditId, selectedPandit]);

  const validateInputs = (): boolean => {
    if (!selectedPandit) {
      setFormError("Please select an astrologer for your Kundli.");
      return false;
    }
    if (!dateOfBirth.trim()) {
      setFormError("Date of Birth is required (YYYY-MM-DD).");
      return false;
    }
    const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dobRegex.test(dateOfBirth.trim())) {
      setFormError("Date of Birth must be in YYYY-MM-DD format (e.g., 1995-08-15).");
      return false;
    }
    if (!timeOfBirth.trim()) {
      setFormError("Time of Birth is required (HH:MM or HH:MM:SS).");
      return false;
    }
    if (!placeOfBirth.trim()) {
      setFormError("Place of Birth is required.");
      return false;
    }

    setFormError(null);
    return true;
  };

  const handleCreateOrder = async () => {
    if (submitting) return;
    if (!validateInputs() || !selectedPandit) return;

    try {
      setSubmitting(true);
      setFormError(null);

      const result = await kundliService.createKundliOrder({
        pandit_id: selectedPandit.id,
        date_of_birth: dateOfBirth.trim(),
        time_of_birth: timeOfBirth.trim(),
        place_of_birth: placeOfBirth.trim(),
        additional_notes: additionalNotes.trim() || undefined,
      });

      navigation.navigate("KundliPayment", {
        kundliOrderId: result.kundli_order_id,
        paymentOrderId: result.payment_order_id,
        amount: result.price,
        panditName: selectedPandit.display_name,
      });
    } catch (err: any) {
      const msg = err?.message || "Failed to create Kundli order. Please check your inputs.";
      setFormError(msg);
      Alert.alert("Order Creation Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPandits) {
    return (
      <ScreenWrapper
        headerComponent={
          <AppBar
            title="Create Kundli Order"
            titleHi="कुण्डली आवेदन"
            showBackButton
            onBackPress={() => navigation.goBack()}
          />
        }
      >
        <LoadingState message="Loading astrologer details..." />
      </ScreenWrapper>
    );
  }

  if (panditsError) {
    return (
      <ScreenWrapper
        headerComponent={
          <AppBar
            title="Create Kundli Order"
            titleHi="कुण्डली आवेदन"
            showBackButton
            onBackPress={() => navigation.goBack()}
          />
        }
      >
        <ErrorState message={panditsError} />
      </ScreenWrapper>
    );
  }

  if (pandits.length === 0) {
    return (
      <ScreenWrapper
        headerComponent={
          <AppBar
            title="Create Kundli Order"
            titleHi="कुण्डली आवेदन"
            showBackButton
            onBackPress={() => navigation.goBack()}
          />
        }
      >
        <EmptyState
          title="No Astrologers Available"
          description="No Kundli specialists are currently active. Please try again later."
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper
      scrollable
      keyboardAvoiding
      headerComponent={
        <AppBar
          title="Vedic Kundli Details"
          titleHi="वैदिक कुण्डली विवरण"
          showBackButton
          onBackPress={() => navigation.goBack()}
        />
      }
      contentContainerStyle={[styles.content, { padding: spacing.md, gap: spacing.md }]}
    >
      {/* Astrologer Selection */}
      <VCard
        variant="default"
        elevation={1}
        style={[
          styles.sectionCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        ]}
      >
        <VText variant="titleMedium" weight="700" color="brandPrimary">
          1. Select Astrologer
        </VText>
        <VText variant="caption" color="textMuted" style={{ marginBottom: spacing.md }}>
          Choose the Vedic scholar who will calculate and prepare your horoscope
        </VText>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.panditPicker}>
          {pandits.map((pandit) => {
            const isSelected = selectedPandit?.id === pandit.id;
            return (
              <TouchableOpacity
                key={pandit.id}
                style={[
                  styles.panditChip,
                  {
                    borderRadius: radii.md,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    backgroundColor: isSelected ? colors.surfaceCard : colors.surfaceSubtle,
                    borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                    borderWidth: isSelected ? 2 : 1,
                    marginRight: spacing.sm,
                  },
                ]}
                onPress={() => setSelectedPandit(pandit)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${pandit.display_name}`}
              >
                <VText
                  variant="bodyMedium"
                  weight={isSelected ? "700" : "500"}
                  color={isSelected ? "brandPrimary" : "textPrimary"}
                >
                  {pandit.display_name}
                </VText>
                <VText
                  variant="caption"
                  weight="600"
                  color={isSelected ? "brandPrimary" : "textMuted"}
                  style={{ marginTop: 2 }}
                >
                  {formatCurrency(pandit.kundli_price)}
                </VText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {selectedPandit && (
          <View
            style={[
              styles.selectedPanditBanner,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                borderRadius: radii.sm,
                padding: spacing.sm,
                marginTop: spacing.sm,
              },
            ]}
          >
            <VText variant="caption" weight="600" color="brandPrimary">
              ✨ {selectedPandit.display_name} • {selectedPandit.experience_years || 5}+ yrs exp •{" "}
              {selectedPandit.kundli_turnaround_days || 3} days delivery
            </VText>
          </View>
        )}
      </VCard>

      {/* Birth Chart Data */}
      <VCard
        variant="default"
        elevation={1}
        style={[
          styles.sectionCard,
          {
            padding: spacing.md,
            gap: spacing.sm,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        ]}
      >
        <VText variant="titleMedium" weight="700" color="brandPrimary">
          2. Birth Information
        </VText>
        <VText variant="caption" color="textMuted" style={{ marginBottom: spacing.xs }}>
          Accurate birth time and coordinates are crucial for precise Vedic planetary calculations
        </VText>

        <VInput
          label="Date of Birth *"
          placeholder="YYYY-MM-DD (e.g. 1995-08-15)"
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          autoCapitalize="none"
        />

        <VInput
          label="Time of Birth *"
          placeholder="HH:MM:SS or HH:MM (e.g. 14:30:00)"
          value={timeOfBirth}
          onChangeText={setTimeOfBirth}
          autoCapitalize="none"
        />

        <VInput
          label="Place of Birth *"
          placeholder="City, State, Country (e.g. Varanasi, UP, India)"
          value={placeOfBirth}
          onChangeText={setPlaceOfBirth}
        />

        <VInput
          label="Questions / Specific Focus (Optional)"
          placeholder="e.g. Career progression, marriage compatibility, health..."
          value={additionalNotes}
          onChangeText={setAdditionalNotes}
          multiline
          numberOfLines={3}
        />
      </VCard>

      {/* Price & Summary */}
      <VCard
        variant="default"
        elevation={2}
        style={[
          styles.summaryCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderAccent,
            borderWidth: 1,
          },
        ]}
      >
        <VText variant="titleMedium" weight="700" color="brandPrimary" style={{ marginBottom: spacing.sm }}>
          3. Order Summary
        </VText>
        <View style={[styles.summaryRow, { paddingVertical: 4 }]}>
          <VText variant="bodyMedium" color="textMuted">
            Service
          </VText>
          <VText variant="bodyMedium" weight="600" color="textPrimary">
            Handwritten Vedic Kundli
          </VText>
        </View>
        <View style={[styles.summaryRow, { paddingVertical: 4 }]}>
          <VText variant="bodyMedium" color="textMuted">
            Selected Astrologer
          </VText>
          <VText variant="bodyMedium" weight="600" color="textPrimary">
            {selectedPandit?.display_name || "—"}
          </VText>
        </View>
        <View style={[styles.summaryRow, { paddingVertical: 4 }]}>
          <VText variant="bodyMedium" color="textMuted">
            Turnaround Time
          </VText>
          <VText variant="bodyMedium" color="textPrimary">
            {selectedPandit?.kundli_turnaround_days || 3} business days
          </VText>
        </View>
        <View
          style={[
            styles.summaryRow,
            styles.totalRow,
            {
              borderTopColor: colors.borderDefault,
              borderTopWidth: 1,
              marginTop: spacing.sm,
              paddingTop: spacing.sm,
            },
          ]}
        >
          <View>
            <VText variant="titleMedium" weight="700" color="textPrimary">
              Total (100% Upfront)
            </VText>
            <VText variant="caption" color="textMuted">
              Includes full report & chart scanning
            </VText>
          </View>
          <VText variant="headlineSmall" weight="700" color="brandPrimary">
            {formatCurrency(selectedPandit?.kundli_price || 0)}
          </VText>
        </View>
      </VCard>

      {formError ? (
        <View
          style={[
            styles.errorContainer,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.errorFg,
              borderWidth: 1,
              borderRadius: radii.sm,
              padding: spacing.sm,
            },
          ]}
        >
          <VText variant="caption" color="error">
            ⚠️ {formError}
          </VText>
        </View>
      ) : null}

      <VButton
        title={submitting ? "Creating Order..." : "Proceed to Payment"}
        variant="primary"
        size="lg"
        onPress={handleCreateOrder}
        disabled={submitting}
        style={{ minHeight: 48 }}
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 40,
  },
  sectionCard: {},
  panditPicker: {
    flexDirection: "row",
  },
  panditChip: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    minWidth: 80,
  },
  selectedPanditBanner: {},
  summaryCard: {},
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalRow: {},
  errorContainer: {},
});

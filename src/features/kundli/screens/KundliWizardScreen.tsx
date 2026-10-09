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
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  Input,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, typography } from "../../../shared/theme/index.ts";
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
    // Simple format validation for YYYY-MM-DD
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
      <ScreenContainer>
        <Header title="Create Kundli Order" onBack={() => navigation.goBack()} />
        <LoadingState message="Loading astrologer details..." />
      </ScreenContainer>
    );
  }

  if (panditsError) {
    return (
      <ScreenContainer>
        <Header title="Create Kundli Order" onBack={() => navigation.goBack()} />
        <ErrorState message={panditsError} />
      </ScreenContainer>
    );
  }

  if (pandits.length === 0) {
    return (
      <ScreenContainer>
        <Header title="Create Kundli Order" onBack={() => navigation.goBack()} />
        <EmptyState
          title="No Astrologers Available"
          description="No Kundli specialists are currently active. Please try again later."
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable padded={false}>
      <Header title="Vedic Kundli Details" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Astrologer Selection */}
        <Card style={styles.sectionCard}>
          <Text variant="h3" style={styles.sectionTitle}>
            1. Select Astrologer
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.sectionSubtitle}>
            Choose the Vedic scholar who will calculate and prepare your horoscope
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.panditPicker}>
            {pandits.map((pandit) => {
              const isSelected = selectedPandit?.id === pandit.id;
              return (
                <TouchableOpacity
                  key={pandit.id}
                  style={[
                    styles.panditChip,
                    isSelected && styles.panditChipSelected,
                  ]}
                  onPress={() => setSelectedPandit(pandit)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${pandit.display_name}`}
                >
                  <Text
                    style={[
                      styles.panditChipName,
                      isSelected && styles.panditChipNameSelected,
                    ]}
                  >
                    {pandit.display_name}
                  </Text>
                  <Text
                    style={[
                      styles.panditChipPrice,
                      isSelected && styles.panditChipPriceSelected,
                    ]}
                  >
                    {formatCurrency(pandit.kundli_price)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selectedPandit && (
            <View style={styles.selectedPanditBanner}>
              <Text variant="caption" color={colors.primary} style={styles.panditHighlight}>
                ✨ {selectedPandit.display_name} • {selectedPandit.experience_years || 5}+ yrs exp •{" "}
                {selectedPandit.kundli_turnaround_days || 3} days delivery
              </Text>
            </View>
          )}
        </Card>

        {/* Birth Chart Data */}
        <Card style={styles.sectionCard}>
          <Text variant="h3" style={styles.sectionTitle}>
            2. Birth Information
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.sectionSubtitle}>
            Accurate birth time and coordinates are crucial for precise Vedic planetary calculations
          </Text>

          <Input
            label="Date of Birth *"
            placeholder="YYYY-MM-DD (e.g. 1995-08-15)"
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            autoCapitalize="none"
          />

          <Input
            label="Time of Birth *"
            placeholder="HH:MM:SS or HH:MM (e.g. 14:30:00)"
            value={timeOfBirth}
            onChangeText={setTimeOfBirth}
            autoCapitalize="none"
          />

          <Input
            label="Place of Birth *"
            placeholder="City, State, Country (e.g. Varanasi, UP, India)"
            value={placeOfBirth}
            onChangeText={setPlaceOfBirth}
          />

          <Input
            label="Questions / Specific Focus (Optional)"
            placeholder="e.g. Career progression, marriage compatibility, health..."
            value={additionalNotes}
            onChangeText={setAdditionalNotes}
            multiline
            numberOfLines={3}
          />
        </Card>

        {/* Price & Summary */}
        <Card style={styles.summaryCard}>
          <Text variant="h3" style={styles.summaryTitle}>
            3. Order Summary
          </Text>
          <View style={styles.summaryRow}>
            <Text variant="body" color={colors.textSecondary}>
              Service
            </Text>
            <Text variant="body" style={styles.summaryBold}>
              Handwritten Vedic Kundli
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="body" color={colors.textSecondary}>
              Selected Astrologer
            </Text>
            <Text variant="body" style={styles.summaryBold}>
              {selectedPandit?.display_name || "—"}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="body" color={colors.textSecondary}>
              Turnaround Time
            </Text>
            <Text variant="body">
              {selectedPandit?.kundli_turnaround_days || 3} business days
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <View>
              <Text variant="h3">Total (100% Upfront)</Text>
              <Text variant="caption" color={colors.textTertiary}>
                Includes full report & chart scanning
              </Text>
            </View>
            <Text variant="h2" style={styles.totalPrice}>
              {formatCurrency(selectedPandit?.kundli_price || 0)}
            </Text>
          </View>
        </Card>

        {formError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {formError}</Text>
          </View>
        ) : null}

        <Button
          title={submitting ? "Creating Order..." : "Proceed to Payment"}
          onPress={handleCreateOrder}
          disabled={submitting}
          style={styles.submitBtn}
        />
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sectionCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    marginBottom: 2,
  },
  sectionSubtitle: {
    marginBottom: spacing.md,
  },
  panditPicker: {
    flexDirection: "row",
    marginBottom: spacing.sm,
  },
  panditChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    alignItems: "center",
  },
  panditChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  panditChipName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
  },
  panditChipNameSelected: {
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  panditChipPrice: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  panditChipPriceSelected: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  selectedPanditBanner: {
    backgroundColor: colors.primaryLight,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  panditHighlight: {
    fontWeight: typography.fontWeight.medium,
  },
  summaryCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.borderLight,
    borderWidth: 1,
  },
  summaryTitle: {
    marginBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  summaryBold: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  totalRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    alignItems: "center",
  },
  totalPrice: {
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  errorContainer: {
    backgroundColor: "#FFEBEE",
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    color: "#C62828",
    fontSize: typography.fontSize.sm,
  },
  submitBtn: {
    marginTop: spacing.xs,
  },
});

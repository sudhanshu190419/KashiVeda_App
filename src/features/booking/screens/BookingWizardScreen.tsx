// src/features/booking/screens/BookingWizardScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Button,
  Card,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency, formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { discoveryService, FetchPanditsOptions } from "../../discovery/services/discoveryService.ts";
import {
  PanditSummary,
  PujaService,
  SamagriItem,
  SamagriPackage,
} from "../../discovery/types/discovery.ts";
import {
  BookingDateSelector,
  BookingLocationSelector,
  BookingModeSelector,
  BookingPriceBreakdown,
  BookingTimeSlotSelector,
  PrasadSelector,
  SamagriSelector,
} from "../components/index.ts";
import { useBookingFlow } from "../hooks/useBookingFlow.ts";
import { bookingService } from "../services/bookingService.ts";
import { PrasadItem } from "../types/booking.types.ts";

type BookingWizardRouteProp = RouteProp<CustomerStackParamList, "BookingWizard">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const BookingWizardScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<BookingWizardRouteProp>();
  const { pujaId, panditId, serviceMode: routeMode } = route.params || {};

  const [puja, setPuja] = useState<PujaService | null>(null);
  const [samagriPackages, setSamagriPackages] = useState<SamagriPackage[]>([]);
  const [customCatalog, setCustomCatalog] = useState<SamagriItem[]>([]);
  const [prasadCatalog, setPrasadCatalog] = useState<PrasadItem[]>([]);
  const [panditsList, setPanditsList] = useState<PanditSummary[]>([]);
  const [loadingPandits, setLoadingPandits] = useState<boolean>(false);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  const booking = useBookingFlow({
    initialMode: routeMode,
  });

  const {
    currentStep,
    setCurrentStep,
    serviceMode,
    setServiceMode,
    selectedDate,
    setSelectedDate,
    selectedPandit,
    setSelectedPandit,
    selectedSlot,
    setSelectedSlot,
    selectedAddress,
    setSelectedAddress,
    selectedTemple,
    setSelectedTemple,
    samagriType,
    setSamagriType,
    selectedPackage,
    setSelectedPackage,
    customSamagri,
    updateCustomSamagriQty,
    prasadSelections,
    updatePrasadQty,
    estimatedPricing,
    submitting,
    submitError,
    submitBooking,
  } = booking;

  // Load initial catalog data (puja details, samagri packages, prasad)
  useEffect(() => {
    let isMounted = true;
    setLoadingInitial(true);
    setInitialError(null);

    const loadData = async () => {
      try {
        if (!pujaId) {
          throw new Error("Puja selection is required to begin booking.");
        }

        const [pujaRes, customSamagriRes, prasadRes] = await Promise.all([
          discoveryService.fetchPujaDetail(pujaId),
          bookingService.fetchCustomSamagriItems(),
          bookingService.fetchPrasadItems(),
        ]);

        if (isMounted) {
          setPuja(pujaRes.puja);
          setSamagriPackages(pujaRes.samagriPackages);
          setCustomCatalog(customSamagriRes);
          setPrasadCatalog(prasadRes);

          const resolvedMode =
            routeMode && pujaRes.puja.allowed_modes?.includes(routeMode)
              ? routeMode
              : pujaRes.puja.allowed_modes && pujaRes.puja.allowed_modes.length > 0
              ? pujaRes.puja.allowed_modes[0]
              : "home";

          setServiceMode(resolvedMode);

          if (resolvedMode !== "remote" && pujaRes.samagriPackages.length > 0) {
            setSelectedPackage(pujaRes.samagriPackages[0]);
          } else if (resolvedMode === "remote") {
            setSelectedPackage(null);
            setSamagriType("none");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setInitialError(err?.message || "Failed to load ritual booking details.");
        }
      } finally {
        if (isMounted) {
          setLoadingInitial(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [pujaId, routeMode, setSelectedPackage, setSamagriType, setServiceMode]);

  // Dynamically load eligible Pandits based on active format and selected temple/location
  useEffect(() => {
    if (!pujaId) return;
    let isMounted = true;
    setLoadingPandits(true);

    const loadPandits = async () => {
      try {
        const options: FetchPanditsOptions = {
          pujaServiceId: pujaId,
          serviceMode,
          limit: 30,
        };

        if (serviceMode === "temple" && selectedTemple?.id) {
          options.templeId = selectedTemple.id;
        } else if (serviceMode === "home" && selectedAddress?.latitude && selectedAddress?.longitude) {
          options.latitude = selectedAddress.latitude;
          options.longitude = selectedAddress.longitude;
        }

        const res = await discoveryService.fetchPandits(options);
        if (isMounted) {
          setPanditsList(res);

          // If panditId was passed in route parameters and exists in filtered results, select it
          if (panditId && !selectedPandit) {
            const matched = res.find((p) => p.id === panditId);
            if (matched) {
              setSelectedPandit(matched);
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load filtered pandits:", err);
      } finally {
        if (isMounted) {
          setLoadingPandits(false);
        }
      }
    };

    loadPandits();

    return () => {
      isMounted = false;
    };
  }, [pujaId, serviceMode, selectedTemple?.id, selectedAddress?.id, panditId, setSelectedPandit, selectedPandit]);

  type WizardStepKey = "mode" | "location" | "temple" | "pandit" | "slot" | "samagri" | "review";

  const isRemote = serviceMode === "remote";
  const isTemple = serviceMode === "temple";
  const isHome = serviceMode === "home";

  const hasPreselectedMode = useMemo(() => {
    if (!puja) return false;
    if (routeMode && puja.allowed_modes?.includes(routeMode)) {
      return true;
    }
    if (puja.allowed_modes && puja.allowed_modes.length === 1) {
      return true;
    }
    return false;
  }, [puja, routeMode]);

  const steps: WizardStepKey[] = useMemo(() => {
    const list: WizardStepKey[] = [];
    if (!hasPreselectedMode) {
      list.push("mode");
    }
    if (serviceMode === "home") {
      list.push("location", "pandit", "slot", "samagri", "review");
    } else if (serviceMode === "temple") {
      list.push("temple", "pandit", "slot", "samagri", "review");
    } else if (serviceMode === "remote") {
      list.push("pandit", "slot", "review");
    }
    return list;
  }, [hasPreselectedMode, serviceMode]);

  const totalSteps = steps.length;
  const currentStepKey: WizardStepKey = steps[currentStep - 1] || "review";

  const stepIndexOf = (key: WizardStepKey) => {
    const idx = steps.indexOf(key);
    return idx !== -1 ? idx + 1 : 1;
  };

  // Step Validation Logic
  const canProceed = useMemo(() => {
    switch (currentStepKey) {
      case "mode":
        return !!serviceMode;
      case "location":
        return !!selectedAddress;
      case "temple":
        return !!selectedTemple;
      case "pandit":
        return !!selectedPandit;
      case "slot":
        return !!selectedDate && !!selectedSlot;
      case "samagri":
        if (samagriType === "package") return !!selectedPackage;
        return true;
      case "review":
        return !submitting;
      default:
        return false;
    }
  }, [
    currentStepKey,
    serviceMode,
    selectedAddress,
    selectedTemple,
    selectedPandit,
    selectedDate,
    selectedSlot,
    samagriType,
    selectedPackage,
    submitting,
  ]);

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleFinalSubmit = async () => {
    if (!puja) return;

    try {
      const response = await submitBooking(puja.id);

      // Navigate to Payment screen with authoritative booking and payment order ID
      navigation.replace("BookingPayment", {
        bookingId: response.booking_id,
        paymentOrderId: response.payment_order_id,
        bookingNumber: response.booking_number,
        advanceAmount: response.advance_amount,
        pujaName: puja.name,
        panditName: selectedPandit?.display_name || "Acharya",
      });
    } catch (err: any) {
      const rawMsg = err?.message || "";
      let userFriendly = rawMsg;

      if (rawMsg.includes("conflicts with an existing confirmed booking") || rawMsg.includes("unavailable during the requested")) {
        userFriendly = "This time slot was just reserved. Please choose another time slot.";
        setCurrentStep(stepIndexOf("slot")); // Send back to slot selection
      } else if (rawMsg.includes("not authorized to perform rituals at the selected Temple")) {
        userFriendly = "The selected Pandit is not approved for this temple. Please choose another Acharya.";
        setCurrentStep(stepIndexOf("pandit")); // Send back to Pandit selection
      } else if (rawMsg.includes("outside the Pandit's active operational")) {
        userFriendly = "The selected Pandit does not cover this address area. Please choose another address or Pandit.";
        setCurrentStep(stepIndexOf(isTemple ? "temple" : "location"));
      }

      Alert.alert("Booking Notice", userFriendly);
    }
  };

  if (loadingInitial) {
    return (
      <ScreenContainer padded>
        <Header title="Schedule Ritual" onBack={() => navigation.goBack()} />
        <LoadingState message="Initializing sacred booking sanctum..." />
      </ScreenContainer>
    );
  }

  if (initialError || !puja) {
    return (
      <ScreenContainer padded>
        <Header title="Schedule Ritual" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Unable to Schedule"
          message={initialError || "Could not load ritual information."}
          onRetry={() => navigation.goBack()}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable padded>
      <Header
        title={puja.name}
        subtitle={`Step ${currentStep} of ${totalSteps}`}
        onBack={handleBack}
      />

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBarFill, { width: `${(currentStep / totalSteps) * 100}%` }]} />
      </View>

      {/* Mode Selection (Only rendered when mode is not pre-selected) */}
      {currentStepKey === "mode" && (
        <View style={styles.stepContent}>
          <BookingModeSelector
            selectedMode={serviceMode}
            allowedModes={puja.allowed_modes || ["home", "remote"]}
            modePrices={
              selectedPandit
                ? {
                    home: selectedPandit.home_price,
                    temple: selectedPandit.temple_price,
                    remote: selectedPandit.remote_price,
                  }
                : undefined
            }
            onSelectMode={(mode) => {
              setServiceMode(mode);
            }}
          />
        </View>
      )}

      {/* Home Address Selection */}
      {currentStepKey === "location" && (
        <View style={styles.stepContent}>
          <BookingLocationSelector
            serviceMode="home"
            selectedAddress={selectedAddress}
            onSelectAddress={(addr) => setSelectedAddress(addr)}
            selectedTemple={null}
            onSelectTemple={() => {}}
          />
        </View>
      )}

      {/* Temple Selection */}
      {currentStepKey === "temple" && (
        <View style={styles.stepContent}>
          <BookingLocationSelector
            serviceMode="temple"
            selectedAddress={null}
            onSelectAddress={() => {}}
            selectedTemple={selectedTemple}
            onSelectTemple={(tmpl) => setSelectedTemple(tmpl)}
          />
        </View>
      )}

      {/* Pandit Selection */}
      {currentStepKey === "pandit" && (
        <View style={styles.stepContent}>
          <Text variant="h3" style={styles.sectionTitle}>
            Choose Verified Acharya
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.sectionSubtitle}>
            {isTemple
              ? `Approved priests consecrated for ${puja.name} at ${selectedTemple?.name || "the selected temple"}.`
              : isHome
              ? `Priests serving your area for ${puja.name}.`
              : `Verified priests consecrated for remote ${puja.name} invocation.`}
          </Text>

          {loadingPandits ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="caption" color={colors.textSecondary} style={{ marginTop: 8 }}>
                Finding approved Acharyas...
              </Text>
            </View>
          ) : panditsList.length === 0 ? (
            <Card variant="outlined" style={styles.emptyPanditCard}>
              <Text variant="h3" style={{ textAlign: "center", marginBottom: 4 }}>
                🏛️ No Acharyas Available
              </Text>
              <Text variant="caption" color={colors.textSecondary} style={{ textAlign: "center" }}>
                {isTemple
                  ? `There are currently no approved priests offering ${puja.name} at ${selectedTemple?.name || "this temple"}. Please select another temple or try Home/Remote format.`
                  : `No priests currently cover this location for ${puja.name}. Please try another address or format.`}
              </Text>
            </Card>
          ) : (
            <View style={styles.panditList}>
              {panditsList.map((p) => {
                const isSelected = selectedPandit?.id === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => {
                      setSelectedPandit(p);
                      setSelectedSlot(null); // Reset slot since availability is Pandit-specific
                    }}
                    activeOpacity={0.7}
                  >
                    <Card
                      variant={isSelected ? "elevated" : "outlined"}
                      style={[styles.panditCard, isSelected && styles.panditCardSelected]}
                    >
                      <View style={styles.panditRow}>
                        <View style={styles.avatarCircle}>
                          <Text variant="h3" color={colors.primary}>
                            {p.display_name.charAt(0)}
                          </Text>
                        </View>
                        <View style={styles.panditInfo}>
                          <Text variant="bodyMedium">{p.display_name}</Text>
                          <Text variant="caption" color={colors.textSecondary}>
                            {p.years_experience ? `${p.years_experience} yrs exp • ` : ""}
                            {p.languages ? p.languages.join(", ") : "Sanskrit, Hindi"}
                          </Text>
                          {(() => {
                            const modePrice =
                              serviceMode === "home"
                                ? p.home_price
                                : serviceMode === "temple"
                                ? p.temple_price
                                : serviceMode === "remote"
                                ? p.remote_price
                                : p.puja_price;
                            return modePrice != null ? (
                              <Text variant="captionMedium" color={colors.primary} style={styles.priceTag}>
                                Dakshina: {formatCurrency(modePrice)}
                              </Text>
                            ) : null;
                          })()}
                        </View>
                        <View style={[styles.radioCircle, isSelected && styles.radioSelected]}>
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                      </View>
                    </Card>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Date & Time Slot Selection */}
      {currentStepKey === "slot" && (
        <View style={styles.stepContent}>
          <BookingDateSelector
            selectedDate={selectedDate}
            onSelectDate={(d) => {
              setSelectedDate(d);
              setSelectedSlot(null);
            }}
          />

          <BookingTimeSlotSelector
            panditId={selectedPandit?.id || ""}
            dateStr={selectedDate}
            durationMinutes={puja.default_duration_minutes || 60}
            selectedSlot={selectedSlot}
            onSelectSlot={setSelectedSlot}
          />
        </View>
      )}

      {/* Samagri & Prasad (Home & Temple only) */}
      {currentStepKey === "samagri" && (
        <View style={styles.stepContent}>
          <SamagriSelector
            serviceMode={serviceMode}
            samagriType={samagriType}
            onSelectSamagriType={setSamagriType}
            packages={samagriPackages}
            selectedPackage={selectedPackage}
            onSelectPackage={setSelectedPackage}
            customCatalog={customCatalog}
            customSelections={customSamagri}
            onUpdateCustomQty={updateCustomSamagriQty}
          />

          <PrasadSelector
            serviceMode={serviceMode}
            prasadCatalog={prasadCatalog}
            prasadSelections={prasadSelections}
            onUpdatePrasadQty={updatePrasadQty}
          />
        </View>
      )}

      {/* Review & Confirmation */}
      {currentStepKey === "review" && (
        <View style={styles.stepContent}>
          <Text variant="h3" style={styles.sectionTitle}>
            Review Your Sacred Sankalp
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.sectionSubtitle}>
            Please review the schedule and items before confirming your booking.
          </Text>

          {/* Booking Summary Card */}
          <Card variant="outlined" style={styles.reviewCard}>
            <View style={styles.reviewRow}>
              <Text variant="caption" color={colors.textSecondary}>Ritual</Text>
              <Text variant="bodyMedium">{puja.name}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text variant="caption" color={colors.textSecondary}>Acharya</Text>
              <Text variant="bodyMedium">{selectedPandit?.display_name || "Assigned Pandit"}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text variant="caption" color={colors.textSecondary}>Format</Text>
              <Text variant="bodyMedium" style={styles.formatText}>
                {serviceMode === "remote" ? "Online Puja" : serviceMode === "home" ? "Home Puja" : "Temple Puja"}
              </Text>
            </View>
            <View style={styles.reviewRow}>
              <Text variant="caption" color={colors.textSecondary}>Date & Time</Text>
              <Text variant="bodyMedium">
                {selectedSlot
                  ? `${formatDate(new Date(selectedSlot))} at ${formatTime(new Date(selectedSlot))}`
                  : "Not selected"}
              </Text>
            </View>
            <View style={styles.reviewRow}>
              <Text variant="caption" color={colors.textSecondary}>Location</Text>
              <Text variant="bodyMedium">
                {serviceMode === "home"
                  ? `${selectedAddress?.address_line1}, ${selectedAddress?.city}`
                  : serviceMode === "temple"
                  ? selectedTemple?.name || "Temple Sanctum"
                  : "Live Video Sanctum (LiveKit HD)"}
              </Text>
            </View>
            {!isRemote && (
              <View style={styles.reviewRow}>
                <Text variant="caption" color={colors.textSecondary}>Samagri</Text>
                <Text variant="bodyMedium">
                  {samagriType === "package"
                    ? selectedPackage?.name || "Standard Package"
                    : samagriType === "custom"
                    ? `${customSamagri.length} custom items`
                    : "Devotee Arranged"}
                </Text>
              </View>
            )}
            {!isRemote && prasadSelections.length > 0 ? (
              <View style={styles.reviewRow}>
                <Text variant="caption" color={colors.textSecondary}>Blessed Prasad</Text>
                <Text variant="bodyMedium">
                  {prasadSelections.map((p) => `${p.item.name} (${p.quantity})`).join(", ")}
                </Text>
              </View>
            ) : null}
          </Card>

          {/* Pricing Breakdown */}
          <BookingPriceBreakdown
            pujaPrice={estimatedPricing.basePrice}
            samagriTotal={estimatedPricing.samagriTotal}
            prasadTotal={estimatedPricing.prasadTotal}
            totalAmount={estimatedPricing.total}
            advanceAmount={estimatedPricing.advanceAmount}
            balanceAmount={estimatedPricing.balanceAmount}
            serviceMode={serviceMode}
          />

          {submitError ? (
            <Card style={styles.errorBox}>
              <Text variant="caption" color={colors.error}>
                {submitError}
              </Text>
            </Card>
          ) : null}
        </View>
      )}

      {/* Navigation Buttons */}
      <View style={styles.footerActions}>
        {currentStep < totalSteps ? (
          <Button
            title="Continue to Next Step"
            variant="primary"
            size="lg"
            disabled={!canProceed}
            onPress={handleNext}
          />
        ) : (
          <Button
            title={submitting ? "Securing Sacred Slot..." : `Confirm & Pay Advance (${formatCurrency(estimatedPricing.advanceAmount)})`}
            variant="primary"
            size="lg"
            disabled={!canProceed || submitting}
            onPress={handleFinalSubmit}
          />
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  progressBarContainer: {
    height: 4,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
    marginVertical: spacing.sm,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  stepContent: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.xxs,
  },
  sectionSubtitle: {
    marginBottom: spacing.md,
  },
  loaderWrap: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPanditCard: {
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  panditList: {
    gap: spacing.sm,
  },
  panditCard: {
    padding: spacing.md,
  },
  panditCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: "#FFF8F6",
  },
  panditRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  panditInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  priceTag: {
    marginTop: spacing.xxs,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  reviewCard: {
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  footerActions: {
    marginVertical: spacing.xl,
  },
  formatText: {
    textTransform: "capitalize",
  },
});

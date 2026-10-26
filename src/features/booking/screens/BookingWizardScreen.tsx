// src/features/booking/screens/BookingWizardScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  StepProgress,
  StepItem,
  VCard,
  VText,
  VButton,
  VAvatar,
  EscrowBadge,
  EmptyState,
} from "../../../shared/components/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
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

type WizardStepKey = "mode" | "location" | "temple" | "pandit" | "slot" | "samagri" | "review";

export const BookingWizardScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<BookingWizardRouteProp>();
  const { pujaId, panditId, serviceMode: routeMode } = route.params || {};

  const { colors, spacing, radii } = useTheme();
  const { language, pick } = useLanguage();

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

  const stepItems: StepItem[] = useMemo(() => {
    return steps.map((key) => {
      switch (key) {
        case "mode":
          return { title: "Format", titleHi: "प्रारूप" };
        case "location":
          return { title: "Address", titleHi: "स्थान" };
        case "temple":
          return { title: "Temple", titleHi: "मंदिर" };
        case "pandit":
          return { title: "Acharya", titleHi: "आचार्य" };
        case "slot":
          return { title: "Muhurat", titleHi: "मुहूर्त" };
        case "samagri":
          return { title: "Offerings", titleHi: "सामग्री" };
        case "review":
          return { title: "Review", titleHi: "संकल्प" };
      }
    });
  }, [steps]);

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
        isFullPayment: response.balance_amount === 0,
        totalAmount: response.total_amount,
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
      <ScreenWrapper
        safeArea="all"
        scrollable={false}
        headerComponent={
          <AppBar
            title={pick("अनुष्ठान निर्धारण", "Schedule Ritual")}
            showBackButton={true}
            onBackPress={() => navigation.goBack()}
          />
        }
      >
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <VText variant="bodyMedium" color="textMuted" style={{ marginTop: spacing.md }}>
            {pick("वैदिक संकल्प कक्ष तैयार किया जा रहा है...", "Initializing sacred booking sanctum...")}
          </VText>
        </View>
      </ScreenWrapper>
    );
  }

  if (initialError || !puja) {
    return (
      <ScreenWrapper
        safeArea="all"
        scrollable={false}
        headerComponent={
          <AppBar
            title={pick("अनुष्ठान निर्धारण", "Schedule Ritual")}
            showBackButton={true}
            onBackPress={() => navigation.goBack()}
          />
        }
      >
        <EmptyState
          title={pick("अनुष्ठान लोड नहीं हो सका", "Unable to Schedule")}
          description={initialError || "Could not load ritual information."}
          actionTitle={pick("वापस जाएं", "Go Back")}
          onAction={() => navigation.goBack()}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper
      safeArea="all"
      scrollable={true}
      headerComponent={
        <AppBar
          title={puja.name}
          subtitle={`Step ${currentStep} of ${totalSteps}`}
          showBackButton={true}
          onBackPress={handleBack}
        />
      }
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxl }}
    >
      {/* Visual Step Nodes Progress */}
      <View style={{ marginVertical: spacing.md }}>
        <StepProgress
          steps={stepItems}
          currentStep={currentStep - 1}
          variant="nodes"
        />
      </View>

      {/* Mode Selection (Only rendered when mode is not pre-selected) */}
      {currentStepKey === "mode" && (
        <View style={styles.stepContent}>
          <VText variant="headlineMedium" color="textPrimary" style={styles.sectionTitle}>
            Select Service Format
          </VText>
          <VText variant="caption" color="textMuted" style={styles.sectionSubtitle}>
            {pick("पूजा का स्वरूप एवं स्थान चुनें", "Choose how you would like to participate in this sacred ritual")}
          </VText>
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
          <VText variant="headlineMedium" color="textPrimary" style={styles.sectionTitle}>
            Choose Verified Acharya
          </VText>
          <VText variant="caption" color="textMuted" style={styles.sectionSubtitle}>
            {isTemple
              ? `Approved priests consecrated for ${puja.name} at ${selectedTemple?.name || "the selected temple"}.`
              : isHome
              ? `Priests serving your area for ${puja.name}.`
              : `Verified priests consecrated for remote ${puja.name} invocation.`}
          </VText>

          {loadingPandits ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="small" color={colors.brandPrimary} />
              <VText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
                {pick("सत्यापित आचार्यों की खोज जारी...", "Finding approved Acharyas...")}
              </VText>
            </View>
          ) : panditsList.length === 0 ? (
            <VCard variant="outlined" style={styles.emptyPanditCard}>
              <VText variant="titleMedium" color="textPrimary" align="center" style={{ marginBottom: spacing.xs }}>
                🏛️ {pick("कोई आचार्य उपलब्ध नहीं", "No Acharyas Available")}
              </VText>
              <VText variant="caption" color="textMuted" align="center">
                {isTemple
                  ? `There are currently no approved priests offering ${puja.name} at ${selectedTemple?.name || "this temple"}. Please select another temple or try Home/Remote format.`
                  : `No priests currently cover this location for ${puja.name}. Please try another address or format.`}
              </VText>
            </VCard>
          ) : (
            <View style={styles.panditList}>
              {panditsList.map((p) => {
                const isSelected = selectedPandit?.id === p.id;
                const modePrice =
                  serviceMode === "home"
                    ? p.home_price
                    : serviceMode === "temple"
                    ? p.temple_price
                    : serviceMode === "remote"
                    ? p.remote_price
                    : p.puja_price;

                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => {
                      setSelectedPandit(p);
                      setSelectedSlot(null); // Reset slot since availability is Pandit-specific
                    }}
                    activeOpacity={0.7}
                    style={{ minHeight: 48 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <VCard
                      variant={isSelected ? "default" : "outlined"}
                      elevation={isSelected ? 2 : 0}
                      style={[
                        styles.panditCard,
                        isSelected && {
                          borderColor: colors.brandPrimary,
                          borderWidth: 2,
                          backgroundColor: colors.surfaceSubtle,
                        },
                      ]}
                    >
                      <View style={styles.panditRow}>
                        <VAvatar
                          name={p.display_name}
                          uri={p.avatar_url || undefined}
                          size="md"
                          style={{ marginRight: spacing.md }}
                        />
                        <View style={styles.panditInfo}>
                          <VText variant="titleMedium" color="textPrimary">
                            {p.display_name}
                          </VText>
                          <VText variant="caption" color="textMuted">
                            {p.years_experience ? `${p.years_experience} yrs exp • ` : ""}
                            {p.languages ? p.languages.join(", ") : "Sanskrit, Hindi"}
                          </VText>
                          {modePrice != null ? (
                            <VText variant="labelMedium" color="brandPrimary" style={styles.priceTag}>
                              Dakshina: {formatCurrency(modePrice)}
                            </VText>
                          ) : (
                            <VText variant="caption" color="textMuted" style={styles.priceTag}>
                              {pick("परामर्शानुसार दक्षिणा", "Dakshina on booking")}
                            </VText>
                          )}
                        </View>
                        <View
                          style={[
                            styles.radioCircle,
                            { borderColor: isSelected ? colors.brandPrimary : colors.borderDefault },
                          ]}
                        >
                          {isSelected && (
                            <View style={[styles.radioInner, { backgroundColor: colors.brandPrimary }]} />
                          )}
                        </View>
                      </View>
                    </VCard>
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
          <VText variant="headlineMedium" color="textPrimary" style={styles.sectionTitle}>
            Review Your Sacred Sankalp
          </VText>
          <VText variant="caption" color="textMuted" style={styles.sectionSubtitle}>
            {pick(
              "कृपया अनुष्ठान व दक्षिणा विवरण की पुष्टि करें।",
              "Please review the schedule and items before confirming your booking."
            )}
          </VText>

          {/* Booking Summary Card */}
          <VCard variant="outlined" style={styles.reviewCard}>
            <View style={styles.reviewRow}>
              <VText variant="caption" color="textMuted">Ritual</VText>
              <VText variant="bodyMedium" weight="600">{puja.name}</VText>
            </View>
            <View style={styles.reviewRow}>
              <VText variant="caption" color="textMuted">Acharya</VText>
              <VText variant="bodyMedium" weight="600">{selectedPandit?.display_name || "Assigned Pandit"}</VText>
            </View>
            <View style={styles.reviewRow}>
              <VText variant="caption" color="textMuted">Format</VText>
              <VText variant="bodyMedium" style={styles.formatText}>
                {serviceMode === "remote" ? "Online Puja" : serviceMode === "home" ? "Home Puja" : "Temple Puja"}
              </VText>
            </View>
            <View style={styles.reviewRow}>
              <VText variant="caption" color="textMuted">Date & Time</VText>
              <VText variant="bodyMedium">
                {selectedSlot
                  ? `${formatDate(new Date(selectedSlot))} at ${formatTime(new Date(selectedSlot))}`
                  : "Not selected"}
              </VText>
            </View>
            <View style={styles.reviewRow}>
              <VText variant="caption" color="textMuted">Location</VText>
              <VText variant="bodyMedium">
                {serviceMode === "home"
                  ? `${selectedAddress?.address_line1}, ${selectedAddress?.city}`
                  : serviceMode === "temple"
                  ? selectedTemple?.name || "Temple Sanctum"
                  : "Live Video Sanctum (LiveKit HD)"}
              </VText>
            </View>
            {!isRemote && (
              <View style={styles.reviewRow}>
                <VText variant="caption" color="textMuted">Samagri</VText>
                <VText variant="bodyMedium">
                  {samagriType === "package"
                    ? selectedPackage?.name || "Standard Package"
                    : samagriType === "custom"
                    ? `${customSamagri.length} custom items`
                    : "Devotee Arranged"}
                </VText>
              </View>
            )}
            {!isRemote && prasadSelections.length > 0 ? (
              <View style={styles.reviewRow}>
                <VText variant="caption" color="textMuted">Blessed Prasad</VText>
                <VText variant="bodyMedium">
                  {prasadSelections.map((p) => `${p.item.name} (${p.quantity})`).join(", ")}
                </VText>
              </View>
            ) : null}
          </VCard>

          {/* 50% RBI Escrow Model Guarantee Badge */}
          <View style={{ marginVertical: spacing.sm }}>
            <EscrowBadge
              status="payment_pending"
              amountInr={estimatedPricing.advanceAmount}
              message={pick(
                "50% एस्क्रो सुरक्षा: पूर्णाहूति सत्यापन के उपरांत ही दक्षिणा आचार्य को अंतरित होगी।",
                "50% Escrow Protection: Released only after verified Vedic Purnahuti."
              )}
            />
          </View>

          {/* 24-Hour Notice */}
          {estimatedPricing.isWithin24Hours && (
            <VCard
              variant="outlined"
              style={[
                styles.within24hNoticeCard,
                {
                  backgroundColor: colors.warningBg,
                  borderColor: colors.warningFg,
                },
              ]}
            >
              <VText variant="labelMedium" color="warningFg" style={styles.within24hNoticeText}>
                ⚠️ This ritual is scheduled within 24 hours. Full payment is required when booking.
              </VText>
            </VCard>
          )}

          {/* Pricing Breakdown */}
          <BookingPriceBreakdown
            pujaPrice={estimatedPricing.basePrice}
            samagriTotal={estimatedPricing.samagriTotal}
            prasadTotal={estimatedPricing.prasadTotal}
            totalAmount={estimatedPricing.total}
            advanceAmount={estimatedPricing.advanceAmount}
            balanceAmount={estimatedPricing.balanceAmount}
            serviceMode={serviceMode}
            isWithin24Hours={estimatedPricing.isWithin24Hours}
          />

          {submitError ? (
            <VCard
              variant="outlined"
              style={[
                styles.errorBox,
                {
                  backgroundColor: colors.errorBg,
                  borderColor: colors.statusAlert,
                },
              ]}
            >
              <VText variant="caption" color="error">
                {submitError}
              </VText>
            </VCard>
          ) : null}
        </View>
      )}

      {/* Navigation Buttons */}
      <View style={styles.footerActions}>
        {currentStep < totalSteps ? (
          <VButton
            title="Continue to Next Step"
            label="Continue to Next Step"
            variant="primary"
            size="lg"
            isDisabled={!canProceed}
            onPress={handleNext}
            fullWidth
            style={{ minHeight: 48 }}
          />
        ) : (
          <VButton
            title={
              submitting
                ? "Securing Sacred Slot..."
                : estimatedPricing.isWithin24Hours
                ? "Confirm & Pay Full Amount"
                : `Confirm & Pay Advance (${formatCurrency(estimatedPricing.advanceAmount)})`
            }
            label={
              submitting
                ? "Securing Sacred Slot..."
                : estimatedPricing.isWithin24Hours
                ? "Confirm & Pay Full Amount"
                : `Confirm & Pay Advance (${formatCurrency(estimatedPricing.advanceAmount)})`
            }
            variant="primary"
            size="lg"
            isDisabled={!canProceed || submitting}
            isLoading={submitting}
            onPress={handleFinalSubmit}
            fullWidth
            style={{ minHeight: 48 }}
          />
        )}
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  stepContent: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  sectionSubtitle: {
    marginBottom: 16,
  },
  loaderWrap: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  emptyPanditCard: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  panditList: {
    gap: 12,
  },
  panditCard: {
    padding: 16,
  },
  panditRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  panditInfo: {
    flex: 1,
    marginRight: 8,
  },
  priceTag: {
    marginTop: 4,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  reviewCard: {
    padding: 16,
    gap: 10,
    marginBottom: 12,
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorBox: {
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
  },
  within24hNoticeCard: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  within24hNoticeText: {
    lineHeight: 18,
  },
  footerActions: {
    marginVertical: 24,
  },
  formatText: {
    textTransform: "capitalize",
  },
});

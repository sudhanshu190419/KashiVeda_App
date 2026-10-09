// src/features/booking/hooks/useBookingFlow.ts
import { useCallback, useMemo, useState } from "react";
import {
  PanditSummary,
  PujaService,
  SamagriItem,
  SamagriPackage,
  ServiceMode,
} from "../../discovery/types/discovery.ts";
import { bookingService } from "../services/bookingService.ts";
import {
  CreateBookingResponse,
  CustomerAddress,
  PrasadItem,
  Temple,
} from "../types/booking.types.ts";

export interface CustomSamagriSelection {
  item: SamagriItem;
  quantity: number;
}

export interface PrasadSelection {
  item: PrasadItem;
  quantity: number;
}

export interface UseBookingFlowProps {
  initialPuja?: PujaService;
  initialPandit?: PanditSummary;
  initialMode?: ServiceMode;
}

export const useBookingFlow = ({
  initialPuja,
  initialPandit,
  initialMode,
}: UseBookingFlowProps = {}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [serviceMode, setServiceModeState] = useState<ServiceMode>(initialMode || "home");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedPandit, setSelectedPandit] = useState<PanditSummary | null>(initialPandit || null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddressState] = useState<CustomerAddress | null>(null);
  const [selectedTemple, setSelectedTempleState] = useState<Temple | null>(null);

  const [samagriType, setSamagriType] = useState<"none" | "package" | "custom">(
    initialMode === "remote" ? "none" : "package"
  );
  const [selectedPackage, setSelectedPackage] = useState<SamagriPackage | null>(null);
  const [customSamagri, setCustomSamagri] = useState<CustomSamagriSelection[]>([]);
  const [prasadSelections, setPrasadSelections] = useState<PrasadSelection[]>([]);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setServiceMode = useCallback((mode: ServiceMode) => {
    setServiceModeState(mode);
    setSelectedPandit(null);
    setSelectedSlot(null);
    if (mode === "remote") {
      setSamagriType("none");
      setSelectedPackage(null);
      setCustomSamagri([]);
      setPrasadSelections([]);
      setSelectedAddress(null);
      setSelectedTemple(null);
    } else if (mode === "home") {
      setSelectedTemple(null);
    } else if (mode === "temple") {
      setSelectedAddress(null);
    }
  }, []);

  const setSelectedTemple = useCallback((temple: Temple | null) => {
    setSelectedTempleState(temple);
    setSelectedPandit(null);
    setSelectedSlot(null);
  }, []);

  const setSelectedAddress = useCallback((address: CustomerAddress | null) => {
    setSelectedAddressState(address);
    setSelectedPandit(null);
    setSelectedSlot(null);
  }, []);

  // Informational display calculation (authoritative final total is determined server-side by RPC)
  const estimatedPricing = useMemo(() => {
    let basePrice = 0;
    if (selectedPandit) {
      if (serviceMode === "home" && selectedPandit.home_price != null) {
        basePrice = selectedPandit.home_price;
      } else if (serviceMode === "temple" && selectedPandit.temple_price != null) {
        basePrice = selectedPandit.temple_price;
      } else if (serviceMode === "remote" && selectedPandit.remote_price != null) {
        basePrice = selectedPandit.remote_price;
      } else {
        basePrice = selectedPandit.puja_price || 0;
      }
    } else if (initialPuja?.starting_price) {
      basePrice = initialPuja.starting_price;
    }

    let samagriTotal = 0;
    // Remote Puja strictly incurs 0 Samagri charges (no packages or custom items allowed)
    if (serviceMode !== "remote") {
      if (samagriType === "package" && selectedPackage) {
        if (selectedPackage.items && selectedPackage.items.length > 0) {
          samagriTotal = selectedPackage.items.reduce(
            (sum, pi) => sum + pi.quantity * (pi.item.unit_price || 0),
            0
          );
        }
      } else if (samagriType === "custom") {
        samagriTotal = customSamagri.reduce(
          (sum, cs) => sum + cs.quantity * (cs.item.unit_price || 0),
          0
        );
      }
    }

    const prasadTotal =
      serviceMode !== "remote"
        ? prasadSelections.reduce(
            (sum, p) => sum + p.quantity * (p.item.unit_price || 0),
            0
          )
        : 0;

    const total = basePrice + samagriTotal + prasadTotal;

    // Canonical mode-specific estimated advance calculation (Home: 10%, Remote: 50%, Temple: 10%)
    let advancePercent = 10;
    if (serviceMode === "remote") {
      advancePercent = 50;
    } else if (serviceMode === "temple") {
      advancePercent = 10;
    }

    const advanceAmount =
      Math.round(
        ((basePrice * advancePercent) / 100 + samagriTotal + prasadTotal) * 100
      ) / 100;
    const balanceAmount = Math.max(0, total - advanceAmount);

    return {
      basePrice,
      samagriTotal,
      prasadTotal,
      total,
      advanceAmount,
      balanceAmount,
      advancePercent,
    };
  }, [
    selectedPandit,
    initialPuja,
    samagriType,
    selectedPackage,
    customSamagri,
    prasadSelections,
    serviceMode,
  ]);

  const updateCustomSamagriQty = useCallback((item: SamagriItem, quantity: number) => {
    setCustomSamagri((prev) => {
      const existingIdx = prev.findIndex((p) => p.item.id === item.id);
      if (quantity <= 0) {
        return prev.filter((p) => p.item.id !== item.id);
      }
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { item, quantity };
        return updated;
      }
      return [...prev, { item, quantity }];
    });
  }, []);

  const updatePrasadQty = useCallback((item: PrasadItem, quantity: number) => {
    setPrasadSelections((prev) => {
      const existingIdx = prev.findIndex((p) => p.item.id === item.id);
      if (quantity <= 0) {
        return prev.filter((p) => p.item.id !== item.id);
      }
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { item, quantity };
        return updated;
      }
      return [...prev, { item, quantity }];
    });
  }, []);

  /**
   * Submit authoritative booking request to PostgreSQL create_or_validate_booking RPC.
   */
  const submitBooking = useCallback(
    async (pujaServiceId?: string): Promise<CreateBookingResponse> => {
      const targetPujaId = pujaServiceId || initialPuja?.id;
      if (!targetPujaId) {
        throw new Error("Puja service is required.");
      }

      if (submitting) {
        throw new Error("Booking request is already being processed.");
      }

      if (!selectedPandit) {
        throw new Error("Please select a verified Pandit.");
      }

      if (!selectedSlot) {
        throw new Error("Please select an available date and time slot.");
      }

      if (serviceMode === "home" && !selectedAddress) {
        throw new Error("Customer address is required for Home rituals.");
      }

      if (serviceMode === "temple" && !selectedTemple) {
        throw new Error("Temple selection is required for Temple rituals.");
      }

      setSubmitting(true);
      setSubmitError(null);

      try {
        // Remote Puja strictly forbids Samagri packages, custom items, and Prasad
        const isRemote = serviceMode === "remote";

        const customItemIds =
          !isRemote && samagriType === "custom" && customSamagri.length > 0
            ? customSamagri.map((c) => c.item.id)
            : null;
        const customItemQtys =
          !isRemote && samagriType === "custom" && customSamagri.length > 0
            ? customSamagri.map((c) => c.quantity)
            : null;
        const samagriPackageId =
          !isRemote && samagriType === "package" ? selectedPackage?.id : null;

        const prasadItemIds =
          !isRemote && prasadSelections.length > 0
            ? prasadSelections.map((p) => p.item.id)
            : null;
        const prasadItemQtys =
          !isRemote && prasadSelections.length > 0
            ? prasadSelections.map((p) => p.quantity)
            : null;

        const result = await bookingService.createOrValidateBooking({
          pandit_id: selectedPandit.id,
          puja_service_id: targetPujaId,
          service_mode: serviceMode,
          scheduled_start_at: selectedSlot,
          address_id: serviceMode === "home" ? selectedAddress?.id : null,
          temple_id: serviceMode === "temple" ? selectedTemple?.id : null,
          samagri_package_id: samagriPackageId,
          custom_samagri_item_ids: customItemIds,
          custom_samagri_quantities: customItemQtys,
          prasad_item_ids: prasadItemIds,
          prasad_quantities: prasadItemQtys,
        });

        return result;
      } catch (err: any) {
        const msg = err?.message || "Failed to create booking. Please try again.";
        setSubmitError(msg);
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      selectedPandit,
      selectedSlot,
      serviceMode,
      selectedAddress,
      selectedTemple,
      samagriType,
      selectedPackage,
      customSamagri,
      prasadSelections,
    ]
  );

  return {
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
  };
};

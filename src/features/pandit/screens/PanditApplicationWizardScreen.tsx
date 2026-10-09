// src/features/pandit/screens/PanditApplicationWizardScreen.tsx
import React, { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  Button,
  Card,
  Header,
  Input,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { useAuth } from "../../auth/AuthContext.tsx";
import { Temple } from "../../booking/types/booking.types.ts";
import { panditApplicationService } from "../services/panditApplicationService.ts";
import { panditTempleService } from "../services/panditTempleService.ts";
import {
  AvailablePujaService,
  PanditApplicationDocument,
  PanditApplicationDocumentType,
  ServiceModePrices,
} from "../types/application.ts";

export interface ModePriceInput {
  home?: string;
  temple?: string;
  remote?: string;
  homeEnabled?: boolean;
  templeEnabled?: boolean;
  remoteEnabled?: boolean;
}

const VEDIC_LANGUAGES = [
  "Sanskrit",
  "Hindi",
  "English",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Tamil",
  "Telugu",
  "Kannada",
  "Odia",
];

const SAMPRADAYAS = [
  "Smarta",
  "Vaishnava (Ramanuja)",
  "Vaishnava (Gaudiya)",
  "Shaiva (Kashmir/Siddhanta)",
  "Shakta",
  "Vedic Srauta",
  "Other Sanatana Tradition",
];

const SACRED_HUBS = [
  { name: "Assi Ghat, Varanasi", label: "Assi Ghat, Varanasi", city: "Varanasi", address: "Assi Ghat Sacred Kshetra, Varanasi", lat: 25.2890, lng: 82.9994, latitude: 25.2890, longitude: 82.9994 },
  { name: "Kashi Vishwanath, Godowlia", label: "Kashi Vishwanath, Godowlia", city: "Varanasi", address: "Kashi Vishwanath Sanctum, Godowlia, Varanasi", lat: 25.3109, lng: 83.0104, latitude: 25.3109, longitude: 83.0104 },
  { name: "Dashashwamedh Ghat", label: "Dashashwamedh Ghat", city: "Varanasi", address: "Dashashwamedh Ghat, Varanasi", lat: 25.3072, lng: 83.0108, latitude: 25.3072, longitude: 83.0108 },
  { name: "Sigra / Cantt, Varanasi", label: "Sigra / Cantt, Varanasi", city: "Varanasi", address: "Sigra Central Area, Varanasi", lat: 25.3216, lng: 82.9872, latitude: 25.3216, longitude: 82.9872 },
  { name: "Sarnath, Varanasi", label: "Sarnath, Varanasi", city: "Varanasi", address: "Sarnath Dharmarajika Kshetra, Varanasi", lat: 25.3762, lng: 83.0227, latitude: 25.3762, longitude: 83.0227 },
  { name: "Ram Janmabhoomi, Ayodhya", label: "Ram Janmabhoomi, Ayodhya", city: "Ayodhya", address: "Ram Janmabhoomi Marg, Ayodhya", lat: 26.7956, lng: 82.1944, latitude: 26.7956, longitude: 82.1944 },
  { name: "Har Ki Pauri, Haridwar", label: "Har Ki Pauri, Haridwar", city: "Haridwar", address: "Har Ki Pauri, Haridwar", lat: 29.9567, lng: 78.1707, latitude: 29.9567, longitude: 78.1707 },
];

export const PanditApplicationWizardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, profile } = useAuth();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [existingAppId, setExistingAppId] = useState<string | null>(null);

  // Step 1: Personal
  const [fullName, setFullName] = useState<string>("");
  const [dob, setDob] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  // Step 2: Professional
  const [bio, setBio] = useState<string>("");
  const [experienceYears, setExperienceYears] = useState<string>("");
  const [languages, setLanguages] = useState<string[]>(["Sanskrit", "Hindi"]);
  const [vedicTradition, setVedicTradition] = useState<string>("Smarta");

  // Step 3: Coverage & Services
  const [primaryCity, setPrimaryCity] = useState<string>("Varanasi");
  const [baseAddress, setBaseAddress] = useState<string>("");
  const [baseLatitude, setBaseLatitude] = useState<string>("");
  const [baseLongitude, setBaseLongitude] = useState<string>("");
  const [serviceRadiusKm, setServiceRadiusKm] = useState<string>("25");
  const [availablePujas, setAvailablePujas] = useState<AvailablePujaService[]>([]);
  const [selectedPujaIds, setSelectedPujaIds] = useState<string[]>([]);
  const [activeTemples, setActiveTemples] = useState<Temple[]>([]);
  const [selectedTempleIds, setSelectedTempleIds] = useState<string[]>([]);
  const [pujaPrices, setPujaPrices] = useState<Record<string, ModePriceInput>>({});
  const [kundliEnabled, setKundliEnabled] = useState<boolean>(false);
  const [kundliPrice, setKundliPrice] = useState<string>("");
  const [kundliTurnaroundDays, setKundliTurnaroundDays] = useState<string>("3");

  // Step 4: Documents
  const [documents, setDocuments] = useState<PanditApplicationDocument[]>([]);

  // Step 5: Review
  const [isAffirmed, setIsAffirmed] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      if (!user?.id) return;
      try {
        setIsLoading(true);

        // 1. Fetch available pujas & active temples in parallel
        const [pujas, temples] = await Promise.all([
          panditApplicationService.fetchAvailablePujas(),
          panditTempleService.fetchActiveTemples(),
        ]);
        if (isMounted) {
          setAvailablePujas(pujas);
          setActiveTemples(temples);
        }

        // 2. Fetch existing application if user previously started one
        const app = await panditApplicationService.fetchMyApplication(user.id);
        if (isMounted && app) {
          setExistingAppId(app.id);
          setFullName(app.full_name || profile?.display_name || "");
          setDob(app.date_of_birth || "");
          setPhone(app.phone || profile?.phone || "");
          setEmail(app.email || profile?.email || "");
          setBio(app.bio || "");
          setExperienceYears(app.years_experience ? String(app.years_experience) : "5");
          if (app.languages && app.languages.length > 0) {
            setLanguages(app.languages);
          }
          if (app.vedic_tradition) {
            setVedicTradition(app.vedic_tradition);
          }
          if (app.primary_city) {
            setPrimaryCity(app.primary_city);
          }
          if (app.base_address) {
            setBaseAddress(app.base_address);
          }
          if (app.base_latitude != null) {
            setBaseLatitude(String(app.base_latitude));
          }
          if (app.base_longitude != null) {
            setBaseLongitude(String(app.base_longitude));
          }
          if (app.service_radius_km) {
            setServiceRadiusKm(String(app.service_radius_km));
          }
          if (app.selected_puja_ids && app.selected_puja_ids.length > 0) {
            setSelectedPujaIds(app.selected_puja_ids);
          }
          if (app.puja_prices && Object.keys(app.puja_prices).length > 0) {
            const initialPrices: Record<string, ModePriceInput> = {};
            Object.entries(app.puja_prices).forEach(([id, val]) => {
              if (typeof val === "object" && val !== null) {
                const sp = val as ServiceModePrices;
                initialPrices[id] = {
                  home: sp.home != null ? String(sp.home) : "",
                  temple: sp.temple != null ? String(sp.temple) : "",
                  remote: sp.remote != null ? String(sp.remote) : "",
                  homeEnabled: sp.home != null,
                  templeEnabled: sp.temple != null,
                  remoteEnabled: sp.remote != null,
                };
              } else if (typeof val === "number" || typeof val === "string") {
                initialPrices[id] = {
                  home: String(val),
                  temple: String(val),
                  remote: String(val),
                  homeEnabled: true,
                  templeEnabled: true,
                  remoteEnabled: true,
                };
              }
            });
            setPujaPrices(initialPrices);
          }
          if (app.kundli_enabled != null) {
            setKundliEnabled(Boolean(app.kundli_enabled));
          }
          if (app.kundli_price != null) {
            setKundliPrice(String(app.kundli_price));
          }
          if (app.kundli_turnaround_days != null) {
            setKundliTurnaroundDays(String(app.kundli_turnaround_days));
          }
          if (app.documents && app.documents.length > 0) {
            setDocuments(app.documents);
          }
          if (app.selected_temple_ids && app.selected_temple_ids.length > 0) {
            setSelectedTempleIds(app.selected_temple_ids);
          }
        } else if (isMounted) {
          setFullName(profile?.display_name || "");
          setPhone(profile?.phone || "");
          setEmail(profile?.email || "");
        }
      } catch (err) {
        console.warn("Could not load initial application data:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [user?.id, profile]);

  const toggleLanguage = (lang: string) => {
    if (languages.includes(lang)) {
      if (languages.length > 1) {
        setLanguages(languages.filter((l) => l !== lang));
      } else {
        Alert.alert("Required", "Please keep at least one ritual language selected.");
      }
    } else {
      setLanguages([...languages, lang]);
    }
  };

  const toggleTemple = (templeId: string) => {
    if (selectedTempleIds.includes(templeId)) {
      setSelectedTempleIds(selectedTempleIds.filter((id) => id !== templeId));
    } else {
      setSelectedTempleIds([...selectedTempleIds, templeId]);
    }
  };

  const togglePuja = (pujaId: string) => {
    if (selectedPujaIds.includes(pujaId)) {
      setSelectedPujaIds(selectedPujaIds.filter((id) => id !== pujaId));
    } else {
      setSelectedPujaIds([...selectedPujaIds, pujaId]);
      const ritual = availablePujas.find((p) => p.id === pujaId);
      const allowed = ritual?.allowed_modes || ["home", "temple", "remote"];
      setPujaPrices((prev) => {
        if (prev[pujaId]) return prev;
        return {
          ...prev,
          [pujaId]: {
            home: "",
            temple: "",
            remote: "",
            homeEnabled: allowed.includes("home"),
            templeEnabled: allowed.includes("temple"),
            remoteEnabled: allowed.includes("remote"),
          },
        };
      });
    }
  };

  const handleAddSampleDocument = (type: PanditApplicationDocumentType) => {
    const existingIndex = documents.findIndex((d) => d.document_type === type);
    const typeLabel = type === "identity_proof" ? "Govt_ID_Proof" : "Vedic_Certificate";
    const timestamp = Date.now();
    const newDoc: PanditApplicationDocument = {
      document_type: type,
      storage_path: `applications/${user?.id || "temp"}/${type}_${timestamp}_doc.pdf`,
      original_name: `${typeLabel}_${timestamp}.pdf`,
      uploaded_at: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      const updated = [...documents];
      updated[existingIndex] = newDoc;
      setDocuments(updated);
    } else {
      setDocuments([...documents, newDoc]);
    }
  };

  const handleRemoveDocument = (type: PanditApplicationDocumentType) => {
    setDocuments(documents.filter((d) => d.document_type !== type));
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      if (!fullName.trim()) {
        Alert.alert("Missing Name", "Please enter your full legal or consecrated name.");
        return false;
      }
      return true;
    }
    if (step === 2) {
      const exp = parseInt(experienceYears, 10);
      if (isNaN(exp) || exp < 0) {
        Alert.alert("Experience Required", "Please enter a valid number of years of experience.");
        return false;
      }
      if (languages.length === 0) {
        Alert.alert("Languages Required", "Please select at least one language.");
        return false;
      }
      return true;
    }
    if (step === 3) {
      if (!primaryCity.trim()) {
        Alert.alert("City Required", "Please provide your primary service city.");
        return false;
      }
      if (!baseAddress.trim()) {
        Alert.alert(
          "Service Base Address Required",
          "Please specify your home residence or service base location address (e.g. house number, street, locality) to establish your operational Home Puja service area."
        );
        return false;
      }
      const lat = parseFloat(baseLatitude.trim());
      const lng = parseFloat(baseLongitude.trim());
      if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
        Alert.alert(
          "Operational Coordinates Required",
          "Please enter valid operational coordinates (Latitude -90 to 90, Longitude -180 to 180) or select a sacred hub preset. Home Puja service coverage depends on exact PostGIS spatial distance."
        );
        return false;
      }
      const rad = parseFloat(serviceRadiusKm.trim());
      if (isNaN(rad) || rad <= 0 || rad > 500) {
        Alert.alert("Valid Radius Required", "Please provide a valid service radius between 1 and 500 km.");
        return false;
      }
      if (selectedPujaIds.length === 0) {
        Alert.alert("Rituals Required", "Please select at least one sacred Puja ritual you offer.");
        return false;
      }
      for (const id of selectedPujaIds) {
        const ritual = availablePujas.find((p) => p.id === id);
        const pricing = pujaPrices[id] || {};
        const allowed = ritual?.allowed_modes || [];

        let activeCount = 0;

        if (pricing.homeEnabled && allowed.includes("home")) {
          const num = parseFloat(pricing.home?.trim() || "");
          if (isNaN(num) || num <= 0) {
            Alert.alert(
              "Price Required",
              `Please enter a valid Home Dakshina greater than ₹0 for "${ritual?.name || "selected ritual"}".`
            );
            return false;
          }
          activeCount++;
        }

        if (pricing.templeEnabled && allowed.includes("temple")) {
          const num = parseFloat(pricing.temple?.trim() || "");
          if (isNaN(num) || num <= 0) {
            Alert.alert(
              "Price Required",
              `Please enter a valid Temple Dakshina greater than ₹0 for "${ritual?.name || "selected ritual"}".`
            );
            return false;
          }
          activeCount++;
        }

        if (pricing.remoteEnabled && allowed.includes("remote")) {
          const num = parseFloat(pricing.remote?.trim() || "");
          if (isNaN(num) || num <= 0) {
            Alert.alert(
              "Price Required",
              `Please enter a valid Remote Dakshina greater than ₹0 for "${ritual?.name || "selected ritual"}".`
            );
            return false;
          }
          activeCount++;
        }

        if (activeCount === 0) {
          Alert.alert(
            "Service Mode Required",
            `Please configure at least one service format (Home, Temple, or Remote) with a valid Dakshina fee (> ₹0) for "${ritual?.name || "selected ritual"}".`
          );
          return false;
        }
      }
      if (kundliEnabled) {
        const kPrice = parseFloat(kundliPrice?.trim() || "");
        if (isNaN(kPrice) || kPrice <= 0) {
          Alert.alert(
            "Kundli Fee Required",
            "Please enter a valid Dakshina fee greater than ₹0 for your Kundli offering."
          );
          return false;
        }
        const kDays = parseInt(kundliTurnaroundDays?.trim() || "", 10);
        if (isNaN(kDays) || kDays <= 0) {
          Alert.alert(
            "Turnaround Days Required",
            "Please enter a valid turnaround time (at least 1 day) for Kundli preparation."
          );
          return false;
        }
      }
      return true;
    }
    if (step === 4) {
      const hasId = documents.some((d) => d.document_type === "identity_proof");
      const hasQual = documents.some((d) => d.document_type === "vedic_qualification");
      if (!hasId || !hasQual) {
        Alert.alert(
          "Documents Required",
          "Please attach both a Government ID Proof and a Vedic Qualification document before submitting."
        );
        return false;
      }
      return true;
    }
    return true;
  };

  const getNumericPujaPrices = (): Record<string, ServiceModePrices> => {
    const res: Record<string, ServiceModePrices> = {};
    selectedPujaIds.forEach((id) => {
      const ritual = availablePujas.find((p) => p.id === id);
      const pricing = pujaPrices[id] || {};
      const allowed = ritual?.allowed_modes || [];
      const modeObj: ServiceModePrices = {};

      if (pricing.homeEnabled && allowed.includes("home")) {
        const num = parseFloat(pricing.home?.trim() || "");
        if (!isNaN(num) && num > 0) modeObj.home = num;
      }
      if (pricing.templeEnabled && allowed.includes("temple")) {
        const num = parseFloat(pricing.temple?.trim() || "");
        if (!isNaN(num) && num > 0) modeObj.temple = num;
      }
      if (pricing.remoteEnabled && allowed.includes("remote")) {
        const num = parseFloat(pricing.remote?.trim() || "");
        if (!isNaN(num) && num > 0) modeObj.remote = num;
      }

      res[id] = modeObj;
    });
    return res;
  };

  const handleSaveDraft = async () => {
    if (!user?.id) return;
    try {
      setIsSaving(true);
      const saved = await panditApplicationService.saveDraftApplication(user.id, {
        id: existingAppId || undefined,
        full_name: fullName,
        date_of_birth: dob || null,
        phone,
        email,
        bio,
        years_experience: parseInt(experienceYears, 10) || 0,
        languages,
        vedic_tradition: vedicTradition,
        primary_city: primaryCity,
        base_address: baseAddress.trim() || null,
        base_latitude: parseFloat(baseLatitude.trim()) || null,
        base_longitude: parseFloat(baseLongitude.trim()) || null,
        service_radius_km: parseFloat(serviceRadiusKm) || 25,
        selected_puja_ids: selectedPujaIds,
        selected_temple_ids: selectedTempleIds,
        puja_prices: getNumericPujaPrices(),
        kundli_enabled: kundliEnabled,
        kundli_price: kundliEnabled ? parseFloat(kundliPrice) || null : null,
        kundli_turnaround_days: kundliEnabled ? parseInt(kundliTurnaroundDays, 10) || 3 : null,
        documents,
      });
      setExistingAppId(saved.id);
      Alert.alert("Draft Saved", "Your application draft has been saved securely.");
    } catch (err: any) {
      Alert.alert("Error Saving Draft", err?.message || "Could not save draft.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 5) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) {
      setCurrentStep(3);
      return;
    }
    if (!validateStep(4)) {
      setCurrentStep(4);
      return;
    }
    if (!isAffirmed) {
      Alert.alert(
        "Affirmation Required",
        "Please affirm the solemn declaration of Vedic accuracy before submitting."
      );
      return;
    }

    if (!user?.id) return;

    try {
      setIsSaving(true);

      // 1. Ensure draft is saved
      const saved = await panditApplicationService.saveDraftApplication(user.id, {
        id: existingAppId || undefined,
        full_name: fullName,
        date_of_birth: dob || null,
        phone,
        email,
        bio,
        years_experience: parseInt(experienceYears, 10) || 0,
        languages,
        vedic_tradition: vedicTradition,
        primary_city: primaryCity,
        base_address: baseAddress.trim() || null,
        base_latitude: parseFloat(baseLatitude.trim()) || null,
        base_longitude: parseFloat(baseLongitude.trim()) || null,
        service_radius_km: parseFloat(serviceRadiusKm) || 25,
        selected_puja_ids: selectedPujaIds,
        selected_temple_ids: selectedTempleIds,
        puja_prices: getNumericPujaPrices(),
        kundli_enabled: kundliEnabled,
        kundli_price: kundliEnabled ? parseFloat(kundliPrice) || null : null,
        kundli_turnaround_days: kundliEnabled ? parseInt(kundliTurnaroundDays, 10) || 3 : null,
        documents,
      });

      // 2. Authoritative submission RPC
      await panditApplicationService.submitApplication(saved.id);

      Alert.alert(
        "Application Submitted!",
        "Your application has been received and is queued for administrative verification. You can track progress in real-time.",
        [
          {
            text: "View Status",
            onPress: () => {
              navigation.replace("PanditApplicationStatus");
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert("Submission Error", err?.message || "Failed to submit application.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading application..." />;
  }

  return (
    <ScreenContainer scrollable padded>
      <Header
        title="Become a Pandit"
        subtitle="Consecrate your Vedic rituals & offer sacred services to devotees"
      />

      {/* Progress Stepper */}
      <View style={styles.stepperContainer}>
        {[1, 2, 3, 4, 5].map((step) => {
          const isActive = step === currentStep;
          const isCompleted = step < currentStep;
          return (
            <View key={step} style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  isActive && styles.stepCircleActive,
                  isCompleted && styles.stepCircleCompleted,
                ]}
              >
                <Text
                  variant="caption"
                  color={
                    isActive || isCompleted ? colors.surface : colors.textSecondary
                  }
                  style={styles.stepText}
                >
                  {isCompleted ? "✓" : String(step)}
                </Text>
              </View>
              <Text
                variant="overline"
                color={isActive ? colors.primary : colors.textSecondary}
                style={styles.stepLabel}
              >
                {step === 1
                  ? "Identity"
                  : step === 2
                  ? "Experience"
                  : step === 3
                  ? "Coverage"
                  : step === 4
                  ? "Documents"
                  : "Review"}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Step 1: Personal Details */}
      {currentStep === 1 && (
        <Card style={styles.formCard}>
          <Text variant="h3" style={styles.stepHeading}>
            Step 1: Personal & Consecrated Identity
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.stepSubheading}>
            Enter your legal and ritual name as it should appear on booking records.
          </Text>

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Full Name (Legal / Diksha Name) *
          </Text>
          <Input
            value={fullName}
            onChangeText={setFullName}
            placeholder="e.g. Pandit Radheshyam Shastri"
          />

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Date of Birth (YYYY-MM-DD)
          </Text>
          <Input
            value={dob}
            onChangeText={setDob}
            placeholder="1985-06-15"
          />

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Contact Phone Number
          </Text>
          <Input
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
          />

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Email Address
          </Text>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="acharya@kashiveda.org"
            keyboardType="email-address"
          />
        </Card>
      )}

      {/* Step 2: Professional Background */}
      {currentStep === 2 && (
        <Card style={styles.formCard}>
          <Text variant="h3" style={styles.stepHeading}>
            Step 2: Vedic Background &amp; Lineage
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.stepSubheading}>
            Share your traditional lineage, study, and years of ceremonial practice.
          </Text>

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Sampradaya / Tradition
          </Text>
          <View style={styles.chipsContainer}>
            {SAMPRADAYAS.map((trad) => {
              const isSelected = vedicTradition === trad;
              return (
                <TouchableOpacity
                  key={trad}
                  onPress={() => setVedicTradition(trad)}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  activeOpacity={0.7}
                >
                  <Text
                    variant="caption"
                    color={isSelected ? colors.surface : colors.textPrimary}
                  >
                    {trad}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Years of Active Experience *
          </Text>
          <Input
            value={experienceYears}
            onChangeText={setExperienceYears}
            placeholder="e.g. 12"
            keyboardType="numeric"
          />

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Languages for Mantras &amp; Devotee Guidance *
          </Text>
          <View style={styles.chipsContainer}>
            {VEDIC_LANGUAGES.map((lang) => {
              const isSelected = languages.includes(lang);
              return (
                <TouchableOpacity
                  key={lang}
                  onPress={() => toggleLanguage(lang)}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  activeOpacity={0.7}
                >
                  <Text
                    variant="caption"
                    color={isSelected ? colors.surface : colors.textPrimary}
                  >
                    {lang} {isSelected ? "✓" : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Vedic Biography &amp; Gurukul Study
          </Text>
          <Input
            value={bio}
            onChangeText={setBio}
            placeholder="Describe your Vedic schooling, Gurukul training, and ritual consecration..."
            multiline
            numberOfLines={4}
          />
        </Card>
      )}

      {/* Step 3: Coverage & Services */}
      {currentStep === 3 && (
        <Card style={styles.formCard}>
          <Text variant="h3" style={styles.stepHeading}>
            Step 3: Service Radius &amp; Catalog
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.stepSubheading}>
            Specify where you conduct in-person rituals and which consecrated Pujas you offer.
          </Text>

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Primary Service City *
          </Text>
          <Input
            value={primaryCity}
            onChangeText={setPrimaryCity}
            placeholder="e.g. Varanasi"
          />

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Service Base Location / Street Address *
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.stepSubheading}>
            Customer Home Puja requests are spatially checked against this exact address using PostGIS radius calculations.
          </Text>
          <Input
            value={baseAddress}
            onChangeText={setBaseAddress}
            placeholder="e.g. Assi Ghat Road, Bhelupur, Varanasi"
          />

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Quick Select Sacred Location Hub
          </Text>
          <View style={styles.hubsContainer}>
            {SACRED_HUBS.map((hub) => {
              const isSelected =
                baseAddress.toLowerCase().includes(hub.name.toLowerCase()) ||
                (parseFloat(baseLatitude) === hub.latitude && parseFloat(baseLongitude) === hub.longitude);
              return (
                <TouchableOpacity
                  key={hub.name}
                  style={[styles.hubChip, isSelected && styles.hubChipActive]}
                  onPress={() => {
                    setBaseAddress(hub.address);
                    setBaseLatitude(String(hub.latitude));
                    setBaseLongitude(String(hub.longitude));
                    setPrimaryCity(hub.city);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    variant="caption"
                    color={isSelected ? colors.surface : colors.textPrimary}
                    style={styles.hubChipText}
                  >
                    📍 {hub.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.coordsRow}>
            <View style={styles.coordCol}>
              <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
                Base Latitude (°N) *
              </Text>
              <Input
                value={baseLatitude}
                onChangeText={setBaseLatitude}
                placeholder="e.g. 25.2974"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.coordCol}>
              <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
                Base Longitude (°E) *
              </Text>
              <Input
                value={baseLongitude}
                onChangeText={setBaseLongitude}
                placeholder="e.g. 83.0039"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Real-time spatial verification indicator */}
          {parseFloat(baseLatitude) && parseFloat(baseLongitude) && !isNaN(parseFloat(baseLatitude)) && !isNaN(parseFloat(baseLongitude)) ? (
            <View style={styles.geoValidCard}>
              <Text variant="captionMedium" color="#15803d">
                ✓ Spatial Anchor Configured: PostGIS service coverage active around ({parseFloat(baseLatitude).toFixed(4)}°, {parseFloat(baseLongitude).toFixed(4)}°) up to {serviceRadiusKm || 25} km.
              </Text>
            </View>
          ) : (
            <View style={styles.geoWarningCard}>
              <Text variant="captionMedium" color="#b45309">
                ⚠️ Operational coordinates required. Mere city names do not configure geospatial service boundaries.
              </Text>
            </View>
          )}

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Service Radius (Kilometers) *
          </Text>
          <Input
            value={serviceRadiusKm}
            onChangeText={setServiceRadiusKm}
            placeholder="25"
            keyboardType="numeric"
          />

          <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
            Select Rituals You Offer ({selectedPujaIds.length} Selected) *
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.stepSubheading}>
            Devotees will book these ceremonies. Every selected ritual requires your custom Dakshina fee (&gt; ₹0).
          </Text>

          <View style={styles.pujaList}>
            {availablePujas.map((puja) => {
              const isSelected = selectedPujaIds.includes(puja.id);
              return (
                <View
                  key={puja.id}
                  style={[styles.pujaItem, isSelected && styles.pujaItemSelected]}
                >
                  <TouchableOpacity
                    onPress={() => togglePuja(puja.id)}
                    style={styles.pujaTopRow}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pujaInfo}>
                      <Text variant="bodyMedium">{puja.name}</Text>
                      {puja.description ? (
                        <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
                          {puja.description}
                        </Text>
                      ) : null}
                      <Text variant="caption" color={colors.textSecondary} style={styles.metaRow}>
                        Duration: {puja.default_duration_minutes} mins • Modes: {puja.allowed_modes.join(", ")}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxSelected,
                      ]}
                    >
                      {isSelected && (
                        <Text variant="caption" color={colors.surface}>
                          ✓
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  {isSelected && (
                    <View style={styles.pujaPriceInputWrap}>
                      <Text variant="captionMedium" color={colors.textPrimary} style={styles.priceSectionHeading}>
                        Select Service Formats &amp; Dakshina (₹):
                      </Text>

                      {puja.allowed_modes.includes("home") && (
                        <View style={styles.wizardModeBlock}>
                          <View style={styles.wizardModeToggleRow}>
                            <TouchableOpacity
                              style={styles.wizardModeCheck}
                              activeOpacity={0.7}
                              onPress={() => {
                                setPujaPrices((prev) => ({
                                  ...prev,
                                  [puja.id]: {
                                    ...prev[puja.id],
                                    homeEnabled: !(prev[puja.id]?.homeEnabled),
                                  },
                                }));
                              }}
                            >
                              <View style={[styles.checkbox, pujaPrices[puja.id]?.homeEnabled && styles.checkboxSelected]}>
                                {pujaPrices[puja.id]?.homeEnabled && <Text variant="caption" color={colors.surface}>✓</Text>}
                              </View>
                              <Text variant="captionMedium" style={styles.wizardModeLabel}>🪔 Home Service</Text>
                            </TouchableOpacity>
                          </View>
                          {pujaPrices[puja.id]?.homeEnabled && (
                            <Input
                              value={pujaPrices[puja.id]?.home || ""}
                              onChangeText={(val) => {
                                const clean = val.replace(/[^0-9.]/g, "");
                                setPujaPrices((prev) => ({
                                  ...prev,
                                  [puja.id]: { ...prev[puja.id], home: clean },
                                }));
                              }}
                              placeholder="Home Dakshina e.g. 5000"
                              keyboardType="numeric"
                              style={styles.wizardModeInput}
                            />
                          )}
                        </View>
                      )}

                      {puja.allowed_modes.includes("temple") && (
                        <View style={styles.wizardModeBlock}>
                          <View style={styles.wizardModeToggleRow}>
                            <TouchableOpacity
                              style={styles.wizardModeCheck}
                              activeOpacity={0.7}
                              onPress={() => {
                                setPujaPrices((prev) => ({
                                  ...prev,
                                  [puja.id]: {
                                    ...prev[puja.id],
                                    templeEnabled: !(prev[puja.id]?.templeEnabled),
                                  },
                                }));
                              }}
                            >
                              <View style={[styles.checkbox, pujaPrices[puja.id]?.templeEnabled && styles.checkboxSelected]}>
                                {pujaPrices[puja.id]?.templeEnabled && <Text variant="caption" color={colors.surface}>✓</Text>}
                              </View>
                              <Text variant="captionMedium" style={styles.wizardModeLabel}>🏛️ Temple Service</Text>
                            </TouchableOpacity>
                          </View>
                          {pujaPrices[puja.id]?.templeEnabled && (
                            <Input
                              value={pujaPrices[puja.id]?.temple || ""}
                              onChangeText={(val) => {
                                const clean = val.replace(/[^0-9.]/g, "");
                                setPujaPrices((prev) => ({
                                  ...prev,
                                  [puja.id]: { ...prev[puja.id], temple: clean },
                                }));
                              }}
                              placeholder="Temple Dakshina e.g. 3500"
                              keyboardType="numeric"
                              style={styles.wizardModeInput}
                            />
                          )}
                        </View>
                      )}

                      {puja.allowed_modes.includes("remote") && (
                        <View style={styles.wizardModeBlock}>
                          <View style={styles.wizardModeToggleRow}>
                            <TouchableOpacity
                              style={styles.wizardModeCheck}
                              activeOpacity={0.7}
                              onPress={() => {
                                setPujaPrices((prev) => ({
                                  ...prev,
                                  [puja.id]: {
                                    ...prev[puja.id],
                                    remoteEnabled: !(prev[puja.id]?.remoteEnabled),
                                  },
                                }));
                              }}
                            >
                              <View style={[styles.checkbox, pujaPrices[puja.id]?.remoteEnabled && styles.checkboxSelected]}>
                                {pujaPrices[puja.id]?.remoteEnabled && <Text variant="caption" color={colors.surface}>✓</Text>}
                              </View>
                              <Text variant="captionMedium" style={styles.wizardModeLabel}>🌐 Live Remote Service</Text>
                            </TouchableOpacity>
                          </View>
                          {pujaPrices[puja.id]?.remoteEnabled && (
                            <Input
                              value={pujaPrices[puja.id]?.remote || ""}
                              onChangeText={(val) => {
                                const clean = val.replace(/[^0-9.]/g, "");
                                setPujaPrices((prev) => ({
                                  ...prev,
                                  [puja.id]: { ...prev[puja.id], remote: clean },
                                }));
                              }}
                              placeholder="Remote Dakshina e.g. 2100"
                              keyboardType="numeric"
                              style={styles.wizardModeInput}
                            />
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Paid Kundli Offering Section */}
          <View style={styles.kundliSection}>
            <View style={styles.kundliHeader}>
              <View style={styles.kundliHeaderText}>
                <Text variant="bodyMedium">Offer Paid Kundli Consultations</Text>
                <Text variant="caption" color={colors.textSecondary}>
                  Devotees can request personalized Janam Kundli charts and astrological analysis from you.
                </Text>
              </View>
              <Switch
                value={kundliEnabled}
                onValueChange={(val) => setKundliEnabled(val)}
                trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
                thumbColor={kundliEnabled ? colors.primary : colors.surface}
              />
            </View>

            {kundliEnabled && (
              <View style={styles.kundliInputs}>
                <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
                  Kundli Dakshina / Price (₹) *
                </Text>
                <Input
                  value={kundliPrice}
                  onChangeText={(val) => setKundliPrice(val.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 501"
                  keyboardType="numeric"
                />

                <Text variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
                  Estimated Turnaround Time (Days) *
                </Text>
                <Input
                  value={kundliTurnaroundDays}
                  onChangeText={(val) => setKundliTurnaroundDays(val.replace(/[^0-9]/g, ""))}
                  placeholder="3"
                  keyboardType="numeric"
                />
              </View>
            )}
          </View>

          {/* Temples I Serve At Section (For Temple Puja Enablement) */}
          <View style={{ marginTop: spacing.lg }}>
            <Text variant="bodyMedium" style={{ fontWeight: "700" }}>
              Temples I Serve At (Optional for Temple Puja)
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={{ marginBottom: spacing.sm }}>
              Select consecrated temples from the directory where you can perform Temple Puja rituals.
            </Text>
            {activeTemples.map((temple) => {
              const isSelected = selectedTempleIds.includes(temple.id);
              return (
                <TouchableOpacity
                  key={temple.id}
                  style={[
                    styles.pujaItem,
                    isSelected && styles.pujaItemSelected,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => toggleTemple(temple.id)}
                >
                  <View style={styles.pujaTopRow}>
                    <View style={styles.pujaInfo}>
                      <Text variant="bodyMedium" style={{ fontWeight: isSelected ? "700" : "500" }}>
                        {temple.name}
                      </Text>
                      <Text variant="caption" color={colors.textSecondary}>
                        {temple.address ? `${temple.address}, ` : ""}{temple.city}
                      </Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Text variant="caption" color={colors.surface}>✓</Text>}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      )}

      {/* Step 4: Verification Documents */}
      {currentStep === 4 && (
        <Card style={styles.formCard}>
          <Text variant="h3" style={styles.stepHeading}>
            Step 4: Verification Documents
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.stepSubheading}>
            Upload your Government ID proof and Vedic qualification or Gurukul certificate.
          </Text>

          {/* Doc 1: Identity Proof */}
          <View style={styles.docSection}>
            <View style={styles.docHeader}>
              <Text variant="bodyMedium">1. Government Identity Proof *</Text>
              <Text variant="caption" color={colors.textSecondary}>
                Aadhaar, Voter ID, Passport, or PAN
              </Text>
            </View>

            {documents.some((d) => d.document_type === "identity_proof") ? (
              <View style={styles.uploadedDocBadge}>
                <Text variant="caption" color={colors.primary}>
                  Attached: {documents.find((d) => d.document_type === "identity_proof")?.original_name}
                </Text>
                <TouchableOpacity
                  onPress={() => handleRemoveDocument("identity_proof")}
                >
                  <Text variant="caption" color={colors.error} style={styles.removeText}>
                    Remove
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Button
                title="Attach Identity Proof Document"
                variant="outline"
                size="sm"
                onPress={() => handleAddSampleDocument("identity_proof")}
              />
            )}
          </View>

          {/* Doc 2: Vedic Qualification */}
          <View style={styles.docSection}>
            <View style={styles.docHeader}>
              <Text variant="bodyMedium">2. Vedic Qualification Certificate *</Text>
              <Text variant="caption" color={colors.textSecondary}>
                Degree, Gurukul Diksha certificate, or Sampradaya letter
              </Text>
            </View>

            {documents.some((d) => d.document_type === "vedic_qualification") ? (
              <View style={styles.uploadedDocBadge}>
                <Text variant="caption" color={colors.primary}>
                  Attached: {documents.find((d) => d.document_type === "vedic_qualification")?.original_name}
                </Text>
                <TouchableOpacity
                  onPress={() => handleRemoveDocument("vedic_qualification")}
                >
                  <Text variant="caption" color={colors.error} style={styles.removeText}>
                    Remove
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Button
                title="Attach Vedic Certificate Document"
                variant="outline"
                size="sm"
                onPress={() => handleAddSampleDocument("vedic_qualification")}
              />
            )}
          </View>
        </Card>
      )}

      {/* Step 5: Final Review & Affirmation */}
      {currentStep === 5 && (
        <Card style={styles.formCard}>
          <Text variant="h3" style={styles.stepHeading}>
            Step 5: Review &amp; Solemn Submission
          </Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.stepSubheading}>
            Confirm your application details before submitting for administrative review.
          </Text>

          <View style={styles.summarySection}>
            <View style={styles.summaryRow}>
              <Text variant="caption" color={colors.textSecondary}>Name:</Text>
              <Text variant="bodyMedium">{fullName}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="caption" color={colors.textSecondary}>Tradition:</Text>
              <Text variant="bodyMedium">{vedicTradition}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="caption" color={colors.textSecondary}>Experience:</Text>
              <Text variant="bodyMedium">{experienceYears} Years</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="caption" color={colors.textSecondary}>Languages:</Text>
              <Text variant="bodyMedium">{languages.join(", ")}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="caption" color={colors.textSecondary}>Primary City:</Text>
              <Text variant="bodyMedium">{primaryCity}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="caption" color={colors.textSecondary}>Service Base Location:</Text>
              <Text variant="bodyMedium" numberOfLines={2} style={styles.summaryValueRight}>
                {baseAddress || "Not specified"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="caption" color={colors.textSecondary}>Coordinates:</Text>
              <Text variant="bodyMedium">
                {baseLatitude && baseLongitude ? `${parseFloat(baseLatitude).toFixed(4)}°N, ${parseFloat(baseLongitude).toFixed(4)}°E` : "None"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="caption" color={colors.textSecondary}>Service Radius:</Text>
              <Text variant="bodyMedium">{serviceRadiusKm} km</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="caption" color={colors.textSecondary}>Pujas Offered:</Text>
              <Text variant="bodyMedium">{selectedPujaIds.length} Rituals</Text>
            </View>
            {selectedPujaIds.map((id) => {
              const p = availablePujas.find((item) => item.id === id);
              const pricing = pujaPrices[id] || {};
              const allowed = p?.allowed_modes || [];
              return (
                <View key={id} style={styles.reviewPujaCard}>
                  <Text variant="captionMedium" style={styles.reviewPujaTitle}>• {p?.name || "Ritual"}</Text>
                  <View style={styles.reviewModesList}>
                    {allowed.includes("home") && (
                      <Text
                        variant="caption"
                        color={pricing.homeEnabled && pricing.home ? colors.primary : colors.textTertiary}
                      >
                        - Home: {pricing.homeEnabled && pricing.home ? `₹${pricing.home}` : "Not Offered"}
                      </Text>
                    )}
                    {allowed.includes("temple") && (
                      <Text
                        variant="caption"
                        color={pricing.templeEnabled && pricing.temple ? colors.primary : colors.textTertiary}
                      >
                        - Temple: {pricing.templeEnabled && pricing.temple ? `₹${pricing.temple}` : "Not Offered"}
                      </Text>
                    )}
                    {allowed.includes("remote") && (
                      <Text
                        variant="caption"
                        color={pricing.remoteEnabled && pricing.remote ? colors.primary : colors.textTertiary}
                      >
                        - Remote: {pricing.remoteEnabled && pricing.remote ? `₹${pricing.remote}` : "Not Offered"}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
            <View style={styles.summaryRow}>
              <Text variant="caption" color={colors.textSecondary}>Kundli Offering:</Text>
              <Text variant="bodyMedium">
                {kundliEnabled
                  ? `Enabled (₹${kundliPrice || 0}, ${kundliTurnaroundDays} days)`
                  : "Disabled"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="caption" color={colors.textSecondary}>Documents:</Text>
              <Text variant="bodyMedium">{documents.length} Files Attached</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.affirmationBox}
            onPress={() => setIsAffirmed(!isAffirmed)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, isAffirmed && styles.checkboxSelected]}>
              {isAffirmed && <Text variant="caption" color={colors.surface}>✓</Text>}
            </View>
            <Text variant="caption" style={styles.affirmationText}>
              I solemnly affirm that the Vedic credentials, lineage background, and documents provided are authentic and consecrated in accordance with Sanatana Dharma.
            </Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* Navigation Buttons */}
      <View style={styles.actionButtonsRow}>
        {currentStep > 1 && (
          <Button
            title="Previous"
            variant="outline"
            size="md"
            onPress={handlePrevious}
            style={styles.btnHalf}
            disabled={isSaving}
          />
        )}

        {currentStep < 5 ? (
          <Button
            title="Next Step"
            variant="primary"
            size="md"
            onPress={handleNext}
            style={currentStep === 1 ? styles.btnFull : styles.btnHalf}
            disabled={isSaving}
          />
        ) : (
          <Button
            title={isSaving ? "Submitting..." : "Submit for Verification"}
            variant="primary"
            size="md"
            onPress={handleSubmit}
            style={styles.btnHalf}
            disabled={isSaving || !isAffirmed}
          />
        )}
      </View>

      {/* Save Draft Option */}
      <TouchableOpacity
        onPress={handleSaveDraft}
        style={styles.saveDraftBtn}
        disabled={isSaving}
      >
        <Text variant="caption" color={colors.primary}>
          {isSaving ? "Saving..." : "Save Draft & Resume Later"}
        </Text>
      </TouchableOpacity>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  stepperContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  stepItem: {
    alignItems: "center",
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: {
    backgroundColor: colors.primary,
  },
  stepCircleCompleted: {
    backgroundColor: colors.success || "#10b981",
  },
  stepText: {
    fontWeight: "700",
  },
  stepLabel: {
    marginTop: 4,
    fontSize: 10,
  },
  formCard: {
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  stepHeading: {
    marginBottom: 4,
  },
  stepSubheading: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pujaList: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  pujaItem: {
    padding: spacing.sm,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  pujaItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight || "#fff7ed",
  },
  pujaTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaRow: {
    marginTop: 2,
    fontSize: 11,
  },
  pujaPriceInputWrap: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  priceSectionHeading: {
    marginBottom: spacing.xs,
    fontSize: 13,
  },
  wizardModeBlock: {
    marginBottom: spacing.xs,
    padding: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.xs,
  },
  wizardModeToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wizardModeCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  wizardModeLabel: {
    fontSize: 13,
  },
  wizardModeInput: {
    marginTop: spacing.xxs,
  },
  reviewPujaCard: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  reviewPujaTitle: {
    marginBottom: 2,
  },
  reviewModesList: {
    paddingLeft: spacing.md,
    gap: 2,
  },
  kundliSection: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xs,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  kundliHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kundliHeaderText: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  kundliInputs: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  reviewPujaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: spacing.sm,
    paddingVertical: 2,
  },
  reviewPujaText: {
    flex: 1,
  },
  pujaInfo: {
    flex: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border || "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  docSection: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.xs,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  docHeader: {
    marginBottom: spacing.xs,
  },
  uploadedDocBadge: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.xs,
  },
  removeText: {
    fontWeight: "600",
  },
  summarySection: {
    padding: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.xs,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  affirmationBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.xs,
  },
  affirmationText: {
    flex: 1,
    lineHeight: 18,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  btnFull: {
    flex: 1,
  },
  btnHalf: {
    flex: 1,
  },
  saveDraftBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginBottom: spacing.xxl,
  },
  summaryValueRight: {
    flex: 1,
    textAlign: "right",
    paddingLeft: spacing.sm,
  },
  hubsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  hubChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  hubChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  hubChipText: {
    fontWeight: "500",
  },
  coordsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  coordCol: {
    flex: 1,
  },
  geoValidCard: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
    borderWidth: 1,
    borderRadius: radius.xs,
    padding: spacing.sm,
    marginVertical: spacing.xs,
  },
  geoWarningCard: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
    borderRadius: radius.xs,
    padding: spacing.sm,
    marginVertical: spacing.xs,
  },
});

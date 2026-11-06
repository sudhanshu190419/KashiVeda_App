// __tests__/account_subpages.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { ThemeProvider } from "../src/shared/theme/index.ts";
import { LanguageProvider } from "../src/shared/i18n/index.ts";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SavedAddressesScreen } from "../src/features/address/screens/SavedAddressesScreen.tsx";
import { KundliProfilesScreen } from "../src/features/kundli/screens/KundliProfilesScreen.tsx";
import { addressService } from "../src/features/address/services/addressService.ts";
import { kundliProfileService } from "../src/features/kundli/services/kundliProfileService.ts";

const initialMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, bottom: 34, right: 0 },
};

// Mock navigation
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
}));

// Mock Auth
jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    user: { id: "test-user-uuid", email: "devotee@kashiveda.com" },
    profile: { display_name: "Test Devotee" },
    roles: ["customer"],
  }),
}));

const renderWithProviders = async (children: React.ReactElement) => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ThemeProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  return renderer;
};

const extractText = (renderer: ReactTestRenderer.ReactTestRenderer): string => {
  return JSON.stringify(renderer.toJSON());
};

describe("Account Subpages: Saved Addresses & Kundli Profiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("SavedAddressesScreen", () => {
    it("renders empty state when customer has no saved addresses", async () => {
      jest.spyOn(addressService, "fetchAddresses").mockResolvedValueOnce([]);

      const tree = await renderWithProviders(<SavedAddressesScreen />);
      const text = extractText(tree);

      expect(text).toContain("No Saved Addresses");
      expect(text).toContain("Add First Address");
    });

    it("renders address cards when addresses exist", async () => {
      jest.spyOn(addressService, "fetchAddresses").mockResolvedValueOnce([
        {
          id: "addr-1",
          customer_id: "test-user-uuid",
          label: "Home",
          address_line1: "B-402, Ganga Heights",
          address_line2: "Assi Ghat Road",
          city: "Varanasi",
          state: "Uttar Pradesh",
          pincode: "221005",
          latitude: 25.3176,
          longitude: 82.9739,
          is_default: true,
        },
      ]);

      const tree = await renderWithProviders(<SavedAddressesScreen />);
      const text = extractText(tree);

      expect(text).toContain("B-402, Ganga Heights");
      expect(text).toContain("Default");
    });
  });

  describe("KundliProfilesScreen", () => {
    it("renders empty state when no Kundli profiles are saved", async () => {
      jest.spyOn(kundliProfileService, "fetchProfiles").mockResolvedValueOnce([]);

      const tree = await renderWithProviders(<KundliProfilesScreen />);
      const text = extractText(tree);

      expect(text).toContain("No Kundli Profiles Saved");
      expect(text).toContain("Add First Member");
    });

    it("renders devotee profiles with astrological attributes", async () => {
      jest.spyOn(kundliProfileService, "fetchProfiles").mockResolvedValueOnce([
        {
          id: "kp-1",
          name: "Amar Sharma",
          relation: "self",
          dateOfBirth: "1992-08-14",
          timeOfBirth: "06:45",
          timeUnknown: false,
          placeOfBirth: "Varanasi, UP",
          gotra: "Kashyapa",
          rashi: "Leo (Simha)",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const tree = await renderWithProviders(<KundliProfilesScreen />);
      const text = extractText(tree);

      expect(text).toContain("Amar Sharma");
      expect(text).toContain("Self");
      expect(text).toContain("Kashyapa");
    });
  });
});

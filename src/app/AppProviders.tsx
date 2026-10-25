// src/app/AppProviders.tsx
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../features/auth/AuthContext.tsx";
import { ThemeProvider } from "../shared/theme/ThemeProvider.tsx";
import { LanguageProvider } from "../shared/i18n/LanguageProvider.tsx";

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

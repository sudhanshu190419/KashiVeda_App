// src/app/AppProviders.tsx
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../features/auth/AuthContext.tsx";

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <SafeAreaProvider>
      <AuthProvider>{children}</AuthProvider>
    </SafeAreaProvider>
  );
};

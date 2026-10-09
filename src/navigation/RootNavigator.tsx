// src/navigation/RootNavigator.tsx
import React from "react";
import { LinkingOptions, NavigationContainer } from "@react-navigation/native";
import { LoadingState } from "../shared/components/ui/LoadingState.tsx";
import { useAuth } from "../features/auth/AuthContext.tsx";
import { AdminNoticeScreen } from "../shared/screens/AdminNoticeScreen.tsx";
import { AuthNavigator } from "./AuthNavigator.tsx";
import { CustomerNavigator } from "./CustomerNavigator.tsx";
import { PanditNavigator } from "./PanditNavigator.tsx";

const linking: LinkingOptions<any> = {
  prefixes: ["kashiveda://", "https://kashiveda.org"],
  config: {
    screens: {
      Login: "login",
      Register: "register",
      ForgotPassword: "forgot-password",
      ResetPassword: "reset-password",
    },
  },
};

export const RootNavigator: React.FC = () => {
  const { session, user, roles, activeMode, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState message="Initializing KashiVeda..." />;
  }

  return (
    <NavigationContainer linking={linking}>
      {!session || !user ? (
        <AuthNavigator />
      ) : roles.includes("admin") || roles.includes("super_admin") ? (
        <AdminNoticeScreen />
      ) : activeMode === "pandit" && roles.includes("pandit") ? (
        <PanditNavigator />
      ) : (
        <CustomerNavigator />
      )}
    </NavigationContainer>
  );
};

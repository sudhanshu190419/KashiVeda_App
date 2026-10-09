// src/navigation/PanditNavigator.tsx
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  PanditAvailabilityScreen,
  PanditBookingDetailsScreen,
  PanditBookingsScreen,
  PanditDashboardScreen,
  PanditKundliScreen,
  PanditLiveSessionScreen,
  PanditProfileScreen,
  PanditUnavailableBlocksScreen,
  PanditEarningsScreen,
  PanditServiceLocationScreen,
  PanditPayoutSetupScreen,
  PanditTemplesScreen,
} from "../features/pandit/index.ts";
import { colors, typography } from "../shared/theme/index.ts";
import { PanditStackParamList, PanditTabParamList } from "../shared/types/index.ts";

const Tab = createBottomTabNavigator<PanditTabParamList>();
const Stack = createNativeStackNavigator<PanditStackParamList>();

const PanditTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderLight,
        },
        tabBarLabelStyle: {
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.medium,
        },
      }}
    >
      <Tab.Screen
        name="PanditDashboard"
        component={PanditDashboardScreen}
        options={{ tabBarLabel: "Dashboard" }}
      />
      <Tab.Screen
        name="PanditBookings"
        component={PanditBookingsScreen}
        options={{ tabBarLabel: "Rituals" }}
      />
      <Tab.Screen
        name="PanditAvailability"
        component={PanditAvailabilityScreen}
        options={{ tabBarLabel: "Schedule" }}
      />
      <Tab.Screen
        name="PanditKundli"
        component={PanditKundliScreen}
        options={{ tabBarLabel: "Kundlis" }}
      />
      <Tab.Screen
        name="PanditProfile"
        component={PanditProfileScreen}
        options={{ tabBarLabel: "Profile" }}
      />
    </Tab.Navigator>
  );
};

export const PanditNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="PanditTabs" component={PanditTabNavigator} />
      <Stack.Screen name="PanditBookingDetail" component={PanditBookingDetailsScreen} />
      <Stack.Screen name="PanditUnavailableBlocks" component={PanditUnavailableBlocksScreen} />
      <Stack.Screen name="PanditLiveSession" component={PanditLiveSessionScreen} />
      <Stack.Screen name="PanditEarnings" component={PanditEarningsScreen} />
      <Stack.Screen name="PanditServiceLocation" component={PanditServiceLocationScreen} />
      <Stack.Screen name="PanditPayoutSetup" component={PanditPayoutSetupScreen} />
      <Stack.Screen name="PanditTemples" component={PanditTemplesScreen} />
    </Stack.Navigator>
  );
};


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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../shared/theme/index.ts";
import { Ionicons } from "../shared/components/icons/index.ts";
import { PanditStackParamList, PanditTabParamList } from "../shared/types/index.ts";

const Tab = createBottomTabNavigator<PanditTabParamList>();
const Stack = createNativeStackNavigator<PanditStackParamList>();

const PanditTabNavigator: React.FC = () => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: isDark ? colors.surfaceCard : colors.surfaceBase,
          borderTopColor: colors.borderDefault,
          borderTopWidth: 1,
          height: 56 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tab.Screen
        name="PanditDashboard"
        component={PanditDashboardScreen}
        options={{
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "speedometer" : "speedometer-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="PanditBookings"
        component={PanditBookingsScreen}
        options={{
          tabBarLabel: "Rituals",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "flame" : "flame-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="PanditAvailability"
        component={PanditAvailabilityScreen}
        options={{
          tabBarLabel: "Schedule",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "time" : "time-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="PanditKundli"
        component={PanditKundliScreen}
        options={{
          tabBarLabel: "Kundlis",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "compass" : "compass-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="PanditProfile"
        component={PanditProfileScreen}
        options={{
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
          ),
        }}
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


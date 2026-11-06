// src/navigation/CustomerNavigator.tsx
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  BookingDetailsScreen,
  BookingPaymentScreen,
  BookingSuccessScreen,
  BookingWizardScreen,
  BookingsScreen,
  CustomerLiveSessionScreen,
} from "../features/booking/index.ts";
import {
  ExploreScreen,
  HomeScreen,
  PanchangScreen,
  PanditDetailScreen,
  PanditDirectoryScreen,
  PujaCategoryListScreen,
  PujaDetailScreen,
  PujaListScreen,
} from "../features/discovery/index.ts";
import {
  KundliDetailScreen,
  KundliOrdersScreen,
  KundliPaymentScreen,
  KundliProfilesScreen,
  KundliScreen,
  KundliWizardScreen,
} from "../features/kundli/index.ts";
import { SavedAddressesScreen } from "../features/address/index.ts";
import {
  FreeKundliWizardScreen,
  FreeKundliResultScreen,
} from "../features/kundli/free/index.ts";
import {
  AstrologyContentDetailScreen,
  AstrologyContentScreen,
  AstrologyDeliveriesScreen,
  AstrologyPaymentScreen,
  AstrologyPlanDetailScreen,
  AstrologyScreen,
  AstrologySubscriptionScreen,
} from "../features/astrology/index.ts";
import { ProfileScreen } from "../features/auth/index.ts";
import { PanditApplicationWizardScreen, PanditApplicationStatusScreen } from "../features/pandit/index.ts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../shared/theme/index.ts";
import { Ionicons } from "../shared/components/icons/index.ts";
import {
  CustomerStackParamList,
  CustomerTabParamList,
} from "../shared/types/index.ts";

const Tab = createBottomTabNavigator<CustomerTabParamList>();
const Stack = createNativeStackNavigator<CustomerStackParamList>();

const CustomerTabNavigator: React.FC = () => {
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
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarLabel: "Pujas",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "flame" : "flame-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Bookings"
        component={BookingsScreen}
        options={{
          tabBarLabel: "My Pujas",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Kundli"
        component={KundliScreen}
        options={{
          tabBarLabel: "Kundli",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "compass" : "compass-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: "Account",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

export const CustomerNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="CustomerTabs" component={CustomerTabNavigator} />
      <Stack.Screen name="Panchang" component={PanchangScreen} />
      <Stack.Screen name="PujaCategoryList" component={PujaCategoryListScreen} />
      <Stack.Screen name="PujaList" component={PujaListScreen} />
      <Stack.Screen name="PujaDetail" component={PujaDetailScreen} />
      <Stack.Screen name="PanditDirectory" component={PanditDirectoryScreen} />
      <Stack.Screen name="PanditDetail" component={PanditDetailScreen} />
      <Stack.Screen name="BookingWizard" component={BookingWizardScreen} />
      <Stack.Screen name="BookingPayment" component={BookingPaymentScreen} />
      <Stack.Screen name="BookingSuccess" component={BookingSuccessScreen} />
      <Stack.Screen name="BookingDetail" component={BookingDetailsScreen} />
      <Stack.Screen name="KundliWizard" component={KundliWizardScreen} />
      <Stack.Screen name="KundliPayment" component={KundliPaymentScreen} />
      <Stack.Screen name="KundliOrders" component={KundliOrdersScreen} />
      <Stack.Screen name="KundliDetail" component={KundliDetailScreen} />
      <Stack.Screen name="FreeKundliWizard" component={FreeKundliWizardScreen} />
      <Stack.Screen name="FreeKundliResult" component={FreeKundliResultScreen} />
      <Stack.Screen name="Astrology" component={AstrologyScreen} />
      <Stack.Screen name="AstrologyPlanDetail" component={AstrologyPlanDetailScreen} />
      <Stack.Screen name="AstrologyPayment" component={AstrologyPaymentScreen} />
      <Stack.Screen name="AstrologySubscription" component={AstrologySubscriptionScreen} />
      <Stack.Screen name="AstrologyContent" component={AstrologyContentScreen} />
      <Stack.Screen name="AstrologyContentDetail" component={AstrologyContentDetailScreen} />
      <Stack.Screen name="AstrologyDeliveries" component={AstrologyDeliveriesScreen} />
      <Stack.Screen name="PanditApplicationWizard" component={PanditApplicationWizardScreen} />
      <Stack.Screen name="PanditApplicationStatus" component={PanditApplicationStatusScreen} />
      <Stack.Screen name="CustomerLiveSession" component={CustomerLiveSessionScreen} />
      <Stack.Screen name="SavedAddresses" component={SavedAddressesScreen} />
      <Stack.Screen name="KundliProfiles" component={KundliProfilesScreen} />
    </Stack.Navigator>
  );
};

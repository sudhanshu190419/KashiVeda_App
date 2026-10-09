// src/shared/types/navigation.ts

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { recoveryToken?: string } | undefined;
};

export type CustomerTabParamList = {
  Home: undefined;
  Explore: undefined;
  Bookings: undefined;
  Kundli: undefined;
  Profile: undefined;
};

export type CustomerStackParamList = {
  CustomerTabs: undefined;
  PujaCategoryList: undefined;
  PujaList: {
    categoryId?: string;
    categoryName?: string;
    serviceMode?: "home" | "temple" | "remote";
    modeTitle?: string;
  } | undefined;
  PujaDetail: {
    pujaId: string;
    pujaName?: string;
    serviceMode?: "home" | "temple" | "remote";
  };
  PanditDirectory: {
    pujaServiceId?: string;
    pujaName?: string;
    serviceMode?: "home" | "temple" | "remote";
  } | undefined;
  PanditDetail: { panditId: string; panditName?: string };
  BookingWizard: {
    pujaId?: string;
    pujaName?: string;
    panditId?: string;
    serviceMode?: "home" | "temple" | "remote";
  };
  BookingPayment: {
    bookingId: string;
    paymentOrderId: string;
    bookingNumber: string;
    advanceAmount: number;
    pujaName: string;
    panditName: string;
    isBalancePayment?: boolean;
  };
  BookingSuccess: { bookingId: string };
  BookingDetail: { bookingId: string };
  KundliWizard: { panditId?: string; panditName?: string } | undefined;
  KundliPayment: {
    kundliOrderId: string;
    paymentOrderId: string;
    orderNumber?: string;
    amount: number;
    panditName: string;
  };
  KundliOrders: undefined;
  KundliDetail: { orderId: string };
  FreeKundliWizard: undefined;
  FreeKundliResult: { kundliData: any };
  Astrology: undefined;
  AstrologyPlanDetail: { planId: string };
  AstrologyPayment: {
    subscriptionId: string;
    paymentOrderId: string;
    planId: string;
    planName: string;
    amount: number;
    currency: string;
    durationDays: number;
  };
  AstrologySubscription: undefined;
  AstrologyContent: undefined;
  AstrologyContentDetail: { contentId: string };
  AstrologyDeliveries: undefined;
  PanditApplicationWizard: undefined;
  PanditApplicationStatus: undefined;
  CustomerLiveSession: {
    bookingId: string;
    roomName: string;
    token: string;
    serverUrl: string;
    pujaName: string;
    panditName: string;
  };
};

export type PanditTabParamList = {
  PanditDashboard: undefined;
  PanditBookings: undefined;
  PanditAvailability: undefined;
  PanditKundli: undefined;
  PanditProfile: undefined;
};

export type PanditStackParamList = {
  PanditTabs: undefined;
  PanditBookingDetail: { bookingId: string };
  PanditUnavailableBlocks: undefined;
  PanditLiveSession: {
    bookingId: string;
    roomName: string;
    token: string;
    serverUrl: string;
    pujaName: string;
  };
  PanditEarnings: undefined;
  PanditServiceLocation: undefined;
  PanditPayoutSetup: undefined;
  PanditTemples: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Customer: undefined;
  Pandit: undefined;
  AdminNotice: undefined;
};

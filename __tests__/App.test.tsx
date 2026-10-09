/**
 * @format
 */

import React from "react";
import ReactTestRenderer from "react-test-renderer";

jest.mock("react-native-encrypted-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() =>
      Promise.resolve({
        type: "success",
        data: { idToken: "token" },
      })
    ),
    getTokens: jest.fn(() => Promise.resolve({ idToken: "token" })),
    signOut: jest.fn(() => Promise.resolve(null)),
  },
  isSuccessResponse: jest.fn(() => true),
  isCancelledResponse: jest.fn(() => false),
  isErrorWithCode: jest.fn(() => false),
  statusCodes: {},
}));

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: any) => children,
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

jest.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: () => null,
  }),
}));

jest.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: () => null,
  }),
}));

import App from "../App";

test("App renders correctly with navigation and auth tree", async () => {
  let tree: any;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  expect(tree.toJSON()).toBeTruthy();
});

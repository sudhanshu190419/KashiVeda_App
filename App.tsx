/**
 * Kashi Veda React Native Application
 * Entry point wrapping AppProviders and RootNavigator.
 */

import React from "react";
import { StatusBar, StyleSheet, useColorScheme, View } from "react-native";
import { AppProviders } from "./src/app/AppProviders.tsx";
import { RootNavigator } from "./src/navigation/RootNavigator.tsx";
import { colors } from "./src/shared/theme/colors.ts";

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === "dark";

  return (
    <AppProviders>
      <View style={styles.root}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
        <RootNavigator />
      </View>
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default App;

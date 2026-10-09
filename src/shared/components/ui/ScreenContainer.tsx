// src/shared/components/ui/ScreenContainer.tsx
import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors.ts";
import { spacing } from "../../theme/spacing.ts";

export interface ScreenContainerProps {
  scrollable?: boolean;
  padded?: boolean;
  backgroundColor?: string;
  style?: ViewStyle;
  refreshControl?: React.ReactElement;
  children: React.ReactNode;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  scrollable = false,
  padded = true,
  backgroundColor = colors.background,
  style,
  refreshControl,
  children,
}) => {
  const insets = useSafeAreaInsets();

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor,
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };

  const contentStyle: ViewStyle = {
    flex: scrollable ? undefined : 1,
    paddingHorizontal: padded ? spacing.base : 0,
    paddingVertical: padded ? spacing.md : 0,
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={containerStyle}
    >
      {scrollable ? (
        <ScrollView
          contentContainerStyle={[contentStyle, style]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[contentStyle, style]}>{children}</View>
      )}
    </KeyboardAvoidingView>
  );
};

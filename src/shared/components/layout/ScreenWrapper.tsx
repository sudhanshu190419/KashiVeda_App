import React from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  StyleProp,
  ViewStyle,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, primitiveTokens } from '../../theme';

export interface ScreenWrapperProps {
  children: React.ReactNode;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  background?: 'surfaceBase' | 'surfaceCard' | 'obsidianVoid';
  safeArea?: 'all' | 'top' | 'bottom' | 'none';
  headerComponent?: React.ReactNode;
  footerComponent?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  keyboardAvoiding?: boolean;
  keyboardVerticalOffset?: number;
  statusBarStyle?: 'light' | 'dark' | 'auto';
  testID?: string;
}

/**
 * ScreenWrapper — Safe-area aware screen shell for Kashi Veda mobile.
 *
 * Enforces:
 * - Theme-grounded backgrounds (surfaceBase, surfaceCard, obsidianVoid)
 * - Flexible safe-area edge handling (all, top, bottom, none) via react-native-safe-area-context
 * - Scrollable / non-scrollable modes with pull-to-refresh
 * - Integrated KeyboardAvoidingView support for forms
 * - Sticky header and footer component slots
 * - Dynamic theme-aware status bar control via react-native StatusBar
 */
export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  scrollable = false,
  refreshing = false,
  onRefresh,
  background = 'surfaceBase',
  safeArea = 'all',
  headerComponent,
  footerComponent,
  contentContainerStyle,
  style,
  keyboardAvoiding = false,
  keyboardVerticalOffset = 0,
  statusBarStyle,
  testID = 'screen-wrapper',
}) => {
  const { colors, colorScheme } = useTheme();
  const insets = useSafeAreaInsets();

  // Resolve background color strictly from tokens
  const resolveBackgroundColor = (): string => {
    switch (background) {
      case 'surfaceCard':
        return colors.surfaceCard;
      case 'obsidianVoid':
        return primitiveTokens.colors.neutral[1000];
      case 'surfaceBase':
      default:
        return colors.surfaceBase;
    }
  };

  const backgroundColor = resolveBackgroundColor();

  // Compute safe area padding
  const paddingTop = safeArea === 'all' || safeArea === 'top' ? insets.top : 0;
  const paddingBottom = safeArea === 'all' || safeArea === 'bottom' ? insets.bottom : 0;
  const paddingLeft = safeArea !== 'none' ? insets.left : 0;
  const paddingRight = safeArea !== 'none' ? insets.right : 0;

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor,
    paddingTop: headerComponent ? 0 : paddingTop,
    paddingBottom: footerComponent ? 0 : paddingBottom,
    paddingLeft,
    paddingRight,
  };

  const renderContent = () => {
    if (scrollable) {
      return (
        <ScrollView
          style={[styles.flexOne, style]}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.brandPrimary}
                colors={[colors.brandPrimary]}
                progressBackgroundColor={colors.surfaceCard}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      );
    }

    return (
      <View style={[styles.flexOne, contentContainerStyle, style]}>
        {children}
      </View>
    );
  };

  const wrappedContent = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.flexOne}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {renderContent()}
    </KeyboardAvoidingView>
  ) : (
    renderContent()
  );

  // Compute status bar style
  const resolvedStatusBarStyle = statusBarStyle ?? (
    background === 'obsidianVoid' || colorScheme === 'dark' ? 'light' : 'dark'
  );

  const barStyle = resolvedStatusBarStyle === 'light' ? 'light-content' : 'dark-content';

  return (
    <View style={containerStyle} testID={testID}>
      <StatusBar barStyle={barStyle} />

      {headerComponent ? (
        <View style={{ paddingTop: safeArea === 'all' || safeArea === 'top' ? insets.top : 0 }}>
          {headerComponent}
        </View>
      ) : null}

      {wrappedContent}

      {footerComponent ? (
        <View style={{ paddingBottom: safeArea === 'all' || safeArea === 'bottom' ? insets.bottom : 0 }}>
          {footerComponent}
        </View>
      ) : null}
    </View>
  );
};

export default ScreenWrapper;

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});

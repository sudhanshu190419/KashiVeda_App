import React from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { VText } from '../foundations/VText';
import { VBadge } from '../foundations/VBadge';

export interface TabItem {
  id: string;
  label: string;
  labelHi?: string;
  badge?: number | string;
  icon?: React.ReactNode;
}

export type TabItemInput = TabItem | string;

export interface VTabsProps {
  /** Array of tabs (string[] or TabItem[]) */
  tabs: TabItemInput[];
  /** Active tab ID or string value */
  activeTab: string;
  /** Callback when tab is selected */
  onTabChange: (tabId: string) => void;
  /** Visual presentation variant */
  variant?: 'segmented' | 'underline' | 'pill';
  /** Whether the tabs should scroll horizontally if they overflow */
  isScrollable?: boolean;
  /** Container style overrides */
  style?: StyleProp<ViewStyle>;
  /** Tab item custom style */
  tabItemStyle?: StyleProp<ViewStyle>;
  /** Test identifier */
  testID?: string;
}

export type TabBarProps = VTabsProps;

/**
 * VTabs (TabBar) — Universal Segmented & Tab Control for Kashi Veda
 *
 * Grounded in:
 * - 3-tier theme tokens (Zero raw hex codes)
 * - 48x48dp minimum touch bounds on every tab item
 * - Devanagari line-height >= 1.5x and minimum 12sp typography floor
 * - 3 distinct variants: 'segmented' (standard card-style), 'underline', 'pill'
 */
export const VTabs: React.FC<VTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  variant = 'segmented',
  isScrollable = false,
  style,
  tabItemStyle,
  testID = 'v-tabs',
}) => {
  const { colors, spacing, radii, elevation } = useTheme();
  const { language } = useLanguage();

  // Normalize tab inputs to structured TabItem
  const normalizedTabs: TabItem[] = tabs.map((t) => {
    if (typeof t === 'string') {
      return { id: t, label: t };
    }
    return t;
  });

  const renderTab = (tab: TabItem) => {
    const isActive = tab.id === activeTab;

    let itemContainerStyle: StyleProp<ViewStyle>;
    let activeTextColor: keyof typeof colors | string = 'textPrimary';

    if (variant === 'segmented') {
      itemContainerStyle = [
        styles.segmentedItem,
        {
          borderRadius: radii.md,
          backgroundColor: isActive ? colors.surfaceCard : 'transparent',
        },
        isActive ? elevation.elevation1 : null,
      ];
      activeTextColor = isActive ? colors.brandPrimary : colors.textMuted;
    } else if (variant === 'underline') {
      itemContainerStyle = [
        styles.underlineItem,
        {
          borderBottomWidth: 2,
          borderBottomColor: isActive ? colors.brandPrimary : 'transparent',
        },
      ];
      activeTextColor = isActive ? colors.brandPrimary : colors.textMuted;
    } else {
      // Pill variant
      itemContainerStyle = [
        styles.pillItem,
        {
          borderRadius: radii.full,
          backgroundColor: isActive ? colors.surfaceSubtle : 'transparent',
          borderWidth: 1,
          borderColor: isActive ? colors.borderAccent : colors.borderDefault,
        },
      ];
      activeTextColor = isActive ? colors.brandPrimary : colors.textPrimary;
    }

    const displayLabel =
      language === 'hi' ? tab.labelHi ?? tab.label : tab.label;

    return (
      <Pressable
        key={tab.id}
        onPress={() => onTabChange(tab.id)}
        style={({ pressed }) => [
          styles.tabBase,
          itemContainerStyle,
          tabItemStyle,
          pressed && { opacity: 0.8 },
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={displayLabel}
        testID={`${testID}-item-${tab.id}`}
      >
        <View style={styles.tabContentRow}>
          {tab.icon && <View style={{ marginRight: spacing.xs }}>{tab.icon}</View>}
          <VText
            variant="labelMedium"
            weight={isActive ? '700' : '500'}
            color={activeTextColor as any}
          >
            {displayLabel}
          </VText>
          {tab.badge !== undefined && (
            <View style={{ marginLeft: spacing.xs }}>
              <VBadge
                variant="counter"
                count={typeof tab.badge === 'number' ? tab.badge : undefined}
                label={typeof tab.badge === 'string' ? tab.badge : undefined}
                size="sm"
                color={isActive ? 'brand' : 'muted'}
              />
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const containerBg =
    variant === 'segmented' ? colors.surfaceSubtle : 'transparent';
  const containerBorder =
    variant === 'segmented'
      ? { borderWidth: 1, borderColor: colors.borderDefault }
      : null;

  if (isScrollable) {
    return (
      <View style={[styles.outerContainer, style]} testID={testID}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            {
              backgroundColor: containerBg,
              borderRadius: radii.lg,
              padding: spacing.xs,
              gap: spacing.xs,
            },
            containerBorder,
          ]}
        >
          {normalizedTabs.map(renderTab)}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.fixedContainer,
        {
          backgroundColor: containerBg,
          borderRadius: radii.lg,
          padding: spacing.xs,
          gap: spacing.xs,
        },
        containerBorder,
        style,
      ]}
      testID={testID}
    >
      {normalizedTabs.map(renderTab)}
    </View>
  );
};

export const TabBar = VTabs;

export default VTabs;

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fixedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  tabBase: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentedItem: {
    flex: 1,
  },
  underlineItem: {
    flex: 1,
  },
  pillItem: {
    paddingHorizontal: 16,
  },
  tabContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

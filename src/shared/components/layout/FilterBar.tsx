import React from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme } from '../../theme';
import { VText } from '../foundations/VText';

export interface FilterItem {
  id: string;
  label: string;
  labelHi?: string;
  count?: number;
}

export interface FilterBarProps {
  filters: FilterItem[];
  selectedId: string;
  onSelectFilter: (id: string) => void;
  onClearAll?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * FilterBar — Horizontal scrollable filter pill / chip bar for Pujas, Pandits, and Muhurats.
 *
 * Enforces:
 * - 48dp minimum touch target floor on all filter chips and actions
 * - Clear active vs inactive contrast states anchored in theme tokens
 * - Numerical count badges per filter
 * - Bilingual label support with Devanagari vertical clearance
 * - Optional Clear All action
 */
export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  selectedId,
  onSelectFilter,
  onClearAll,
  style,
}) => {
  const { colors, spacing, radii } = useTheme();

  return (
    <View style={[styles.wrapper, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.xs,
            gap: spacing.sm,
          },
        ]}
      >
        {/* Optional Clear All Button */}
        {onClearAll ? (
          <Pressable
            onPress={onClearAll}
            style={({ pressed }) => [
              styles.chipPressable,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderRadius: radii.full,
                paddingHorizontal: spacing.md,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Ionicons
              name="refresh-outline"
              size={16}
              color={colors.textMuted}
              style={{ marginRight: spacing.xs }}
            />
            <VText variant="labelMedium" color="textMuted">
              Reset
            </VText>
          </Pressable>
        ) : null}

        {/* Filter Chips */}
        {filters.map((filter) => {
          const isSelected = filter.id === selectedId;

          const chipBg = isSelected ? colors.brandPrimary : colors.surfaceCard;
          const chipBorderColor = isSelected ? colors.brandPrimary : colors.borderDefault;
          const textColor = isSelected ? 'textOnPrimary' : 'textPrimary';

          const resolvedLabel = filter.labelHi && filter.label !== filter.labelHi
            ? `${filter.labelHi} • ${filter.label}`
            : filter.labelHi || filter.label;

          return (
            <Pressable
              key={filter.id}
              onPress={() => onSelectFilter(filter.id)}
              style={({ pressed }) => [
                styles.chipPressable,
                {
                  backgroundColor: chipBg,
                  borderColor: chipBorderColor,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.lg,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={resolvedLabel}
            >
              <VText
                variant="labelMedium"
                color={textColor}
                weight={isSelected ? '700' : '600'}
              >
                {resolvedLabel}
              </VText>

              {/* Count Badge */}
              {filter.count !== undefined ? (
                <View
                  style={[
                    styles.countBadge,
                    {
                      backgroundColor: isSelected ? colors.surfaceCard : colors.surfaceSubtle,
                      borderRadius: radii.full,
                      marginLeft: spacing.xs,
                    },
                  ]}
                >
                  <VText
                    variant="caption"
                    color={isSelected ? 'brandPrimary' : 'textMuted'}
                    weight="700"
                    style={styles.countText}
                  >
                    {String(filter.count)}
                  </VText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default FilterBar;

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipPressable: {
    minHeight: 48,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 12,
    lineHeight: 14,
  },
});

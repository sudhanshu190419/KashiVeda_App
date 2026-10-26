import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Switch,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { SamagriItem } from '../../types/domain';

export interface SamagriChecklistProps {
  /** List of ritual materials/items */
  items: SamagriItem[];
  /** Whether devotee can toggle arrangement or inclusion */
  isEditable?: boolean;
  /** Callback fired when an item's inclusion status is toggled */
  onToggleItem?: (itemId: string, included: boolean) => void;
  /** Callback fired when devotee chooses "I will arrange this myself" */
  onToggleClientArrange?: (itemId: string, arranging: boolean) => void;
  /** Currency symbol (defaults to ₹) */
  currencySymbol?: string;
  /** Container styling override */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

/**
 * SamagriChecklist — Authentic Ritual Materials Checklist
 *
 * Displays itemized puja samagri with authentic units and the sacred
 * "I will arrange myself" toggle, which adjusts the net samagri invoice live.
 */
export const SamagriChecklist: React.FC<SamagriChecklistProps> = ({
  items = [],
  isEditable = true,
  onToggleItem,
  onToggleClientArrange,
  currencySymbol = '₹',
  style,
  testID = 'samagri-checklist',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';

  // Price calculation
  const calculations = useMemo(() => {
    let grossTotal = 0;
    let clientArrangedTotal = 0;
    let clientArrangedCount = 0;
    let panditArrangedCount = 0;

    for (const item of items) {
      const price = item.priceInr ?? item.price ?? 0;
      const isIncluded = item.isIncluded !== false; // defaults to true
      const isArranging = Boolean(item.isClientArranging ?? (item as unknown as { isArrangedByDevotee?: boolean }).isArrangedByDevotee);

      if (isIncluded) {
        grossTotal += price;
        if (isArranging) {
          clientArrangedTotal += price;
          clientArrangedCount += 1;
        } else {
          panditArrangedCount += 1;
        }
      }
    }

    const netPayable = grossTotal - clientArrangedTotal;

    return {
      grossTotal,
      clientArrangedTotal,
      clientArrangedCount,
      panditArrangedCount,
      netPayable,
    };
  }, [items]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: colors.borderDefault,
          borderRadius: radii.lg,
          padding: spacing.md,
        },
        elevation.elevation1,
        style,
      ]}
      testID={testID}
      accessible={true}
      accessibilityRole="none"
      accessibilityLabel={isHi ? 'पूजन सामग्री सूची' : 'Ritual samagri checklist'}
    >
      {/* Header bar */}
      <View style={[styles.headerRow, { marginBottom: spacing.md }]}>
        <View style={styles.headerTitleWrap}>
          <View
            style={[
              styles.iconWrapper,
              {
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.full,
                marginRight: spacing.sm,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="basket-outline"
              size={18}
              color={colors.brandPrimary}
            />
          </View>
          <View>
            <Text
              style={[
                styles.titleHi,
                {
                  color: colors.textPrimary,
                  fontFamily: typography.titleSmall.fontFamily,
                  fontSize: typography.titleSmall.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
                },
              ]}
            >
              {isHi ? 'पूजन सामग्री सूची' : 'Ritual Samagri'}
            </Text>
            <Text
              style={[
                styles.subtitleEn,
                {
                  color: colors.textMuted,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                  lineHeight: typography.caption.lineHeight,
                },
              ]}
            >
              {isHi
                ? `पूजन सामग्री सूची (${items.length} वस्तुएँ)`
                : `Materials checklist (${items.length} items)`}
            </Text>
          </View>
        </View>

        {/* Live Total Pill */}
        <View
          style={[
            styles.totalPill,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderAccent,
              borderRadius: radii.full,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xxs,
            },
          ]}
        >
          <Text
            style={[
              styles.totalPillText,
              {
                color: colors.brandPrimary,
                fontFamily: typography.labelLarge.fontFamily,
                fontSize: typography.labelLarge.fontSize,
                lineHeight: typography.labelLarge.lineHeight,
              },
            ]}
          >
            {currencySymbol}
            {calculations.netPayable}
          </Text>
        </View>
      </View>

      {/* Empty State */}
      {items.length === 0 ? (
        <View
          style={[
            styles.emptyStateContainer,
            {
              backgroundColor: colors.surfaceSubtle,
              borderRadius: radii.md,
              padding: spacing.md,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="archive-outline"
            size={24}
            color={colors.textMuted}
            style={{ marginBottom: spacing.xs }}
          />
          <Text
            style={[
              styles.emptyTitle,
              {
                color: colors.textPrimary,
                fontFamily: typography.titleSmall.fontFamily,
                fontSize: typography.titleSmall.fontSize,
                lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
              },
            ]}
          >
            {isHi ? 'कोई सामग्री सूची उपलब्ध नहीं है' : 'No ritual materials listed'}
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              {
                color: colors.textMuted,
                fontFamily: typography.caption.fontFamily,
                fontSize: typography.caption.fontSize,
                lineHeight: typography.caption.lineHeight,
              },
            ]}
          >
            {isHi
              ? 'इस पूजा हेतु सामग्री सूची उपलब्ध नहीं है'
              : 'No checklist provided for this puja'}
          </Text>
        </View>
      ) : (
        /* Items List */
        <View style={styles.listContainer}>
          {items.map((item, index) => {
            const displayName = isHi
              ? item.nameHi || item.nameHindi || item.nameEn || item.nameEnglish || 'सामग्री'
              : item.nameEn || item.nameEnglish || 'Item';
            const nameEn = item.nameEn || item.nameEnglish || '';
            const price = item.priceInr ?? item.price ?? 0;
            const isIncluded = item.isIncluded !== false;
            const isClientArranging = Boolean(item.isClientArranging ?? (item as unknown as { isArrangedByDevotee?: boolean }).isArrangedByDevotee);
            const unit = isHi ? item.unitHi || item.unitEn : item.unitEn || item.unitHi;
            const quantityText = `${item.quantity}${unit ? ` ${unit}` : ''}`;

            return (
              <View
                key={item.id || `samagri-${index}`}
                style={[
                  styles.itemRow,
                  {
                    borderColor: colors.borderDefault,
                    borderBottomWidth: index === items.length - 1 ? 0 : 1,
                    paddingVertical: spacing.sm,
                  },
                ]}
              >
                {/* Left checkmark / inclusion indicator */}
                {isEditable && onToggleItem ? (
                  <Pressable
                    onPress={() => onToggleItem(item.id, !isIncluded)}
                    style={styles.checkboxTouch}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isIncluded }}
                    accessibilityLabel={displayName}
                  >
                    <Ionicons
                      name={isIncluded ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={isIncluded ? colors.brandPrimary : colors.textMuted}
                    />
                  </Pressable>
                ) : (
                  <View style={styles.bulletDot}>
                    <MaterialCommunityIcons
                      name="circle-small"
                      size={20}
                      color={colors.brandPrimary}
                    />
                  </View>
                )}

                {/* Item Details */}
                <View style={styles.itemDetailsWrap}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[
                        styles.itemTitleHi,
                        {
                          color: isIncluded ? colors.textPrimary : colors.textMuted,
                          textDecorationLine: isIncluded ? 'none' : 'line-through',
                          fontFamily: typography.bodyMedium.fontFamily,
                          fontSize: typography.bodyMedium.fontSize,
                          lineHeight: getDevanagariLineHeight(typography.bodyMedium.fontSize),
                        },
                      ]}
                    >
                      {displayName}
                    </Text>
                    <Text
                      style={[
                        styles.itemQuantity,
                        {
                          color: colors.brandPrimary,
                          backgroundColor: colors.surfaceSubtle,
                          borderRadius: radii.sm,
                          paddingHorizontal: spacing.xs,
                          paddingVertical: 1,
                          marginLeft: spacing.xs,
                          fontFamily: typography.caption.fontFamily,
                          fontSize: typography.caption.fontSize,
                          lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                        },
                      ]}
                    >
                      {quantityText}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.itemSubtitleEn,
                      {
                        color: colors.textMuted,
                        fontFamily: typography.caption.fontFamily,
                        fontSize: typography.caption.fontSize,
                        lineHeight: typography.caption.lineHeight,
                      },
                    ]}
                  >
                    {nameEn}
                  </Text>
                </View>
                <View style={styles.rightActionWrap}>
                  <Text
                    style={[
                      styles.priceText,
                      {
                        color: isClientArranging ? colors.textMuted : colors.textPrimary,
                        textDecorationLine: isClientArranging ? 'line-through' : 'none',
                        fontFamily: typography.labelLarge.fontFamily,
                        fontSize: typography.labelLarge.fontSize,
                        lineHeight: typography.labelLarge.lineHeight,
                      },
                    ]}
                  >
                    {currencySymbol}
                    {price}
                  </Text>

                  {/* Toggle: "Self arrange" */}
                  {isEditable && onToggleClientArrange && (
                    <View style={styles.arrangeToggleWrap}>
                      <Text
                        style={[
                          styles.selfArrangeLabel,
                          {
                            color: isClientArranging
                              ? colors.brandPrimary
                              : colors.textMuted,
                            fontFamily: typography.caption.fontFamily,
                            fontSize: 10,
                            lineHeight: 12,
                            marginRight: spacing.xxs,
                          },
                        ]}
                      >
                        {isHi
                          ? isClientArranging
                            ? 'स्वयं व्यवस्था'
                            : 'पंडित जी लाएँगे'
                          : isClientArranging
                          ? 'Self arrange'
                          : 'Pandit Ji brings'}
                      </Text>
                      <View style={styles.switchTouchTarget}>
                        <Switch
                          value={isClientArranging}
                          onValueChange={(val) => onToggleClientArrange(item.id, val)}
                          trackColor={{
                            false: colors.borderDefault,
                            true: colors.brandPrimary,
                          }}
                          thumbColor={colors.surfaceCard}
                          style={styles.compactSwitch}
                          accessibilityLabel={
                            isHi
                              ? `${displayName} मैं स्वयं व्यवस्था करूँगा`
                              : `I will arrange ${nameEn || displayName} myself`
                          }
                        />
                      </View>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Summary calculation card */}
      {items.length > 0 && (
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderAccent,
              borderRadius: radii.md,
              padding: spacing.sm,
              marginTop: spacing.sm,
            },
          ]}
        >
          <View style={styles.summaryLine}>
            <Text
              style={[
                styles.summaryLabel,
                {
                  color: colors.textMuted,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                },
              ]}
            >
              {isHi ? 'कुल सामग्री मूल्य:' : 'Gross material total:'}
            </Text>
            <Text
              style={[
                styles.summaryValue,
                {
                  color: colors.textPrimary,
                  fontFamily: typography.labelMedium.fontFamily,
                  fontSize: typography.labelMedium.fontSize,
                },
              ]}
            >
              {currencySymbol}
              {calculations.grossTotal}
            </Text>
          </View>

          {calculations.clientArrangedCount > 0 && (
            <View style={styles.summaryLine}>
              <Text
                style={[
                  styles.summaryLabel,
                  {
                    color: colors.statusActive,
                    fontFamily: typography.caption.fontFamily,
                    fontSize: typography.caption.fontSize,
                    lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                  },
                ]}
              >
                {isHi
                  ? `यजमान द्वारा व्यवस्था (${calculations.clientArrangedCount} वस्तुएँ छूट):`
                  : `Self-arranged by devotee (${calculations.clientArrangedCount} items):`}
              </Text>
              <Text
                style={[
                  styles.summaryValue,
                  {
                    color: colors.statusActive,
                    fontFamily: typography.labelMedium.fontFamily,
                    fontSize: typography.labelMedium.fontSize,
                  },
                ]}
              >
                - {currencySymbol}
                {calculations.clientArrangedTotal}
              </Text>
            </View>
          )}

          <View
            style={[
              styles.summaryDivider,
              {
                backgroundColor: colors.borderAccent,
                marginVertical: spacing.xs,
              },
            ]}
          />

          <View style={styles.summaryLine}>
            <Text
              style={[
                styles.netTotalLabel,
                {
                  color: colors.textPrimary,
                  fontFamily: typography.titleSmall.fontFamily,
                  fontSize: typography.titleSmall.fontSize,
                  lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
                },
              ]}
            >
              {isHi ? 'सामग्री देय राशि:' : 'Net samagri due:'}
            </Text>
            <Text
              style={[
                styles.netTotalValue,
                {
                  color: colors.brandPrimary,
                  fontFamily: typography.headlineSmall.fontFamily,
                  fontSize: typography.headlineSmall.fontSize,
                },
              ]}
            >
              {currencySymbol}
              {calculations.netPayable}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

export default SamagriChecklist;

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleHi: {
    fontWeight: '700',
  },
  subtitleEn: {
    marginTop: 1,
  },
  totalPill: {
    borderWidth: 1,
  },
  totalPillText: {
    fontWeight: '700',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
  },
  emptyTitle: {
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    marginTop: 2,
  },
  listContainer: {
    width: '100%',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  checkboxTouch: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletDot: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDetailsWrap: {
    flex: 1,
    paddingRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  itemTitleHi: {
    fontWeight: '600',
  },
  itemQuantity: {
    fontWeight: '600',
  },
  itemSubtitleEn: {
    marginTop: 1,
  },
  rightActionWrap: {
    alignItems: 'flex-end',
  },
  priceText: {
    fontWeight: '700',
  },
  arrangeToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  selfArrangeLabel: {
    fontWeight: '500',
  },
  switchTouchTarget: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  summaryCard: {
    borderWidth: 1,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    flex: 1,
  },
  summaryValue: {
    fontWeight: '600',
  },
  summaryDivider: {
    height: 1,
    width: '100%',
  },
  netTotalLabel: {
    fontWeight: '700',
    flex: 1,
  },
  netTotalValue: {
    fontWeight: '800',
  },
});

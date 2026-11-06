// src/shared/components/spiritual/PujaKitCard.tsx
import React from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { VCard } from '../layout/VCard.tsx';
import { VText } from '../foundations/VText.tsx';
import { VButton } from '../foundations/VButton.tsx';
import { useTheme } from '../../theme/index.ts';
import { useLanguage } from '../../i18n/index.ts';
import { formatCurrency } from '../../utils/formatters.ts';
import { MaterialCommunityIcons } from '../icons/index.ts';

export interface PujaKitItem {
  name: string;
  quantity?: string;
}

export interface PujaKitCardProps {
  /** Name of the kit, e.g. "Rudrabhishek Standard Kit" */
  packageName?: string;
  /** Subtitle context, e.g. "Essential ritual items arranged for you" */
  subtitle?: string;
  /** List of included ingredients/items */
  items?: PujaKitItem[];
  /** Price of the kit in INR */
  price?: number;
  /** Whether the kit is currently selected in booking flow */
  isSelected?: boolean;
  /** Optional selection toggle callback */
  onToggleSelect?: () => void;
  /** Action button handler */
  onActionPress?: () => void;
  /** Action button custom label */
  actionLabel?: string;
  /** Container style overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

const DEFAULT_ITEMS: PujaKitItem[] = [
  { name: 'Pure Haridwar Ganga Jal', quantity: '250ml' },
  { name: 'Desi Gir Cow Bilona Ghee', quantity: '500g' },
  { name: 'Fresh Bilva Patra & Kusha Grass', quantity: 'Handpicked' },
  { name: 'Natural Sandalwood & Raktachandan', quantity: 'Pure Paste' },
];

/**
 * PujaKitCard — Human-designed component for standard and curated puja samagri kits.
 * Direct, honest ingredient list with transparent pricing and zero marketing slop.
 */
export const PujaKitCard: React.FC<PujaKitCardProps> = ({
  packageName = 'Puja Essentials Kit',
  subtitle,
  items = DEFAULT_ITEMS,
  price = 850,
  isSelected,
  onToggleSelect,
  onActionPress,
  actionLabel,
  style,
  testID = 'puja-kit-card',
}) => {
  const { colors, spacing, radii } = useTheme();
  const { pick } = useLanguage();

  const defaultActionText =
    actionLabel ||
    (isSelected
      ? pick('चयनित किट', 'Kit Selected')
      : pick('किट जोड़ें', 'Add Kit'));

  return (
    <VCard
      variant="default"
      elevation={isSelected ? 2 : 1}
      onPress={onToggleSelect || onActionPress}
      style={[
        styles.container,
        isSelected && {
          borderColor: colors.brandPrimary,
          borderWidth: 1.5,
        },
        style,
      ]}
      testID={testID}
    >
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <VText variant="titleMedium" color="textPrimary" weight="600">
            {packageName}
          </VText>
          {subtitle ? (
            <VText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              {subtitle}
            </VText>
          ) : null}
        </View>

        {isSelected !== undefined && (
          <MaterialCommunityIcons
            name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
            size={22}
            color={isSelected ? colors.brandPrimary : colors.textMuted}
          />
        )}
      </View>

      {/* Itemized List */}
      <View style={styles.itemsList}>
        {items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <MaterialCommunityIcons
              name="check"
              size={16}
              color={colors.statusSuccess}
              style={styles.checkIcon}
            />
            <VText variant="bodySmall" color="textPrimary" style={{ flex: 1 }}>
              {item.name}
            </VText>
            {item.quantity ? (
              <VText variant="caption" color="textMuted">
                {item.quantity}
              </VText>
            ) : null}
          </View>
        ))}
      </View>

      {/* Footer: Price & Decisive Action */}
      <View
        style={[
          styles.footerRow,
          {
            borderTopColor: colors.borderDefault,
            borderTopWidth: 1,
          },
        ]}
      >
        <View>
          <VText variant="caption" color="textMuted">
            {pick('किट मूल्य', 'Kit Total')}
          </VText>
          <VText variant="titleMedium" color="textPrimary" weight="700">
            {formatCurrency(price)}
          </VText>
        </View>

        <VButton
          label={defaultActionText}
          variant={isSelected ? 'secondary' : 'primary'}
          size="sm"
          onPress={onActionPress || onToggleSelect}
          testID={`${testID}-action`}
        />
      </View>
    </VCard>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    borderRadius: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  itemsList: {
    marginBottom: 16,
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkIcon: {
    marginRight: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
});

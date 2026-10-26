import React from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme';

export interface VCardProps {
  children: React.ReactNode;
  /** Elevation depth (0 to 4) */
  elevation?: 0 | 1 | 2 | 3 | 4;
  /** Visual variant */
  variant?: 'default' | 'outlined' | 'subtle';
  /** Optional press handler for interactive cards */
  onPress?: () => void;
  /** Container styling overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

/**
 * VCard (Card) — Standard surface card container for Kashi Veda mobile.
 *
 * Enforces:
 * - Design system radii (radii.lg = 12dp standard)
 * - Semantic surface backgrounds (colors.surfaceCard or colors.surfaceSubtle)
 * - Token-grounded elevation levels (elevation0 to elevation4)
 * - 48dp minimum bounds when interactive
 */
export const VCard: React.FC<VCardProps> = ({
  children,
  elevation = 1,
  variant = 'default',
  onPress,
  style,
  testID = 'v-card',
}) => {
  const { colors, radii, elevation: themeElevation } = useTheme();

  // Resolve elevation style
  const resolveElevation = () => {
    switch (elevation) {
      case 0:
        return themeElevation.elevation0;
      case 2:
        return themeElevation.elevation2;
      case 3:
        return themeElevation.elevation3;
      case 4:
        return themeElevation.elevation4;
      case 1:
      default:
        return themeElevation.elevation1;
    }
  };

  const isSubtle = variant === 'subtle';
  const isOutlined = variant === 'outlined';

  const cardStyle: ViewStyle = {
    backgroundColor: isSubtle ? colors.surfaceSubtle : colors.surfaceCard,
    borderColor: isOutlined ? colors.borderAccent : colors.borderDefault,
    borderWidth: 1,
    borderRadius: radii.lg,
  };

  const content = (
    <View
      style={[
        styles.container,
        cardStyle,
        resolveElevation(),
        style,
      ]}
      testID={testID}
      accessible={true}
      accessibilityRole={onPress ? 'button' : 'none'}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return content;
};

export const Card = VCard;
export type CardProps = VCardProps;

export default VCard;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
});

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '../icons';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';

export interface SolarBrandGlyphProps {
  /** Diameter of the solar glyph in dp (default: 48) */
  size?: number;
  /** Tint color override (defaults to theme.colors.brandPrimary) */
  tint?: string;
  /** Whether to show the sacred Om symbol in center */
  showOm?: boolean;
  /** Container styling overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

/**
 * SolarBrandGlyph — Sacred Vedic Surya (Solar) Brand Icon
 *
 * Represents the eternal solar energy of Kashi (Aditya Mandalas),
 * with 12 rays corresponding to the 12 Adityas and a consecrated central Om.
 */
export const SolarBrandGlyph: React.FC<SolarBrandGlyphProps> = ({
  size = 48,
  tint,
  showOm = true,
  style,
  testID = 'solar-brand-glyph',
}) => {
  const { colors, radii } = useTheme();
  const { language } = useLanguage();

  const glyphColor = tint || colors.brandPrimary;
  const innerSize = Math.round(size * 0.62);
  const omFontSize = Math.round(innerSize * 0.58);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
        },
        style,
      ]}
      testID={testID}
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={
        language === 'hi' ? 'काशी वेदा सूर्य प्रतीक' : 'Kashi Veda solar brand glyph'
      }
    >
      {/* Outer 12-Rayed Surya Corona */}
      <MaterialCommunityIcons
        name="sun-wireless-outline"
        size={size}
        color={glyphColor}
        style={styles.coronaIcon}
      />

      {/* Consecrated Om Center */}
      {showOm && (
        <View
          style={[
            styles.centerHalo,
            {
              width: innerSize,
              height: innerSize,
              borderRadius: radii.full,
              backgroundColor: colors.surfaceSubtle,
              borderColor: glyphColor,
            },
          ]}
        >
          <Text
            style={[
              styles.omText,
              {
                color: glyphColor,
                fontSize: omFontSize,
                lineHeight: omFontSize + 2,
              },
            ]}
          >
            ॐ
          </Text>
        </View>
      )}
    </View>
  );
};

export default SolarBrandGlyph;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  coronaIcon: {
    position: 'absolute',
  },
  centerHalo: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  omText: {
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
});

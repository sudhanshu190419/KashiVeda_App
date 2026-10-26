import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '../icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { SolarBrandGlyph } from '../foundations/SolarBrandGlyph';

export interface AppBarProps {
  /** Title text (English or bilingual) */
  title: string;
  /** Optional title in Devanagari Hindi */
  titleHi?: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Whether to show a back button */
  showBackButton?: boolean;
  /** Back button press handler */
  onBackPress?: () => void;
  /** Whether to display the solar brand glyph */
  showBrandGlyph?: boolean;
  /** Geographic location badge (e.g., 'वाराणसी / Varanasi') */
  locationBadge?: string;
  /** Whether to show a share button */
  showShareButton?: boolean;
  /** Share button press handler */
  onSharePress?: () => void;
  /** Optional custom right-hand action component */
  rightComponent?: React.ReactNode;
  /** Whether AppBar includes safe-area top inset padding (defaults to false when handled by ScreenWrapper) */
  includeSafeArea?: boolean;
  /** Container styling overrides */
  style?: StyleProp<ViewStyle>;
  /** Accessibility / test identifier */
  testID?: string;
}

/**
 * AppBar — Canonical Top Navigation Bar for Kashi Veda
 *
 * Implements:
 * - Brand glyph display with sacred solar insignia
 * - Varanasi sacred location badge
 * - Language switcher button
 * - Share and back action triggers with 48x48dp touch targets
 * - Devanagari headline typography with guaranteed line-height & clearance
 */
export const AppBar: React.FC<AppBarProps> = ({
  title,
  titleHi,
  subtitle,
  showBackButton = false,
  onBackPress,
  showBrandGlyph = false,
  locationBadge,
  showShareButton = false,
  onSharePress,
  rightComponent,
  includeSafeArea = false,
  style,
  testID = 'app-bar',
}) => {
  const { colors, spacing, radii, typography, elevation } = useTheme();
  const { language, toggleLanguage, t } = useLanguage();
  const insets = useSafeAreaInsets();

  const containerPaddingTop = includeSafeArea ? insets.top : 0;

  // True language switch: render one script, never both side by side.
  const resolvedTitle = language === 'hi' ? titleHi ?? title : title;
  const titleHasDevanagari = /[\u0900-\u097F]/.test(resolvedTitle);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceCard,
          borderBottomColor: colors.borderDefault,
          borderBottomWidth: 1,
          paddingTop: containerPaddingTop,
          paddingHorizontal: spacing.md,
        },
        elevation.elevation1,
        style,
      ]}
      testID={testID}
      accessible={true}
      accessibilityRole="header"
    >
      <View style={styles.contentRow}>
        {/* Left Section: Back Button or Brand Glyph */}
        <View style={styles.leftSection}>
          {showBackButton ? (
            <Pressable
              onPress={onBackPress}
              style={styles.iconButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <Ionicons
                name="arrow-back"
                size={22}
                color={colors.textPrimary}
              />
            </Pressable>
          ) : showBrandGlyph ? (
            <View style={styles.brandGlyphWrap}>
              <SolarBrandGlyph size={32} />
            </View>
          ) : null}
        </View>

        {/* Center Section: Title & Subtitle / Location */}
        <View style={styles.centerSection}>
          <Text
            style={[
              styles.titleText,
              {
                color: colors.textPrimary,
                fontFamily: titleHasDevanagari
                  ? 'NotoSansDevanagari-Bold'
                  : typography.titleMedium.fontFamily,
                fontSize: typography.titleMedium.fontSize,
                lineHeight: getDevanagariLineHeight(typography.titleMedium.fontSize),
                fontWeight: titleHasDevanagari ? '400' : '700',
              },
            ]}
            numberOfLines={1}
          >
            {resolvedTitle}
          </Text>

          {locationBadge ? (
            <View style={styles.locationRow}>
              <Ionicons
                name="location-sharp"
                size={11}
                color={colors.brandPrimary}
                style={{ marginRight: spacing.xxs }}
              />
              <Text
                style={[
                  styles.locationText,
                  {
                    color: colors.brandPrimary,
                    fontFamily: typography.caption.fontFamily,
                    fontSize: typography.caption.fontSize,
                    lineHeight: typography.caption.lineHeight,
                  },
                ]}
                numberOfLines={1}
              >
                {locationBadge}
              </Text>
            </View>
          ) : subtitle ? (
            <Text
              style={[
                styles.subtitleText,
                {
                  color: colors.textMuted,
                  fontFamily: typography.caption.fontFamily,
                  fontSize: typography.caption.fontSize,
                },
              ]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Right Section: Actions */}
        <View style={styles.rightSection}>
          {rightComponent ? (
            rightComponent
          ) : (
            <>
              {/* Language Switcher — flips the whole app locale */}
              <Pressable
                onPress={toggleLanguage}
                style={[
                  styles.langToggleBtn,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderAccent,
                    borderRadius: radii.full,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('common.languageToggle')}
              >
                <Text
                  style={[
                    styles.langText,
                    {
                      color: colors.brandPrimary,
                      fontFamily: 'NotoSansDevanagari-SemiBold',
                      fontSize: typography.caption.fontSize,
                      lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
                    },
                  ]}
                >
                  {t('common.languageCode')}
                </Text>
              </Pressable>

              {/* Share Button */}
              {showShareButton ? (
                <Pressable
                  onPress={onSharePress}
                  style={styles.iconButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.share')}
                >
                  <Ionicons
                    name="share-social-outline"
                    size={20}
                    color={colors.textPrimary}
                  />
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </View>
    </View>
  );
};

export default AppBar;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 56,
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  leftSection: {
    minWidth: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandGlyphWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  titleText: {
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitleText: {
    textAlign: 'center',
    marginTop: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  locationText: {
    fontWeight: '600',
  },
  rightSection: {
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  langToggleBtn: {
    minWidth: 48,
    minHeight: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  langText: {
    fontWeight: '700',
  },
});

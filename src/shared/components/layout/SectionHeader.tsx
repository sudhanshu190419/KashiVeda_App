import React from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { VText } from '../foundations/VText';

export interface SectionHeaderProps {
  title: string;
  titleHi?: string;
  subtitle?: string;
  subtitleHi?: string;
  actionLabel?: string;
  actionLabelHi?: string;
  onActionPress?: () => void;
  sacredGlyph?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * SectionHeader — Sacred standardized section title with optional action link and ornament.
 *
 * Enforces:
 * - Bilingual titles and subtitles with proper Devanagari vertical clearance
 * - Optional sacred Vedic glyph accent (sacred flame / sparkle ornament)
 * - 48x48dp minimum touch bounds for the action button
 * - Token-grounded typography and colors via useTheme()
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  titleHi,
  subtitle,
  subtitleHi,
  actionLabel,
  actionLabelHi,
  onActionPress,
  sacredGlyph = false,
  style,
}) => {
  const { colors, spacing } = useTheme();
  const { language } = useLanguage();

  const hasAction = Boolean(onActionPress && (actionLabel || actionLabelHi));

  const resolvedTitle = language === 'hi' ? titleHi ?? title : title;
  const resolvedSubtitle =
    language === 'hi' ? subtitleHi ?? subtitle : subtitle;
  const resolvedActionLabel =
    language === 'hi' ? actionLabelHi ?? actionLabel ?? '' : actionLabel ?? '';

  return (
    <View style={[styles.container, { marginBottom: spacing.md }, style]}>
      <View style={styles.contentRow}>
        <View style={styles.titleColumn}>
          <View style={styles.headerTitleRow}>
            {sacredGlyph && (
              <View
                style={[
                  styles.glyphContainer,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    marginRight: spacing.sm,
                  },
                ]}
              >
                <Ionicons name="sparkles" size={14} color={colors.brandPrimary} />
              </View>
            )}

            <View style={styles.titleWrap}>
              <VText variant="headlineSmall" color="textPrimary" style={styles.textWrap}>
                {resolvedTitle}
              </VText>
            </View>
          </View>

          {/* Subtitle / Description */}
          {resolvedSubtitle ? (
            <View style={{ marginTop: spacing.xxs }}>
              <VText variant="bodyMedium" color="textMuted">
                {resolvedSubtitle}
              </VText>
            </View>
          ) : null}
        </View>

        {/* Action Button with 48x48dp touch floor */}
        {hasAction ? (
          <Pressable
            onPress={onActionPress}
            style={({ pressed }) => [
              styles.actionPressable,
              {
                paddingHorizontal: spacing.sm,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={resolvedActionLabel}
          >
            <VText
              variant="labelMedium"
              color="brandPrimary"
              weight="700"
              style={{ marginRight: spacing.xxs }}
            >
              {resolvedActionLabel}
            </VText>
            <Ionicons name="chevron-forward" size={14} color={colors.brandPrimary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

export default SectionHeader;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  textWrap: {
    flexWrap: 'wrap',
  },
  glyphContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressable: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

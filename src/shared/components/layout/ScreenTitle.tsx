import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { VText } from '../foundations/VText';

export interface ScreenTitleProps {
  /** Main page title. Set in the active language by the caller. */
  title: string;
  /** Optional short line above the title (e.g. a date or section). */
  eyebrow?: string;
  /** Optional supporting line below the title. */
  subtitle?: string;
  /** Horizontal alignment of the block. */
  align?: 'left' | 'center';
  /** Container style overrides. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * ScreenTitle — Display-tier page header for Kashi Veda.
 *
 * The signature layer of the app: Rozha One at display size, a hairline rule
 * with a temple-diamond ornament, and a quiet muted subtitle. Every primary
 * screen can share this rhythm so pages read as one publication rather than
 * a stack of unrelated cards.
 *
 * Rules honoured:
 * - Rozha One is single-weight (400); no faux bold.
 * - Devanagari line-height clearance is applied by VText automatically.
 * - All colors and spacing come from theme tokens.
 */
export const ScreenTitle: React.FC<ScreenTitleProps> = ({
  title,
  eyebrow,
  subtitle,
  align = 'left',
  style,
  testID = 'screen-title',
}) => {
  const { colors, spacing } = useTheme();
  const ruleWidth = spacing.xxxl + spacing.xs;
  const isCentered = align === 'center';
  const ornamentAlignment = isCentered
    ? { justifyContent: 'center' as const }
    : { justifyContent: 'flex-start' as const };

  return (
    <View
      style={[styles.container, isCentered && styles.centered, style]}
      testID={testID}
    >
      {eyebrow ? (
        <VText
          variant="caption"
          color="brandPrimary"
          weight="700"
          align={align}
          style={styles.eyebrow}
        >
          {eyebrow}
        </VText>
      ) : null}

      <VText variant="displayHero" color="textPrimary" align={align} style={styles.title}>
        {title}
      </VText>

      {/* Ornamental rule: hairline — diamond — hairline */}
      <View style={[styles.ornamentRow, ornamentAlignment]}>
        <View
          style={[
            styles.rule,
            {
              width: ruleWidth,
              backgroundColor: colors.borderDefault,
              marginRight: spacing.sm,
            },
          ]}
        />
        <View
          style={[
            styles.diamond,
            {
              width: spacing.xs,
              height: spacing.xs,
              backgroundColor: colors.borderAccent,
              marginRight: spacing.sm,
            },
          ]}
        />
        <View
          style={[
            styles.rule,
            { width: ruleWidth, backgroundColor: colors.borderDefault },
          ]}
        />
      </View>

      {subtitle ? (
        <VText variant="bodyMedium" color="textMuted" align={align}>
          {subtitle}
        </VText>
      ) : null}
    </View>
  );
};

export default ScreenTitle;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  centered: {
    alignItems: 'center',
  },
  eyebrow: {
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    letterSpacing: -0.25,
  },
  ornamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rule: {
    height: 1,
  },
  diamond: {
    transform: [{ rotate: '45deg' }],
  },
});

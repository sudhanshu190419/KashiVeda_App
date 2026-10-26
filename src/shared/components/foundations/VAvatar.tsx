import React, { useState } from 'react';
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
  ImageStyle,
  ImageSourcePropType,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme, MIN_FONT_SIZE } from '../../theme';
import { VText } from './VText';

export type VAvatarSize = 'sm' | 'md' | 'lg' | 'xl' | number;

export interface VAvatarProps {
  /** Remote image URI string */
  uri?: string | null;
  /** Image source object or local asset */
  source?: ImageSourcePropType;
  /** Full name for monogram initials generation and accessibility */
  name?: string;
  /** Standard preset ('sm' | 'md' | 'lg' | 'xl') or custom numerical diameter in dp */
  size?: VAvatarSize;
  /** Displays a sacred verified checkmark badge overlay on bottom right */
  isVerified?: boolean;
  /** Press handler. When provided, automatically guarantees >= 48x48dp hit bounds */
  onPress?: () => void;
  /** Custom accessibility label */
  accessibilityLabel?: string;
  /** Outer container style */
  style?: StyleProp<ViewStyle>;
  /** Inner image style */
  imageStyle?: StyleProp<ImageStyle>;
  /** Test identifier */
  testID?: string;
}

export type AvatarProps = VAvatarProps;

const SIZE_MAP: Record<'sm' | 'md' | 'lg' | 'xl', number> = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

/**
 * Extracts 1-2 initial characters from English or Devanagari names.
 */
function getInitials(name?: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const single = parts[0];
    return Array.from(single).slice(0, 2).join('').toUpperCase();
  }
  const first = Array.from(parts[0])[0] || '';
  const second = Array.from(parts[parts.length - 1])[0] || '';
  return `${first}${second}`.toUpperCase();
}

/**
 * VAvatar — Devotee and Pandit profile portrait with initials fallback and verified overlay.
 *
 * Enforces:
 * - 4 standard sizes: sm (32dp), md (40dp), lg (56dp), xl (80dp)
 * - Automatic touch target expansion to >= 48x48dp hit bounds when onPress is provided
 * - Bilingual monogram fallback for Latin and Devanagari names
 * - Verified sacred checkmark badge overlay
 * - Strict theme token grounding
 */
export const VAvatar: React.FC<VAvatarProps> = ({
  uri,
  source,
  name,
  size = 'md',
  isVerified = false,
  onPress,
  accessibilityLabel,
  style,
  imageStyle,
  testID,
}) => {
  const theme = useTheme();
  const [imageError, setImageError] = useState(false);

  // Resolve numerical diameter
  const diameter = typeof size === 'number' ? size : SIZE_MAP[size] ?? 40;

  // Resolve image source
  const resolvedSource: ImageSourcePropType | null = source
    ? source
    : uri
    ? { uri }
    : null;

  const showImage = Boolean(resolvedSource && !imageError);
  const initials = getInitials(name);

  // Compute typography size for monogram (strict 12sp floor)
  const monogramFontSize = Math.max(
    MIN_FONT_SIZE,
    Math.round(diameter * 0.38)
  );

  // Dimensions for verified badge overlay
  const badgeDiameter = Math.max(12, Math.round(diameter * 0.3));
  const badgeIconSize = Math.max(8, Math.round(badgeDiameter * 0.65));

  // Minimum 48x48dp hit bounds calculation
  const hitSlopPadding = Math.max(0, Math.ceil((theme.spacing.touch - diameter) / 2));
  const hitSlop = {
    top: hitSlopPadding,
    bottom: hitSlopPadding,
    left: hitSlopPadding,
    right: hitSlopPadding,
  };

  const defaultA11yLabel = accessibilityLabel || (name ? `${name}'s profile picture` : 'Profile picture');

  const avatarContent = (
    <View
      style={[
        styles.avatarContainer,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: theme.colors.surfaceSubtle,
          borderColor: theme.colors.borderAccent,
        },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={resolvedSource!}
          style={[
            styles.image,
            {
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
            },
            imageStyle,
          ]}
          onError={() => setImageError(true)}
          resizeMode="cover"
        />
      ) : initials ? (
        <VText
          variant="labelMedium"
          color={theme.colors.brandPrimary}
          style={[
            styles.monogramText,
            {
              fontSize: monogramFontSize,
              lineHeight: Math.max(monogramFontSize * 1.2, MIN_FONT_SIZE),
            },
          ]}
        >
          {initials}
        </VText>
      ) : (
        <Ionicons
          name="person"
          size={Math.max(16, Math.round(diameter * 0.5))}
          color={theme.colors.brandPrimary}
        />
      )}

      {isVerified && (
        <View
          style={[
            styles.verifiedBadge,
            {
              width: badgeDiameter,
              height: badgeDiameter,
              borderRadius: badgeDiameter / 2,
              backgroundColor: theme.colors.statusActive,
              borderColor: theme.colors.surfaceCard,
            },
          ]}
        >
          <Ionicons
            name="checkmark"
            size={badgeIconSize}
            color={theme.colors.textOnPrimary}
          />
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={defaultA11yLabel}
        style={({ pressed }) => [
          styles.pressableContainer,
          pressed && styles.pressed,
        ]}
      >
        {avatarContent}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={defaultA11yLabel}
      style={styles.pressableContainer}
    >
      {avatarContent}
    </View>
  );
};

const styles = StyleSheet.create({
  pressableContainer: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'visible',
    position: 'relative',
  },
  image: {
    overflow: 'hidden',
  },
  monogramText: {
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});

export default VAvatar;

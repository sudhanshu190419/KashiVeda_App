import React, { useRef } from 'react';
import {
  Text,
  Pressable,
  Animated,
  ActivityIndicator,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
  Insets,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme, getDevanagariLineHeight } from '../../theme';

export interface VButtonProps {
  label?: string;
  title?: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  isLoading?: boolean;
  isDisabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export type ButtonProps = VButtonProps;

export const VButton: React.FC<VButtonProps> = ({
  label,
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  leadingIcon,
  trailingIcon,
  isLoading = false,
  isDisabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}) => {
  const { colors, spacing, radii, typography } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  // Dimensions & hitSlop for 48dp minimum touch target guarantee
  const getHeight = (): number => {
    switch (size) {
      case 'sm':
        return 32;
      case 'md':
        return 40;
      case 'lg':
      default:
        return spacing.touch; // 48dp
    }
  };

  const getHitSlop = (): Insets | undefined => {
    if (size === 'sm') {
      return { top: spacing.sm, bottom: spacing.sm, left: spacing.sm, right: spacing.sm }; // 32 + 16 = 48dp
    }
    if (size === 'md') {
      return { top: spacing.xs, bottom: spacing.xs, left: spacing.xs, right: spacing.xs }; // 40 + 8 = 48dp
    }
    return undefined;
  };

  const getHorizontalPadding = (): number => {
    switch (size) {
      case 'sm':
        return spacing.md;
      case 'md':
        return spacing.lg;
      case 'lg':
      default:
        return spacing.xl;
    }
  };

  const resolvedLabel = label ?? title ?? '';

  // Devanagari script detection for font pairing and vertical clearance
  const isDevanagari = /[\u0900-\u097F]/.test(resolvedLabel);
  const baseType = size === 'sm' ? typography.labelMedium : typography.labelLarge;
  const fontSize = Math.max(baseType.fontSize, 12);
  const lineHeight = isDevanagari ? getDevanagariLineHeight(fontSize) : baseType.lineHeight;
  const fontFamily = isDevanagari ? 'NotoSansDevanagari-Bold' : baseType.fontFamily;

  // Variant color definitions
  const getTextColor = (): string => {
    if (isDisabled) {
      return colors.textMuted;
    }
    switch (variant) {
      case 'primary':
        return colors.textOnPrimary;
      case 'secondary':
        return colors.textPrimary;
      case 'outline':
      case 'ghost':
        return colors.brandPrimary;
      case 'destructive':
        return colors.statusAlert;
    }
  };

  const textColor = getTextColor();
  const height = getHeight();
  const paddingHorizontal = getHorizontalPadding();
  const hitSlop = getHitSlop();

  const renderContent = () => (
    <View style={styles.contentRow}>
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={textColor}
          style={styles.spinner}
          accessibilityElementsHidden={true}
        />
      ) : (
        <>
          {leadingIcon ? <View style={[styles.iconContainer, { marginRight: spacing.sm }]}>{leadingIcon}</View> : null}
          <Text
            style={[
              {
                color: textColor,
                fontSize,
                lineHeight,
                fontFamily,
                fontWeight: '700',
                textAlign: 'center',
                includeFontPadding: false,
              },
            ]}
            numberOfLines={1}
          >
            {resolvedLabel}
          </Text>
          {trailingIcon ? <View style={[styles.iconContainer, { marginLeft: spacing.sm }]}>{trailingIcon}</View> : null}
        </>
      )}
    </View>
  );

  const containerBaseStyle: ViewStyle = {
    height,
    minWidth: spacing.touch,
    paddingHorizontal,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: fullWidth ? '100%' : undefined,
    opacity: isDisabled ? 0.38 : 1,
  };

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }], width: fullWidth ? '100%' : undefined },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled || isLoading}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || resolvedLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: isLoading }}
        testID={testID}
      >
        {variant === 'primary' ? (
          <LinearGradient
            colors={[colors.brandButtonGradient[0], colors.brandButtonGradient[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[containerBaseStyle, styles.primaryGradient]}
          >
            {renderContent()}
          </LinearGradient>
        ) : (
          <View
            style={[
              containerBaseStyle,
              variant === 'secondary' && {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderWidth: 1,
              },
              variant === 'outline' && {
                backgroundColor: 'transparent',
                borderColor: colors.borderAccent,
                borderWidth: 1.5,
              },
              variant === 'ghost' && {
                backgroundColor: 'transparent',
              },
              variant === 'destructive' && {
                backgroundColor: colors.errorBg,
                borderColor: colors.statusAlert,
                borderWidth: 1,
              },
            ]}
          >
            {renderContent()}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

export const Button = VButton;
export default VButton;

const styles = StyleSheet.create({
  primaryGradient: {
    overflow: 'hidden',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    paddingVertical: 2,
  },
});

import React, { useRef } from 'react';
import {
  Pressable,
  Animated,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
  Insets,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../theme';

export interface VIconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  variant?: 'surface' | 'ghost' | 'brand' | 'destructive';
  size?: 36 | 40 | 48;
  isDisabled?: boolean;
  accessibilityLabel: string; // MANDATORY for screen readers per spec
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export type IconButtonProps = VIconButtonProps;

export const VIconButton: React.FC<VIconButtonProps> = ({
  icon,
  onPress,
  variant = 'ghost',
  size = 40,
  isDisabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}) => {
  const { colors, radii, spacing } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.94,
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

  // Enforce 48x48dp minimum touch target floor via calculated hitSlop
  const getHitSlop = (): Insets | undefined => {
    if (size < spacing.touch) {
      const delta = (spacing.touch - size) / 2;
      return { top: delta, bottom: delta, left: delta, right: delta };
    }
    return undefined;
  };

  const hitSlop = getHitSlop();

  const containerStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: isDisabled ? 0.38 : 1,
  };

  const renderInner = () => (
    <View style={styles.centerContainer}>
      {icon}
    </View>
  );

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled }}
        testID={testID}
      >
        {variant === 'brand' ? (
          <LinearGradient
            colors={[colors.brandButtonGradient[0], colors.brandButtonGradient[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[containerStyle, styles.gradientOverflow]}
          >
            {renderInner()}
          </LinearGradient>
        ) : (
          <View
            style={[
              containerStyle,
              variant === 'surface' && {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.borderDefault,
                borderWidth: 1,
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
            {renderInner()}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

export const IconButton = VIconButton;
export default VIconButton;

const styles = StyleSheet.create({
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientOverflow: {
    overflow: 'hidden',
  },
});

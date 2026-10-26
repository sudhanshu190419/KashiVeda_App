import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Pressable,
  Animated,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { VText } from '../foundations/VText';

export interface AccordionSection {
  id: string;
  title: string;
  titleHi?: string;
  subtitle?: string;
  subtitleHi?: string;
  content: React.ReactNode;
  defaultOpen?: boolean;
}

export interface AccordionListProps {
  sections: AccordionSection[];
  allowMultiple?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface AccordionItemProps {
  section: AccordionSection;
  isOpen: boolean;
  onToggle: () => void;
}

const AccordionItem: React.FC<AccordionItemProps> = ({
  section,
  isOpen,
  onToggle,
}) => {
  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();
  const resolvedTitle = language === 'hi' ? section.titleHi ?? section.title : section.title;
  const resolvedSubtitle =
    language === 'hi' ? section.subtitleHi ?? section.subtitle : section.subtitle;
  const rotationAnim = useRef(new Animated.Value(isOpen ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotationAnim, {
      toValue: isOpen ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isOpen, rotationAnim]);

  const chevronRotate = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View
      style={[
        styles.itemContainer,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: colors.borderDefault,
          borderRadius: radii.md,
          marginBottom: spacing.sm,
        },
      ]}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.headerPressable,
          {
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            backgroundColor: pressed ? colors.surfaceSubtle : 'transparent',
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={resolvedTitle}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        <View style={styles.titleColumn}>
          <View style={styles.titleRow}>
            <VText variant="titleMedium" color="textPrimary">
              {resolvedTitle}
            </VText>
          </View>

          {resolvedSubtitle ? (
            <View style={{ marginTop: spacing.xxs }}>
              <VText variant="bodyMedium" color="textMuted">
                {resolvedSubtitle}
              </VText>
            </View>
          ) : null}
        </View>

        <Animated.View
          style={[
            styles.chevronContainer,
            { transform: [{ rotate: chevronRotate }] },
          ]}
        >
          <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
        </Animated.View>
      </Pressable>

      {isOpen && (
        <View
          style={[
            styles.contentContainer,
            {
              borderTopColor: colors.borderDefault,
              padding: spacing.lg,
            },
          ]}
        >
          {section.content}
        </View>
      )}
    </View>
  );
};

/**
 * AccordionList — Expandable/collapsible section list for FAQs, Ritual details, and Guidelines.
 *
 * Enforces:
 * - 48dp minimum touch bounds for headers
 * - Smooth animated chevron rotation indicator
 * - Bilingual support for section titles and subtitles
 * - Single-open or multiple-open accordion orchestration
 */
export const AccordionList: React.FC<AccordionListProps> = ({
  sections,
  allowMultiple = false,
  style,
}) => {
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    sections.forEach((s) => {
      if (s.defaultOpen) {
        initial.add(s.id);
      }
    });
    return initial;
  });

  const handleToggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      const isCurrentlyOpen = next.has(id);

      if (isCurrentlyOpen) {
        next.delete(id);
      } else {
        if (!allowMultiple) {
          next.clear();
        }
        next.add(id);
      }
      return next;
    });
  };

  return (
    <View style={[styles.container, style]}>
      {sections.map((section) => (
        <AccordionItem
          key={section.id}
          section={section}
          isOpen={openIds.has(section.id)}
          onToggle={() => handleToggle(section.id)}
        />
      ))}
    </View>
  );
};

export default AccordionList;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  itemContainer: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerPressable: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleColumn: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  chevronContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    borderTopWidth: 1,
  },
});

// src/features/booking/components/BookingDateSelector.tsx
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, typography } from "../../../shared/theme/index.ts";

interface BookingDateSelectorProps {
  selectedDate: string; // "YYYY-MM-DD"
  onSelectDate: (dateStr: string) => void;
  daysAhead?: number;
}

export const BookingDateSelector: React.FC<BookingDateSelectorProps> = ({
  selectedDate,
  onSelectDate,
  daysAhead = 21,
}) => {
  const dates = useMemo(() => {
    const list: { fullDate: string; dayName: string; dayNumber: number; monthName: string }[] = [];
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const today = new Date();

    for (let i = 1; i <= daysAhead; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);

      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");

      list.push({
        fullDate: `${yyyy}-${mm}-${dd}`,
        dayName: weekdays[d.getDay()],
        dayNumber: d.getDate(),
        monthName: months[d.getMonth()],
      });
    }
    return list;
  }, [daysAhead]);

  return (
    <View style={styles.container}>
      <Text variant="h3" style={styles.title}>
        Select Auspicious Date
      </Text>
      <Text variant="caption" color={colors.textSecondary} style={styles.subtitle}>
        Choose your preferred date for the ritual.
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {dates.map((item) => {
          const isSelected = selectedDate === item.fullDate;
          return (
            <TouchableOpacity
              key={item.fullDate}
              onPress={() => onSelectDate(item.fullDate)}
              activeOpacity={0.7}
              style={[
                styles.dateChip,
                isSelected && styles.dateChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.dayName,
                  { color: isSelected ? colors.primary : colors.textSecondary },
                ]}
              >
                {item.dayName}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  { color: isSelected ? colors.primary : colors.textPrimary },
                ]}
              >
                {item.dayNumber}
              </Text>
              <Text
                style={[
                  styles.monthName,
                  { color: isSelected ? colors.primary : colors.textTertiary },
                ]}
              >
                {item.monthName}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
  },
  title: {
    marginBottom: spacing.xxs,
  },
  subtitle: {
    marginBottom: spacing.md,
  },
  scrollContent: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  dateChip: {
    width: 68,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  dateChipSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: "#FFF8F6",
  },
  dayName: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    textTransform: "uppercase",
  },
  dayNumber: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginVertical: 2,
  },
  monthName: {
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
  },
});

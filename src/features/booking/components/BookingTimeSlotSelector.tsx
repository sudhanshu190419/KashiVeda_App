// src/features/booking/components/BookingTimeSlotSelector.tsx
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, typography } from "../../../shared/theme/index.ts";
import { formatTime } from "../../../shared/utils/formatters.ts";
import { bookingService } from "../services/bookingService.ts";

interface BookingTimeSlotSelectorProps {
  panditId: string;
  dateStr: string; // "YYYY-MM-DD"
  durationMinutes?: number;
  selectedSlot: string | null;
  onSelectSlot: (slotIso: string) => void;
}

export const BookingTimeSlotSelector: React.FC<BookingTimeSlotSelectorProps> = ({
  panditId,
  dateStr,
  durationMinutes = 60,
  selectedSlot,
  onSelectSlot,
}) => {
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!panditId || !dateStr) {
      setSlots([]);
      return;
    }

    setLoading(true);
    setReason(null);

    bookingService
      .fetchPanditAvailability(panditId, dateStr, durationMinutes)
      .then((res) => {
        if (isMounted) {
          setSlots(res.availableSlots);
          setReason(res.reason || null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setSlots([]);
          setReason(err.message || "Failed to load time slots.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [panditId, dateStr, durationMinutes]);

  if (!dateStr) {
    return (
      <View style={styles.container}>
        <Text variant="h3" style={styles.title}>
          Select Time Slot
        </Text>
        <Card style={styles.emptyCard}>
          <Text variant="body" color={colors.textSecondary} align="center">
            Please select a date above to view available time slots.
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="h3" style={styles.title}>
        Select Muhurat / Time Slot
      </Text>
      <Text variant="caption" color={colors.textSecondary} style={styles.subtitle}>
        Available starting times based on Pandit Ji&apos;s working schedule ({durationMinutes} mins).
      </Text>

      {/* Vedic Shubh Muhurat Calculation Guidance */}
      <View style={styles.guidanceBox}>
        <Text variant="caption" color={colors.textSecondary} style={styles.guidanceText}>
          Pandit Ji will calculate the exact auspicious Shubh Muhurat within your selected window based on Gotra and Janma Nakshatra.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="caption" color={colors.textSecondary} style={styles.loadingText}>
            Calculating available slots...
          </Text>
        </View>
      ) : slots.length > 0 ? (
        <View style={styles.grid}>
          {slots.map((slotIso) => {
            const isSelected = selectedSlot === slotIso;
            const slotDate = new Date(slotIso);
            const formatted = formatTime(slotDate);

            return (
              <TouchableOpacity
                key={slotIso}
                onPress={() => onSelectSlot(slotIso)}
                activeOpacity={0.7}
                style={[
                  styles.slotChip,
                  isSelected && styles.slotChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.slotText,
                    { color: isSelected ? colors.primary : colors.textPrimary },
                  ]}
                >
                  {formatted}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <Card style={styles.emptyCard}>
          <Text variant="body" color={colors.textSecondary} align="center">
            {reason || "No available slots on this date. Please choose another date."}
          </Text>
        </Card>
      )}
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
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: {
    marginTop: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  slotChip: {
    minHeight: 48,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    minWidth: "30%",
    alignItems: "center",
    justifyContent: "center",
  },
  guidanceBox: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.md,
  },
  guidanceText: {
    lineHeight: 18,
  },
  slotChipSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: "#FFF8F6",
  },
  slotText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  emptyCard: {
    padding: spacing.lg,
  },
});

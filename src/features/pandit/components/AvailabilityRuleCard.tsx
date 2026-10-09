// src/features/pandit/components/AvailabilityRuleCard.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, TouchableOpacity, View } from "react-native";
import { Card, Input, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { PanditAvailabilityRule } from "../types/pandit.types.ts";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface AvailabilityRuleCardProps {
  dayOfWeek: number;
  rule?: PanditAvailabilityRule;
  onSaveRule: (rule: {
    id?: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
  }) => Promise<any>;
  onDeleteRule?: (ruleId: string) => Promise<any>;
}

export const AvailabilityRuleCard: React.FC<AvailabilityRuleCardProps> = ({
  dayOfWeek,
  rule,
  onSaveRule,
}) => {
  const isConfigured = !!rule;
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<string>(
    rule?.start_time ? rule.start_time.substring(0, 5) : "08:00"
  );
  const [endTime, setEndTime] = useState<string>(
    rule?.end_time ? rule.end_time.substring(0, 5) : "18:00"
  );
  const [isActive, setIsActive] = useState<boolean>(rule ? rule.is_active : false);
  const [editError, setEditError] = useState<string | null>(null);

  // Synchronize component state with persisted rule updates
  useEffect(() => {
    if (rule) {
      setStartTime(rule.start_time ? rule.start_time.substring(0, 5) : "08:00");
      setEndTime(rule.end_time ? rule.end_time.substring(0, 5) : "18:00");
      setIsActive(rule.is_active);
    } else {
      setStartTime("08:00");
      setEndTime("18:00");
      setIsActive(false);
    }
  }, [rule]);

  const handleToggle = async (val: boolean) => {
    setIsActive(val);
    try {
      await onSaveRule({
        id: rule?.id,
        day_of_week: dayOfWeek,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        is_active: val,
      });
    } catch {
      setIsActive(!val);
    }
  };

  const handleSaveTimes = async () => {
    if (endTime <= startTime) {
      setEditError("End time must be after start time.");
      return;
    }
    setEditError(null);

    const newActiveState = isConfigured ? isActive : true;
    setIsActive(newActiveState);

    try {
      await onSaveRule({
        id: rule?.id,
        day_of_week: dayOfWeek,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        is_active: newActiveState,
      });
      setIsEditing(false);
    } catch (err: any) {
      setEditError(err?.message || "Failed to update schedule.");
    }
  };

  const getSubtitle = () => {
    if (!isConfigured) {
      return "Not configured";
    }
    return `${startTime} - ${endTime}`;
  };

  const getActionText = () => {
    if (!isConfigured) {
      return "Set working hours >";
    }
    return "Adjust Hours >";
  };

  return (
    <Card
      variant="outlined"
      style={[
        styles.card,
        !isConfigured && styles.unconfiguredCard,
        isConfigured && !isActive && styles.inactiveCard,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleCol}>
          <Text variant="bodyMedium" style={styles.dayName}>
            {DAYS[dayOfWeek]}
          </Text>
          <Text
            variant="caption"
            color={
              !isConfigured
                ? colors.textTertiary
                : isActive
                ? colors.textSecondary
                : colors.textTertiary
            }
          >
            {getSubtitle()}
          </Text>
        </View>

        <View style={styles.controls}>
          <Switch
            value={isActive}
            onValueChange={handleToggle}
            trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
            thumbColor={isActive ? colors.primary : colors.surface}
          />
        </View>
      </View>

      {!isEditing ? (
        <TouchableOpacity
          onPress={() => setIsEditing(true)}
          style={styles.editButton}
          activeOpacity={0.7}
        >
          <Text variant="captionMedium" color={colors.primary}>
            {getActionText()}
          </Text>
        </TouchableOpacity>
      ) : null}

      {isEditing ? (
        <View style={styles.editSection}>
          <View style={styles.inputRow}>
            <View style={styles.inputCol}>
              <Text variant="caption" color={colors.textSecondary}>
                Start Time (HH:MM)
              </Text>
              <Input
                value={startTime}
                onChangeText={setStartTime}
                placeholder="08:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={styles.inputCol}>
              <Text variant="caption" color={colors.textSecondary}>
                End Time (HH:MM)
              </Text>
              <Input
                value={endTime}
                onChangeText={setEndTime}
                placeholder="18:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {editError ? (
            <Text variant="caption" color={colors.error} style={styles.errorText}>
              {editError}
            </Text>
          ) : null}

          <View style={styles.editActions}>
            <TouchableOpacity
              onPress={() => {
                setIsEditing(false);
                setEditError(null);
              }}
              style={styles.cancelBtn}
            >
              <Text variant="caption" color={colors.textSecondary}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSaveTimes} style={styles.saveBtn}>
              <Text variant="captionMedium" color={colors.surface}>
                {isConfigured ? "Save" : "Save & Activate"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xs,
    padding: spacing.md,
  },
  unconfiguredCard: {
    backgroundColor: "#FCFBF9",
    borderColor: colors.borderLight,
    borderStyle: "dashed",
  },
  inactiveCard: {
    opacity: 0.65,
    backgroundColor: colors.surfaceSubtle,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleCol: {
    flex: 1,
  },
  dayName: {
    fontSize: 15,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
  },
  editButton: {
    marginTop: spacing.xs,
    alignSelf: "flex-start",
  },
  editSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  inputCol: {
    flex: 1,
  },
  errorText: {
    marginTop: spacing.xxs,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  cancelBtn: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xs,
  },
});

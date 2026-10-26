// src/features/pandit/screens/PanditUnavailableBlocksScreen.tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Button, Card, Header, Input, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { UnavailabilityBlockCard } from "../components/UnavailabilityBlockCard.tsx";
import { usePanditBlocks } from "../hooks/usePanditBlocks.ts";

export const PanditUnavailableBlocksScreen: React.FC = () => {
  const navigation = useNavigation();
  const { isDark, colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";
  const { blocks, loading, saving, error, addBlock, deleteBlock } = usePanditBlocks();

  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [dateStr, setDateStr] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [startTimeStr, setStartTimeStr] = useState<string>("09:00");
  const [endTimeStr, setEndTimeStr] = useState<string>("18:00");
  const [reason, setReason] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreateBlock = async () => {
    if (!dateStr || !startTimeStr || !endTimeStr) {
      setFormError("Date, start time, and end time are required.");
      return;
    }

    if (endTimeStr <= startTimeStr) {
      setFormError("End time must be after start time.");
      return;
    }

    const startIso = `${dateStr}T${startTimeStr}:00+05:30`;
    const endIso = `${dateStr}T${endTimeStr}:00+05:30`;

    setFormError(null);

    try {
      await addBlock(startIso, endIso, reason);
      setShowAddForm(false);
      setReason("");
      Alert.alert("Blocked Time Added", "Devotees will not be able to book rituals during this window.");
    } catch (err: any) {
      setFormError(err?.message || "Failed to create block.");
    }
  };

  const handleDelete = (blockId: string) => {
    Alert.alert(
      "Remove Block",
      "Are you sure you want to remove this unavailability block?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBlock(blockId);
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Could not remove block.");
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer scrollable padded style={{ backgroundColor: themeColors.surfaceBase }}>
      <Header
        title="Unavailable Blocks"
        subtitle="Block specific dates or hours for personal commitments"
        onBack={() => navigation.goBack()}
      />

      {/* Info notice */}
      <Card
        variant="outlined"
        style={[
          styles.infoCard,
          {
            backgroundColor: isDark ? "rgba(224, 86, 36, 0.08)" : "#FFFDFB",
            borderColor: isDark ? "rgba(224, 86, 36, 0.3)" : themeColors.borderDefault,
          },
        ]}
      >
        <Text variant="caption" color={themeColors.textMuted}>
          ℹ️ Unavailable blocks protect your time for festivals, personal rituals, or travel. Blocks cannot be created over an already confirmed customer booking.
        </Text>
      </Card>

      {/* Add Block Toggle CTA */}
      {!showAddForm ? (
        <Button
          title="+ Add Unavailable Period"
          variant="primary"
          size="md"
          onPress={() => setShowAddForm(true)}
          style={styles.addBtn}
        />
      ) : (
        <Card
          variant="elevated"
          style={[
            styles.formCard,
            {
              backgroundColor: themeColors.surfaceCard,
              borderColor: colors.primary,
            },
          ]}
        >
          <Text variant="h3" color={themeColors.textPrimary} style={styles.formTitle}>
            New Unavailable Block
          </Text>

          <Text variant="caption" color={themeColors.textMuted} style={styles.inputLabel}>
            Date (YYYY-MM-DD)
          </Text>
          <Input
            value={dateStr}
            onChangeText={setDateStr}
            placeholder="2026-10-15"
            keyboardType="numbers-and-punctuation"
          />

          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <Text variant="caption" color={themeColors.textMuted} style={styles.inputLabel}>
                From (HH:MM)
              </Text>
              <Input
                value={startTimeStr}
                onChangeText={setStartTimeStr}
                placeholder="09:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={styles.timeCol}>
              <Text variant="caption" color={themeColors.textMuted} style={styles.inputLabel}>
                To (HH:MM)
              </Text>
              <Input
                value={endTimeStr}
                onChangeText={setEndTimeStr}
                placeholder="18:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <Text variant="caption" color={themeColors.textMuted} style={styles.inputLabel}>
            Reason / Note (Optional)
          </Text>
          <Input
            value={reason}
            onChangeText={setReason}
            placeholder="e.g., Personal Travel, Temple Festival"
          />

          {formError ? (
            <Text variant="caption" color={colors.error || "#EF4444"} style={styles.errorText}>
              {formError}
            </Text>
          ) : null}

          <View style={styles.formActions}>
            <TouchableOpacity
              onPress={() => {
                setShowAddForm(false);
                setFormError(null);
              }}
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel Adding Block"
            >
              <Text variant="bodyMedium" color={themeColors.textMuted}>
                Cancel
              </Text>
            </TouchableOpacity>

            <Button
              title={saving ? "Saving..." : "Save Block"}
              variant="primary"
              size="sm"
              onPress={handleCreateBlock}
              disabled={saving}
              style={{ minHeight: 48, minWidth: 100 }}
            />
          </View>
        </Card>
      )}

      {/* List of current blocks */}
      <Text variant="h3" color={themeColors.textPrimary} style={styles.listHeader}>
        Your Active Blocks ({blocks.length})
      </Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="caption" color={themeColors.textMuted} style={styles.loadingText}>
            Loading blocks...
          </Text>
        </View>
      ) : blocks.length > 0 ? (
        blocks.map((b) => (
          <UnavailabilityBlockCard key={b.id} block={b} onDelete={handleDelete} />
        ))
      ) : (
        <Card style={[styles.emptyCard, { backgroundColor: themeColors.surfaceCard, borderColor: themeColors.borderDefault }]}>
          <Text variant="body" color={themeColors.textMuted} align="center">
            You currently have no ad-hoc unavailable blocks configured.
          </Text>
        </Card>
      )}

      {error ? (
        <Text variant="caption" color={colors.error || "#EF4444"} style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  infoCard: {
    marginBottom: 10,
    padding: 14,
    borderRadius: radius.md,
  },
  addBtn: {
    marginBottom: 16,
    minHeight: 48,
  },
  formCard: {
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  formTitle: {
    marginBottom: 8,
  },
  inputLabel: {
    marginTop: 8,
    marginBottom: 4,
  },
  timeRow: {
    flexDirection: "row",
    gap: 10,
  },
  timeCol: {
    flex: 1,
  },
  errorText: {
    marginTop: 8,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 16,
    marginTop: 16,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  listHeader: {
    marginTop: 10,
    marginBottom: 8,
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
  },
  emptyCard: {
    paddingVertical: 32,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});

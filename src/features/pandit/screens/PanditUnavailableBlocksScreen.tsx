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
import { colors, spacing } from "../../../shared/theme/index.ts";
import { UnavailabilityBlockCard } from "../components/UnavailabilityBlockCard.tsx";
import { usePanditBlocks } from "../hooks/usePanditBlocks.ts";

export const PanditUnavailableBlocksScreen: React.FC = () => {
  const navigation = useNavigation();
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
    <ScreenContainer scrollable padded>
      <Header
        title="Unavailable Blocks"
        subtitle="Block specific dates or hours for personal commitments"
        onBack={() => navigation.goBack()}
      />

      {/* Info notice */}
      <Card variant="outlined" style={styles.infoCard}>
        <Text variant="caption" color={colors.textSecondary}>
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
        <Card variant="elevated" style={styles.formCard}>
          <Text variant="h3" style={styles.formTitle}>
            New Unavailable Block
          </Text>

          <Text variant="caption" color={colors.textSecondary} style={styles.inputLabel}>
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
              <Text variant="caption" color={colors.textSecondary} style={styles.inputLabel}>
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
              <Text variant="caption" color={colors.textSecondary} style={styles.inputLabel}>
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

          <Text variant="caption" color={colors.textSecondary} style={styles.inputLabel}>
            Reason / Note (Optional)
          </Text>
          <Input
            value={reason}
            onChangeText={setReason}
            placeholder="e.g., Personal Travel, Temple Festival"
          />

          {formError ? (
            <Text variant="caption" color={colors.error} style={styles.errorText}>
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
            >
              <Text variant="bodyMedium" color={colors.textSecondary}>
                Cancel
              </Text>
            </TouchableOpacity>

            <Button
              title={saving ? "Saving..." : "Save Block"}
              variant="primary"
              size="sm"
              onPress={handleCreateBlock}
              disabled={saving}
            />
          </View>
        </Card>
      )}

      {/* List of current blocks */}
      <Text variant="h3" style={styles.listHeader}>
        Your Active Blocks ({blocks.length})
      </Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="caption" color={colors.textSecondary} style={styles.loadingText}>
            Loading blocks...
          </Text>
        </View>
      ) : blocks.length > 0 ? (
        blocks.map((b) => (
          <UnavailabilityBlockCard key={b.id} block={b} onDelete={handleDelete} />
        ))
      ) : (
        <Card style={styles.emptyCard}>
          <Text variant="body" color={colors.textSecondary} align="center">
            You currently have no ad-hoc unavailable blocks configured.
          </Text>
        </Card>
      )}

      {error ? (
        <Text variant="caption" color={colors.error} style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  infoCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  addBtn: {
    marginBottom: spacing.md,
  },
  formCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  formTitle: {
    marginBottom: spacing.xs,
  },
  inputLabel: {
    marginTop: spacing.xs,
    marginBottom: spacing.xxs,
  },
  timeRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  timeCol: {
    flex: 1,
  },
  errorText: {
    marginTop: spacing.xs,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  listHeader: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  loadingBox: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  loadingText: {
    marginTop: spacing.xs,
  },
  emptyCard: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
});

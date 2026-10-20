// src/features/booking/components/SubmitReviewModal.tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Button, Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";

interface SubmitReviewModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment?: string | null) => Promise<boolean>;
  panditName?: string;
  submitting?: boolean;
}

export const SubmitReviewModal: React.FC<SubmitReviewModalProps> = ({
  visible,
  onClose,
  onSubmit,
  panditName,
  submitting = false,
}) => {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSelectRating = (selected: number) => {
    setRating(selected);
    setErrorMsg(null);
  };

  const handleSubmit = async () => {
    if (rating < 1 || rating > 5) {
      setErrorMsg("Please select a star rating (1 to 5 stars).");
      return;
    }

    setErrorMsg(null);
    const success = await onSubmit(rating, comment);
    if (success) {
      setRating(0);
      setComment("");
      onClose();
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setErrorMsg(null);
    onClose();
  };

  const ratingDescriptions: Record<number, string> = {
    1: "Needs Improvement",
    2: "Fair Ritual Experience",
    3: "Good & Punctual",
    4: "Very Auspicious & Devout",
    5: "Exceptional Sacred Experience",
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <Card variant="elevated" style={styles.modalCard}>
          {/* Header */}
          <Text variant="h2" align="center" style={styles.title}>
            Rate Your Pandit
          </Text>
          <Text variant="caption" color={colors.textSecondary} align="center" style={styles.subtitle}>
            Share your sacred experience with {panditName || "the Acharya"}
          </Text>

          {/* Interactive Star Rating Selector */}
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => handleSelectRating(star)}
                activeOpacity={0.7}
                disabled={submitting}
                style={styles.starTouch}
                testID={`star-rating-${star}`}
              >
                <Text
                  variant="display"
                  style={[
                    styles.starIcon,
                    { color: star <= rating ? "#F59E0B" : "#D1D5DB" },
                  ]}
                >
                  ★
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Rating Descriptive Label */}
          {rating > 0 ? (
            <Text variant="captionMedium" color={colors.primary} align="center" style={styles.ratingLabel}>
              {ratingDescriptions[rating]} ({rating} / 5 Stars)
            </Text>
          ) : (
            <Text variant="caption" color={colors.textTertiary} align="center" style={styles.ratingLabel}>
              Tap a star to rate
            </Text>
          )}

          {/* Optional Comment Input */}
          <View style={styles.inputContainer}>
            <Text variant="captionMedium" color={colors.textSecondary} style={styles.inputLabel}>
              Written Feedback (Optional)
            </Text>
            <TextInput
              style={styles.textArea}
              placeholder="Share details about Vedic chanting, punctuality, and ritual sanctity..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              maxLength={1000}
              value={comment}
              onChangeText={setComment}
              editable={!submitting}
              textAlignVertical="top"
            />
            <Text variant="caption" color={colors.textTertiary} align="right" style={styles.charCount}>
              {`${comment.length} / 1000`}
            </Text>
          </View>

          {/* Error Message */}
          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text variant="caption" color={colors.error} align="center">
                {errorMsg}
              </Text>
            </View>
          ) : null}

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <Button
              title="Cancel"
              variant="secondary"
              size="md"
              onPress={handleClose}
              disabled={submitting}
              style={styles.actionBtn}
            />
            <Button
              title={submitting ? "Submitting..." : "Submit Review"}
              variant="primary"
              size="md"
              onPress={handleSubmit}
              disabled={rating === 0 || submitting}
              style={styles.actionBtn}
            />
          </View>

          {submitting && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </Card>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    padding: spacing.md,
  },
  modalCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    position: "relative",
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: spacing.md,
  },
  starsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  starTouch: {
    padding: spacing.xxs,
  },
  starIcon: {
    fontSize: 36,
  },
  ratingLabel: {
    marginVertical: spacing.xs,
    fontWeight: "600",
  },
  inputContainer: {
    marginTop: spacing.sm,
  },
  inputLabel: {
    marginBottom: 4,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 90,
    backgroundColor: colors.surfaceSubtle,
  },
  charCount: {
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    padding: spacing.xs,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionBtn: {
    flex: 1,
  },
  loadingOverlay: {
    marginTop: spacing.sm,
    alignItems: "center",
  },
});

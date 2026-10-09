// src/features/pandit/screens/PanditKundliScreen.tsx
import React, { useState } from "react";
import { errorCodes, isErrorWithCode, pick, types } from "@react-native-documents/picker";
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../auth/index.ts";
import {
  usePanditKundliOrders,
} from "../../kundli/hooks/usePanditKundliOrders.ts";
import { KundliOrder, KundliOrderStatus } from "../../kundli/types/kundli.types.ts";
import { getKundliStatusMeta } from "../../kundli/components/KundliOrderCard.tsx";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, typography } from "../../../shared/theme/index.ts";
import { formatCurrency, formatDate } from "../../../shared/utils/formatters.ts";

export const PanditKundliScreen: React.FC = () => {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<string>("all");
  const statusFilter: KundliOrderStatus | undefined =
    activeTab === "pending"
      ? "paid"
      : activeTab === "uploaded"
      ? "document_uploaded"
      : activeTab === "completed"
      ? "completed"
      : undefined;

  const {
    orders,
    loading,
    refreshing,
    error,
    uploadingOrderId,
    refresh,
    fetchNextPage,
    uploadDocument,
  } = usePanditKundliOrders(statusFilter);

  // Upload modal state
  const [selectedOrderForUpload, setSelectedOrderForUpload] = useState<KundliOrder | null>(null);
  const [pickedFile, setPickedFile] = useState<{
    uri: string;
    name: string;
    type: string;
    size: number;
  } | null>(null);
  const [fileNameInput, setFileNameInput] = useState<string>("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleOpenUploadModal = (order: KundliOrder) => {
    console.log("[KUNDLI_UPLOAD_DEBUG] Upload modal opened for order:", {
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
    });
    setSelectedOrderForUpload(order);
    const sanitizedOrderNum = (order.order_number || order.id.slice(0, 8)).replace(/[^a-zA-Z0-9]/g, "");
    setFileNameInput(`Kundli_${sanitizedOrderNum}.pdf`);
    setPickedFile(null);
    setUploadError(null);
  };

  const handleCloseUploadModal = () => {
    console.log("[KUNDLI_UPLOAD_DEBUG] Upload modal closed");
    setSelectedOrderForUpload(null);
    setPickedFile(null);
    setFileNameInput("");
    setUploadError(null);
  };

  const handlePickDocument = async () => {
    console.log("[KUNDLI_UPLOAD_DEBUG] Choose PDF pressed");
    try {
      setUploadError(null);
      const pdfType = types?.pdf || "application/pdf";
      console.log("[KUNDLI_UPLOAD_DEBUG] Calling document picker pick() with type:", [pdfType]);
      const res = await pick({
        type: [pdfType],
        allowMultiSelection: false,
      });
      console.log("[KUNDLI_UPLOAD_DEBUG] Picker returned raw result:", res);

      if (!res || res.length === 0) {
        console.log("[KUNDLI_UPLOAD_DEBUG] Picker returned empty selection or cancelled");
        return;
      }
      const file = res[0];
      console.log("[KUNDLI_UPLOAD_DEBUG] Selected file metadata:", {
        name: file.name,
        type: file.type,
        size: file.size,
        uri: file.uri,
      });

      console.log("[KUNDLI_UPLOAD_DEBUG] Validating PDF file...", {
        name: file.name,
        type: file.type,
        size: file.size,
      });

      if (!file?.uri) {
        console.log("[KUNDLI_UPLOAD_DEBUG] PDF validation failed: No file URI returned");
        setUploadError("Could not retrieve file path from document picker.");
        return;
      }

      const fileName = file.name || "document.pdf";
      if (!fileName.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
        console.log("[KUNDLI_UPLOAD_DEBUG] PDF validation failed: Invalid extension or MIME", {
          fileName,
          type: file.type,
        });
        setUploadError("Selected file is not a valid PDF document.");
        return;
      }

      const maxSizeBytes = 25 * 1024 * 1024; // 25MB max
      if (file.size && file.size > maxSizeBytes) {
        console.log("[KUNDLI_UPLOAD_DEBUG] PDF validation failed: Size exceeds 25MB limit", {
          size: file.size,
          maxSizeBytes,
        });
        setUploadError("File is too large. Maximum allowed size is 25MB.");
        return;
      }

      console.log("[KUNDLI_UPLOAD_DEBUG] PDF validation passed successfully");

      const pickedData = {
        uri: file.uri,
        name: fileName,
        type: file.type || "application/pdf",
        size: file.size || 0,
      };
      console.log("[KUNDLI_UPLOAD_DEBUG] Selected file state set in UI:", pickedData);
      setPickedFile(pickedData);
      setFileNameInput(fileName);
    } catch (err: any) {
      console.log("[KUNDLI_UPLOAD_DEBUG] STEP 1 (Pick Document) FAILED:", {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
        code: err?.code,
      });
      if (
        (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) ||
        err?.code === "OPERATION_CANCELED" ||
        err?.code === "DOCUMENT_PICKER_CANCELED" ||
        err?.message?.toLowerCase().includes("cancel")
      ) {
        console.log("[KUNDLI_UPLOAD_DEBUG] Document picker operation canceled by user");
        return;
      }
      setUploadError(
        typeof err?.message === "string" &&
        (err.message.includes("undefined is not a function") || err.message.includes("could not be found"))
          ? "Unable to open device file picker. Please verify app permissions."
          : err?.message || "Failed to select document from device."
      );
    }
  };

  const handleConfirmUpload = async () => {
    console.log("[KUNDLI_UPLOAD_DEBUG] Upload Document button pressed for order:", {
      orderId: selectedOrderForUpload?.id,
      fileNameInput,
      pickedFile,
    });

    if (!selectedOrderForUpload || !user?.id) {
      console.log("[KUNDLI_UPLOAD_DEBUG] Missing selectedOrderForUpload or user ID", {
        hasOrder: Boolean(selectedOrderForUpload),
        userId: user?.id,
      });
      return;
    }

    if (!pickedFile) {
      console.log("[KUNDLI_UPLOAD_DEBUG] No file picked yet");
      setUploadError("Please select a PDF document from your device first.");
      return;
    }

    const trimmedName = (fileNameInput.trim() || pickedFile.name).trim();
    if (!trimmedName.toLowerCase().endsWith(".pdf")) {
      console.log("[KUNDLI_UPLOAD_DEBUG] Filename does not end with .pdf:", trimmedName);
      setUploadError("Document must be a PDF file (e.g. Kundli_123.pdf).");
      return;
    }

    try {
      setUploadError(null);
      console.log("[KUNDLI_UPLOAD_DEBUG] Calling uploadDocument hook...", {
        orderId: selectedOrderForUpload.id,
        trimmedName,
        uploaderUserId: user.id,
      });
      const doc = await uploadDocument(
        selectedOrderForUpload.id,
        {
          name: trimmedName,
          type: pickedFile.type || "application/pdf",
          uri: pickedFile.uri,
        },
        user.id
      );

      console.log("[KUNDLI_UPLOAD_DEBUG] uploadDocument hook returned successfully:", {
        orderId: selectedOrderForUpload.id,
        docId: doc?.id,
      });

      Alert.alert(
        "Upload Successful",
        `Handwritten Kundli PDF (${trimmedName}) has been uploaded and made available to the devotee.`
      );
      handleCloseUploadModal();
    } catch (err: any) {
      console.log("[KUNDLI_UPLOAD_DEBUG] STEP 2 (Confirm Upload) FAILED:", {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
      });
      setUploadError(err?.message || "Failed to upload document.");
    }
  };

  return (
    <ScreenContainer scrollable={false} padded={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h2" style={styles.headerTitle}>
          Kundli Queue
        </Text>
        <Text variant="caption" color={colors.textSecondary}>
          Prepare birth charts and upload scanned handwritten PDFs
        </Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsRow}>
        {[
          { key: "all", label: "All" },
          { key: "pending", label: "Pending" },
          { key: "uploaded", label: "Uploaded" },
          { key: "completed", label: "Completed" },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabChip, isActive && styles.tabChipActive]}
              accessibilityRole="button"
              accessibilityLabel={`Filter ${tab.label}`}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Orders List */}
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={styles.listContent}
        onEndReached={fetchNextPage}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => {
          const statusMeta = getKundliStatusMeta(item.status);
          const isCurrentUploading = uploadingOrderId === item.id;
          const hasDoc = Boolean(item.current_document);

          return (
            <Card style={styles.orderCard}>
              {/* Order Header */}
              <View style={styles.orderCardHeader}>
                <View>
                  <Text style={styles.orderNumber}>
                    #{item.order_number || item.id.slice(0, 8).toUpperCase()}
                  </Text>
                  <Text variant="caption" color={colors.textTertiary}>
                    {formatDate(item.created_at)}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusMeta.badgeBg }]}>
                  <Text style={[styles.statusBadgeText, { color: statusMeta.badgeText }]}>
                    {statusMeta.label}
                  </Text>
                </View>
              </View>

              {/* Devotee Info */}
              <View style={styles.infoSection}>
                <Text variant="caption" color={colors.textSecondary}>
                  Devotee:
                </Text>
                <Text variant="body" style={styles.customerName}>
                  👤 {item.customer?.display_name || "Devotee"}
                </Text>
              </View>

              {/* Birth Chart Data */}
              <View style={styles.birthGrid}>
                <View style={styles.birthGridItem}>
                  <Text variant="caption" color={colors.textTertiary}>
                    Date of Birth
                  </Text>
                  <Text variant="caption" color={colors.textPrimary} style={styles.birthValue}>
                    {formatDate(item.date_of_birth)}
                  </Text>
                </View>

                <View style={styles.birthGridItem}>
                  <Text variant="caption" color={colors.textTertiary}>
                    Time of Birth
                  </Text>
                  <Text variant="caption" color={colors.textPrimary} style={styles.birthValue}>
                    {item.time_of_birth}
                  </Text>
                </View>

                <View style={styles.birthGridItem}>
                  <Text variant="caption" color={colors.textTertiary}>
                    Place of Birth
                  </Text>
                  <Text
                    variant="caption"
                    color={colors.textPrimary}
                    style={styles.birthValue}
                    numberOfLines={1}
                  >
                    {item.place_of_birth}
                  </Text>
                </View>
              </View>

              {/* Devotee Notes */}
              {item.additional_notes ? (
                <View style={styles.notesBox}>
                  <Text variant="caption" color={colors.textTertiary}>
                    Devotee Focus / Questions:
                  </Text>
                  <Text variant="caption" color={colors.textPrimary} style={styles.notesText}>
                    "{item.additional_notes}"
                  </Text>
                </View>
              ) : null}

              {/* Document Status */}
              <View style={styles.docRow}>
                {hasDoc ? (
                  <View style={styles.docStatusReady}>
                    <Text style={styles.docStatusText}>
                      📄 PDF (v{item.current_document?.version_number}) Uploaded:{" "}
                      {item.current_document?.file_name}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.docStatusPending}>
                    <Text style={styles.docStatusPendingText}>
                      ⏳ Awaiting PDF Upload
                    </Text>
                  </View>
                )}
                <Text style={styles.priceTag}>{formatCurrency(item.price)}</Text>
              </View>

              {/* Pandit Action */}
              <Button
                title={
                  isCurrentUploading
                    ? "Uploading PDF..."
                    : hasDoc
                    ? "Upload Updated PDF"
                    : "Upload Handwritten PDF"
                }
                size="sm"
                variant={hasDoc ? "outline" : "primary"}
                disabled={isCurrentUploading}
                onPress={() => handleOpenUploadModal(item)}
                style={styles.uploadBtn}
              />
            </Card>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <LoadingState message="Loading assigned Kundli requests..." />
          ) : error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <EmptyState
              title="No Kundli Requests"
              description="No Kundli orders are currently assigned in this category."
            />
          )
        }
      />

      {/* Upload Document Modal */}
      <Modal
        visible={Boolean(selectedOrderForUpload)}
        transparent
        animationType="slide"
        onRequestClose={handleCloseUploadModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text variant="h3" style={styles.modalTitle}>
              Upload Handwritten Kundli PDF
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.modalSubtitle}>
              Upload high-resolution scanned PDF of the completed handwritten Vedic Kundli for
              Order #{selectedOrderForUpload?.order_number || selectedOrderForUpload?.id.slice(0, 8)}
            </Text>

            {pickedFile ? (
              <View style={styles.pickedFileBox}>
                <View style={styles.pickedFileHeader}>
                  <Text variant="captionMedium" color={colors.primary}>
                    📄 Selected PDF Document
                  </Text>
                  <Text variant="caption" color="#2E7D32" style={styles.validBadge}>
                    ✓ Verified PDF
                  </Text>
                </View>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {pickedFile.name}
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  Size: {(pickedFile.size / (1024 * 1024)).toFixed(2)} MB
                </Text>
                <Button
                  title="Choose Different PDF"
                  variant="outline"
                  size="sm"
                  onPress={handlePickDocument}
                  style={styles.changeFileBtn}
                />
              </View>
            ) : (
              <View style={styles.selectFileBox}>
                <Text variant="caption" color={colors.textSecondary} align="center" style={styles.selectPrompt}>
                  Select the high-resolution scanned Kundli PDF chart from your device storage.
                </Text>
                <Button
                  title="📄 Choose PDF from Device"
                  variant="primary"
                  onPress={handlePickDocument}
                  style={styles.selectFileBtn}
                />
              </View>
            )}

            <Input
              label="Document File Name (PDF) *"
              placeholder="e.g. Kundli_Report.pdf"
              value={fileNameInput}
              onChangeText={setFileNameInput}
              autoCapitalize="none"
            />

            {uploadError ? (
              <View style={styles.modalErrorBox}>
                <Text style={styles.modalErrorText}>⚠️ {uploadError}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={handleCloseUploadModal}
                style={styles.modalCancelBtn}
              />
              <Button
                title={uploadingOrderId ? "Uploading..." : "Upload Document"}
                onPress={handleConfirmUpload}
                disabled={Boolean(uploadingOrderId) || !pickedFile}
                style={styles.modalConfirmBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitle: {
    color: colors.primary,
  },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  tabChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    marginRight: spacing.sm,
  },
  tabChipActive: {
    backgroundColor: colors.primary,
  },
  tabLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: "#FFFFFF",
    fontWeight: typography.fontWeight.bold,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  orderCard: {
    marginBottom: spacing.md,
    borderColor: colors.borderLight,
    borderWidth: 1,
  },
  orderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  orderNumber: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  infoSection: {
    marginBottom: spacing.xs,
  },
  customerName: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  birthGrid: {
    flexDirection: "row",
    backgroundColor: colors.primaryLight,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  birthGridItem: {
    flex: 1,
  },
  birthValue: {
    fontWeight: typography.fontWeight.medium,
    marginTop: 2,
  },
  notesBox: {
    backgroundColor: "#FFF8E1",
    padding: spacing.xs,
    borderRadius: radius.sm,
    marginVertical: spacing.xs,
  },
  notesText: {
    fontStyle: "italic",
    marginTop: 2,
  },
  docRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  docStatusReady: {
    flex: 1,
  },
  docStatusText: {
    fontSize: typography.fontSize.xs,
    color: "#2E7D32",
    fontWeight: typography.fontWeight.medium,
  },
  docStatusPending: {
    flex: 1,
  },
  docStatusPendingText: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  priceTag: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
  uploadBtn: {
    marginTop: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    marginBottom: spacing.md,
  },
  modalErrorBox: {
    backgroundColor: "#FFEBEE",
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  modalErrorText: {
    color: "#C62828",
    fontSize: typography.fontSize.xs,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalCancelBtn: {
    flex: 1,
  },
  modalConfirmBtn: {
    flex: 1,
  },
  pickedFileBox: {
    backgroundColor: "#F5F5F5",
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  pickedFileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  validBadge: {
    fontWeight: "700",
  },
  changeFileBtn: {
    marginTop: spacing.sm,
  },
  selectFileBox: {
    padding: spacing.md,
    backgroundColor: "#FBF9F7",
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
  },
  selectPrompt: {
    marginBottom: spacing.sm,
  },
  selectFileBtn: {
    width: "100%",
  },
});

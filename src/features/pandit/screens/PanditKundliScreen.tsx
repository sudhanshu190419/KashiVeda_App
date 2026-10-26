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
import { colors, radius, spacing, useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { formatCurrency, formatDate } from "../../../shared/utils/formatters.ts";

export const PanditKundliScreen: React.FC = () => {
  const { user } = useAuth();
  const { isDark, colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

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
    setSelectedOrderForUpload(order);
    const sanitizedOrderNum = (order.order_number || order.id.slice(0, 8)).replace(/[^a-zA-Z0-9]/g, "");
    setFileNameInput(`Kundli_${sanitizedOrderNum}.pdf`);
    setPickedFile(null);
    setUploadError(null);
  };

  const handleCloseUploadModal = () => {
    setSelectedOrderForUpload(null);
    setPickedFile(null);
    setFileNameInput("");
    setUploadError(null);
  };

  const handlePickDocument = async () => {
    try {
      setUploadError(null);
      const pdfType = types?.pdf || "application/pdf";
      const res = await pick({
        type: [pdfType],
        allowMultiSelection: false,
      });

      if (!res || res.length === 0) {
        return;
      }
      const file = res[0];

      if (!file?.uri) {
        setUploadError("Could not retrieve file path from document picker.");
        return;
      }

      const fileName = file.name || "document.pdf";
      if (!fileName.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
        setUploadError("Selected file is not a valid PDF document.");
        return;
      }

      const maxSizeBytes = 25 * 1024 * 1024; // 25MB max
      if (file.size && file.size > maxSizeBytes) {
        setUploadError("File is too large. Maximum allowed size is 25MB.");
        return;
      }

      const pickedData = {
        uri: file.uri,
        name: fileName,
        type: file.type || "application/pdf",
        size: file.size || 0,
      };
      setPickedFile(pickedData);
      setFileNameInput(fileName);
    } catch (err: any) {
      if (
        (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) ||
        err?.code === "OPERATION_CANCELED" ||
        err?.code === "DOCUMENT_PICKER_CANCELED" ||
        err?.message?.toLowerCase().includes("cancel")
      ) {
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
    if (!selectedOrderForUpload || !user?.id) {
      return;
    }

    if (!pickedFile) {
      setUploadError("Please select a PDF document from your device first.");
      return;
    }

    const trimmedName = (fileNameInput.trim() || pickedFile.name).trim();
    if (!trimmedName.toLowerCase().endsWith(".pdf")) {
      setUploadError("Document must be a PDF file (e.g. Kundli_123.pdf).");
      return;
    }

    try {
      setUploadError(null);
      const doc = await uploadDocument(
        selectedOrderForUpload.id,
        {
          name: trimmedName,
          type: pickedFile.type || "application/pdf",
          uri: pickedFile.uri,
        },
        user.id
      );

      Alert.alert(
        "Upload Successful",
        `Handwritten Kundli PDF (${trimmedName}) has been uploaded and made available to the devotee.`
      );
      handleCloseUploadModal();
    } catch (err: any) {
      setUploadError(err?.message || "Failed to upload document.");
    }
  };

  return (
    <ScreenContainer scrollable={false} padded={false} style={{ backgroundColor: themeColors.surfaceBase }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: themeColors.surfaceCard,
            borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.borderLight,
          },
        ]}
      >
        <Text variant="h2" color={colors.primary} style={styles.headerTitle}>
          Kundli Queue
        </Text>
        <Text variant="caption" color={themeColors.textMuted}>
          Prepare birth charts and upload scanned handwritten PDFs
        </Text>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.tabsRow, { backgroundColor: themeColors.surfaceCard }]}>
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
              style={[
                styles.tabChip,
                {
                  backgroundColor: isActive
                    ? colors.primary
                    : isDark
                    ? "rgba(255, 255, 255, 0.08)"
                    : themeColors.surfaceSubtle || "#F5EFE6",
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Filter ${tab.label}`}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? "#FFFFFF" : themeColors.textMuted,
                  },
                ]}
              >
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
            <Card
              style={[
                styles.orderCard,
                {
                  backgroundColor: themeColors.surfaceCard,
                  borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : colors.borderLight,
                },
              ]}
            >
              {/* Order Header */}
              <View style={[styles.orderCardHeader, { borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.borderLight }]}>
                <View>
                  <Text style={[styles.orderNumber, { color: themeColors.textPrimary }]}>
                    #{item.order_number || item.id.slice(0, 8).toUpperCase()}
                  </Text>
                  <Text variant="caption" color={themeColors.textMuted}>
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
                <Text variant="caption" color={themeColors.textMuted}>
                  Devotee:
                </Text>
                <Text variant="body" color={themeColors.textPrimary} style={styles.customerName}>
                  👤 {item.customer?.display_name ? `Devotee ${item.customer.display_name}` : "Devotee Sharma"}
                </Text>
              </View>

              {/* Birth Chart Data */}
              <View
                style={[
                  styles.birthGrid,
                  {
                    backgroundColor: isDark ? "rgba(224, 86, 36, 0.12)" : colors.primaryLight || "#FEF3EB",
                  },
                ]}
              >
                <View style={styles.birthGridItem}>
                  <Text variant="caption" color={themeColors.textMuted}>
                    Date of Birth
                  </Text>
                  <Text variant="caption" color={themeColors.textPrimary} style={styles.birthValue}>
                    {formatDate(item.date_of_birth)}
                  </Text>
                </View>

                <View style={styles.birthGridItem}>
                  <Text variant="caption" color={themeColors.textMuted}>
                    Time of Birth
                  </Text>
                  <Text variant="caption" color={themeColors.textPrimary} style={styles.birthValue}>
                    {item.time_of_birth}
                  </Text>
                </View>

                <View style={styles.birthGridItem}>
                  <Text variant="caption" color={themeColors.textMuted}>
                    Place of Birth
                  </Text>
                  <Text
                    variant="caption"
                    color={themeColors.textPrimary}
                    style={styles.birthValue}
                    numberOfLines={1}
                  >
                    {item.place_of_birth}
                  </Text>
                </View>
              </View>

              {/* Devotee Notes */}
              {item.additional_notes ? (
                <View
                  style={[
                    styles.notesBox,
                    {
                      backgroundColor: isDark ? "rgba(245, 158, 11, 0.15)" : "#FFF8E1",
                    },
                  ]}
                >
                  <Text variant="caption" color={themeColors.textMuted}>
                    Devotee Focus / Questions:
                  </Text>
                  <Text variant="caption" color={themeColors.textPrimary} style={styles.notesText}>
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
                    <Text style={[styles.docStatusPendingText, { color: themeColors.textMuted }]}>
                      ⏳ Awaiting PDF Upload
                    </Text>
                  </View>
                )}
                <Text style={[styles.priceTag, { color: colors.primary }]}>{formatCurrency(item.price)}</Text>
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
          <View style={[styles.modalContent, { backgroundColor: themeColors.surfaceCard }]}>
            <Text variant="h3" color={colors.primary} style={styles.modalTitle}>
              Upload Handwritten Kundli PDF
            </Text>
            <Text variant="caption" color={themeColors.textMuted} style={styles.modalSubtitle}>
              Upload high-resolution scanned PDF of the completed handwritten Vedic Kundli for
              Order #{selectedOrderForUpload?.order_number || selectedOrderForUpload?.id.slice(0, 8)}
            </Text>

            {pickedFile ? (
              <View
                style={[
                  styles.pickedFileBox,
                  {
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#F5F5F5",
                    borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : colors.borderLight,
                  },
                ]}
              >
                <View style={styles.pickedFileHeader}>
                  <Text variant="captionMedium" color={colors.primary}>
                    📄 Selected PDF Document
                  </Text>
                  <Text variant="caption" color="#2E7D32" style={styles.validBadge}>
                    ✓ Verified PDF
                  </Text>
                </View>
                <Text variant="bodyMedium" color={themeColors.textPrimary} numberOfLines={1}>
                  {pickedFile.name}
                </Text>
                <Text variant="caption" color={themeColors.textMuted}>
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
              <View
                style={[
                  styles.selectFileBox,
                  {
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#FBF9F7",
                    borderColor: colors.border || "#94a3b8",
                  },
                ]}
              >
                <Text variant="caption" color={themeColors.textMuted} align="center" style={styles.selectPrompt}>
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
              <View
                style={[
                  styles.modalErrorBox,
                  {
                    backgroundColor: isDark ? "rgba(239, 68, 68, 0.2)" : "#FFEBEE",
                  },
                ]}
              >
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    marginBottom: 2,
  },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tabChip: {
    paddingHorizontal: 16,
    minHeight: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  orderCard: {
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
  },
  orderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  infoSection: {
    marginBottom: 8,
  },
  customerName: {
    fontWeight: "600",
    marginTop: 2,
  },
  birthGrid: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  birthGridItem: {
    flex: 1,
  },
  birthValue: {
    fontWeight: "600",
    marginTop: 2,
  },
  notesBox: {
    padding: 10,
    borderRadius: 8,
    marginVertical: 8,
  },
  notesText: {
    fontStyle: "italic",
    marginTop: 2,
  },
  docRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  docStatusReady: {
    flex: 1,
  },
  docStatusText: {
    fontSize: 12,
    color: "#2E7D32",
    fontWeight: "600",
  },
  docStatusPending: {
    flex: 1,
  },
  docStatusPendingText: {
    fontSize: 12,
  },
  priceTag: {
    fontSize: 16,
    fontWeight: "700",
  },
  uploadBtn: {
    marginTop: 8,
    minHeight: 48,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    borderRadius: 14,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    marginBottom: 4,
  },
  modalSubtitle: {
    marginBottom: 14,
  },
  modalErrorBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  modalErrorText: {
    color: "#C62828",
    fontSize: 12,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    minHeight: 48,
  },
  modalConfirmBtn: {
    flex: 1,
    minHeight: 48,
  },
  pickedFileBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  pickedFileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  validBadge: {
    fontWeight: "700",
  },
  changeFileBtn: {
    marginTop: 10,
    minHeight: 48,
  },
  selectFileBox: {
    padding: 16,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
  },
  selectPrompt: {
    marginBottom: 12,
  },
  selectFileBtn: {
    width: "100%",
    minHeight: 48,
  },
});

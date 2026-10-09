// src/features/pandit/components/PanditPayoutCard.tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Button, Card, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatCurrency, formatDate } from "../../../shared/utils/formatters.ts";
import { panditPayoutService } from "../services/panditPayoutService.ts";
import { PanditPayoutItem, PanditPayoutStatus } from "../types/pandit.types.ts";

export interface PanditPayoutCardProps {
  payout: PanditPayoutItem;
}

export const PanditPayoutCard: React.FC<PanditPayoutCardProps> = ({ payout }) => {
  const [proofModalVisible, setProofModalVisible] = useState(false);
  const [loadingProof, setLoadingProof] = useState(false);
  const [signedProofUrl, setSignedProofUrl] = useState<string | null>(
    payout.signed_proof_url || null
  );

  const isBooking = Boolean(payout.booking_id);
  const refNumber =
    payout.booking?.booking_number ||
    payout.kundli_order?.order_number ||
    `Ref: ${payout.id.slice(0, 8)}`;

  const devoteeName =
    payout.kundli_order?.customer?.display_name ||
    payout.kundli_order?.customer_name ||
    null;

  const serviceName =
    payout.booking?.puja_service?.name ||
    (payout.kundli_order?.report_type
      ? `${payout.kundli_order.report_type.toUpperCase()} Kundli Report`
      : isBooking
      ? "Vedic Ritual Puja"
      : "Vedic Astrology / Kundli");

  const statusConfig: Record<
    PanditPayoutStatus,
    { label: string; bg: string; text: string; icon: string }
  > = {
    pending: {
      label: "Awaiting Payout",
      bg: "#fef3c7",
      text: "#92400e",
      icon: "⏳",
    },
    approved: {
      label: "Payout Approved",
      bg: "#e0f2fe",
      text: "#0369a1",
      icon: "📋",
    },
    processing: {
      label: "Transfer Processing",
      bg: "#f3e8ff",
      text: "#6b21a8",
      icon: "🔄",
    },
    paid: {
      label: "Disbursed",
      bg: "#dcfce7",
      text: "#15803d",
      icon: "✓",
    },
    failed: {
      label: "Payout Failed",
      bg: "#fee2e2",
      text: "#b91c1c",
      icon: "⚠️",
    },
    cancelled: {
      label: "Payout Cancelled",
      bg: "#f1f5f9",
      text: "#475569",
      icon: "✕",
    },
  };

  const status = statusConfig[payout.status] || {
    label: payout.status.toUpperCase(),
    bg: colors.borderLight,
    text: colors.textSecondary,
    icon: "•",
  };

  const isPaid = payout.status === "paid";
  const settlementDate = payout.confirmed_at || payout.released_at;
  const transactionRef = payout.transaction_reference || payout.provider_payout_id;

  const handleViewProof = async () => {
    if (signedProofUrl) {
      setProofModalVisible(true);
      return;
    }
    if (!payout.proof_document_path) {
      Alert.alert("Notice", "Payment proof document is not attached to this disbursement.");
      return;
    }
    setLoadingProof(true);
    try {
      const url = await panditPayoutService.getPayoutProofSignedUrl(
        payout.proof_document_path
      );
      if (url) {
        setSignedProofUrl(url);
        setProofModalVisible(true);
      } else {
        Alert.alert(
          "Notice",
          "Unable to load payment proof. Please check your network connection."
        );
      }
    } catch {
      Alert.alert("Error", "Failed to retrieve secure proof link.");
    } finally {
      setLoadingProof(false);
    }
  };

  return (
    <Card variant="elevated" style={styles.card}>
      {/* Header Row: Ref Number & Status Badge */}
      <View style={styles.headerRow}>
        <View style={styles.refWrap}>
          <Text variant="overline" color={colors.primary}>
            {isBooking ? "RITUAL CEREMONY" : "KUNDLI REPORT"}
          </Text>
          <Text variant="captionMedium" color={colors.textSecondary}>
            {refNumber}
          </Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text variant="caption" style={[styles.statusText, { color: status.text }]}>
            {status.icon} {status.label}
          </Text>
        </View>
      </View>

      {/* Service Name */}
      <Text variant="h3" style={styles.serviceName}>
        {serviceName}
      </Text>

      {/* Mode or Recipient Subtitle */}
      {isBooking && payout.booking?.service_mode ? (
        <Text variant="caption" color={colors.textSecondary} style={styles.modeSubtitle}>
          {`Mode: ${payout.booking.service_mode === "remote" ? "Remote Live Sanctum" : "At-Home Ritual"}`}
        </Text>
      ) : (payout.kundli_order?.customer?.display_name || payout.kundli_order?.customer_name) ? (
        <Text variant="caption" color={colors.textSecondary} style={styles.modeSubtitle}>
          {`Devotee: ${payout.kundli_order?.customer?.display_name || payout.kundli_order?.customer_name}`}
        </Text>
      ) : null}

      {/* Financial Breakdown Card */}
      <View style={styles.financialBox}>
        <View style={styles.financialCol}>
          <Text variant="caption" color={colors.textSecondary}>
            Gross Dakshina
          </Text>
          <Text variant="bodyMedium">{formatCurrency(payout.gross_amount)}</Text>
        </View>

        <View style={styles.financialDivider} />

        <View style={styles.financialCol}>
          <Text variant="caption" color={colors.textSecondary}>
            Platform Fee
          </Text>
          <Text variant="bodyMedium" color={colors.textSecondary}>
            -{formatCurrency(payout.platform_fee)}
          </Text>
        </View>

        <View style={styles.financialDivider} />

        <View style={styles.financialCol}>
          <Text variant="caption" color={colors.primary}>
            Net Payout
          </Text>
          <Text variant="h3" color={colors.primary}>
            {formatCurrency(payout.net_amount)}
          </Text>
        </View>
      </View>

      {/* Manual Transfer Settlement Details (when disbursed) */}
      {isPaid && (transactionRef || payout.payment_method || settlementDate || payout.proof_document_path) ? (
        <View style={styles.transferDetailsBox}>
          {payout.payment_method ? (
            <View style={styles.transferDetailRow}>
              <Text variant="caption" color={colors.textSecondary}>
                Payment Mode:
              </Text>
              <Text variant="captionMedium" style={styles.paymentMethodText}>
                {payout.payment_method.replace("_", " ").toUpperCase()}
              </Text>
            </View>
          ) : null}

          {transactionRef ? (
            <View style={styles.transferDetailRow}>
              <Text variant="caption" color={colors.textSecondary}>
                UTR / Ref:
              </Text>
              <Text variant="captionMedium" color={colors.primary} style={styles.utrText}>
                {transactionRef}
              </Text>
            </View>
          ) : null}

          {payout.proof_document_path ? (
            <View style={styles.transferDetailRow}>
              <Text variant="caption" color={colors.textSecondary}>
                Payment Proof:
              </Text>
              <TouchableOpacity
                onPress={handleViewProof}
                disabled={loadingProof}
                style={styles.proofBtn}
                activeOpacity={0.7}
              >
                {loadingProof ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text variant="captionMedium" color={colors.primary} style={styles.proofBtnText}>
                    📄 View Proof
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {payout.notes ? (
            <View style={styles.transferDetailRow}>
              <Text variant="caption" color={colors.textSecondary}>
                Note:
              </Text>
              <Text variant="caption" color={colors.textSecondary} style={styles.notesText}>
                {payout.notes}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Failure Alert Banner (if failed) */}
      {payout.status === "failed" ? (
        <View style={styles.failureBanner}>
          <Text style={styles.failureIcon}>⚠️</Text>
          <View style={styles.failureTextWrap}>
            <Text variant="captionMedium" color="#b91c1c">
              Gateway transfer could not be completed.
            </Text>
            <Text variant="caption" color="#991b1b">
              Our administrative finance team is reviewing your bank details for manual disbursement.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Footer Info: Bank Account & Timestamps */}
      <View style={styles.footerRow}>
        <View style={styles.footerLeft}>
          {payout.bank_account ? (
            <Text variant="caption" color={colors.textSecondary}>
              Bank: {payout.bank_account.bank_name || "Verified Account"} (IFSC:{" "}
              {payout.bank_account.ifsc_code})
            </Text>
          ) : (
            <Text variant="caption" color={colors.textSecondary}>
              Settlement Ledger Record
            </Text>
          )}
        </View>

        <View style={styles.footerRight}>
          <Text variant="caption" color={colors.textSecondary}>
            Created: {formatDate(payout.created_at)}
          </Text>
          {settlementDate && isPaid ? (
            <Text variant="captionMedium" color={colors.success || "#10b981"}>
              Disbursed: {formatDate(settlementDate)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Payment Proof Preview Modal */}
      <Modal
        visible={proofModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProofModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Text variant="h3">Payment Transfer Receipt</Text>
                <Text variant="caption" color={colors.textSecondary}>
                  {transactionRef ? `UTR: ${transactionRef}` : refNumber}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setProofModalVisible(false)}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.proofImageContainer}>
              {signedProofUrl ? (
                <Image
                  source={{ uri: signedProofUrl }}
                  style={styles.proofImage}
                  resizeMode="contain"
                />
              ) : (
                <ActivityIndicator size="large" color={colors.primary} />
              )}
            </View>

            <View style={styles.modalFooter}>
              {signedProofUrl ? (
                <Button
                  variant="outline"
                  size="sm"
                  title="Open Full Screen"
                  onPress={async () => {
                    try {
                      const canOpen = await Linking.canOpenURL(signedProofUrl);
                      if (canOpen) {
                        await Linking.openURL(signedProofUrl);
                      }
                    } catch {
                      // Handled
                    }
                  }}
                  style={styles.modalFullBtn}
                />
              ) : null}
              <Button
                variant="primary"
                size="sm"
                title="Close"
                onPress={() => setProofModalVisible(false)}
                style={styles.modalCloseBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  refWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full || 99,
  },
  statusText: {
    fontWeight: "700",
    fontSize: 11,
  },
  serviceName: {
    marginTop: spacing.xxs,
    marginBottom: 2,
  },
  modeSubtitle: {
    marginBottom: spacing.sm,
  },
  financialBox: {
    flexDirection: "row",
    backgroundColor: "#faf5ee",
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginVertical: spacing.xs,
    alignItems: "center",
  },
  financialCol: {
    flex: 1,
    alignItems: "center",
  },
  financialDivider: {
    width: 1,
    height: "80%",
    backgroundColor: "#e2d9cd",
  },
  transferDetailsBox: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
    gap: 4,
  },
  transferDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentMethodText: {
    textTransform: "uppercase",
  },
  utrText: {
    fontFamily: "monospace",
    fontWeight: "700",
  },
  notesText: {
    flex: 1,
    textAlign: "right",
    fontStyle: "italic",
  },
  failureBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  failureIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  failureTextWrap: {
    flex: 1,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  footerLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  footerRight: {
    alignItems: "flex-end",
  },
  proofBtn: {
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.xs || 4,
    backgroundColor: "#e0f2fe",
  },
  proofBtnText: {
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  modalCard: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalHeaderLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full || 99,
    backgroundColor: colors.borderLight,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textSecondary,
    lineHeight: 18,
    textAlign: "center",
    width: 18,
  },
  proofImageContainer: {
    height: 320,
    backgroundColor: "#f8fafc",
    borderRadius: radius.sm,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginVertical: spacing.xs,
  },
  proofImage: {
    width: "100%",
    height: "100%",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  modalFullBtn: {
    flex: 1,
  },
  modalCloseBtn: {
    flex: 1,
  },
});


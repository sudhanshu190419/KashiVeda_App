// src/features/pandit/screens/PanditBookingDetailsScreen.tsx
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
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Card, ErrorState, Header, LoadingState, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatCurrency, formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { BookingStatusBadge } from "../../booking/components/BookingStatusBadge.tsx";
import { usePanditBookingDetail } from "../hooks/usePanditBookingDetail.ts";
import { panditPayoutService } from "../services/panditPayoutService.ts";
import { panditService } from "../services/panditService.ts";

export const PanditBookingDetailsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<RouteProp<{ params: { bookingId: string } }, "params">>();
  const bookingId = route.params?.bookingId || "";

  const {
    booking,
    loading,
    error,
    completing,
    completeError,
    loadingToken,
    tokenError,
    refresh,
    completeRitual,
    fetchLiveRoomToken,
  } = usePanditBookingDetail(bookingId);

  const [confirmModalVisible, setConfirmModalVisible] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [cancelModalVisible, setCancelModalVisible] = useState<boolean>(false);
  const [proofModalVisible, setProofModalVisible] = useState<boolean>(false);
  const [loadingProof, setLoadingProof] = useState<boolean>(false);
  const [signedProofUrl, setSignedProofUrl] = useState<string | null>(null);
  const cancelReason = "Personal Emergency";

  const handleViewPayoutProof = async () => {
    if (signedProofUrl) {
      setProofModalVisible(true);
      return;
    }
    const proofPath = booking?.payout?.proof_document_path;
    if (!proofPath) {
      Alert.alert("Notice", "Payment proof document is not attached to this disbursement.");
      return;
    }
    setLoadingProof(true);
    try {
      const url = await panditPayoutService.getPayoutProofSignedUrl(proofPath);
      if (url) {
        setSignedProofUrl(url);
        setProofModalVisible(true);
      } else {
        Alert.alert("Notice", "Unable to load payment proof. Please check your network connection.");
      }
    } catch {
      Alert.alert("Error", "Failed to retrieve secure proof link.");
    } finally {
      setLoadingProof(false);
    }
  };

  const handlePanditCancel = async () => {
    if (!booking) return;
    setCancelling(true);
    try {
      await panditService.cancelBooking(booking.id, cancelReason);
      setCancelModalVisible(false);
      Alert.alert(
        "Ritual Cancelled",
        "The booking has been cancelled and a 100% refund has been queued for the devotee."
      );
      refresh();
    } catch (err: any) {
      Alert.alert("Cancellation Notice", err?.message || "Failed to cancel ritual.");
    } finally {
      setCancelling(false);
    }
  };

  const isPanditCancellable = booking ? ["confirmed", "upcoming", "rescheduled"].includes(booking.status) : false;

  if (loading && !booking) {
    return (
      <ScreenContainer padded>
        <Header title="Ritual Details" onBack={() => navigation.goBack()} />
        <LoadingState message="Loading ritual booking details..." />
      </ScreenContainer>
    );
  }

  if (error || !booking) {
    return (
      <ScreenContainer padded>
        <Header title="Ritual Details" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Booking Not Found"
          message={error || "Could not retrieve this booking record."}
          onRetry={refresh}
        />
      </ScreenContainer>
    );
  }

  const startDate = new Date(booking.scheduled_start_at);
  const isRemote = booking.service_mode === "remote";
  const isCompleted = booking.status === "completed";
  const isCancellable = ["cancelled", "disputed"].includes(booking.status);

  const handleJoinLive = async () => {
    try {
      const creds = await fetchLiveRoomToken();
      if (creds) {
        navigation.navigate("PanditLiveSession", {
          bookingId: booking.id,
          roomName: creds.room_name,
          token: creds.token,
          serverUrl: creds.server_url,
          pujaName: booking.puja_service?.name || "Vedic Ritual",
        });
      }
    } catch (err: any) {
      Alert.alert("Live Session Notice", err?.message || "Could not connect to live room.");
    }
  };

  const currentOutstandingBalance =
    booking?.outstanding_balance !== undefined
      ? booking.outstanding_balance
      : (booking?.balance_amount ?? 0);
  const currentTotalPaid =
    booking?.total_paid !== undefined
      ? booking.total_paid
      : currentOutstandingBalance === 0
      ? (booking?.total_amount ?? 0)
      : (booking?.advance_amount ?? 0);
  const hasOutstandingBalance = currentOutstandingBalance > 0;

  const handlePressComplete = () => {
    if (hasOutstandingBalance) {
      Alert.alert(
        "Settlement Required",
        `This ritual cannot be marked completed because the devotee still has an unsettled balance of ${formatCurrency(
          currentOutstandingBalance
        )}. Please ask the devotee to settle the balance via their app, and tap 'Refresh Payment Status' once received.`
      );
      return;
    }
    setConfirmModalVisible(true);
  };

  const handleConfirmCompletion = async () => {
    try {
      await completeRitual();
      setConfirmModalVisible(false);
      Alert.alert(
        "Ritual Completed! 🕉️",
        "Sankalp has been marked completed and the payout has been recorded."
      );
    } catch (err: any) {
      Alert.alert("Completion Notice", err?.message || "Could not mark ritual completed.");
    }
  };

  return (
    <ScreenContainer scrollable padded>
      <Header
        title="Ritual Details"
        subtitle={booking.booking_number}
        onBack={() => navigation.goBack()}
      />

      {/* Main Status & Ceremony Card */}
      <Card variant="elevated" style={styles.mainCard}>
        <View style={styles.statusRow}>
          <View style={styles.ceremonyWrap}>
            <Text variant="caption" color={colors.textSecondary}>
              Sacred Ceremony
            </Text>
            <Text variant="h2" style={styles.ceremonyName}>
              {booking.puja_service?.name || "Vedic Ritual"}
            </Text>
          </View>
          <BookingStatusBadge status={booking.status} />
        </View>

        <View style={styles.divider} />

        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <Text variant="caption" color={colors.textSecondary}>
              Scheduled Date
            </Text>
            <Text variant="bodyMedium">
              {formatDate(startDate)}
            </Text>
          </View>

          <View style={styles.infoCol}>
            <Text variant="caption" color={colors.textSecondary}>
              Muhurat Time
            </Text>
            <Text variant="bodyMedium">
              {formatTime(startDate)}
            </Text>
          </View>

          <View style={styles.infoCol}>
            <Text variant="caption" color={colors.textSecondary}>
              Format
            </Text>
            <Text variant="bodyMedium" style={styles.formatText}>
              {booking.service_mode} Ritual
            </Text>
          </View>
        </View>
      </Card>

      {/* Devotee Information Card */}
      <Card style={styles.sectionCard}>
        <Text variant="h3" style={styles.sectionTitle}>
          Devotee Information
        </Text>
        <View style={styles.devoteeRow}>
          <View style={styles.avatarCircle}>
            <Text variant="h3" color={colors.primary}>
              {booking.customer?.display_name?.charAt(0) || "D"}
            </Text>
          </View>
          <View style={styles.devoteeInfo}>
            <Text variant="bodyMedium">{booking.customer?.display_name || "Blessed Devotee"}</Text>
            {booking.customer?.phone ? (
              <Text variant="caption" color={colors.textSecondary}>
                Contact: {booking.customer.phone}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      {/* Location / Remote Access Card */}
      <Card style={styles.sectionCard}>
        <Text variant="h3" style={styles.sectionTitle}>
          {isRemote ? "Live Video Sanctum" : "Ritual Location"}
        </Text>

        {isRemote ? (
          <View>
            <View style={styles.remoteBox}>
              <Text style={styles.remoteIcon}>🌐</Text>
              <View style={styles.remoteTextWrap}>
                <Text variant="bodyMedium">LiveKit Cloud HD Room</Text>
                <Text variant="caption" color={colors.textSecondary}>
                  Acharyas can join the room 30 minutes before the scheduled start time.
                </Text>
              </View>
            </View>

            {booking.status === "confirmed" || booking.status === "in_progress" ? (
              <Button
                title={loadingToken ? "Connecting to Sanctum..." : "Enter Live Video Sanctum 🎥"}
                variant="primary"
                size="md"
                onPress={handleJoinLive}
                disabled={loadingToken}
                style={styles.joinBtn}
              />
            ) : null}

            {tokenError ? (
              <Text variant="caption" color={colors.error} style={styles.errorText}>
                {tokenError}
              </Text>
            ) : null}
          </View>
        ) : booking.service_mode === "home" ? (
          <View>
            <Text variant="bodyMedium">
              {booking.location?.address_snapshot || `${booking.location?.city || "Home Residence"}`}
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.locationSub}>
              Please reach the address 15 minutes before the auspicious muhurat.
            </Text>
          </View>
        ) : (
          <View>
            <Text variant="bodyMedium">
              {booking.location?.temple_name_snapshot || "Temple Sanctum"}
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.locationSub}>
              {booking.location?.city || "Varanasi"}
            </Text>
          </View>
        )}
      </Card>

      {/* Inclusions (Samagri & Prasad) */}
      {booking.line_items && booking.line_items.length > 0 ? (
        <Card style={styles.sectionCard}>
          <Text variant="h3" style={styles.sectionTitle}>
            Samagri & Prasad Inclusions
          </Text>
          <View style={styles.lineItemsList}>
            {booking.line_items.map((item) => (
              <View key={item.id} style={styles.lineItemRow}>
                <Text variant="body" style={styles.lineItemName}>
                  • {item.name_snapshot} ({item.quantity}x)
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  {item.item_type}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {/* Dedicated Dakshina & Settlement Status Card (for completed bookings) */}
      {isCompleted ? (
        <Card variant="elevated" style={styles.settlementCard}>
          <View style={styles.settlementHeaderRow}>
            <View style={styles.settlementTitleWrap}>
              <Text variant="overline" color={colors.primary}>
                PANDIT SETTLEMENT LEDGER
              </Text>
              <Text variant="h3">Dakshina &amp; Settlement Status</Text>
            </View>
            {booking.payout ? (
              <View
                style={[
                  styles.settlementBadge,
                  {
                    backgroundColor:
                      booking.payout.status === "paid"
                        ? "#dcfce7"
                        : booking.payout.status === "failed"
                        ? "#fee2e2"
                        : booking.payout.status === "processing"
                        ? "#f3e8ff"
                        : booking.payout.status === "approved"
                        ? "#e0f2fe"
                        : "#fef3c7",
                  },
                ]}
              >
                <Text
                  variant="caption"
                  style={[
                    styles.settlementBadgeText,
                    {
                      color:
                        booking.payout.status === "paid"
                          ? "#15803d"
                          : booking.payout.status === "failed"
                          ? "#b91c1c"
                          : booking.payout.status === "processing"
                          ? "#6b21a8"
                          : booking.payout.status === "approved"
                          ? "#0369a1"
                          : "#92400e",
                    },
                  ]}
                >
                  {booking.payout.status === "paid"
                    ? "✓ Paid"
                    : booking.payout.status === "approved"
                    ? "📋 Payout Approved"
                    : booking.payout.status === "processing"
                    ? "🔄 Transfer Processing"
                    : booking.payout.status === "failed"
                    ? "⚠️ Payout Failed"
                    : "⏳ Awaiting Payout"}
                </Text>
              </View>
            ) : (
              <View style={[styles.settlementBadge, styles.settlementBadgePending]}>
                <Text variant="caption" style={[styles.settlementBadgeText, styles.settlementBadgeTextPending]}>
                  ⏳ Settlement Pending
                </Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {booking.payout ? (
            <View>
              {/* Net Earnings Highlight Box */}
              <View style={styles.netEarningsBox}>
                <View style={styles.netEarningsCol}>
                  <Text variant="caption" color={colors.textSecondary}>
                    Your Net Dakshina (Disbursement)
                  </Text>
                  <Text variant="h1" color={colors.primary} style={styles.netEarningsAmount}>
                    {formatCurrency(booking.payout.net_amount)}
                  </Text>
                </View>
                <View style={styles.grossPlatformCol}>
                  <Text variant="caption" color={colors.textSecondary}>
                    Gross: {formatCurrency(booking.payout.gross_amount)}
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    Platform Fee: -{formatCurrency(booking.payout.platform_fee)}
                  </Text>
                </View>
              </View>

              {/* Settlement Transfer Details (Only shown when paid) */}
              {booking.payout.status === "paid" ? (
                <View style={styles.paidDetailsSection}>
                  <View style={styles.financeRow}>
                    <Text variant="caption" color={colors.textSecondary}>
                      Disbursement Status
                    </Text>
                    <Text variant="bodyMedium" color={colors.success}>
                      ✓ Transferred to Bank Account
                    </Text>
                  </View>

                  {booking.payout.payment_method ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={colors.textSecondary}>
                        Payment Mode
                      </Text>
                      <Text variant="bodyMedium" style={{ textTransform: "uppercase" }}>
                        {booking.payout.payment_method.replace("_", " ").toUpperCase()}
                      </Text>
                    </View>
                  ) : null}

                  {booking.payout.transaction_reference ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={colors.textSecondary}>
                        UTR / Transaction Reference
                      </Text>
                      <Text variant="bodyMedium" style={styles.utrText}>
                        {booking.payout.transaction_reference}
                      </Text>
                    </View>
                  ) : booking.payout.provider_payout_id ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={colors.textSecondary}>
                        Gateway Reference ID
                      </Text>
                      <Text variant="bodyMedium">
                        {booking.payout.provider_payout_id}
                      </Text>
                    </View>
                  ) : null}

                  {booking.payout.confirmed_at || booking.payout.released_at ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={colors.textSecondary}>
                        Settlement Date
                      </Text>
                      <Text variant="bodyMedium">
                        {formatDate(new Date(booking.payout.confirmed_at || booking.payout.released_at!))}
                      </Text>
                    </View>
                  ) : null}

                  {booking.payout.bank_account ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={colors.textSecondary}>
                        Target Account
                      </Text>
                      <Text variant="bodyMedium">
                        {booking.payout.bank_account.bank_name || "Bank Account"} (IFSC: {booking.payout.bank_account.ifsc_code})
                      </Text>
                    </View>
                  ) : null}

                  {booking.payout.proof_document_path ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={colors.textSecondary}>
                        Payment Proof
                      </Text>
                      <TouchableOpacity
                        onPress={handleViewPayoutProof}
                        disabled={loadingProof}
                        style={styles.proofBtn}
                        activeOpacity={0.7}
                      >
                        {loadingProof ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Text variant="captionMedium" color={colors.primary} style={styles.proofBtnText}>
                            📄 View Receipt
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ) : (
                /* Unpaid / Pending Settlement Information */
                <View style={styles.unsettledBanner}>
                  <Text style={styles.unsettledIcon}>
                    {booking.payout.status === "failed" ? "⚠️" : "⏳"}
                  </Text>
                  <View style={styles.unsettledTextWrap}>
                    <Text
                      variant="captionMedium"
                      color={booking.payout.status === "failed" ? "#b91c1c" : "#92400e"}
                    >
                      {booking.payout.status === "failed"
                        ? "Disbursement Transfer Failed"
                        : booking.payout.status === "processing"
                        ? "Transfer In Progress"
                        : booking.payout.status === "approved"
                        ? "Payout Approved"
                        : "Awaiting Administrative Transfer"}
                    </Text>
                    <Text
                      variant="caption"
                      color={booking.payout.status === "failed" ? "#991b1b" : "#b45309"}
                    >
                      {booking.payout.status === "failed"
                        ? "The automatic bank transfer failed. Our finance team is reviewing your verified bank details for manual disbursement."
                        : "Ritual completion has been recorded. Dakshina will be disbursed directly to your registered bank account by our finance team."}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.unsettledBanner}>
              <Text style={styles.unsettledIcon}>⏳</Text>
              <View style={styles.unsettledTextWrap}>
                <Text variant="captionMedium" color="#92400e">
                  Settlement Ledger Initialization Pending
                </Text>
                <Text variant="caption" color="#b45309">
                  Ritual completion has been recorded. The authoritative settlement record will appear here shortly.
                </Text>
              </View>
            </View>
          )}
        </Card>
      ) : null}

      {/* Devotee Payment Overview Card */}
      <Card style={styles.sectionCard}>
        <Text variant="h3" style={styles.sectionTitle}>
          Devotee Booking &amp; Payment Overview
        </Text>
        <View style={styles.financeRow}>
          <Text variant="body" color={colors.textSecondary}>
            Total Ritual Value
          </Text>
          <Text variant="bodyMedium">
            {formatCurrency(booking.total_amount)}
          </Text>
        </View>
        <View style={styles.financeRow}>
          <Text variant="body" color={colors.textSecondary}>
            Amount Paid to Date
          </Text>
          <Text variant="bodyMedium" color={colors.primary}>
            {formatCurrency(currentTotalPaid)}
          </Text>
        </View>
        <View style={styles.financeRow}>
          <Text variant="body" color={colors.textSecondary}>
            Outstanding Balance
          </Text>
          <Text
            variant="bodyMedium"
            color={hasOutstandingBalance ? colors.secondary : colors.success}
          >
            {formatCurrency(currentOutstandingBalance)}
          </Text>
        </View>

        {hasOutstandingBalance ? (
          <View style={styles.unsettledDevoteeBanner}>
            <Text style={styles.unsettledIcon}>⚠️</Text>
            <View style={styles.unsettledTextWrap}>
              <Text variant="captionMedium" color="#92400e">
                Devotee Balance Settlement Pending ({formatCurrency(currentOutstandingBalance)})
              </Text>
              <Text variant="caption" color="#b45309">
                Devotee has an unsettled balance of {formatCurrency(currentOutstandingBalance)}. Please ask the devotee to settle the balance from their app before marking the ritual completed.
              </Text>
              <TouchableOpacity
                onPress={refresh}
                disabled={loading}
                style={styles.refreshStatusBtn}
                activeOpacity={0.7}
              >
                <Text variant="captionMedium" color={colors.primary}>
                  🔄 Refresh Payment Status
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.paidBadgeBox}>
            <Text variant="captionMedium" color="#15803d">
              ✓ Full Ritual Dakshina Paid &amp; Cleared — Eligible for Completion
            </Text>
          </View>
        )}
      </Card>

      {/* Ritual Completion & Pandit Cancellation Actions */}
      {!isCompleted && !isCancellable ? (
        <View style={styles.completionSection}>
          <Button
            title={
              completing
                ? "Marking Completed..."
                : "Mark Ritual as Completed 🕉️"
            }
            variant={hasOutstandingBalance ? "outline" : "primary"}
            size="lg"
            onPress={handlePressComplete}
            disabled={completing || cancelling}
          />
          {hasOutstandingBalance ? (
            <Text variant="caption" color={colors.textSecondary} align="center" style={{ marginTop: spacing.xs }}>
              Devotee must settle remaining balance before ritual completion can be submitted.
            </Text>
          ) : null}
          {completeError ? (
            <Text variant="caption" color={colors.error} align="center" style={styles.errorText}>
              {completeError}
            </Text>
          ) : null}

          {isPanditCancellable && (
            <Button
              title="Cancel Ritual (Pandit Duty / Emergency)"
              variant="outline"
              size="md"
              onPress={() => setCancelModalVisible(true)}
              disabled={completing || cancelling}
              style={{ marginTop: spacing.sm }}
            />
          )}
        </View>
      ) : isCompleted ? (
        <Card variant="outlined" style={styles.completedBanner}>
          <Text variant="h3" color={colors.success} align="center">
            ✓ Ritual Completed
          </Text>
          <Text variant="caption" color={colors.textSecondary} align="center" style={styles.completedSub}>
            Completed on {booking.completed_at ? formatDate(new Date(booking.completed_at)) : "record"}.
          </Text>
        </Card>
      ) : null}

      {/* Confirmation Dialog Area */}
      {confirmModalVisible ? (
        <Card variant="elevated" style={styles.confirmCard}>
          <Text variant="h3" style={styles.confirmTitle}>
            Confirm Ritual Completion?
          </Text>
          <Text variant="body" color={colors.textSecondary} style={styles.confirmDesc}>
            Are you sure you want to mark this Vedic ritual as completed? This will trigger payout disbursement records.
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity
              onPress={() => setConfirmModalVisible(false)}
              style={styles.cancelConfirmBtn}
            >
              <Text variant="bodyMedium" color={colors.textSecondary}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirmCompletion}
              disabled={completing}
              style={styles.yesConfirmBtn}
            >
              {completing ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Text variant="bodyMedium" color={colors.surface}>
                  Yes, Complete Ritual
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Card>
      ) : null}

      {/* Pandit Cancellation Dialog */}
      {cancelModalVisible ? (
        <Card variant="elevated" style={styles.confirmCard}>
          <Text variant="h3" style={styles.confirmTitle}>
            Cancel Ritual Assignment?
          </Text>
          <Text variant="body" color={colors.textSecondary} style={styles.confirmDesc}>
            Cancelling this ritual will immediately notify the devotee and grant a 100% full refund of all captured funds.
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity
              onPress={() => setCancelModalVisible(false)}
              style={styles.cancelConfirmBtn}
            >
              <Text variant="bodyMedium" color={colors.textSecondary}>
                Keep Ritual
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePanditCancel}
              disabled={cancelling}
              style={[styles.yesConfirmBtn, { backgroundColor: colors.error }]}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Text variant="bodyMedium" color={colors.surface}>
                  Yes, Cancel & Refund Devotee
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Card>
      ) : null}

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
                  {booking?.payout?.transaction_reference
                    ? `UTR: ${booking.payout.transaction_reference}`
                    : `Booking #${booking?.booking_number}`}
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
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  mainCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  ceremonyWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  ceremonyName: {
    marginTop: spacing.xxs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  infoGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoCol: {
    flex: 1,
  },
  formatText: {
    textTransform: "capitalize",
  },
  sectionCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  devoteeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  devoteeInfo: {
    flex: 1,
  },
  remoteBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  remoteIcon: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  remoteTextWrap: {
    flex: 1,
  },
  joinBtn: {
    marginTop: spacing.sm,
  },
  locationSub: {
    marginTop: 2,
  },
  lineItemsList: {
    gap: spacing.xs,
  },
  lineItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lineItemName: {
    flex: 1,
  },
  financeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  completionSection: {
    marginVertical: spacing.lg,
  },
  errorText: {
    marginTop: spacing.xs,
  },
  completedBanner: {
    marginVertical: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  completedSub: {
    marginTop: 2,
  },
  confirmCard: {
    backgroundColor: "#FFFDFB",
    borderColor: colors.primary,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  confirmTitle: {
    marginBottom: spacing.xs,
  },
  confirmDesc: {
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
    alignItems: "center",
  },
  cancelConfirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  yesConfirmBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xs,
  },
  settlementCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: "#FFFDFB",
    borderColor: colors.primaryLight,
    borderWidth: 1.5,
  },
  settlementHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  settlementTitleWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  settlementBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xs,
  },
  settlementBadgeText: {
    fontWeight: "700",
    fontSize: 11,
  },
  settlementBadgePending: {
    backgroundColor: "#fef3c7",
  },
  settlementBadgeTextPending: {
    color: "#92400e",
  },
  netEarningsBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    backgroundColor: "#faf5ee",
    padding: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  netEarningsCol: {
    flex: 1,
  },
  netEarningsAmount: {
    marginTop: spacing.xxs,
    fontWeight: "800",
  },
  grossPlatformCol: {
    alignItems: "flex-end",
    justifyContent: "flex-end",
  },
  paidDetailsSection: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 4,
  },
  utrText: {
    fontFamily: "monospace",
    fontWeight: "700",
    color: colors.primary,
  },
  unsettledBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  unsettledIcon: {
    fontSize: 18,
    marginRight: 2,
  },
  unsettledTextWrap: {
    flex: 1,
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
  unsettledDevoteeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  refreshStatusBtn: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  paidBadgeBox: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
    alignItems: "center",
  },
});

// src/features/booking/screens/BookingDetailsScreen.tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, Card, ErrorState, Header, LoadingState, ScreenContainer, Text } from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency, formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { BookingStatusBadge } from "../components/index.ts";
import { useBookingDetails } from "../hooks/useBookingDetails.ts";
import { bookingPaymentService } from "../services/bookingPaymentService.ts";
import { bookingService } from "../services/bookingService.ts";
import { CancellationRefundPreview } from "../types/booking.types.ts";

type BookingDetailRouteProp = RouteProp<CustomerStackParamList, "BookingDetail">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const BookingDetailsScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<BookingDetailRouteProp>();
  const bookingId = route.params?.bookingId || "";

  const { booking, loading, error, refresh } = useBookingDetails(bookingId);

  const [loadingToken, setLoadingToken] = useState<boolean>(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Financial Lifecycle Action States
  const [payingBalance, setPayingBalance] = useState<boolean>(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // Cancellation Modal & Preview State
  const [cancelModalVisible, setCancelModalVisible] = useState<boolean>(false);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [cancellationReason, setCancellationReason] = useState<string>("");
  const [refundPreview, setRefundPreview] = useState<CancellationRefundPreview | null>(null);

  // Reschedule Modal State
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState<boolean>(false);
  const [rescheduling, setRescheduling] = useState<boolean>(false);
  const [rescheduleDateStr, setRescheduleDateStr] = useState<string>("");

  const handleJoinLive = async () => {
    if (!booking) return;
    setLoadingToken(true);
    setTokenError(null);
    try {
      const creds = await bookingService.requestLiveSessionToken(booking.id);
      if (creds) {
        navigation.navigate("CustomerLiveSession", {
          bookingId: booking.id,
          roomName: creds.room_name,
          token: creds.token,
          serverUrl: creds.server_url,
          pujaName: booking.puja_service?.name || "Vedic Ritual",
          panditName: booking.pandit?.display_name || "Acharya",
        });
      }
    } catch (err: any) {
      const msg = err?.message || "Could not connect to live room. Please ensure session window is open.";
      setTokenError(msg);
      Alert.alert("Live Session Notice", msg);
    } finally {
      setLoadingToken(false);
    }
  };

  const handlePayBalance = async () => {
    if (!booking) return;
    setPayingBalance(true);
    setBalanceError(null);
    try {
      const balanceOrder = await bookingPaymentService.createBookingBalancePaymentOrder(booking.id);
      navigation.navigate("BookingPayment", {
        bookingId: booking.id,
        paymentOrderId: balanceOrder.payment_order_id,
        bookingNumber: booking.booking_number,
        advanceAmount: balanceOrder.amount,
        pujaName: booking.puja_service?.name || "Vedic Ritual",
        panditName: booking.pandit?.display_name || "Acharya",
        isBalancePayment: true,
      });
    } catch (err: any) {
      const msg = err?.message || "Failed to initialize balance payment.";
      setBalanceError(msg);
      Alert.alert("Balance Payment Notice", msg);
      if (
        msg.toLowerCase().includes("no outstanding balance") ||
        msg.toLowerCase().includes("balance: 0.00")
      ) {
        refresh();
      }
    } finally {
      setPayingBalance(false);
    }
  };

  const handleOpenCancelModal = async () => {
    if (!booking) return;
    setCancelModalVisible(true);
    setLoadingPreview(true);
    try {
      const preview = await bookingService.previewCancellationRefund(booking.id);
      setRefundPreview(preview);
    } catch (err: any) {
      Alert.alert("Notice", err?.message || "Could not calculate refund preview.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!booking) return;
    setCancelling(true);
    try {
      const result = await bookingService.cancelBooking(booking.id, cancellationReason);
      setCancelModalVisible(false);
      Alert.alert(
        "Ritual Cancelled",
        `Your booking has been cancelled. Eligible refund of ${formatCurrency(result.refund_amount)} has been queued.`
      );
      refresh();
    } catch (err: any) {
      Alert.alert("Cancellation Error", err?.message || "Failed to cancel booking.");
    } finally {
      setCancelling(false);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!booking || !rescheduleDateStr) {
      Alert.alert("Reschedule Notice", "Please enter a valid future ISO timestamp (e.g. 2026-10-10T10:00:00+05:30).");
      return;
    }
    setRescheduling(true);
    try {
      await bookingService.requestBookingReschedule(booking.id, rescheduleDateStr);
      setRescheduleModalVisible(false);
      Alert.alert("Ritual Rescheduled! 🕉️", "Your booking time has been updated at no additional cost.");
      refresh();
    } catch (err: any) {
      Alert.alert("Reschedule Error", err?.message || "Could not reschedule ritual.");
    } finally {
      setRescheduling(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer padded>
        <Header title="Booking Details" onBack={() => navigation.goBack()} />
        <LoadingState message="Loading ritual booking details..." />
      </ScreenContainer>
    );
  }

  if (error || !booking) {
    return (
      <ScreenContainer padded>
        <Header title="Booking Details" onBack={() => navigation.goBack()} />
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
  const isCancellable = ["confirmed", "upcoming", "rescheduled", "payment_pending"].includes(booking.status);
  const isReschedulable = ["confirmed", "upcoming"].includes(booking.status) && booking.reschedule_count < 1;

  // Authoritative real-time financial balance
  const currentOutstandingBalance =
    booking.outstanding_balance !== undefined
      ? booking.outstanding_balance
      : booking.balance_amount;
  const isBalancePayable =
    ["confirmed", "upcoming", "rescheduled"].includes(booking.status) &&
    currentOutstandingBalance > 0;
  const totalPaidAmount =
    booking.total_paid !== undefined
      ? booking.total_paid
      : currentOutstandingBalance === 0
      ? booking.total_amount
      : booking.advance_amount;

  return (
    <ScreenContainer scrollable padded>
      <Header
        title="Ritual Sankalp"
        subtitle={booking.booking_number}
        onBack={() => navigation.goBack()}
      />

      {/* Main Status & Ritual Header */}
      <Card variant="elevated" style={styles.mainCard}>
        <View style={styles.statusRow}>
          <View>
            <Text variant="caption" color={colors.textSecondary}>
              Reference Number
            </Text>
            <Text variant="bodyMedium" color={colors.textPrimary}>
              {booking.booking_number}
            </Text>
          </View>
          <BookingStatusBadge status={booking.status} />
        </View>

        <View style={styles.divider} />

        <Text variant="h2" style={styles.pujaTitle}>
          {booking.puja_service?.name || "Vedic Puja"}
        </Text>

        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <Text variant="caption" color={colors.textSecondary}>
              Date & Time
            </Text>
            <Text variant="bodyMedium">
              {formatDate(startDate)}
            </Text>
            <Text variant="caption" color={colors.primary}>
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

      {/* Pandit Profile Card */}
      <Card style={styles.sectionCard}>
        <Text variant="h3" style={styles.sectionTitle}>
          Officiating Acharya
        </Text>
        <View style={styles.panditRow}>
          <View style={styles.avatarCircle}>
            <Text variant="h3" color={colors.primary}>
              {booking.pandit?.display_name?.charAt(0) || "A"}
            </Text>
          </View>
          <View style={styles.panditInfo}>
            <Text variant="bodyMedium">{booking.pandit?.display_name || "Verified Priest"}</Text>
            <Text variant="caption" color={colors.textSecondary}>
              Authorized by Kashi Veda Vedic Board
            </Text>
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
                  Devotees can join the room 15 minutes before the scheduled start time.
                </Text>
              </View>
            </View>

            {booking.status === "confirmed" || booking.status === "in_progress" || booking.status === "rescheduled" ? (
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
            <Text variant="caption" color={colors.textSecondary} style={styles.subTextSpacing}>
              The Acharya will reach your address with complete samagri.
            </Text>
          </View>
        ) : (
          <View>
            <Text variant="bodyMedium">
              {booking.location?.temple_name_snapshot || "Temple Sanctum"}
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.subTextSpacing}>
              {booking.location?.city || "Varanasi"}
            </Text>
          </View>
        )}
      </Card>

      {/* Itemized Line Items Table */}
      {booking.line_items && booking.line_items.length > 0 ? (
        <Card style={styles.sectionCard}>
          <Text variant="h3" style={styles.sectionTitle}>
            Itemized Inclusions
          </Text>

          <View style={styles.lineItemsList}>
            {booking.line_items.map((item) => (
              <View key={item.id} style={styles.lineItemRow}>
                <View style={styles.lineItemInfo}>
                  <Text variant="bodyMedium">{item.name_snapshot}</Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    Qty: {item.quantity} {item.unit || ""}
                  </Text>
                </View>
                <Text variant="bodyMedium" color={colors.textPrimary}>
                  {formatCurrency(item.total_price)}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {/* Financial Summary */}
      <Card variant="elevated" style={styles.financialCard}>
        <Text variant="h3" style={styles.sectionTitle}>
          Payment Summary
        </Text>

        <View style={styles.financialRow}>
          <Text variant="body" color={colors.textSecondary}>Total Ritual Amount</Text>
          <Text variant="bodyMedium">{formatCurrency(booking.total_amount)}</Text>
        </View>

        {currentOutstandingBalance > 0 ? (
          <View style={styles.financialRow}>
            <Text variant="body" color={colors.textSecondary}>Advance Paid (Confirmed)</Text>
            <Text variant="bodyMedium" color="#15803D">
              {formatCurrency(booking.advance_amount)}
            </Text>
          </View>
        ) : (
          <View style={styles.financialRow}>
            <Text variant="body" color={colors.textSecondary}>Total Dakshina Paid (Confirmed)</Text>
            <Text variant="bodyMedium" color="#15803D">
              {formatCurrency(totalPaidAmount)}
            </Text>
          </View>
        )}

        {currentOutstandingBalance > 0 && totalPaidAmount > booking.advance_amount && (
          <View style={styles.financialRow}>
            <Text variant="body" color={colors.textSecondary}>Total Paid to Date</Text>
            <Text variant="bodyMedium" color="#15803D">
              {formatCurrency(totalPaidAmount)}
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.financialRow}>
          <Text variant="bodyMedium">Outstanding Balance</Text>
          <Text variant="h3" color={isBalancePayable ? colors.primary : "#15803D"}>
            {formatCurrency(currentOutstandingBalance)}
          </Text>
        </View>

        {isBalancePayable && (
          <View style={styles.balanceActionWrap}>
            <View style={styles.balanceNoticeBox}>
              <Text variant="caption" color={colors.textSecondary}>
                ⚠️ Balance must be settled at least 24 hours prior to ritual start.
              </Text>
            </View>
            <Button
              title={payingBalance ? "Initializing Balance Checkout..." : `Pay Remaining Balance — ${formatCurrency(currentOutstandingBalance)} 💳`}
              variant="primary"
              size="md"
              onPress={handlePayBalance}
              disabled={payingBalance}
              style={styles.payBalanceBtn}
            />
            {balanceError ? (
              <Text variant="caption" color={colors.error} style={styles.errorText}>
                {balanceError}
              </Text>
            ) : null}
          </View>
        )}

        {currentOutstandingBalance === 0 && booking.status !== "cancelled" && (
          <View style={styles.paidBadgeBox}>
            <Text variant="captionMedium" color="#15803D">
              ✓ Full Ritual Dakshina Paid & Cleared — No Outstanding Balance
            </Text>
          </View>
        )}
      </Card>

      {/* Customer Action CTAs (Reschedule & Cancel) */}
      {(isReschedulable || isCancellable) && (
        <Card style={styles.actionCard}>
          <Text variant="h3" style={styles.sectionTitle}>
            Booking Actions
          </Text>
          <View style={styles.actionButtonsCol}>
            {isReschedulable && (
              <Button
                title="Reschedule Ritual (1 Free Reschedule)"
                variant="secondary"
                size="md"
                onPress={() => setRescheduleModalVisible(true)}
              />
            )}
            {isCancellable && (
              <Button
                title="Cancel Ritual"
                variant="outline"
                size="md"
                onPress={handleOpenCancelModal}
              />
            )}
          </View>
        </Card>
      )}

      {/* Cancellation Modal with Server-Side Preview */}
      <Modal visible={cancelModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Card variant="elevated" style={styles.modalCard}>
            <Text variant="h2" align="center" style={styles.modalTitle}>
              Cancel Ritual
            </Text>
            <Text variant="caption" color={colors.textSecondary} align="center">
              Server-Calculated Refund Policy Preview
            </Text>

            {loadingPreview ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text variant="body" color={colors.textSecondary}>
                  Calculating authoritative refund...
                </Text>
              </View>
            ) : refundPreview ? (
              <View style={styles.previewBox}>
                <View style={styles.previewRow}>
                  <Text variant="body" color={colors.textSecondary}>Net Captured Amount</Text>
                  <Text variant="bodyMedium">{formatCurrency(refundPreview.net_captured)}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text variant="body" color={colors.textSecondary}>Applied Policy Tier</Text>
                  <Text variant="captionMedium" color={colors.primary}>{refundPreview.policy_name}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text variant="body" color={colors.textSecondary}>Refund Percentage</Text>
                  <Text variant="bodyMedium">{refundPreview.refund_percent}%</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text variant="body" color={colors.textSecondary}>Cancellation Deduction</Text>
                  <Text variant="bodyMedium" color={colors.error}>{formatCurrency(refundPreview.deduction_amount)}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.previewRow}>
                  <Text variant="h3">Total Refund Due</Text>
                  <Text variant="h3" color="#15803D">{formatCurrency(refundPreview.refund_amount)}</Text>
                </View>

                <TextInput
                  style={styles.reasonInput}
                  placeholder="Reason for cancellation (optional)"
                  value={cancellationReason}
                  onChangeText={setCancellationReason}
                />

                <View style={styles.modalActions}>
                  <Button
                    title="Keep Booking"
                    variant="secondary"
                    size="md"
                    onPress={() => setCancelModalVisible(false)}
                    style={styles.actionButton}
                  />
                  <Button
                    title={cancelling ? "Processing..." : "Confirm Cancel"}
                    variant="primary"
                    size="md"
                    onPress={handleConfirmCancel}
                    disabled={cancelling}
                    style={styles.actionButton}
                  />
                </View>
              </View>
            ) : null}
          </Card>
        </View>
      </Modal>

      {/* Reschedule Modal */}
      <Modal visible={rescheduleModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Card variant="elevated" style={styles.modalCard}>
            <Text variant="h2" align="center" style={styles.modalTitle}>
              Reschedule Ritual
            </Text>
            <Text variant="caption" color={colors.textSecondary} align="center">
              1-Time Free Reschedule • Original Price Preserved
            </Text>

            <View style={styles.rescheduleContent}>
              <Text variant="body" color={colors.textSecondary}>
                Enter new Muhurat start timestamp (ISO format):
              </Text>
              <TextInput
                style={styles.reasonInput}
                placeholder="2026-10-15T10:00:00+05:30"
                value={rescheduleDateStr}
                onChangeText={setRescheduleDateStr}
              />
              <Text variant="caption" color={colors.textTertiary}>
                Note: The Acharya must be available during the new time slot.
              </Text>

              <View style={styles.modalActions}>
                <Button
                  title="Close"
                  variant="secondary"
                  size="md"
                  onPress={() => setRescheduleModalVisible(false)}
                  style={styles.actionButton}
                />
                <Button
                  title={rescheduling ? "Updating..." : "Confirm New Slot"}
                  variant="primary"
                  size="md"
                  onPress={handleConfirmReschedule}
                  disabled={rescheduling}
                  style={styles.actionButton}
                />
              </View>
            </View>
          </Card>
        </View>
      </Modal>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  mainCard: {
    marginVertical: spacing.sm,
    padding: spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.sm,
  },
  pujaTitle: {
    marginBottom: spacing.sm,
  },
  infoGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  infoCol: {
    flex: 1,
  },
  sectionCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  panditRow: {
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
  panditInfo: {
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
    fontSize: 28,
    marginRight: spacing.sm,
  },
  remoteTextWrap: {
    flex: 1,
  },
  lineItemsList: {
    gap: spacing.xs,
  },
  lineItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xxs,
  },
  lineItemInfo: {
    flex: 1,
  },
  financialCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  balanceActionWrap: {
    marginTop: spacing.xs,
  },
  balanceNoticeBox: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  paidBadgeBox: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
    borderWidth: 1,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    alignItems: "center",
  },
  payBalanceBtn: {
    marginTop: spacing.xxs,
  },
  actionCard: {
    marginBottom: spacing.xl,
    padding: spacing.md,
  },
  actionButtonsCol: {
    gap: spacing.sm,
  },
  formatText: {
    textTransform: "capitalize",
  },
  subTextSpacing: {
    marginTop: 2,
  },
  joinBtn: {
    marginTop: spacing.sm,
  },
  errorText: {
    marginTop: spacing.xs,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: spacing.md,
  },
  modalCard: {
    padding: spacing.lg,
  },
  modalTitle: {
    marginBottom: spacing.xxs,
  },
  modalLoading: {
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  previewBox: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  reasonInput: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  rescheduleContent: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  actionButton: {
    flex: 1,
  },
});

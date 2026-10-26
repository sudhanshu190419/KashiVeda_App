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
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  VAvatar,
  LiveStatusPill,
  StepProgress,
  StepItem,
  VDivider,
  RatingStars,
} from "../../../shared/components/index.ts";
import { Button } from "../../../shared/components/ui/Button.tsx";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency, formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { SubmitReviewModal } from "../components/index.ts";
import { useBookingDetails, useBookingReview } from "../hooks/index.ts";
import { bookingPaymentService } from "../services/bookingPaymentService.ts";
import { bookingService } from "../services/bookingService.ts";
import { CancellationRefundPreview } from "../types/booking.types.ts";

type BookingDetailRouteProp = RouteProp<CustomerStackParamList, "BookingDetail">;
type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

export const BookingDetailsScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const route = useRoute<BookingDetailRouteProp>();
  const bookingId = route.params?.bookingId || "";

  const { colors, spacing } = useTheme();
  const { pick } = useLanguage();

  const { booking, loading, error, refresh } = useBookingDetails(bookingId);

  // Review State & Hook
  const isCompleted = booking?.status === "completed";
  const {
    review,
    hasReviewed,
    submitting: submittingReview,
    submitReview,
  } = useBookingReview(booking?.id, isCompleted);
  const [reviewModalVisible, setReviewModalVisible] = useState<boolean>(false);

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
      <ScreenWrapper safeArea="all" scrollable={false} contentContainerStyle={styles.centerContainer}>
        <AppBar
          title="Booking Details"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <VText variant="bodyMedium" color="textMuted" style={{ marginTop: spacing.md }}>
            Loading ritual booking details...
          </VText>
        </View>
      </ScreenWrapper>
    );
  }

  if (error || !booking) {
    return (
      <ScreenWrapper safeArea="all" scrollable={false} contentContainerStyle={styles.centerContainer}>
        <AppBar
          title="Booking Details"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <VCard
          variant="outlined"
          style={[
            styles.errorStateCard,
            {
              backgroundColor: colors.errorBg,
              borderColor: colors.statusAlert,
            },
          ]}
        >
          <VText variant="headlineMedium" color="error" align="center" style={{ marginBottom: spacing.sm }}>
            Booking Not Found
          </VText>
          <VText variant="bodyMedium" color="textMuted" align="center" style={{ marginBottom: spacing.lg }}>
            {error || "Could not retrieve this booking record."}
          </VText>
          <Button
            title="Try Again"
            onPress={refresh}
            variant="outline"
            style={{ minHeight: 48, minWidth: 160 }}
          />
        </VCard>
      </ScreenWrapper>
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
    ["confirmed", "upcoming", "in_progress", "rescheduled"].includes(booking.status) &&
    currentOutstandingBalance > 0;
  const totalPaidAmount =
    booking.total_paid !== undefined
      ? booking.total_paid
      : currentOutstandingBalance === 0
      ? booking.total_amount
      : booking.advance_amount;

  // Decoupled 5-Node Ritual Fulfillment Tracking
  const fulfillmentSteps: StepItem[] = [
    { title: "Scheduled", titleHi: "निर्धारित" },
    { title: "Samagri Ready", titleHi: "सामग्री" },
    { title: "In Transit", titleHi: "प्रस्थान" },
    { title: "In Progress", titleHi: "अनुष्ठान" },
    { title: "Completed", titleHi: "पूर्णाहूति" },
  ];

  const resolveFulfillmentIndex = (): number => {
    if (booking.status === "completed") return 4;
    if (booking.status === "in_progress") return 3;
    const stage = (booking as any)?.fulfillment_stage;
    if (stage === "en_route" || stage === "arrived") return 2;
    if (stage === "samagri_dispatched") return 1;
    if (stage === "started") return 3;
    if (stage === "completed" || stage === "purnahuti") return 4;
    return 0;
  };

  const fulfillmentIndex = resolveFulfillmentIndex();

  return (
    <ScreenWrapper
      safeArea="all"
      scrollable={true}
      headerComponent={
        <AppBar
          title="Ritual Sankalp"
          subtitle={booking.booking_number}
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
      }
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxl }}
    >
      {/* Macro & Micro Status Banner */}
      <VCard variant="default" elevation={2} style={styles.mainCard}>
        <View style={styles.statusRow}>
          <View>
            <VText variant="caption" color="textMuted">
              Reference Number
            </VText>
            <VText variant="titleMedium" color="textPrimary" weight="700">
              {booking.booking_number}
            </VText>
          </View>
          <LiveStatusPill status={booking.status} />
        </View>

        <VDivider style={{ marginVertical: spacing.md }} />

        <VText variant="headlineLarge" color="textPrimary" style={styles.pujaTitle}>
          {booking.puja_service?.name || "Kashi Rudrabhishek"}
        </VText>

        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <VText variant="caption" color="textMuted">
              Date & Time
            </VText>
            <VText variant="bodyMedium" weight="600">
              {formatDate(startDate)}
            </VText>
            <VText variant="labelMedium" color="brandPrimary">
              {formatTime(startDate)}
            </VText>
          </View>

          <View style={styles.infoCol}>
            <VText variant="caption" color="textMuted">
              Format
            </VText>
            <VText variant="bodyMedium" weight="600" style={styles.formatText}>
              {booking.service_mode} Ritual
            </VText>
          </View>
        </View>
      </VCard>

      {/* 5-Node Micro Fulfillment Tracker */}
      <VCard
        variant="subtle"
        style={[
          styles.trackerCard,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.borderDefault,
          },
        ]}
      >
        <VText variant="labelMedium" color="textMuted" style={{ marginBottom: spacing.md }}>
          🕉️ {pick("अनुष्ठान प्रगति ट्रैकर", "Ritual Fulfillment Tracker")}
        </VText>
        <StepProgress
          steps={fulfillmentSteps}
          currentStep={fulfillmentIndex}
          variant="nodes"
        />
      </VCard>

      {/* Pandit Profile Card */}
      <VCard variant="default" style={styles.sectionCard}>
        <VText variant="headlineSmall" color="textPrimary" style={styles.sectionTitle}>
          Officiating Acharya
        </VText>
        <View style={styles.panditRow}>
          <VAvatar
            name={booking.pandit?.display_name || "Acharya"}
            uri={booking.pandit?.avatar_url || undefined}
            size="md"
            style={{ marginRight: spacing.md }}
          />
          <View style={styles.panditInfo}>
            <VText variant="titleMedium" color="textPrimary">
              {booking.pandit?.display_name || "Verified Priest"}
            </VText>
            <VText variant="caption" color="textMuted">
              Authorized by Kashi Veda Vedic Board
            </VText>
            {booking.pandit?.phone ? (
              <VText variant="caption" color="brandPrimary" style={{ marginTop: 2 }}>
                📞 {booking.pandit.phone}
              </VText>
            ) : null}
          </View>
        </View>
      </VCard>

      {/* Location / Remote Access Card */}
      <VCard variant="default" style={styles.sectionCard}>
        <VText variant="headlineSmall" color="textPrimary" style={styles.sectionTitle}>
          {isRemote ? "Live Video Sanctum" : "Ritual Location"}
        </VText>

        {isRemote ? (
          <View>
            <View
              style={[
                styles.remoteBox,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.borderDefault,
                },
              ]}
            >
              <VText variant="headlineMedium" style={styles.remoteIcon}>
                🌐
              </VText>
              <View style={styles.remoteTextWrap}>
                <VText variant="titleSmall" color="textPrimary">
                  LiveKit Cloud HD Room
                </VText>
                <VText variant="caption" color="textMuted">
                  Devotees can join the room 15 minutes before the scheduled start time.
                </VText>
              </View>
            </View>

            {booking.status === "confirmed" || booking.status === "in_progress" || booking.status === "rescheduled" ? (
              <Button
                title={loadingToken ? "Connecting to Sanctum..." : "Enter Live Video Sanctum 🎥"}
                variant="primary"
                size="md"
                onPress={handleJoinLive}
                disabled={loadingToken}
                style={{ minHeight: 48, marginTop: spacing.sm }}
              />
            ) : null}

            {tokenError ? (
              <VText variant="caption" color="error" style={styles.errorText}>
                {tokenError}
              </VText>
            ) : null}
          </View>
        ) : booking.service_mode === "home" ? (
          <View>
            <VText variant="bodyMedium" weight="600">
              {booking.location?.address_snapshot || `${booking.location?.city || "Home Residence"}`}
            </VText>
            <VText variant="caption" color="textMuted" style={styles.subTextSpacing}>
              The Acharya will reach your address with complete samagri.
            </VText>
          </View>
        ) : (
          <View>
            <VText variant="bodyMedium" weight="600">
              {booking.location?.temple_name_snapshot || "Temple Sanctum"}
            </VText>
            <VText variant="caption" color="textMuted" style={styles.subTextSpacing}>
              {booking.location?.city || "Varanasi"}
            </VText>
          </View>
        )}
      </VCard>

      {/* Itemized Line Items Table */}
      {booking.line_items && booking.line_items.length > 0 ? (
        <VCard variant="default" style={styles.sectionCard}>
          <VText variant="headlineSmall" color="textPrimary" style={styles.sectionTitle}>
            Itemized Inclusions
          </VText>

          <View style={styles.lineItemsList}>
            {booking.line_items.map((item) => (
              <View key={item.id} style={styles.lineItemRow}>
                <View style={styles.lineItemInfo}>
                  <VText variant="bodyMedium" weight="600">{item.name_snapshot}</VText>
                  <VText variant="caption" color="textMuted">
                    Qty: {item.quantity} {item.unit || ""}
                  </VText>
                </View>
                <VText variant="bodyMedium" weight="600" color="textPrimary">
                  {formatCurrency(item.total_price)}
                </VText>
              </View>
            ))}
          </View>
        </VCard>
      ) : null}

      {/* Financial Summary */}
      <VCard variant="default" elevation={2} style={styles.financialCard}>
        <VText variant="headlineSmall" color="textPrimary" style={styles.sectionTitle}>
          Payment Summary
        </VText>

        <View style={styles.financialRow}>
          <VText variant="bodyMedium" color="textMuted">Total Ritual Amount</VText>
          <VText variant="bodyMedium" weight="600">{formatCurrency(booking.total_amount)}</VText>
        </View>

        {currentOutstandingBalance > 0 ? (
          <View style={styles.financialRow}>
            <VText variant="bodyMedium" color="textMuted">Advance Paid (Confirmed)</VText>
            <VText variant="bodyMedium" weight="600" color="success">
              {formatCurrency(booking.advance_amount)}
            </VText>
          </View>
        ) : (
          <View style={styles.financialRow}>
            <VText variant="bodyMedium" color="textMuted">Total Dakshina Paid (Confirmed)</VText>
            <VText variant="bodyMedium" weight="600" color="success">
              {formatCurrency(totalPaidAmount)}
            </VText>
          </View>
        )}

        {currentOutstandingBalance > 0 && totalPaidAmount > booking.advance_amount && (
          <View style={styles.financialRow}>
            <VText variant="bodyMedium" color="textMuted">Total Paid to Date</VText>
            <VText variant="bodyMedium" weight="600" color="success">
              {formatCurrency(totalPaidAmount)}
            </VText>
          </View>
        )}

        <VDivider style={{ marginVertical: spacing.sm }} />

        <View style={styles.financialRow}>
          <VText variant="bodyLarge" weight="600">Outstanding Balance</VText>
          <VText variant="headlineMedium" color={isBalancePayable ? "brandPrimary" : "success"}>
            {formatCurrency(currentOutstandingBalance)}
          </VText>
        </View>

        {isBalancePayable && (
          <View style={styles.balanceActionWrap}>
            <View
              style={[
                styles.balanceNoticeBox,
                {
                  backgroundColor: colors.warningBg,
                  borderColor: colors.warningFg,
                },
              ]}
            >
              <VText variant="caption" color="warningFg">
                {startDate.getTime() <= Date.now()
                  ? "⚠️ Ritual is underway or scheduled time has arrived. You may settle your remaining balance until the pandit completes the ceremony."
                  : startDate.getTime() - 24 * 60 * 60 * 1000 <= Date.now()
                  ? "⚠️ Balance settlement deadline (24 hours prior) has passed. Please settle remaining balance promptly before ritual completion."
                  : "⚠️ Balance must be settled prior to ritual completion."}
              </VText>
            </View>
            <Button
              title={
                payingBalance
                  ? "Initializing Balance Checkout..."
                  : startDate.getTime() <= Date.now()
                  ? `Pay Remaining Balance — ${formatCurrency(currentOutstandingBalance)} 💳`
                  : startDate.getTime() - 24 * 60 * 60 * 1000 <= Date.now()
                  ? `Pay Remaining Balance Promptly — ${formatCurrency(currentOutstandingBalance)} 💳`
                  : `Pay Remaining Balance — ${formatCurrency(currentOutstandingBalance)} 💳`
              }
              variant="primary"
              size="md"
              onPress={handlePayBalance}
              disabled={payingBalance}
              style={{ minHeight: 48, marginTop: spacing.sm }}
            />
            {balanceError ? (
              <VText variant="caption" color="error" style={styles.errorText}>
                {balanceError}
              </VText>
            ) : null}
          </View>
        )}

        {currentOutstandingBalance === 0 && booking.status !== "cancelled" && (
          <View
            style={[
              styles.paidBadgeBox,
              {
                backgroundColor: colors.successBg,
                borderColor: colors.statusActive,
              },
            ]}
          >
            <VText variant="labelMedium" color="success">
              ✓ Full Ritual Dakshina Paid & Cleared — No Outstanding Balance
            </VText>
          </View>
        )}
      </VCard>

      {/* Customer Review Section (Completed Rituals Only) */}
      {isCompleted && (
        <VCard variant="default" style={styles.reviewSectionCard}>
          {!hasReviewed ? (
            <View>
              <VText variant="headlineSmall" color="textPrimary" style={styles.sectionTitle}>
                Rate & Review Your Pandit
              </VText>
              <VText variant="bodyMedium" color="textMuted" style={styles.reviewPromptText}>
                Your sacred ritual has been completed. Share your feedback to help other devotees in the Sanatan community.
              </VText>
              <Button
                title="Write Review & Rate Acharya ★"
                variant="primary"
                size="md"
                onPress={() => setReviewModalVisible(true)}
                style={{ minHeight: 48, marginTop: spacing.sm }}
                testID="write-review-cta"
              />
            </View>
          ) : review ? (
            <View>
              <View style={styles.reviewHeaderRow}>
                <VText variant="headlineSmall" color="textPrimary" style={styles.sectionTitle}>
                  Your Sacred Review
                </VText>
                <View
                  style={[
                    styles.verifiedReviewBadge,
                    {
                      backgroundColor: colors.successBg,
                      borderColor: colors.statusActive,
                    },
                  ]}
                >
                  <VText variant="caption" color="success">
                    ✓ Verified Feedback
                  </VText>
                </View>
              </View>
              <View style={styles.reviewStarsRow}>
                <RatingStars rating={review.rating} size={18} />
                <VText variant="caption" color="textMuted" style={{ marginLeft: spacing.sm }}>
                  {formatDate(review.created_at)}
                </VText>
              </View>
              {review.comment ? (
                <VText variant="bodyMedium" color="textMuted" style={styles.submittedComment}>
                  "{review.comment}"
                </VText>
              ) : (
                <VText variant="caption" color="textMuted" style={styles.submittedComment}>
                  Rating submitted without written comment.
                </VText>
              )}
            </View>
          ) : null}
        </VCard>
      )}

      {/* Customer Action CTAs (Reschedule & Cancel) */}
      {(isReschedulable || isCancellable) && (
        <VCard variant="default" style={styles.actionCard}>
          <VText variant="headlineSmall" color="textPrimary" style={styles.sectionTitle}>
            Booking Actions
          </VText>
          <View style={styles.actionButtonsCol}>
            {isReschedulable && (
              <Button
                title="Reschedule Ritual (1 Free Reschedule)"
                variant="secondary"
                size="md"
                onPress={() => setRescheduleModalVisible(true)}
                style={{ minHeight: 48 }}
              />
            )}
            {isCancellable && (
              <Button
                title="Cancel Ritual"
                variant="outline"
                size="md"
                onPress={handleOpenCancelModal}
                style={{ minHeight: 48 }}
              />
            )}
          </View>
        </VCard>
      )}

      {/* Submit Review Modal */}
      <SubmitReviewModal
        visible={reviewModalVisible}
        onClose={() => setReviewModalVisible(false)}
        onSubmit={async (rating, comment) => {
          const success = await submitReview(rating, comment);
          if (success) {
            Alert.alert("Sacred Feedback Received", "Thank you for reviewing your ritual with the Acharya.");
          }
          return success;
        }}
        panditName={booking.pandit?.display_name || "the Acharya"}
        submitting={submittingReview}
      />

      {/* Cancellation Modal with Server-Side Preview */}
      <Modal visible={cancelModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlayScrim }]}>
          <VCard variant="default" elevation={4} style={[styles.modalCard, { backgroundColor: colors.surfaceCard }]}>
            <VText variant="headlineLarge" align="center" style={styles.modalTitle}>
              Cancel Ritual
            </VText>
            <VText variant="caption" color="textMuted" align="center">
              Server-Calculated Refund Policy Preview
            </VText>

            {loadingPreview ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="small" color={colors.brandPrimary} />
                <VText variant="bodyMedium" color="textMuted" style={{ marginTop: spacing.sm }}>
                  Calculating authoritative refund...
                </VText>
              </View>
            ) : refundPreview ? (
              <View style={styles.previewBox}>
                <View style={styles.previewRow}>
                  <VText variant="bodyMedium" color="textMuted">Net Captured Amount</VText>
                  <VText variant="bodyMedium" weight="600">{formatCurrency(refundPreview.net_captured)}</VText>
                </View>
                {refundPreview.refundable_base < refundPreview.net_captured && (
                  <>
                    <View style={styles.previewRow}>
                      <VText variant="bodyMedium" color="textMuted">Non-Refundable Samagri</VText>
                      <VText variant="bodyMedium" weight="600" color="error">
                        {formatCurrency(refundPreview.net_captured - refundPreview.refundable_base)}
                      </VText>
                    </View>
                    <View style={styles.previewRow}>
                      <VText variant="bodyMedium" color="textMuted">Refundable Dakshina</VText>
                      <VText variant="bodyMedium" weight="600">{formatCurrency(refundPreview.refundable_base)}</VText>
                    </View>
                  </>
                )}
                <View style={styles.previewRow}>
                  <VText variant="bodyMedium" color="textMuted">Applied Policy Tier</VText>
                  <VText variant="labelMedium" color="brandPrimary">{refundPreview.policy_name}</VText>
                </View>
                <View style={styles.previewRow}>
                  <VText variant="bodyMedium" color="textMuted">Refund Percentage</VText>
                  <VText variant="bodyMedium" weight="600">
                    {refundPreview.refund_percent}%
                    {refundPreview.refundable_base < refundPreview.net_captured ? " (Dakshina)" : ""}
                  </VText>
                </View>
                <View style={styles.previewRow}>
                  <VText variant="bodyMedium" color="textMuted">Cancellation Deduction</VText>
                  <VText variant="bodyMedium" weight="600" color="error">
                    {formatCurrency(refundPreview.deduction_amount)}
                  </VText>
                </View>
                <VDivider style={{ marginVertical: spacing.sm }} />
                <View style={styles.previewRow}>
                  <VText variant="headlineSmall">Total Refund Due</VText>
                  <VText variant="headlineSmall" color="success">
                    {formatCurrency(refundPreview.refund_amount)}
                  </VText>
                </View>

                <TextInput
                  style={[
                    styles.reasonInput,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.borderDefault,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder="Reason for cancellation (optional)"
                  placeholderTextColor={colors.textMuted}
                  value={cancellationReason}
                  onChangeText={setCancellationReason}
                />

                <View style={styles.modalActions}>
                  <Button
                    title="Keep Booking"
                    variant="secondary"
                    size="md"
                    onPress={() => setCancelModalVisible(false)}
                    style={{ minHeight: 48, flex: 1 }}
                  />
                  <Button
                    title={cancelling ? "Processing..." : "Confirm Cancel"}
                    variant="primary"
                    size="md"
                    onPress={handleConfirmCancel}
                    disabled={cancelling}
                    style={{ minHeight: 48, flex: 1 }}
                  />
                </View>
              </View>
            ) : null}
          </VCard>
        </View>
      </Modal>

      {/* Reschedule Modal */}
      <Modal visible={rescheduleModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlayScrim }]}>
          <VCard variant="default" elevation={4} style={[styles.modalCard, { backgroundColor: colors.surfaceCard }]}>
            <VText variant="headlineLarge" align="center" style={styles.modalTitle}>
              Reschedule Ritual
            </VText>
            <VText variant="caption" color="textMuted" align="center">
              1-Time Free Reschedule • Original Price Preserved
            </VText>

            <View style={styles.rescheduleContent}>
              <VText variant="bodyMedium" color="textMuted" style={{ marginBottom: 4 }}>
                Enter new Muhurat start timestamp (ISO format):
              </VText>
              <TextInput
                style={[
                  styles.reasonInput,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderDefault,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="2026-10-15T10:00:00+05:30"
                placeholderTextColor={colors.textMuted}
                value={rescheduleDateStr}
                onChangeText={setRescheduleDateStr}
              />
              <VText variant="caption" color="textMuted">
                Note: The Acharya must be available during the new time slot.
              </VText>

              <View style={styles.modalActions}>
                <Button
                  title="Close"
                  variant="secondary"
                  size="md"
                  onPress={() => setRescheduleModalVisible(false)}
                  style={{ minHeight: 48, flex: 1 }}
                />
                <Button
                  title={rescheduling ? "Updating..." : "Confirm New Slot"}
                  variant="primary"
                  size="md"
                  onPress={handleConfirmReschedule}
                  disabled={rescheduling}
                  style={{ minHeight: 48, flex: 1 }}
                />
              </View>
            </View>
          </VCard>
        </View>
      </Modal>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loaderWrap: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  errorStateCard: {
    padding: 24,
    alignItems: "center",
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
  },
  mainCard: {
    marginVertical: 12,
    padding: 16,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pujaTitle: {
    marginBottom: 8,
  },
  infoGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  infoCol: {
    flex: 1,
  },
  formatText: {
    textTransform: "capitalize",
  },
  trackerCard: {
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 12,
  },
  sectionCard: {
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  panditRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  panditInfo: {
    flex: 1,
  },
  remoteBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  remoteIcon: {
    marginRight: 12,
  },
  remoteTextWrap: {
    flex: 1,
  },
  subTextSpacing: {
    marginTop: 4,
  },
  lineItemsList: {
    gap: 8,
  },
  lineItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lineItemInfo: {
    flex: 1,
  },
  financialCard: {
    padding: 16,
    marginBottom: 16,
  },
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 4,
  },
  balanceActionWrap: {
    marginTop: 12,
  },
  balanceNoticeBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  paidBadgeBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    alignItems: "center",
  },
  reviewSectionCard: {
    padding: 16,
    marginBottom: 16,
  },
  reviewPromptText: {
    lineHeight: 20,
    marginBottom: 12,
  },
  reviewHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  verifiedReviewBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  submittedComment: {
    fontStyle: "italic",
    marginTop: 4,
  },
  actionCard: {
    padding: 16,
    marginBottom: 16,
  },
  actionButtonsCol: {
    gap: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    padding: 20,
    borderRadius: 16,
  },
  modalTitle: {
    marginBottom: 4,
  },
  modalLoading: {
    padding: 32,
    alignItems: "center",
  },
  previewBox: {
    marginTop: 16,
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 4,
  },
  reasonInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 16,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  rescheduleContent: {
    marginTop: 16,
  },
  errorText: {
    marginTop: 4,
  },
});

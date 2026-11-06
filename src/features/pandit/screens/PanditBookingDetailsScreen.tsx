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
import { EscrowBadge } from "../../../shared/components/spiritual/EscrowBadge.tsx";
import { colors, radius, spacing, useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { formatCurrency, formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { BookingStatusBadge } from "../../booking/components/BookingStatusBadge.tsx";
import { usePanditBookingDetail } from "../hooks/usePanditBookingDetail.ts";
import { panditPayoutService } from "../services/panditPayoutService.ts";
import { panditService } from "../services/panditService.ts";

export const PanditBookingDetailsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<RouteProp<{ params: { bookingId: string } }, "params">>();
  const bookingId = route.params?.bookingId || "";
  const { isDark, colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

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
      <ScreenContainer padded style={{ backgroundColor: themeColors.surfaceBase }}>
        <Header title="Ritual Details" onBack={() => navigation.goBack()} />
        <LoadingState message="Loading ritual booking details..." />
      </ScreenContainer>
    );
  }

  if (error || !booking) {
    return (
      <ScreenContainer padded style={{ backgroundColor: themeColors.surfaceBase }}>
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
    <ScreenContainer scrollable padded style={{ backgroundColor: themeColors.surfaceBase }}>
      <Header
        title="Ritual Details"
        subtitle={booking.booking_number}
        onBack={() => navigation.goBack()}
      />

      {/* Spiritual Escrow Badge */}
      <EscrowBadge
        status={booking.status}
        amountInr={booking.total_amount}
        compact={false}
        style={{ marginBottom: 12 }}
      />

      {/* Main Status & Ceremony Card */}
      <Card
        variant="elevated"
        style={[
          styles.mainCard,
          {
            backgroundColor: themeColors.surfaceCard,
            borderColor: themeColors.borderDefault,
          },
        ]}
      >
        <View style={styles.statusRow}>
          <View style={styles.ceremonyWrap}>
            <Text variant="caption" color={themeColors.textMuted}>
              Sacred Ceremony
            </Text>
            <Text variant="h2" color={themeColors.textPrimary} style={styles.ceremonyName}>
              {booking.puja_service?.name || "Vedic Ritual"}
            </Text>
          </View>
          <BookingStatusBadge status={booking.status} />
        </View>

        <View style={[styles.divider, { backgroundColor: themeColors.borderDefault }]} />

        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <Text variant="caption" color={themeColors.textMuted}>
              Scheduled Date
            </Text>
            <Text variant="bodyMedium" color={themeColors.textPrimary}>
              {formatDate(startDate)}
            </Text>
          </View>

          <View style={styles.infoCol}>
            <Text variant="caption" color={themeColors.textMuted}>
              Muhurat Time
            </Text>
            <Text variant="bodyMedium" color={themeColors.textPrimary}>
              {formatTime(startDate)}
            </Text>
          </View>

          <View style={styles.infoCol}>
            <Text variant="caption" color={themeColors.textMuted}>
              Format
            </Text>
            <Text variant="bodyMedium" color={themeColors.textPrimary} style={styles.formatText}>
              {booking.service_mode} Ritual
            </Text>
          </View>
        </View>
      </Card>

      {/* Devotee Information Card */}
      <Card style={[styles.sectionCard, { backgroundColor: themeColors.surfaceCard, borderColor: themeColors.borderDefault }]}>
        <Text variant="h3" color={themeColors.textPrimary} style={styles.sectionTitle}>
          Devotee Information
        </Text>
        <View style={styles.devoteeRow}>
          <View
            style={[
              styles.avatarCircle,
              {
                backgroundColor: isDark ? "rgba(224, 86, 36, 0.2)" : colors.primaryLight || "#FEF3EB",
              },
            ]}
          >
            <Text variant="h3" color={colors.primary}>
              {booking.customer?.display_name?.charAt(0) || "D"}
            </Text>
          </View>
          <View style={styles.devoteeInfo}>
            <Text variant="bodyMedium" color={themeColors.textPrimary}>
              {booking.customer?.display_name ? `Devotee: ${booking.customer.display_name}` : "Devotee: Devotee Sharma"}
            </Text>
            {booking.customer?.phone ? (
              <Text variant="caption" color={themeColors.textMuted}>
                Contact: {booking.customer.phone}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      {/* Location / Remote Access Card */}
      <Card style={[styles.sectionCard, { backgroundColor: themeColors.surfaceCard, borderColor: themeColors.borderDefault }]}>
        <Text variant="h3" color={themeColors.textPrimary} style={styles.sectionTitle}>
          {isRemote ? "Live Video Sanctum" : "Ritual Location"}
        </Text>

        {isRemote ? (
          <View>
            <View
              style={[
                styles.remoteBox,
                {
                  backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : colors.surfaceSubtle || "#F8FAFC",
                },
              ]}
            >
              <Text style={styles.remoteIcon}>🌐</Text>
              <View style={styles.remoteTextWrap}>
                <Text variant="bodyMedium" color={themeColors.textPrimary}>LiveKit Cloud HD Room</Text>
                <Text variant="caption" color={themeColors.textMuted}>
                  Pandit Ji can join the room 30 minutes before the scheduled start time.
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
              <Text variant="caption" color={colors.error || "#EF4444"} style={styles.errorText}>
                {tokenError}
              </Text>
            ) : null}
          </View>
        ) : booking.service_mode === "home" ? (
          <View>
            <Text variant="bodyMedium" color={themeColors.textPrimary}>
              {booking.location?.address_snapshot || `${booking.location?.city || "Home Residence"}`}
            </Text>
            <Text variant="caption" color={themeColors.textMuted} style={styles.locationSub}>
              Please reach the address 15 minutes before the auspicious muhurat.
            </Text>
          </View>
        ) : (
          <View>
            <Text variant="bodyMedium" color={themeColors.textPrimary}>
              {booking.location?.temple_name_snapshot || "Temple Sanctum"}
            </Text>
            <Text variant="caption" color={themeColors.textMuted} style={styles.locationSub}>
              {booking.location?.city || "Varanasi"}
            </Text>
          </View>
        )}
      </Card>

      {/* Inclusions (Samagri & Prasad) */}
      {booking.line_items && booking.line_items.length > 0 ? (
        <Card style={[styles.sectionCard, { backgroundColor: themeColors.surfaceCard, borderColor: themeColors.borderDefault }]}>
          <Text variant="h3" color={themeColors.textPrimary} style={styles.sectionTitle}>
            Samagri &amp; Prasad Inclusions
          </Text>
          <View style={styles.lineItemsList}>
            {booking.line_items.map((item) => (
              <View key={item.id} style={styles.lineItemRow}>
                <Text variant="body" color={themeColors.textPrimary} style={styles.lineItemName}>
                  • {item.name_snapshot} ({item.quantity}x)
                </Text>
                <Text variant="caption" color={themeColors.textMuted}>
                  {item.item_type}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {/* Dedicated Dakshina & Settlement Status Card (for completed bookings) */}
      {isCompleted ? (
        <Card
          variant="elevated"
          style={[
            styles.settlementCard,
            {
              backgroundColor: isDark ? "rgba(224, 86, 36, 0.08)" : "#FFFDFB",
              borderColor: isDark ? "rgba(224, 86, 36, 0.3)" : colors.primaryLight,
            },
          ]}
        >
          <View style={styles.settlementHeaderRow}>
            <View style={styles.settlementTitleWrap}>
              <Text variant="overline" color={colors.primary}>
                PANDIT SETTLEMENT LEDGER
              </Text>
              <Text variant="h3" color={themeColors.textPrimary}>
                Dakshina &amp; Settlement Status
              </Text>
            </View>
            {booking.payout ? (
              <View
                style={[
                  styles.settlementBadge,
                  {
                    backgroundColor:
                      booking.payout.status === "paid"
                        ? isDark ? "rgba(16, 185, 129, 0.2)" : "#dcfce7"
                        : booking.payout.status === "failed"
                        ? isDark ? "rgba(239, 68, 68, 0.2)" : "#fee2e2"
                        : booking.payout.status === "processing"
                        ? isDark ? "rgba(168, 85, 247, 0.2)" : "#f3e8ff"
                        : booking.payout.status === "approved"
                        ? isDark ? "rgba(14, 165, 233, 0.2)" : "#e0f2fe"
                        : isDark ? "rgba(245, 158, 11, 0.2)" : "#fef3c7",
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

          <View style={[styles.divider, { backgroundColor: themeColors.borderDefault }]} />

          {booking.payout ? (
            <View>
              {/* Net Earnings Highlight Box */}
              <View
                style={[
                  styles.netEarningsBox,
                  {
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#faf5ee",
                  },
                ]}
              >
                <View style={styles.netEarningsCol}>
                  <Text variant="caption" color={themeColors.textMuted}>
                    Your Net Dakshina (Disbursement)
                  </Text>
                  <Text variant="h1" color={colors.primary} style={styles.netEarningsAmount}>
                    {formatCurrency(booking.payout.net_amount)}
                  </Text>
                </View>
                <View style={styles.grossPlatformCol}>
                  <Text variant="caption" color={themeColors.textMuted}>
                    Gross: {formatCurrency(booking.payout.gross_amount)}
                  </Text>
                  <Text variant="caption" color={themeColors.textMuted}>
                    Platform Fee: -{formatCurrency(booking.payout.platform_fee)}
                  </Text>
                </View>
              </View>

              {/* Settlement Transfer Details (Only shown when paid) */}
              {booking.payout.status === "paid" ? (
                <View style={[styles.paidDetailsSection, { borderTopColor: themeColors.borderDefault }]}>
                  <View style={styles.financeRow}>
                    <Text variant="caption" color={themeColors.textMuted}>
                      Disbursement Status
                    </Text>
                    <Text variant="bodyMedium" color={colors.success || "#10B981"}>
                      ✓ Transferred to Bank Account
                    </Text>
                  </View>

                  {booking.payout.payment_method ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={themeColors.textMuted}>
                        Payment Mode
                      </Text>
                      <Text variant="bodyMedium" color={themeColors.textPrimary} style={{ textTransform: "uppercase" }}>
                        {booking.payout.payment_method.replace("_", " ").toUpperCase()}
                      </Text>
                    </View>
                  ) : null}

                  {booking.payout.transaction_reference ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={themeColors.textMuted}>
                        UTR / Transaction Reference
                      </Text>
                      <Text variant="bodyMedium" style={[styles.utrText, { color: colors.primary }]}>
                        {booking.payout.transaction_reference}
                      </Text>
                    </View>
                  ) : booking.payout.provider_payout_id ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={themeColors.textMuted}>
                        Gateway Reference ID
                      </Text>
                      <Text variant="bodyMedium" color={themeColors.textPrimary}>
                        {booking.payout.provider_payout_id}
                      </Text>
                    </View>
                  ) : null}

                  {booking.payout.confirmed_at || booking.payout.released_at ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={themeColors.textMuted}>
                        Settlement Date
                      </Text>
                      <Text variant="bodyMedium" color={themeColors.textPrimary}>
                        {formatDate(new Date(booking.payout.confirmed_at || booking.payout.released_at!))}
                      </Text>
                    </View>
                  ) : null}

                  {booking.payout.bank_account ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={themeColors.textMuted}>
                        Target Account
                      </Text>
                      <Text variant="bodyMedium" color={themeColors.textPrimary}>
                        {booking.payout.bank_account.bank_name || "Bank Account"} (IFSC: {booking.payout.bank_account.ifsc_code})
                      </Text>
                    </View>
                  ) : null}

                  {booking.payout.proof_document_path ? (
                    <View style={styles.financeRow}>
                      <Text variant="caption" color={themeColors.textMuted}>
                        Payment Proof
                      </Text>
                      <TouchableOpacity
                        onPress={handleViewPayoutProof}
                        disabled={loadingProof}
                        style={[styles.proofBtn, { backgroundColor: isDark ? "rgba(14, 165, 233, 0.2)" : "#e0f2fe" }]}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="View Payment Proof Receipt"
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
                <View
                  style={[
                    styles.unsettledBanner,
                    {
                      backgroundColor: isDark ? "rgba(180, 83, 9, 0.15)" : "#fffbeb",
                      borderColor: isDark ? "rgba(245, 158, 11, 0.3)" : "#fde68a",
                    },
                  ]}
                >
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
            <View
              style={[
                styles.unsettledBanner,
                {
                  backgroundColor: isDark ? "rgba(180, 83, 9, 0.15)" : "#fffbeb",
                  borderColor: isDark ? "rgba(245, 158, 11, 0.3)" : "#fde68a",
                },
              ]}
            >
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
      <Card style={[styles.sectionCard, { backgroundColor: themeColors.surfaceCard, borderColor: themeColors.borderDefault }]}>
        <Text variant="h3" color={themeColors.textPrimary} style={styles.sectionTitle}>
          Devotee Booking &amp; Payment Overview
        </Text>
        <View style={styles.financeRow}>
          <Text variant="body" color={themeColors.textMuted}>
            Total Ritual Value
          </Text>
          <Text variant="bodyMedium" color={themeColors.textPrimary}>
            {formatCurrency(booking.total_amount)}
          </Text>
        </View>
        <View style={styles.financeRow}>
          <Text variant="body" color={themeColors.textMuted}>
            Amount Paid to Date
          </Text>
          <Text variant="bodyMedium" color={colors.primary}>
            {formatCurrency(currentTotalPaid)}
          </Text>
        </View>
        <View style={styles.financeRow}>
          <Text variant="body" color={themeColors.textMuted}>
            Outstanding Balance
          </Text>
          <Text
            variant="bodyMedium"
            color={hasOutstandingBalance ? colors.secondary || "#D97706" : colors.success || "#10B981"}
          >
            {formatCurrency(currentOutstandingBalance)}
          </Text>
        </View>

        {hasOutstandingBalance ? (
          <View
            style={[
              styles.unsettledDevoteeBanner,
              {
                backgroundColor: isDark ? "rgba(180, 83, 9, 0.15)" : "#fffbeb",
                borderColor: isDark ? "rgba(245, 158, 11, 0.3)" : "#fde68a",
              },
            ]}
          >
            <Text style={styles.unsettledIcon}>⚠️</Text>
            <View style={styles.unsettledTextWrap}>
              <Text variant="captionMedium" color={isDark ? "#FDE68A" : "#92400e"}>
                Devotee Balance Settlement Pending ({formatCurrency(currentOutstandingBalance)})
              </Text>
              <Text variant="caption" color={isDark ? "#FCD34D" : "#b45309"}>
                Devotee has an unsettled balance of {formatCurrency(currentOutstandingBalance)}. Please ask the devotee to settle the balance from their app before marking the ritual completed.
              </Text>
              <TouchableOpacity
                onPress={refresh}
                disabled={loading}
                style={styles.refreshStatusBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Refresh Payment Status"
              >
                <Text variant="captionMedium" color={colors.primary}>
                  🔄 Refresh Payment Status
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.paidBadgeBox,
              {
                backgroundColor: isDark ? "rgba(16, 185, 129, 0.15)" : "#f0fdf4",
                borderColor: isDark ? "rgba(16, 185, 129, 0.3)" : "#bbf7d0",
              },
            ]}
          >
            <Text variant="captionMedium" color={colors.success || "#15803d"}>
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
            style={{ minHeight: 48 }}
          />
          {hasOutstandingBalance ? (
            <Text variant="caption" color={themeColors.textMuted} align="center" style={{ marginTop: 8 }}>
              Devotee must settle remaining balance before ritual completion can be submitted.
            </Text>
          ) : null}
          {completeError ? (
            <Text variant="caption" color={colors.error || "#EF4444"} align="center" style={styles.errorText}>
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
              style={{ marginTop: 12, minHeight: 48 }}
            />
          )}
        </View>
      ) : isCompleted ? (
        <Card
          variant="outlined"
          style={[
            styles.completedBanner,
            {
              backgroundColor: isDark ? "rgba(16, 185, 129, 0.12)" : "#F0FDF4",
              borderColor: isDark ? "rgba(16, 185, 129, 0.3)" : "#BBF7D0",
            },
          ]}
        >
          <Text variant="h3" color={colors.success || "#10B981"} align="center">
            ✓ Ritual Completed
          </Text>
          <Text variant="caption" color={themeColors.textMuted} align="center" style={styles.completedSub}>
            Completed on {booking.completed_at ? formatDate(new Date(booking.completed_at)) : "record"}.
          </Text>
        </Card>
      ) : null}

      {/* Confirmation Dialog Area */}
      {confirmModalVisible ? (
        <Card
          variant="elevated"
          style={[
            styles.confirmCard,
            {
              backgroundColor: isDark ? themeColors.surfaceCard : "#FFFDFB",
              borderColor: colors.primary,
            },
          ]}
        >
          <Text variant="h3" color={themeColors.textPrimary} style={styles.confirmTitle}>
            Confirm Ritual Completion?
          </Text>
          <Text variant="body" color={themeColors.textMuted} style={styles.confirmDesc}>
            Are you sure you want to mark this Vedic ritual as completed? This will trigger payout disbursement records.
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity
              onPress={() => setConfirmModalVisible(false)}
              style={styles.cancelConfirmBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel Completion"
            >
              <Text variant="bodyMedium" color={themeColors.textMuted}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirmCompletion}
              disabled={completing}
              style={[styles.yesConfirmBtn, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Yes, Complete Ritual"
            >
              {completing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text variant="bodyMedium" color="#FFFFFF">
                  Yes, Complete Ritual
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Card>
      ) : null}

      {/* Pandit Cancellation Dialog */}
      {cancelModalVisible ? (
        <Card
          variant="elevated"
          style={[
            styles.confirmCard,
            {
              backgroundColor: isDark ? themeColors.surfaceCard : "#FFFDFB",
              borderColor: colors.primary,
            },
          ]}
        >
          <Text variant="h3" color={themeColors.textPrimary} style={styles.confirmTitle}>
            Cancel Ritual Assignment?
          </Text>
          <Text variant="body" color={themeColors.textMuted} style={styles.confirmDesc}>
            Cancelling this ritual will immediately notify the devotee and grant a 100% full refund of all captured funds.
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity
              onPress={() => setCancelModalVisible(false)}
              style={styles.cancelConfirmBtn}
              accessibilityRole="button"
              accessibilityLabel="Keep Ritual"
            >
              <Text variant="bodyMedium" color={themeColors.textMuted}>
                Keep Ritual
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePanditCancel}
              disabled={cancelling}
              style={[styles.yesConfirmBtn, { backgroundColor: colors.error || "#EF4444" }]}
              accessibilityRole="button"
              accessibilityLabel="Yes, Cancel and Refund Devotee"
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text variant="bodyMedium" color="#FFFFFF">
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
          <View style={[styles.modalCard, { backgroundColor: themeColors.surfaceCard }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.borderDefault }]}>
              <View style={styles.modalHeaderLeft}>
                <Text variant="h3" color={themeColors.textPrimary}>Payment Transfer Receipt</Text>
                <Text variant="caption" color={themeColors.textMuted}>
                  {booking?.payout?.transaction_reference
                    ? `UTR: ${booking.payout.transaction_reference}`
                    : `Booking #${booking?.booking_number}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setProofModalVisible(false)}
                style={[styles.closeBtn, { backgroundColor: themeColors.borderDefault }]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close Receipt Modal"
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

            <View style={[styles.modalFooter, { borderTopColor: themeColors.borderDefault }]}>
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
    marginBottom: 10,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  ceremonyWrap: {
    flex: 1,
    marginRight: 10,
  },
  ceremonyName: {
    marginTop: 4,
  },
  divider: {
    height: 1,
    marginVertical: 14,
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
    marginBottom: 10,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  devoteeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  devoteeInfo: {
    flex: 1,
  },
  remoteBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
  },
  remoteIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  remoteTextWrap: {
    flex: 1,
  },
  joinBtn: {
    marginTop: 12,
    minHeight: 48,
  },
  locationSub: {
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
  lineItemName: {
    flex: 1,
  },
  financeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  completionSection: {
    marginVertical: 20,
  },
  errorText: {
    marginTop: 8,
  },
  completedBanner: {
    marginVertical: 20,
    paddingVertical: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  completedSub: {
    marginTop: 4,
  },
  confirmCard: {
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 24,
    borderRadius: radius.md,
  },
  confirmTitle: {
    marginBottom: 6,
  },
  confirmDesc: {
    marginBottom: 14,
    lineHeight: 20,
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    alignItems: "center",
  },
  cancelConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  yesConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
    minHeight: 48,
    minWidth: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  settlementCard: {
    marginBottom: 10,
    padding: 16,
    borderWidth: 1.5,
    borderRadius: radius.md,
  },
  settlementHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  settlementTitleWrap: {
    flex: 1,
    marginRight: 10,
  },
  settlementBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
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
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
  },
  netEarningsCol: {
    flex: 1,
  },
  netEarningsAmount: {
    marginTop: 4,
    fontWeight: "800",
  },
  grossPlatformCol: {
    alignItems: "flex-end",
    justifyContent: "flex-end",
  },
  paidDetailsSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  utrText: {
    fontFamily: "monospace",
    fontWeight: "700",
  },
  unsettledBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  unsettledIcon: {
    fontSize: 18,
    marginRight: 2,
  },
  unsettledTextWrap: {
    flex: 1,
  },
  proofBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  proofBtnText: {
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxHeight: "85%",
    borderRadius: 12,
    padding: 16,
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
    paddingBottom: 10,
    marginBottom: 10,
  },
  modalHeaderLeft: {
    flex: 1,
    marginRight: 10,
  },
  closeBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  proofImageContainer: {
    height: 300,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginVertical: 8,
  },
  proofImage: {
    width: "100%",
    height: "100%",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  modalFullBtn: {
    flex: 1,
    minHeight: 48,
  },
  modalCloseBtn: {
    flex: 1,
    minHeight: 48,
  },
  unsettledDevoteeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  refreshStatusBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
  },
  paidBadgeBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    alignItems: "center",
  },
});

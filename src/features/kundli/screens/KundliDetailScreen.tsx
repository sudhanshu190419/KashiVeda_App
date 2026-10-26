// src/features/kundli/screens/KundliDetailScreen.tsx
import React from "react";
import {
  Alert,
  Linking,
  StyleSheet,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  VCard,
  VText,
  VButton,
  VBadge,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../../shared/components/index.ts";
import { useTheme, getDevanagariLineHeight } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { formatCurrency, formatDate, formatTime } from "../../../shared/utils/formatters.ts";
import { getKundliStatusMeta } from "../components/KundliOrderCard.tsx";
import { useKundliOrderDetail } from "../hooks/useKundliOrderDetail.ts";

type DetailRouteProp = RouteProp<CustomerStackParamList, "KundliDetail">;
type DetailNavProp = NativeStackNavigationProp<CustomerStackParamList, "KundliDetail">;

export const KundliDetailScreen: React.FC = () => {
  const route = useRoute<DetailRouteProp>();
  const navigation = useNavigation<DetailNavProp>();
  const { orderId } = route.params;

  const { colors, spacing, radii } = useTheme();
  const { language } = useLanguage();
  const isHi = language === "hi";

  const {
    order,
    signedDocUrl,
    loading,
    docLoading,
    confirming,
    error,
    refresh,
    confirmDelivery,
  } = useKundliOrderDetail(orderId);

  const handleOpenDocument = async () => {
    if (!signedDocUrl) {
      Alert.alert("Document Notice", "Your Kundli document is not available yet.");
      return;
    }

    try {
      const supported = await Linking.canOpenURL(signedDocUrl);
      if (supported) {
        await Linking.openURL(signedDocUrl);
      } else {
        Alert.alert("Open Error", "Cannot open document viewer for this link.");
      }
    } catch {
      Alert.alert("Document Access", "Opening secure Kundli document link.");
    }
  };

  const handleConfirmReceipt = () => {
    Alert.alert(
      "Confirm Kundli Delivery",
      "Are you satisfied with your received handwritten Kundli PDF? Confirming will mark this order as successfully completed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Confirm",
          onPress: async () => {
            try {
              await confirmDelivery();
              Alert.alert("Delivered!", "Thank you for confirming your Kundli delivery.");
            } catch (err: any) {
              Alert.alert("Confirmation Failed", err?.message || "Could not confirm delivery.");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <ScreenWrapper
        headerComponent={
          <AppBar
            title="Kundli Order"
            titleHi="कुण्डली विवरण"
            showBackButton
            onBackPress={() => navigation.goBack()}
          />
        }
      >
        <LoadingState message="Loading Kundli order details..." />
      </ScreenWrapper>
    );
  }

  if (error || !order) {
    return (
      <ScreenWrapper
        headerComponent={
          <AppBar
            title="Kundli Order"
            titleHi="कुण्डली विवरण"
            showBackButton
            onBackPress={() => navigation.goBack()}
          />
        }
      >
        <ErrorState message={error || "Order not found."} onRetry={refresh} />
      </ScreenWrapper>
    );
  }

  const statusMeta = getKundliStatusMeta(order.status);
  const isDocumentReady =
    order.status === "document_uploaded" ||
    order.status === "customer_confirmed" ||
    order.status === "completed" ||
    Boolean(order.current_document);

  return (
    <ScreenWrapper
      scrollable
      headerComponent={
        <AppBar
          title={`Order #${order.order_number || order.id.slice(0, 8).toUpperCase()}`}
          showBackButton
          onBackPress={() => navigation.goBack()}
        />
      }
      contentContainerStyle={[styles.content, { padding: spacing.md, gap: spacing.md }]}
    >
      {/* Status Card */}
      <VCard
        variant="default"
        elevation={1}
        style={[
          styles.statusCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        ]}
      >
        <View style={styles.statusRow}>
          <View>
            <VText variant="caption" color="textMuted">
              Order Status
            </VText>
            {order.order_number ? (
              <VText variant="caption" weight="600" color="brandPrimary">
                {order.order_number}
              </VText>
            ) : null}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusMeta.badgeBg }]}>
            <VText style={[styles.statusBadgeText, { color: statusMeta.badgeText }]}>
              {statusMeta.label}
            </VText>
          </View>
        </View>
        <VText variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
          Created on {formatDate(order.created_at)} at {formatTime(order.created_at)}
        </VText>
      </VCard>

      {/* Document Section */}
      <VCard
        variant="default"
        elevation={2}
        style={[
          styles.documentCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderAccent,
            borderWidth: 1,
          },
        ]}
      >
        <VText variant="titleMedium" weight="700" color="brandPrimary" style={{ marginBottom: spacing.md }}>
          📜 Handwritten Kundli Document
        </VText>

        {isDocumentReady ? (
          <View
            style={[
              styles.docReadyBox,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                padding: spacing.md,
                borderRadius: radii.md,
              },
            ]}
          >
            <VText style={styles.docReadyIcon}>📄</VText>
            <View style={[styles.docInfo, { marginBottom: spacing.md }]}>
              <VText variant="titleMedium" weight="700" color="textPrimary">
                {order.current_document?.file_name || "Handwritten_Kundli.pdf"}
              </VText>
              <VText variant="caption" color="textMuted">
                Uploaded on {formatDate(order.current_document?.uploaded_at || order.updated_at)}
              </VText>
            </View>

            <VButton
              title={docLoading ? "Loading..." : "View / Download PDF"}
              variant="outline"
              size="md"
              onPress={handleOpenDocument}
              disabled={docLoading || !signedDocUrl}
              style={styles.viewDocBtn}
            />

            {order.status === "document_uploaded" && (
              <View
                style={[
                  styles.confirmationBox,
                  {
                    borderTopColor: colors.borderDefault,
                    marginTop: spacing.md,
                    paddingTop: spacing.md,
                  },
                ]}
              >
                <VText
                  variant="caption"
                  color="textMuted"
                  align="center"
                  style={{ marginBottom: spacing.sm, lineHeight: getDevanagariLineHeight(14) }}
                >
                  Please review your completed chart. Confirm receipt below to finalize the delivery.
                </VText>
                <VButton
                  title={confirming ? "Confirming..." : "Confirm Receipt & Complete"}
                  variant="primary"
                  size="md"
                  onPress={handleConfirmReceipt}
                  disabled={confirming}
                  style={styles.confirmBtn}
                />
              </View>
            )}

            {(order.status === "customer_confirmed" || order.status === "completed") && (
              <View
                style={[
                  styles.completedNotice,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.successFg,
                    borderWidth: 1,
                    borderRadius: radii.sm,
                    padding: spacing.sm,
                    marginTop: spacing.md,
                  },
                ]}
              >
                <VText variant="caption" weight="600" color="success" align="center">
                  ✅ Delivery confirmed and order completed!
                </VText>
              </View>
            )}
          </View>
        ) : (
          <View
            style={[
              styles.docPendingBox,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                borderRadius: radii.md,
                padding: spacing.lg,
              },
            ]}
          >
            <VText style={styles.pendingIcon}>⏳</VText>
            <VText variant="titleMedium" weight="700" color="textPrimary" style={{ marginBottom: 4 }}>
              Your Kundli is being prepared
            </VText>
            <VText
              variant="caption"
              color="textMuted"
              align="center"
              style={{ lineHeight: getDevanagariLineHeight(14) }}
            >
              Pandit {order.pandit?.display_name || "ji"} is calculating planetary alignments and
              handwriting your chart. Once uploaded, your high-resolution PDF will appear here.
            </VText>
          </View>
        )}
      </VCard>

      {/* Astrologer Details */}
      <VCard
        variant="default"
        elevation={1}
        style={[
          styles.sectionCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        ]}
      >
        <VText variant="titleMedium" weight="700" color="brandPrimary" style={{ marginBottom: spacing.md }}>
          🪔 Assigned Astrologer
        </VText>
        <View style={styles.astrologerRow}>
          <View
            style={[
              styles.avatarPlaceholder,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.brandPrimary,
                borderWidth: 1,
                borderRadius: radii.full,
                marginRight: spacing.md,
              },
            ]}
          >
            <VText variant="headlineMedium" weight="700" color="brandPrimary">
              {(order.pandit?.display_name || "P").charAt(0).toUpperCase()}
            </VText>
          </View>
          <View style={styles.astrologerInfo}>
            <VText variant="bodyLarge" weight="600" color="textPrimary">
              {order.pandit?.display_name || "Vedic Astrologer"}
            </VText>
            {order.pandit?.experience_years ? (
              <VText variant="caption" color="textMuted">
                {order.pandit.experience_years} years Vedic experience in Kashi
              </VText>
            ) : null}
          </View>
        </View>
      </VCard>

      {/* Birth Chart Data */}
      <VCard
        variant="default"
        elevation={1}
        style={[
          styles.sectionCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        ]}
      >
        <VText variant="titleMedium" weight="700" color="brandPrimary" style={{ marginBottom: spacing.md }}>
          ✨ Birth Information Provided
        </VText>

        <View style={[styles.dataRow, { borderBottomColor: colors.borderDefault, paddingVertical: spacing.xs }]}>
          <VText variant="caption" color="textMuted">
            Date of Birth
          </VText>
          <VText variant="bodyMedium" weight="600" color="textPrimary">
            {formatDate(order.date_of_birth)}
          </VText>
        </View>

        <View style={[styles.dataRow, { borderBottomColor: colors.borderDefault, paddingVertical: spacing.xs }]}>
          <VText variant="caption" color="textMuted">
            Time of Birth
          </VText>
          <VText variant="bodyMedium" weight="600" color="textPrimary">
            {order.time_of_birth}
          </VText>
        </View>

        <View style={[styles.dataRow, { borderBottomColor: colors.borderDefault, paddingVertical: spacing.xs }]}>
          <VText variant="caption" color="textMuted">
            Place of Birth
          </VText>
          <VText variant="bodyMedium" weight="600" color="textPrimary">
            {order.place_of_birth}
          </VText>
        </View>

        {order.additional_notes ? (
          <View
            style={[
              styles.notesBox,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                borderRadius: radii.sm,
                padding: spacing.sm,
                marginTop: spacing.sm,
              },
            ]}
          >
            <VText variant="caption" color="brandPrimary">
              Specific Questions / Focus:
            </VText>
            <VText variant="bodyMedium" color="textPrimary" style={{ marginTop: 2 }}>
              {order.additional_notes}
            </VText>
          </View>
        ) : null}
      </VCard>

      {/* Financial Summary */}
      <VCard
        variant="default"
        elevation={1}
        style={[
          styles.sectionCard,
          {
            padding: spacing.md,
            backgroundColor: colors.surfaceCard,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        ]}
      >
        <VText variant="titleMedium" weight="700" color="brandPrimary" style={{ marginBottom: spacing.md }}>
          💳 Payment Details
        </VText>
        <View style={[styles.dataRow, { paddingVertical: spacing.xs }]}>
          <VText variant="caption" color="textMuted">
            Model
          </VText>
          <VText variant="bodyMedium" weight="600" color="textPrimary">
            100% Upfront
          </VText>
        </View>
        <View style={[styles.dataRow, { paddingVertical: spacing.xs }]}>
          <VText variant="caption" color="textMuted">
            Total Amount
          </VText>
          <VText variant="titleMedium" weight="700" color="brandPrimary">
            {formatCurrency(order.price)}
          </VText>
        </View>
      </VCard>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 40,
  },
  statusCard: {},
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  documentCard: {},
  docReadyBox: {
    alignItems: "center",
  },
  docReadyIcon: {
    fontSize: 40,
    marginBottom: 6,
  },
  docInfo: {
    alignItems: "center",
  },
  viewDocBtn: {
    width: "100%",
    minHeight: 48,
  },
  confirmationBox: {
    width: "100%",
    borderTopWidth: 1,
  },
  confirmBtn: {
    minHeight: 48,
  },
  completedNotice: {
    width: "100%",
  },
  docPendingBox: {
    alignItems: "center",
  },
  pendingIcon: {
    fontSize: 36,
    marginBottom: 6,
  },
  sectionCard: {},
  astrologerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  astrologerInfo: {
    flex: 1,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  notesBox: {},
});

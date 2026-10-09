// src/features/kundli/screens/KundliDetailScreen.tsx
import React from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Button,
  Card,
  ErrorState,
  Header,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing, typography } from "../../../shared/theme/index.ts";
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
      <ScreenContainer>
        <Header title="Kundli Order" onBack={() => navigation.goBack()} />
        <LoadingState message="Loading Kundli order details..." />
      </ScreenContainer>
    );
  }

  if (error || !order) {
    return (
      <ScreenContainer>
        <Header title="Kundli Order" onBack={() => navigation.goBack()} />
        <ErrorState message={error || "Order not found."} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  const statusMeta = getKundliStatusMeta(order.status);
  const isDocumentReady =
    order.status === "document_uploaded" ||
    order.status === "customer_confirmed" ||
    order.status === "completed" ||
    Boolean(order.current_document);

  return (
    <ScreenContainer scrollable padded={false}>
      <Header
        title={`Order #${order.order_number || order.id.slice(0, 8).toUpperCase()}`}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Card */}
        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text variant="caption" color={colors.textSecondary}>
              Order Status
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusMeta.badgeBg }]}>
              <Text style={[styles.statusBadgeText, { color: statusMeta.badgeText }]}>
                {statusMeta.label}
              </Text>
            </View>
          </View>
          <Text variant="caption" color={colors.textTertiary} style={styles.orderDate}>
            Created on {formatDate(order.created_at)} at {formatTime(order.created_at)}
          </Text>
        </Card>

        {/* Document Section */}
        <Card style={styles.documentCard}>
          <Text variant="h3" style={styles.sectionTitle}>
            📜 Handwritten Kundli Document
          </Text>

          {isDocumentReady ? (
            <View style={styles.docReadyBox}>
              <Text style={styles.docReadyIcon}>📄</Text>
              <View style={styles.docInfo}>
                <Text variant="body" style={styles.docTitle}>
                  {order.current_document?.file_name || "Handwritten_Kundli.pdf"}
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  Uploaded on {formatDate(order.current_document?.uploaded_at || order.updated_at)}
                </Text>
              </View>

              <Button
                title={docLoading ? "Loading..." : "View / Download PDF"}
                onPress={handleOpenDocument}
                disabled={docLoading || !signedDocUrl}
                size="sm"
                style={styles.viewDocBtn}
              />

              {order.status === "document_uploaded" && (
                <View style={styles.confirmationBox}>
                  <Text variant="caption" color={colors.textSecondary} style={styles.confirmPrompt}>
                    Please review your completed chart. Confirm receipt below to finalize the
                    delivery.
                  </Text>
                  <Button
                    title={confirming ? "Confirming..." : "Confirm Receipt & Complete"}
                    onPress={handleConfirmReceipt}
                    disabled={confirming}
                    style={styles.confirmBtn}
                  />
                </View>
              )}

              {(order.status === "customer_confirmed" || order.status === "completed") && (
                <View style={styles.completedNotice}>
                  <Text style={styles.completedText}>
                    ✅ Delivery confirmed and order completed!
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.docPendingBox}>
              <Text style={styles.pendingIcon}>⏳</Text>
              <Text variant="body" style={styles.pendingTitle}>
                Your Kundli is being prepared
              </Text>
              <Text variant="caption" color={colors.textSecondary} style={styles.pendingSubtitle}>
                Pandit {order.pandit?.display_name || "ji"} is calculating planetary alignments and
                handwriting your chart. Once uploaded, your high-resolution PDF will appear here.
              </Text>
            </View>
          )}
        </Card>

        {/* Astrologer Details */}
        <Card style={styles.sectionCard}>
          <Text variant="h3" style={styles.sectionTitle}>
            🪔 Assigned Astrologer
          </Text>
          <View style={styles.astrologerRow}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {(order.pandit?.display_name || "P").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.astrologerInfo}>
              <Text variant="body" style={styles.astrologerName}>
                {order.pandit?.display_name || "Vedic Astrologer"}
              </Text>
              {order.pandit?.experience_years && (
                <Text variant="caption" color={colors.textSecondary}>
                  {order.pandit.experience_years} years Vedic experience in Kashi
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* Birth Chart Data */}
        <Card style={styles.sectionCard}>
          <Text variant="h3" style={styles.sectionTitle}>
            ✨ Birth Information Provided
          </Text>

          <View style={styles.dataRow}>
            <Text variant="caption" color={colors.textSecondary}>
              Date of Birth
            </Text>
            <Text variant="body" style={styles.dataValue}>
              {formatDate(order.date_of_birth)}
            </Text>
          </View>

          <View style={styles.dataRow}>
            <Text variant="caption" color={colors.textSecondary}>
              Time of Birth
            </Text>
            <Text variant="body" style={styles.dataValue}>
              {order.time_of_birth}
            </Text>
          </View>

          <View style={styles.dataRow}>
            <Text variant="caption" color={colors.textSecondary}>
              Place of Birth
            </Text>
            <Text variant="body" style={styles.dataValue}>
              {order.place_of_birth}
            </Text>
          </View>

          {order.additional_notes ? (
            <View style={styles.notesBox}>
              <Text variant="caption" color={colors.textTertiary}>
                Specific Questions / Focus:
              </Text>
              <Text variant="body" color={colors.textPrimary} style={styles.notesText}>
                {order.additional_notes}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Financial Summary */}
        <Card style={styles.sectionCard}>
          <Text variant="h3" style={styles.sectionTitle}>
            💳 Payment Details
          </Text>
          <View style={styles.dataRow}>
            <Text variant="caption" color={colors.textSecondary}>
              Model
            </Text>
            <Text variant="body" style={styles.dataValue}>
              100% Upfront
            </Text>
          </View>
          <View style={styles.dataRow}>
            <Text variant="caption" color={colors.textSecondary}>
              Total Amount
            </Text>
            <Text variant="body" style={[styles.dataValue, styles.priceText]}>
              {formatCurrency(order.price)}
            </Text>
          </View>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  statusCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.primaryLight,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  orderDate: {
    marginTop: spacing.xs,
  },
  documentCard: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  docReadyBox: {
    backgroundColor: "#F1F8E9",
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  docReadyIcon: {
    fontSize: 40,
    marginBottom: spacing.xs,
  },
  docInfo: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  docTitle: {
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  viewDocBtn: {
    width: "100%",
  },
  confirmationBox: {
    width: "100%",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  confirmPrompt: {
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  confirmBtn: {
    backgroundColor: "#2E7D32",
  },
  completedNotice: {
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: "#E8F5E9",
    borderRadius: radius.sm,
    width: "100%",
  },
  completedText: {
    color: "#1B5E20",
    fontWeight: typography.fontWeight.semibold,
    textAlign: "center",
    fontSize: typography.fontSize.sm,
  },
  docPendingBox: {
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
  },
  pendingIcon: {
    fontSize: 36,
    marginBottom: spacing.xs,
  },
  pendingTitle: {
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  pendingSubtitle: {
    textAlign: "center",
    lineHeight: 18,
  },
  sectionCard: {
    marginBottom: spacing.md,
  },
  astrologerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
  astrologerInfo: {
    flex: 1,
  },
  astrologerName: {
    fontWeight: typography.fontWeight.semibold,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  dataValue: {
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
  },
  priceText: {
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  notesBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
  },
  notesText: {
    marginTop: 2,
    fontSize: typography.fontSize.sm,
  },
});

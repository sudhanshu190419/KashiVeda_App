// src/features/pandit/screens/PanditTemplesScreen.tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  Button,
  Card,
  Header,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { useAuth } from "../../auth/AuthContext.tsx";
import { Temple } from "../../booking/types/booking.types.ts";
import { panditTempleService } from "../services/panditTempleService.ts";
import {
  PanditTempleAssociation,
  TempleAdditionRequest,
} from "../types/temple.types.ts";

export const PanditTemplesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { panditProfile } = useAuth();

  const [associations, setAssociations] = useState<PanditTempleAssociation[]>([]);
  const [activeCatalog, setActiveCatalog] = useState<Temple[]>([]);
  const [additionRequests, setAdditionRequests] = useState<TempleAdditionRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Modals
  const [showAssociateModal, setShowAssociateModal] = useState<boolean>(false);
  const [showSuggestModal, setShowSuggestModal] = useState<boolean>(false);
  const [selectedTempleId, setSelectedTempleId] = useState<string>("");
  const [submittingAssoc, setSubmittingAssoc] = useState<boolean>(false);

  // Suggest New Temple Form State
  const [newName, setNewName] = useState<string>("");
  const [newAddress, setNewAddress] = useState<string>("");
  const [newCity, setNewCity] = useState<string>("Varanasi");
  const [newState, setNewState] = useState<string>("Uttar Pradesh");
  const [submittingSuggest, setSubmittingSuggest] = useState<boolean>(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const loadAll = async () => {
    if (!panditProfile?.id) return;
    try {
      setLoading(true);
      const [assocRes, catalogRes, reqRes] = await Promise.all([
        panditTempleService.fetchMyTempleAssociations(panditProfile.id),
        panditTempleService.fetchActiveTemples(),
        panditTempleService.fetchMyTempleRequests(panditProfile.id),
      ]);
      setAssociations(assocRes);
      setActiveCatalog(catalogRes);
      setAdditionRequests(reqRes);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to load temple data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [panditProfile?.id]);

  const handleRequestAssociation = async () => {
    if (!panditProfile?.id || !selectedTempleId) {
      Alert.alert("Notice", "Please select a temple from the list.");
      return;
    }

    setSubmittingAssoc(true);
    try {
      await panditTempleService.requestTempleAssociation(
        panditProfile.id,
        selectedTempleId
      );
      Alert.alert(
        "Request Submitted",
        "Your temple affiliation request has been submitted for administrative review."
      );
      setShowAssociateModal(false);
      setSelectedTempleId("");
      loadAll();
    } catch (err: any) {
      Alert.alert("Submission Error", err?.message || "Failed to request affiliation.");
    } finally {
      setSubmittingAssoc(false);
    }
  };

  const handleSuggestTemple = async () => {
    if (!panditProfile?.id) return;
    if (!newName.trim()) {
      setSuggestError("Temple name is required.");
      return;
    }
    if (!newCity.trim()) {
      setSuggestError("City is required.");
      return;
    }

    setSubmittingSuggest(true);
    setSuggestError(null);
    try {
      await panditTempleService.requestNewTemple(panditProfile.id, {
        name: newName.trim(),
        address: newAddress.trim() || undefined,
        city: newCity.trim(),
        state: newState.trim() || "Uttar Pradesh",
      });
      Alert.alert(
        "Temple Submitted",
        "Your temple addition suggestion has been submitted. Once verified by administrators, it will be added to the directory."
      );
      setShowSuggestModal(false);
      setNewName("");
      setNewAddress("");
      loadAll();
    } catch (err: any) {
      setSuggestError(err?.message || "Failed to submit temple suggestion.");
    } finally {
      setSubmittingSuggest(false);
    }
  };

  const handleRemoveAssociation = (assocId: string, templeName: string) => {
    Alert.alert(
      "Remove Affiliation Request",
      `Are you sure you want to remove your affiliation with ${templeName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await panditTempleService.removeTempleAssociation(assocId);
              loadAll();
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Failed to remove affiliation.");
            }
          },
        },
      ]
    );
  };

  const associatedTempleIds = new Set(associations.map((a) => a.temple_id));
  const availableTemplesToRequest = activeCatalog.filter(
    (t) => !associatedTempleIds.has(t.id)
  );

  return (
    <ScreenContainer scrollable padded>
      <Header
        title="Temples I Serve At"
        subtitle="Manage your consecrated temple affiliations for Temple Puja bookings"
        onBack={() => navigation.goBack()}
      />

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Button
          title="+ Add Temple Affiliation"
          variant="primary"
          size="sm"
          onPress={() => setShowAssociateModal(true)}
          style={styles.actionBtn}
        />
        <Button
          title="Suggest New Temple"
          variant="outline"
          size="sm"
          onPress={() => setShowSuggestModal(true)}
          style={styles.actionBtn}
        />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="body" color={colors.textSecondary} style={{ marginTop: 12 }}>
            Loading temple sanctums...
          </Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Active / Requested Affiliations */}
          <Text variant="h3" style={styles.sectionTitle}>
            My Temple Affiliations ({associations.length})
          </Text>

          {associations.length === 0 ? (
            <Card variant="outlined" style={styles.emptyCard}>
              <Text variant="bodyMedium" color={colors.textSecondary} style={styles.emptyText}>
                You have not registered any temple affiliations yet.
              </Text>
              <Text variant="caption" color={colors.textSecondary} style={styles.emptySubtext}>
                Tap &quot;+ Add Temple Affiliation&quot; to choose from active temples in Varanasi, Ayodhya, and Kashi kshetra.
              </Text>
            </Card>
          ) : (
            associations.map((assoc) => {
              const templeName = assoc.temple?.name || "Consecrated Temple";
              const templeCity = assoc.temple?.city || "Varanasi";
              const templeAddr = assoc.temple?.address;

              let statusColor: string = colors.warning;
              let statusLabel = "Pending Review";
              let badgeBg = "rgba(245, 158, 11, 0.1)";

              if (assoc.status === "approved") {
                statusColor = colors.success;
                statusLabel = "Approved & Active";
                badgeBg = "rgba(16, 185, 129, 0.1)";
              } else if (assoc.status === "rejected") {
                statusColor = colors.error;
                statusLabel = "Rejected";
                badgeBg = "rgba(239, 68, 68, 0.1)";
              }

              return (
                <Card key={assoc.id} variant="elevated" style={styles.assocCard}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.templeIconCircle}>
                      <Text style={{ fontSize: 18 }}>🏛️</Text>
                    </View>
                    <View style={styles.templeInfo}>
                      <Text variant="bodyMedium" style={styles.templeTitle}>
                        {templeName}
                      </Text>
                      <Text variant="caption" color={colors.textSecondary}>
                        {templeAddr ? `${templeAddr}, ` : ""}{templeCity}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                      <Text variant="captionMedium" style={{ color: statusColor }}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>

                  {assoc.status === "rejected" && assoc.rejection_reason && (
                    <View style={styles.rejectionBox}>
                      <Text variant="captionMedium" color={colors.error}>
                        Feedback: {assoc.rejection_reason}
                      </Text>
                    </View>
                  )}

                  {assoc.status === "pending" && (
                    <View style={styles.cardFooterRow}>
                      <Text variant="caption" color={colors.textSecondary}>
                        Awaiting Administrator Approval
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveAssociation(assoc.id, templeName)}
                      >
                        <Text variant="captionMedium" color={colors.error}>
                          Cancel Request
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </Card>
              );
            })
          )}

          {/* Submitted Temple Addition Suggestions */}
          {additionRequests.length > 0 && (
            <View style={{ marginTop: spacing.lg }}>
              <Text variant="h3" style={styles.sectionTitle}>
                Suggested Temple Additions ({additionRequests.length})
              </Text>
              {additionRequests.map((req) => (
                <Card key={req.id} variant="outlined" style={styles.requestCard}>
                  <View style={styles.requestRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium">{req.name}</Text>
                      <Text variant="caption" color={colors.textSecondary}>
                        {req.address ? `${req.address}, ` : ""}{req.city}, {req.state}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            req.status === "approved"
                              ? "rgba(16, 185, 129, 0.1)"
                              : req.status === "rejected"
                              ? "rgba(239, 68, 68, 0.1)"
                              : "rgba(245, 158, 11, 0.1)",
                        },
                      ]}
                    >
                      <Text
                        variant="captionMedium"
                        style={{
                          color:
                            req.status === "approved"
                              ? colors.success
                              : req.status === "rejected"
                              ? colors.error
                              : colors.warning,
                        }}
                      >
                        {req.status === "approved"
                          ? "Registered"
                          : req.status === "rejected"
                          ? "Declined"
                          : "In Review"}
                      </Text>
                    </View>
                  </View>
                  {req.rejection_reason && (
                    <Text variant="caption" color={colors.error} style={{ marginTop: 4 }}>
                      Reason: {req.rejection_reason}
                    </Text>
                  )}
                </Card>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Modal: Request Association with Active Temple */}
      <Modal
        visible={showAssociateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAssociateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text variant="h3" style={styles.modalTitle}>
              Select Consecrated Temple
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.modalSubtitle}>
              Choose from the verified temple directory to request your ritual affiliation.
            </Text>

            <ScrollView style={[styles.modalList, { maxHeight: 320 }]}>
              {availableTemplesToRequest.length === 0 ? (
                <Text variant="caption" color={colors.textSecondary} style={{ textAlign: "center", padding: 20 }}>
                  You are already associated with or have requested all active temples.
                </Text>
              ) : (
                availableTemplesToRequest.map((t) => {
                  const isSelected = selectedTempleId === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.templeSelectItem,
                        isSelected && styles.templeSelectItemSelected,
                      ]}
                      onPress={() => setSelectedTempleId(t.id)}
                    >
                      <Text style={{ fontSize: 16, marginRight: 10 }}>🏛️</Text>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium" style={{ fontWeight: isSelected ? "700" : "500" }}>
                          {t.name}
                        </Text>
                        <Text variant="caption" color={colors.textSecondary}>
                          {t.address ? `${t.address}, ` : ""}{t.city}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.radioCircle,
                          isSelected && styles.radioCircleSelected,
                        ]}
                      >
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <Button
                title="Cancel"
                variant="outline"
                size="sm"
                onPress={() => setShowAssociateModal(false)}
                style={{ flex: 1, marginRight: spacing.sm }}
              />
              <Button
                title={submittingAssoc ? "Submitting..." : "Submit Request"}
                variant="primary"
                size="sm"
                onPress={handleRequestAssociation}
                disabled={submittingAssoc || !selectedTempleId}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Suggest New Temple */}
      <Modal
        visible={showSuggestModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSuggestModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text variant="h3" style={styles.modalTitle}>
              Suggest New Temple
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.modalSubtitle}>
              If a consecrated temple is missing from the directory, submit its details for administrative verification.
            </Text>

            {suggestError && (
              <View style={styles.errorBox}>
                <Text variant="caption" color={colors.error}>
                  {suggestError}
                </Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text variant="captionMedium" style={styles.fieldLabel}>
                Temple Name *
              </Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Sankat Mochan Hanuman Temple"
                placeholderTextColor={colors.textSecondary}
                style={styles.textInput}
              />
            </View>

            <View style={styles.formGroup}>
              <Text variant="captionMedium" style={styles.fieldLabel}>
                Address / Ghat
              </Text>
              <TextInput
                value={newAddress}
                onChangeText={setNewAddress}
                placeholder="e.g. Saket Nagar, Nagwa"
                placeholderTextColor={colors.textSecondary}
                style={styles.textInput}
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                <Text variant="captionMedium" style={styles.fieldLabel}>
                  City *
                </Text>
                <TextInput
                  value={newCity}
                  onChangeText={setNewCity}
                  placeholder="Varanasi"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.textInput}
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text variant="captionMedium" style={styles.fieldLabel}>
                  State
                </Text>
                <TextInput
                  value={newState}
                  onChangeText={setNewState}
                  placeholder="Uttar Pradesh"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.textInput}
                />
              </View>
            </View>

            <View style={styles.modalBtnRow}>
              <Button
                title="Cancel"
                variant="outline"
                size="sm"
                onPress={() => setShowSuggestModal(false)}
                style={{ flex: 1, marginRight: spacing.sm }}
              />
              <Button
                title={submittingSuggest ? "Submitting..." : "Submit Suggestion"}
                variant="primary"
                size="sm"
                onPress={handleSuggestTemple}
                disabled={submittingSuggest}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
  loaderWrap: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyCard: {
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    textAlign: "center",
    marginBottom: 4,
  },
  emptySubtext: {
    textAlign: "center",
  },
  assocCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  templeIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  templeInfo: {
    flex: 1,
  },
  templeTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  rejectionBox: {
    marginTop: spacing.sm,
    padding: spacing.xs,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderRadius: radius.sm,
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  requestCard: {
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalSubtitle: {
    marginBottom: spacing.md,
  },
  modalList: {
    marginVertical: spacing.sm,
  },
  templeSelectItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  templeSelectItemSelected: {
    borderColor: colors.primary,
    backgroundColor: "rgba(245, 158, 11, 0.06)",
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  modalBtnRow: {
    flexDirection: "row",
    marginTop: spacing.md,
  },
  formGroup: {
    marginBottom: spacing.sm,
  },
  formRow: {
    flexDirection: "row",
  },
  fieldLabel: {
    marginBottom: 4,
    color: colors.textPrimary,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontSize: 14,
  },
  errorBox: {
    padding: spacing.xs,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
});

// src/features/pandit/screens/PanditPayoutSetupScreen.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { errorCodes, isErrorWithCode, pick, types } from "@react-native-documents/picker";
import { useNavigation } from "@react-navigation/native";
import {
  Button,
  Card,
  Header,
  Input,
  LoadingState,
  ScreenContainer,
  Text,
} from "../../../shared/components/ui/index.ts";
import { colors, radius, spacing } from "../../../shared/theme/index.ts";
import { formatDate } from "../../../shared/utils/formatters.ts";
import { panditPayoutService } from "../services/panditPayoutService.ts";
import {
  PanditBankAccountDetails,
  SelectedBankDocument,
} from "../types/pandit.types.ts";

export const PanditPayoutSetupScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [bankAccount, setBankAccount] = useState<PanditBankAccountDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form fields
  const [holderName, setHolderName] = useState<string>("");
  const [bankName, setBankName] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState<string>("");
  const [ifscCode, setIfscCode] = useState<string>("");
  const [upiId, setUpiId] = useState<string>("");
  const [selectedDocument, setSelectedDocument] = useState<SelectedBankDocument | null>(null);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);

  // Field validation errors
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});

  const loadBankAccount = useCallback(async () => {
    setLoading(true);
    setFormError(null);
    try {
      const current = await panditPayoutService.fetchCurrentBankAccount();
      setBankAccount(current);
      if (current) {
        // Pre-fill fields for editing/resubmitting
        setHolderName(current.account_holder_name || "");
        setBankName(current.bank_name || "");
        setIfscCode(current.ifsc_code || "");
        setUpiId(current.upi_id || "");
        setAccountNumber("");
        setConfirmAccountNumber("");
        setSelectedDocument(null);
        setIsConfirmed(false);
      }
    } catch (err: any) {
      setFormError(err?.message || "Failed to load bank account details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBankAccount();
  }, [loadBankAccount]);

  const handlePickDocument = async () => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.document;
      return next;
    });

    try {
      const docTypes = [types.images, types.pdf, "image/jpeg", "image/png", "image/jpg", "application/pdf"];
      const res = await pick({
        type: docTypes,
        allowMultiSelection: false,
      });

      if (!res || res.length === 0) {
        return;
      }

      const file = res[0];
      const fileSize = file.size || 0;
      const fileName = file.name || "bank_proof.jpg";

      // 10 MB maximum limit
      if (fileSize > 10 * 1024 * 1024) {
        setFieldErrors((prev) => ({
          ...prev,
          document: "Document file size exceeds 10 MB limit.",
        }));
        return;
      }

      setSelectedDocument({
        uri: file.uri,
        name: fileName,
        type: file.type || "image/jpeg",
        size: fileSize,
      });
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      setFieldErrors((prev) => ({
        ...prev,
        document: err?.message || "Failed to select bank document.",
      }));
    }
  };

  const handleRemoveDocument = () => {
    setSelectedDocument(null);
  };

  const handleConfirmAccount = async () => {
    if (!bankAccount?.id) return;
    setConfirming(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      await panditPayoutService.confirmBankAccount(bankAccount.id);
      setSuccessMessage("Bank account ownership confirmed. Awaiting administrator review.");
      await loadBankAccount();
    } catch (err: any) {
      setFormError(err?.message || "Failed to confirm bank account details.");
    } finally {
      setConfirming(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};

    const trimmedHolder = holderName.trim();
    if (!trimmedHolder) {
      errors.holderName = "Account holder name is required.";
    } else if (trimmedHolder.length < 2 || trimmedHolder.length > 100) {
      errors.holderName = "Name must be between 2 and 100 characters.";
    }

    const trimmedBank = bankName.trim();
    if (!trimmedBank) {
      errors.bankName = "Bank name is required.";
    } else if (trimmedBank.length < 2 || trimmedBank.length > 100) {
      errors.bankName = "Bank name must be between 2 and 100 characters.";
    }

    const trimmedAcc = accountNumber.trim();
    if (!trimmedAcc) {
      errors.accountNumber = "Account number is required.";
    } else if (!/^\d{9,18}$/.test(trimmedAcc)) {
      errors.accountNumber = "Account number must be 9 to 18 numeric digits.";
    }

    const trimmedConfirm = confirmAccountNumber.trim();
    if (!trimmedConfirm) {
      errors.confirmAccountNumber = "Please confirm your account number.";
    } else if (trimmedAcc !== trimmedConfirm) {
      errors.confirmAccountNumber = "Account numbers do not match.";
    }

    const upperIfsc = ifscCode.trim().toUpperCase();
    if (!upperIfsc) {
      errors.ifscCode = "IFSC code is required.";
    } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(upperIfsc)) {
      errors.ifscCode = "Invalid IFSC format (e.g. SBIN0001234).";
    }

    const trimmedUpi = upiId.trim();
    if (trimmedUpi && !/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$/.test(trimmedUpi)) {
      errors.upiId = "Invalid UPI ID format (e.g. name@bank).";
    }

    // Document validation: required when adding new or when existing account has no document
    if (!selectedDocument && !bankAccount?.verification_document_path) {
      errors.document = "Bank proof document (passbook photo, cancelled cheque, or statement) is required.";
    }

    // Mandatory ownership confirmation declaration
    if (!isConfirmed) {
      errors.confirmation = "You must confirm that this bank account belongs to you and the details are correct.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    setFormError(null);
    setSuccessMessage(null);

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    let uploadedStoragePath: string | null = null;

    try {
      let docPath = bankAccount?.verification_document_path || "";

      // Step 1: Upload verification document if newly selected
      if (selectedDocument) {
        const panditId = await panditPayoutService.getAuthenticatedPanditId();
        uploadedStoragePath = await panditPayoutService.uploadBankVerificationDocument(
          panditId,
          selectedDocument
        );
        docPath = uploadedStoragePath;
      }

      if (!docPath) {
        throw new Error("Bank proof document is required before submission.");
      }

      // Step 2: Submit bank account details via authoritative RPC
      const res = await panditPayoutService.submitBankAccount({
        account_holder_name: holderName.trim(),
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        ifsc_code: ifscCode.trim().toUpperCase(),
        upi_id: upiId.trim() || null,
        verification_document_path: docPath,
        verification_document_type: "passbook_cheque",
      });

      if (res.success) {
        setSuccessMessage("Bank account details and verification proof submitted successfully.");
        setIsEditing(false);
        setSelectedDocument(null);
        setIsConfirmed(false);
        await loadBankAccount();
      }
    } catch (err: any) {
      // Clean up orphaned document if RPC submission fails
      if (uploadedStoragePath) {
        await panditPayoutService.deleteBankVerificationDocument(uploadedStoragePath);
      }
      setFormError(err?.message || "Failed to submit bank account details.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !bankAccount) {
    return (
      <ScreenContainer padded>
        <LoadingState message="Checking payout account configuration..." />
      </ScreenContainer>
    );
  }

  const showForm = !bankAccount || isEditing;

  return (
    <ScreenContainer padded>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Back Button & Header */}
          <View style={styles.topNavRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Text variant="bodyMedium" color={colors.primary}>
                &larr; Back
              </Text>
            </TouchableOpacity>
          </View>

          <Header
            title="Payout Bank Account"
            subtitle="Authoritative Vedic Sanctum Settlement Details"
          />

          {/* Success Banner */}
          {successMessage ? (
            <Card style={styles.successBanner}>
              <Text variant="captionMedium" color={colors.success}>
                ✓ {successMessage}
              </Text>
            </Card>
          ) : null}

          {/* Error Banner */}
          {formError ? (
            <Card style={styles.errorBanner}>
              <Text variant="captionMedium" color={colors.error}>
                ⚠️ {formError}
              </Text>
            </Card>
          ) : null}

          {/* Existing Account Status Display (When not editing) */}
          {bankAccount && !isEditing ? (
            <View>
              {/* Status Banner */}
              {bankAccount.verification_status === "verified" ? (
                <Card variant="elevated" style={styles.verifiedCard}>
                  <View style={styles.badgeRow}>
                    <View style={styles.verifiedBadge}>
                      <Text variant="captionMedium" color={colors.success} style={styles.badgeText}>
                        ✓ VERIFIED &amp; PAYOUT ELIGIBLE
                      </Text>
                    </View>
                  </View>
                  <Text variant="h3" style={styles.statusTitle}>
                    Payouts Active
                  </Text>
                  <Text variant="caption" color={colors.textSecondary} style={styles.statusSub}>
                    Your payout bank account is verified. Dakshina for completed rituals and Janam Kundlis will be cleared directly to this bank account.
                  </Text>
                </Card>
              ) : bankAccount.verification_status === "pending" ? (
                <View>
                  <Card variant="elevated" style={styles.pendingCard}>
                    <View style={styles.badgeRow}>
                      <View style={styles.pendingBadge}>
                        <Text variant="captionMedium" color="#b45309" style={styles.badgeText}>
                          ⏳ PENDING VERIFICATION
                        </Text>
                      </View>
                    </View>
                    <Text variant="h3" style={styles.statusTitle}>
                      Under Administrative Review
                    </Text>
                    <Text variant="caption" color={colors.textSecondary} style={styles.statusSub}>
                      Your bank account details and proof document have been submitted with your ownership confirmation and are awaiting verification by the Kashi Veda temple administrators.
                    </Text>
                  </Card>

                  {/* Pandit Confirmation Card (Legacy unconfirmed records compatibility only) */}
                  {!bankAccount.pandit_confirmed_at ? (
                    <Card variant="outlined" style={styles.confirmationActionCard}>
                      <Text variant="bodyBold" color="#92400e" style={styles.confirmationTitle}>
                        ⚠️ Legacy Account: Confirmation Required
                      </Text>
                      <Text variant="caption" color={colors.textSecondary} style={styles.confirmationSub}>
                        Please confirm that these bank account details belong to you so administrators can proceed with verification.
                      </Text>
                      <Button
                        title={confirming ? "Confirming..." : "Confirm Bank Details"}
                        variant="primary"
                        onPress={handleConfirmAccount}
                        disabled={confirming}
                        style={styles.confirmBtn}
                      />
                    </Card>
                  ) : (
                    <Card style={styles.confirmedBanner}>
                      <Text variant="captionMedium" color={colors.success}>
                        ✓ Ownership confirmed by you on {formatDate(bankAccount.pandit_confirmed_at)}. Awaiting administrator approval.
                      </Text>
                    </Card>
                  )}
                </View>
              ) : (
                <Card variant="elevated" style={styles.rejectedCard}>
                  <View style={styles.badgeRow}>
                    <View style={styles.rejectedBadge}>
                      <Text variant="captionMedium" color={colors.error} style={styles.badgeText}>
                        ⚠️ VERIFICATION REJECTED
                      </Text>
                    </View>
                  </View>
                  <Text variant="h3" style={styles.statusTitle}>
                    Action Required
                  </Text>
                  <Text variant="bodyMedium" color={colors.error} style={styles.rejectionReasonText}>
                    {`Reason: ${bankAccount.rejection_reason || "Invalid IFSC code or account holder mismatch."}`}
                  </Text>
                  <Text variant="caption" color={colors.textSecondary} style={styles.statusSub}>
                    Please review your bank details, upload a clear photo of your passbook or cheque, and resubmit for verification.
                  </Text>
                </Card>
              )}

              {/* Account Details Overview */}
              <Card variant="outlined" style={styles.detailsCard}>
                <Text variant="overline" color={colors.primary} style={styles.sectionOverline}>
                  CURRENT ACCOUNT DETAILS
                </Text>

                <View style={styles.detailRow}>
                  <Text variant="caption" color={colors.textSecondary}>
                    Account Holder
                  </Text>
                  <Text variant="bodyBold">{bankAccount.account_holder_name}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.detailRow}>
                  <Text variant="caption" color={colors.textSecondary}>
                    Bank Name
                  </Text>
                  <Text variant="bodyMedium">{bankAccount.bank_name || "Bank"}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.detailRow}>
                  <Text variant="caption" color={colors.textSecondary}>
                    Account Number
                  </Text>
                  <Text variant="bodyBold">{bankAccount.masked_account_number}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.detailRow}>
                  <Text variant="caption" color={colors.textSecondary}>
                    IFSC Code
                  </Text>
                  <Text variant="bodyBold">{bankAccount.ifsc_code}</Text>
                </View>

                {bankAccount.upi_id ? (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.detailRow}>
                      <Text variant="caption" color={colors.textSecondary}>
                        UPI ID
                      </Text>
                      <Text variant="bodyMedium">{bankAccount.upi_id}</Text>
                    </View>
                  </>
                ) : null}

                <View style={styles.divider} />

                <View style={styles.detailRow}>
                  <Text variant="caption" color={colors.textSecondary}>
                    Bank Proof Document
                  </Text>
                  <Text
                    variant="captionMedium"
                    color={bankAccount.verification_document_path ? colors.success : colors.textSecondary}
                  >
                    {bankAccount.verification_document_path ? "✓ Uploaded" : "Not Attached"}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.detailRow}>
                  <Text variant="caption" color={colors.textSecondary}>
                    Pandit Confirmation
                  </Text>
                  <Text
                    variant="captionMedium"
                    color={bankAccount.pandit_confirmed_at ? colors.success : "#b45309"}
                  >
                    {bankAccount.pandit_confirmed_at
                      ? `✓ Confirmed (${formatDate(bankAccount.pandit_confirmed_at)})`
                      : "⚠️ Awaiting Confirmation"}
                  </Text>
                </View>

                {bankAccount.verified_at ? (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.detailRow}>
                      <Text variant="caption" color={colors.textSecondary}>
                        Verified On
                      </Text>
                      <Text variant="captionMedium">
                        {formatDate(bankAccount.verified_at)}
                      </Text>
                    </View>
                  </>
                ) : null}
              </Card>

              {/* Actions */}
              <View style={styles.actionRow}>
                <Button
                  title={
                    bankAccount.verification_status === "rejected"
                      ? "Update & Resubmit Bank Account"
                      : "Change Bank Account"
                  }
                  variant={bankAccount.verification_status === "rejected" ? "primary" : "outline"}
                  onPress={() => {
                    setFieldErrors({});
                    setIsEditing(true);
                  }}
                  style={styles.fullWidthButton}
                />
              </View>
            </View>
          ) : null}

          {/* Form: New or Edit Bank Account */}
          {showForm ? (
            <View>
              {/* Not configured banner */}
              {!bankAccount ? (
                <Card style={styles.infoBanner}>
                  <Text variant="captionMedium" color="#b45309">
                    ℹ️ Bank Account Not Configured
                  </Text>
                  <Text variant="caption" color="#92400e" style={styles.infoBannerText}>
                    Provide your verified Indian bank account details and upload a proof document to receive direct disbursements for completed ritual ceremonies and Janam Kundlis.
                  </Text>
                </Card>
              ) : null}

              <Card variant="elevated" style={styles.formCard}>
                <Text variant="h3" style={styles.formTitle}>
                  {bankAccount ? "Update Bank Account Details" : "Add Payout Bank Account"}
                </Text>
                <Text variant="caption" color={colors.textSecondary} style={styles.formSubtitle}>
                  All banking information is encrypted and manually reviewed with your attached verification proof.
                </Text>

                <Input
                  label="Account Holder Name *"
                  placeholder="e.g. Acharya Ramkrishna Shastri"
                  value={holderName}
                  onChangeText={setHolderName}
                  error={fieldErrors.holderName}
                  autoCapitalize="words"
                />

                <Input
                  label="Bank Name *"
                  placeholder="e.g. State Bank of India"
                  value={bankName}
                  onChangeText={setBankName}
                  error={fieldErrors.bankName}
                  autoCapitalize="words"
                />

                <Input
                  label="Bank Account Number *"
                  placeholder="e.g. 123456789012"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  error={fieldErrors.accountNumber}
                  keyboardType="numeric"
                  secureTextEntry
                />

                <Input
                  label="Confirm Account Number *"
                  placeholder="Re-enter bank account number"
                  value={confirmAccountNumber}
                  onChangeText={setConfirmAccountNumber}
                  error={fieldErrors.confirmAccountNumber}
                  keyboardType="numeric"
                />

                <Input
                  label="IFSC Code *"
                  placeholder="e.g. SBIN0001234"
                  value={ifscCode}
                  onChangeText={(val) => setIfscCode(val.toUpperCase())}
                  error={fieldErrors.ifscCode}
                  autoCapitalize="characters"
                  maxLength={11}
                />

                <Input
                  label="UPI ID (Optional)"
                  placeholder="e.g. shastri@okhdfcbank"
                  value={upiId}
                  onChangeText={setUpiId}
                  error={fieldErrors.upiId}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  helperText="Optional secondary payout identifier."
                />

                {/* Bank Account Verification Proof Upload Section */}
                <View style={styles.documentSection}>
                  <Text variant="bodyBold" style={styles.documentSectionTitle}>
                    Bank Account Proof Document *
                  </Text>
                  <Text variant="caption" color={colors.textSecondary} style={styles.documentSectionSubtitle}>
                    Upload a clear photo of your bank passbook, cancelled cheque, or bank statement displaying the account holder name, account number, and IFSC code.
                  </Text>
                  <Text variant="caption" color={colors.textSecondary} style={styles.formatHint}>
                    Supported formats: JPG, JPEG, PNG, PDF (Max 10 MB)
                  </Text>

                  {selectedDocument ? (
                    <Card variant="outlined" style={styles.selectedDocCard}>
                      <View style={styles.docInfoRow}>
                        <Text style={styles.docIcon}>📄</Text>
                        <View style={styles.docTextContainer}>
                          <Text variant="bodyBold" numberOfLines={1} style={styles.docFileName}>
                            {selectedDocument.name}
                          </Text>
                          <Text variant="caption" color={colors.textSecondary}>
                            {(selectedDocument.size / (1024 * 1024)).toFixed(2)} MB • Ready for Upload
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={handleRemoveDocument}
                          style={styles.removeDocBtn}
                          disabled={submitting}
                        >
                          <Text variant="captionMedium" color={colors.error}>
                            Remove
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  ) : bankAccount?.verification_document_path ? (
                    <Card variant="outlined" style={styles.existingDocCard}>
                      <View style={styles.docInfoRow}>
                        <Text style={styles.docIcon}>✓</Text>
                        <View style={styles.docTextContainer}>
                          <Text variant="bodyMedium" color={colors.success}>
                            Current verification proof document on file
                          </Text>
                          <Text variant="caption" color={colors.textSecondary}>
                            Tap button below to replace with a new document
                          </Text>
                        </View>
                      </View>
                      <Button
                        title="Choose Different Document"
                        variant="outline"
                        onPress={handlePickDocument}
                        disabled={submitting}
                        style={styles.pickDocBtn}
                      />
                    </Card>
                  ) : (
                    <View style={styles.pickDocContainer}>
                      <Button
                        title="📁 Choose Bank Proof Document"
                        variant="outline"
                        onPress={handlePickDocument}
                        disabled={submitting}
                        style={styles.pickDocBtn}
                      />
                    </View>
                  )}

                  {fieldErrors.document ? (
                    <Text variant="caption" color={colors.error} style={styles.docErrorText}>
                      ⚠️ {fieldErrors.document}
                    </Text>
                  ) : null}
                </View>

                {/* Bank Account Ownership & Authorization Confirmation Declaration */}
                <TouchableOpacity
                  style={styles.confirmationBox}
                  onPress={() => {
                    setIsConfirmed(!isConfirmed);
                    if (fieldErrors.confirmation) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.confirmation;
                        return next;
                      });
                    }
                  }}
                  activeOpacity={0.8}
                  disabled={submitting}
                >
                  <View style={[styles.checkbox, isConfirmed && styles.checkboxSelected]}>
                    {isConfirmed && <Text variant="caption" color={colors.surface}>✓</Text>}
                  </View>
                  <View style={styles.confirmationTextContainer}>
                    <Text variant="bodyMedium" style={styles.confirmationText}>
                      I confirm that this bank account belongs to me and the bank details provided above are correct.
                    </Text>
                    <Text variant="caption" color={colors.textSecondary} style={styles.confirmationSubtext}>
                      I authorize Kashi Veda to use this verified account for future payouts.
                    </Text>
                  </View>
                </TouchableOpacity>

                {fieldErrors.confirmation ? (
                  <Text variant="caption" color={colors.error} style={styles.confirmationErrorText}>
                    ⚠️ {fieldErrors.confirmation}
                  </Text>
                ) : null}

                <View style={styles.formActions}>
                  {bankAccount ? (
                    <TouchableOpacity
                      onPress={() => {
                        setFieldErrors({});
                        setSelectedDocument(null);
                        setIsConfirmed(false);
                        setIsEditing(false);
                      }}
                      style={styles.cancelBtn}
                      disabled={submitting}
                    >
                      <Text variant="bodyMedium" color={colors.textSecondary}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <Button
                    title={submitting ? "Uploading & Submitting..." : "Submit Bank Details"}
                    variant="primary"
                    onPress={handleSubmit}
                    disabled={submitting}
                    style={styles.submitBtn}
                  />
                </View>
              </Card>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  topNavRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
  },
  successBanner: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorBanner: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoBanner: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoBannerText: {
    marginTop: spacing.xxs,
  },
  verifiedCard: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  pendingCard: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  confirmationActionCard: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  confirmationTitle: {
    marginBottom: spacing.xxs,
  },
  confirmationSub: {
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  confirmBtn: {
    alignSelf: "flex-start",
  },
  confirmedBanner: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  rejectedCard: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  badgeRow: {
    marginBottom: spacing.xs,
  },
  verifiedBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#d1fae5",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  pendingBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fef3c7",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  rejectedBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fee2e2",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  statusTitle: {
    marginBottom: spacing.xxs,
  },
  statusSub: {
    lineHeight: 18,
  },
  rejectionReasonText: {
    fontWeight: "600",
    marginVertical: spacing.xs,
  },
  detailsCard: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionOverline: {
    letterSpacing: 1.2,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xxs,
  },
  actionRow: {
    marginTop: spacing.sm,
  },
  fullWidthButton: {
    width: "100%",
  },
  formCard: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  formTitle: {
    marginBottom: spacing.xxs,
  },
  formSubtitle: {
    marginBottom: spacing.md,
  },
  documentSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  documentSectionTitle: {
    marginBottom: spacing.xxs,
  },
  documentSectionSubtitle: {
    lineHeight: 18,
    marginBottom: spacing.xxs,
  },
  formatHint: {
    marginBottom: spacing.sm,
  },
  pickDocContainer: {
    marginTop: spacing.xs,
  },
  pickDocBtn: {
    width: "100%",
  },
  selectedDocCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  existingDocCard: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    padding: spacing.sm,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  docInfoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  docIcon: {
    fontSize: 22,
    marginRight: spacing.sm,
  },
  docTextContainer: {
    flex: 1,
  },
  docFileName: {
    fontSize: 13,
  },
  removeDocBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  docErrorText: {
    marginTop: spacing.xs,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  submitBtn: {
    flex: 1,
  },
  confirmationBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border || "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
    marginTop: 2,
    backgroundColor: colors.surface,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  confirmationTextContainer: {
    flex: 1,
  },
  confirmationText: {
    lineHeight: 20,
    fontWeight: "600",
  },
  confirmationSubtext: {
    marginTop: spacing.xxs,
    lineHeight: 16,
  },
  confirmationErrorText: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
});

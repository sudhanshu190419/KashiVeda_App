import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '../icons';
import { useTheme, getDevanagariLineHeight } from '../../theme';
import { useLanguage } from '../../i18n';
import { VIconButton } from './VIconButton';

export interface UploadedDocument {
  uri: string;
  name: string;
  size?: string;
  type?: 'pdf' | 'image';
}

export interface FileUploadFieldProps {
  label: string;
  fileUri?: string;
  fileName?: string;
  fileSize?: string;
  onSelectFile: () => void;
  onRemoveFile?: () => void;
  allowedTypes?: ('pdf' | 'image')[];
  maxSizeMb?: number;
  helperText?: string;
  errorMessage?: string;
  isDisabled?: boolean;
  institutionHint?: string; // e.g. "SSU / BHU SVDV"
  testID?: string;
}

export const FileUploadField: React.FC<FileUploadFieldProps> = ({
  label,
  fileUri,
  fileName,
  fileSize,
  onSelectFile,
  onRemoveFile,
  allowedTypes = ['pdf', 'image'],
  maxSizeMb = 10,
  helperText,
  errorMessage,
  isDisabled = false,
  institutionHint,
  testID,
}) => {
  const { colors, spacing, radii, typography } = useTheme();
  const { language } = useLanguage();
  const isHi = language === 'hi';
  const hasFile = Boolean(fileUri);
  const hasError = Boolean(errorMessage);

  const resolvedInstitutionHint =
    institutionHint ??
    (isHi
      ? 'मान्यता प्राप्त संस्थान: संपूर्णानंद संस्कृत वि.वि. / बीएचयू एसवीडीवी'
      : 'Recognised institutions: SSU / BHU SVDV');

  const isPdf = fileName?.toLowerCase().endsWith('.pdf');

  return (
    <View style={styles.container} testID={testID}>
      {/* Label */}
      <Text
        style={[
          styles.label,
          {
            color: hasError ? colors.statusAlert : colors.textPrimary,
            fontSize: typography.labelMedium.fontSize,
            lineHeight: getDevanagariLineHeight(typography.labelMedium.fontSize),
            marginBottom: spacing.xs,
          },
        ]}
      >
        {label}
      </Text>

      {/* Main Upload / File Card */}
      {hasFile ? (
        /* Selected File Card State */
        <View
          style={[
            styles.fileCard,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: hasError ? colors.statusAlert : colors.borderAccent,
              borderRadius: radii.lg,
              borderWidth: 1,
              padding: spacing.md,
              minHeight: spacing.touch,
            },
          ]}
        >
          {/* File Icon Slot */}
          <View
            style={[
              styles.iconWrapper,
              {
                width: 44,
                height: 44,
                borderRadius: radii.md,
                backgroundColor: colors.surfaceSubtle,
                marginRight: spacing.md,
              },
            ]}
          >
            <Ionicons
              name={isPdf ? 'document-text' : 'image'}
              size={24}
              color={colors.brandPrimary}
            />
          </View>

          {/* File Information */}
          <View style={styles.fileInfoCol}>
            <Text
              style={[
                styles.fileNameText,
                {
                  color: colors.textPrimary,
                  fontSize: typography.titleSmall.fontSize,
                  lineHeight: typography.titleSmall.lineHeight,
                  fontWeight: '600',
                },
              ]}
              numberOfLines={1}
            >
              {fileName || (isHi ? 'दस्तावेज संलग्न' : 'Document attached')}
            </Text>

            <View style={styles.metaRow}>
              {fileSize ? (
                <Text
                  style={[
                    styles.metaText,
                    {
                      color: colors.textMuted,
                      fontSize: typography.caption.fontSize,
                    },
                  ]}
                >
                  {fileSize} •{' '}
                </Text>
              ) : null}

              <Text
                style={[
                  styles.verifiedBadgeText,
                  {
                    color: colors.statusActive,
                    fontSize: typography.caption.fontSize,
                    fontWeight: '600',
                  },
                ]}
              >
                {isHi ? 'अपलोड संपन्न' : 'Uploaded'}
              </Text>
            </View>
          </View>

          {/* Remove File Button (48x48dp touch floor guaranteed) */}
          {onRemoveFile && !isDisabled ? (
            <VIconButton
              icon={<Ionicons name="trash-outline" size={20} color={colors.statusAlert} />}
              onPress={onRemoveFile}
              variant="ghost"
              size={40}
              accessibilityLabel={
                isHi ? `${fileName || 'दस्तावेज'} हटाएं` : `Remove ${fileName || 'document'}`
              }
            />
          ) : null}
        </View>
      ) : (
        /* Tap-To-Upload Empty State Card */
        <Pressable
          onPress={onSelectFile}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityLabel={
            isHi
              ? `${label}: प्रमाणपत्र या पहचान पत्र अपलोड करें`
              : `${label}: Tap to upload degree certificate or identity document`
          }
          accessibilityHint={
            isHi
              ? `${allowedTypes.join(', ')} फ़ाइलें, अधिकतम ${maxSizeMb}MB`
              : `Allows ${allowedTypes.join(', ')} up to ${maxSizeMb} megabytes`
          }
          style={({ pressed }) => [
            styles.emptyCard,
            {
              backgroundColor: pressed ? colors.surfaceBase : colors.surfaceCard,
              borderColor: hasError
                ? colors.statusAlert
                : pressed
                ? colors.borderAccent
                : colors.borderDefault,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderRadius: radii.lg,
              padding: spacing.lg,
              opacity: isDisabled ? 0.45 : 1,
            },
          ]}
        >
          {/* Upload Cloud Icon */}
          <View
            style={[
              styles.uploadIconCircle,
              {
                width: 48,
                height: 48,
                borderRadius: radii.full,
                backgroundColor: colors.surfaceSubtle,
                marginBottom: spacing.sm,
              },
            ]}
          >
            <Ionicons name="cloud-upload-outline" size={24} color={colors.brandPrimary} />
          </View>

          {/* Instruction Headlines */}
          <Text
            style={[
              styles.emptyTitle,
              {
                color: colors.textPrimary,
                fontSize: typography.titleSmall.fontSize,
                lineHeight: getDevanagariLineHeight(typography.titleSmall.fontSize),
                fontWeight: '600',
                textAlign: 'center',
              },
            ]}
          >
            {isHi ? 'प्रमाणपत्र / उपाधि अपलोड करें' : 'Upload certificate / degree'}
          </Text>

          <Text
            style={[
              styles.emptySubtitle,
              {
                color: colors.textMuted,
                fontSize: typography.caption.fontSize,
                lineHeight: typography.caption.lineHeight,
                textAlign: 'center',
                marginTop: 2,
              },
            ]}
          >
            {isHi
              ? `दस्तावेज अपलोड करने हेतु टैप करें (${allowedTypes.map((t) => t.toUpperCase()).join(' / ')}, अधिकतम ${maxSizeMb}MB)`
              : `Tap to upload document (${allowedTypes.map((t) => t.toUpperCase()).join(' / ')}, max ${maxSizeMb}MB)`}
          </Text>

          {/* Academic Institution Hint */}
          {resolvedInstitutionHint ? (
            <View
              style={[
                styles.institutionPill,
                {
                  backgroundColor: colors.surfaceBase,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xxs,
                  marginTop: spacing.sm,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.institutionText,
                  {
                    color: colors.brandPrimary,
                    fontSize: 12,
                    lineHeight: getDevanagariLineHeight(12),
                    fontWeight: '600',
                    textAlign: 'center',
                  },
                ]}
              >
                {resolvedInstitutionHint}
              </Text>
            </View>
          ) : null}
        </Pressable>
      )}

      {/* Helper or Error Message */}
      {hasError ? (
        <Text
          style={[
            styles.feedbackText,
            {
              color: colors.statusAlert,
              fontSize: typography.caption.fontSize,
              lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
              marginTop: spacing.xs,
            },
          ]}
        >
          {errorMessage}
        </Text>
      ) : helperText ? (
        <Text
          style={[
            styles.feedbackText,
            {
              color: colors.textMuted,
              fontSize: typography.caption.fontSize,
              lineHeight: getDevanagariLineHeight(typography.caption.fontSize),
              marginTop: spacing.xs,
            },
          ]}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
};

export default FileUploadField;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontWeight: '600',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  fileNameText: {},
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaText: {},
  verifiedBadgeText: {},
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadIconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {},
  emptySubtitle: {},
  institutionPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  institutionText: {},
  feedbackText: {},
});

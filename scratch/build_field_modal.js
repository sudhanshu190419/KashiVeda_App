const fs = require('fs');
const path = require('path');

const adminDir = 'C:\\Projects\\kashi-veda-admin';

// 1. Create daily-insight-field-modal.tsx
const fieldModalContent = `"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { saveDailyRashiInsight } from "@/lib/actions/daily-insights-management";
import type {
  CanonicalRashi,
  DailyRashiInsightAdminItem,
  DailyRashiInsightFormData,
} from "@/lib/types/daily-insights-management";
import { Loader2, X, AlertTriangle, Save, Sparkles } from "lucide-react";

export type InsightEditableField =
  | "general_outlook"
  | "career_business"
  | "finance_wealth"
  | "love_relationships"
  | "health_wellbeing";

interface DailyInsightFieldModalProps {
  rashi: CanonicalRashi;
  date: string;
  language: string;
  field: InsightEditableField;
  existingInsight?: DailyRashiInsightAdminItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const FIELD_CONFIGS: Record<
  InsightEditableField,
  {
    title: string;
    label: string;
    placeholder: string;
    icon: string;
    isRequired?: boolean;
    rows?: number;
  }
> = {
  general_outlook: {
    title: "General Outlook",
    label: "General Planetary Outlook & Daily Guidance",
    placeholder: "Enter overall planetary influence, cosmic energy, and general day guidance...",
    icon: "🌟",
    isRequired: true,
    rows: 6,
  },
  career_business: {
    title: "Career & Business",
    label: "Career, Workplace Dynamics & Business Insights",
    placeholder: "Professional decisions, office dynamics, deals, leadership opportunities...",
    icon: "💼",
    rows: 5,
  },
  finance_wealth: {
    title: "Finance & Wealth",
    label: "Finance, Investments & Monetary Decisions",
    placeholder: "Investments, expenditures, monetary caution, unexpected gains...",
    icon: "💰",
    rows: 5,
  },
  love_relationships: {
    title: "Love & Relationships",
    label: "Love, Marriage, Family & Relationships",
    placeholder: "Family harmony, romantic transit, communication, domestic peace...",
    icon: "❤️",
    rows: 5,
  },
  health_wellbeing: {
    title: "Health & Wellbeing",
    label: "Physical Wellness, Vitality & Mental Peace",
    placeholder: "Vitality, diet, mental peace, physical wellness tips, yoga...",
    icon: "🌿",
    rows: 5,
  },
};

export function DailyInsightFieldModal({
  rashi,
  date,
  language,
  field,
  existingInsight,
  isOpen,
  onClose,
  onSuccess,
}: DailyInsightFieldModalProps) {
  const config = FIELD_CONFIGS[field] || FIELD_CONFIGS.general_outlook;
  const isCurrentlyPublished = existingInsight?.status === "published";

  // State
  const [fieldValue, setFieldValue] = useState("");
  const [hasConfirmedPublishedWarning, setHasConfirmedPublishedWarning] = useState(!isCurrentlyPublished);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load field value on open
  useEffect(() => {
    if (!isOpen) return;

    let initialVal = "";
    if (existingInsight) {
      if (field === "general_outlook") initialVal = existingInsight.general_outlook || "";
      else if (field === "career_business") initialVal = existingInsight.career_business || "";
      else if (field === "finance_wealth") initialVal = existingInsight.finance_wealth || "";
      else if (field === "love_relationships") initialVal = existingInsight.love_relationships || "";
      else if (field === "health_wellbeing") initialVal = existingInsight.health_wellbeing || "";
    }

    setFieldValue(initialVal);
    setHasConfirmedPublishedWarning(!isCurrentlyPublished);
    setError(null);

    // Autofocus textarea with cursor at the end
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        if (initialVal) {
          const len = initialVal.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen, field, existingInsight, isCurrentlyPublished]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError(null);

    if (isCurrentlyPublished && !hasConfirmedPublishedWarning) {
      setError("Please confirm the warning before saving changes to a published record.");
      return;
    }

    setIsSubmitting(true);
    try {
      // PRESERVE ALL OTHER FIELDS: construct complete authoritative payload
      const payload: DailyRashiInsightFormData = {
        id: existingInsight?.id,
        insight_date: date,
        rashi_id: rashi.id,
        language,
        general_outlook:
          field === "general_outlook"
            ? fieldValue
            : (existingInsight?.general_outlook || ""),
        career_business:
          field === "career_business"
            ? fieldValue
            : (existingInsight?.career_business || ""),
        finance_wealth:
          field === "finance_wealth"
            ? fieldValue
            : (existingInsight?.finance_wealth || ""),
        love_relationships:
          field === "love_relationships"
            ? fieldValue
            : (existingInsight?.love_relationships || ""),
        health_wellbeing:
          field === "health_wellbeing"
            ? fieldValue
            : (existingInsight?.health_wellbeing || ""),
        auspicious_color: existingInsight?.auspicious_color || "",
        auspicious_number:
          existingInsight?.auspicious_number != null
            ? String(existingInsight.auspicious_number)
            : "",
        status: "draft", // Saving individual field sets status to draft
      };

      const res = await saveDailyRashiInsight(payload);
      if (!res.success) {
        setError(res.error || "Failed to save field draft.");
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while saving.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <Card className="w-full max-w-lg shadow-2xl border-border bg-card my-auto">
        {/* Field Editor Header */}
        <CardHeader className="flex flex-row items-start justify-between border-b border-border/60 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{rashi.symbol}</span>
              <CardTitle className="text-base font-bold text-foreground">
                {rashi.vedicName} — {config.title}
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Sign: <span className="font-semibold text-foreground">{rashi.vedicName} ({rashi.englishName})</span> • Date:{" "}
              <span className="font-semibold text-foreground">{date}</span> • Language:{" "}
              <span className="font-semibold uppercase text-foreground">{language}</span>
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>

        {/* Field Editor Body (ONLY the clicked field!) */}
        <CardContent className="py-4 space-y-3.5 text-sm">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Published Record Protection Warning */}
          {isCurrentlyPublished && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-500 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <span>Published Record Warning</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-500/90">
                This Rashi is currently <strong>Published</strong>. Saving changes to this field will convert the record to <strong>Draft</strong> status and temporarily withdraw it from the mobile customer feed until re-published.
              </p>
              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="confirm-publish-change"
                  checked={hasConfirmedPublishedWarning}
                  onCheckedChange={(checked) => setHasConfirmedPublishedWarning(!!checked)}
                />
                <label
                  htmlFor="confirm-publish-change"
                  className="text-xs font-medium cursor-pointer text-amber-400 select-none"
                >
                  I understand this will change status to Draft
                </label>
              </div>
            </div>
          )}

          {/* Single Dedicated Field Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="single-field-input" className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                <span>{config.icon}</span>
                <span>{config.label}</span>
                {config.isRequired && <span className="text-destructive">*</span>}
              </Label>
              <span className="text-[10px] text-muted-foreground font-mono">
                {fieldValue.length} characters
              </span>
            </div>
            <textarea
              id="single-field-input"
              ref={textareaRef}
              rows={config.rows || 5}
              value={fieldValue}
              onChange={(e) => setFieldValue(e.target.value)}
              placeholder={config.placeholder}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </CardContent>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-5 py-3 rounded-b-lg">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Status:</span>
            <Badge
              variant="outline"
              className={"text-[10px] uppercase font-semibold " + (
                isCurrentlyPublished
                  ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                  : existingInsight
                  ? "border-amber-500/30 text-amber-600 bg-amber-500/10"
                  : "border-muted text-muted-foreground"
              )}
            >
              {existingInsight?.status || "Not Created"}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting || (isCurrentlyPublished && !hasConfirmedPublishedWarning)}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Draft
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
`;

// 2. Update daily-insights-matrix-view.tsx to route cell clicks to DailyInsightFieldModal and row actions to DailyInsightsFormModal
const matrixViewContent = `"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getDailyRashiInsightsMatrix,
  bulkSaveDailyRashiInsightsDrafts,
  validateDailySetReadiness,
  publishDailyRashiInsightsSet,
} from "@/lib/actions/daily-insights-management";
import type {
  CanonicalRashi,
  DailyRashiInsightAdminItem,
  DailyInsightsMatrixResponse,
  RashiMatrixSlot,
  PublishSetValidationResult,
  DailyRashiInsightFormData,
} from "@/lib/types/daily-insights-management";
import { DailyInsightsFormModal } from "./daily-insights-form-modal";
import { DailyInsightFieldModal, type InsightEditableField } from "./daily-insight-field-modal";
import { PublishDailySetModal } from "./publish-daily-set-modal";
import {
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Edit3,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
  Send,
  Plus,
} from "lucide-react";

interface DailyInsightsMatrixViewProps {
  initialData: DailyInsightsMatrixResponse;
}

export function DailyInsightsMatrixView({ initialData }: DailyInsightsMatrixViewProps) {
  const [matrix, setMatrix] = useState<DailyInsightsMatrixResponse>(initialData);
  const [selectedDate, setSelectedDate] = useState<string>(initialData.date);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialData.language);

  // 1. Compact Field-Specific Editor Modal State (Opened by clicking table cells)
  const [activeFieldSlot, setActiveFieldSlot] = useState<{
    rashi: CanonicalRashi;
    insight: DailyRashiInsightAdminItem | null;
    field: InsightEditableField;
  } | null>(null);

  // 2. Complete Rashi Editor Modal State (Opened by row-level Create / Edit actions)
  const [activeFullSlot, setActiveFullSlot] = useState<{
    rashi: CanonicalRashi;
    insight: DailyRashiInsightAdminItem | null;
  } | null>(null);

  // Publish daily set dialog state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishValidation, setPublishValidation] = useState<PublishSetValidationResult | null>(null);
  const [isValidatingPublish, setIsValidatingPublish] = useState(false);
  const [isPublishingSet, setIsPublishingSet] = useState(false);

  // Bulk draft saving state
  const [isSavingDrafts, setIsSavingDrafts] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const [isPending, startTransition] = useTransition();

  // Auto-clear notifications after 6 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleFetchMatrix = (date: string, lang: string) => {
    startTransition(async () => {
      try {
        const res = await getDailyRashiInsightsMatrix({ date, language: lang });
        setMatrix(res);
      } catch (err) {
        console.error("Failed to load daily insights matrix:", err);
        setNotification({ type: 'error', message: 'Failed to refresh matrix data.' });
      }
    });
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    handleFetchMatrix(newDate, selectedLanguage);
  };

  const handleLanguageChange = (newLang: string) => {
    setSelectedLanguage(newLang);
    handleFetchMatrix(selectedDate, newLang);
  };

  const handleStepDay = (delta: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + delta);
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, "0");
    const dd = String(current.getDate()).padStart(2, "0");
    const nextDateStr = \`\${yyyy}-\${mm}-\${dd}\`;
    handleDateChange(nextDateStr);
  };

  // Open compact field-specific modal (ONLY the clicked field)
  const handleOpenFieldEditor = (
    rashi: CanonicalRashi,
    insight: DailyRashiInsightAdminItem | null,
    field: InsightEditableField
  ) => {
    setActiveFieldSlot({
      rashi,
      insight,
      field,
    });
  };

  // Open complete Rashi modal (All fields for the Rashi)
  const handleOpenFullEditor = (
    rashi: CanonicalRashi,
    insight: DailyRashiInsightAdminItem | null
  ) => {
    setActiveFullSlot({
      rashi,
      insight,
    });
  };

  // Bulk Save as Draft
  const handleBulkSaveDrafts = async () => {
    setIsSavingDrafts(true);
    setNotification(null);

    const itemsToSave: DailyRashiInsightFormData[] = matrix.slots
      .filter((slot) => slot.insight !== null)
      .map((slot) => ({
        id: slot.insight?.id,
        insight_date: selectedDate,
        rashi_id: slot.rashi.id,
        language: selectedLanguage,
        general_outlook: slot.insight?.general_outlook || "",
        career_business: slot.insight?.career_business || "",
        finance_wealth: slot.insight?.finance_wealth || "",
        love_relationships: slot.insight?.love_relationships || "",
        health_wellbeing: slot.insight?.health_wellbeing || "",
        auspicious_color: slot.insight?.auspicious_color || "",
        auspicious_number: slot.insight?.auspicious_number || "",
        status: "draft",
      }));

    try {
      const res = await bulkSaveDailyRashiInsightsDrafts(itemsToSave);
      if (res.success) {
        setNotification({ type: 'success', message: res.message || \`Saved \${res.savedCount} drafts.\` });
        handleFetchMatrix(selectedDate, selectedLanguage);
      } else {
        setNotification({
          type: 'error',
          message: res.errors?.join(', ') || res.message || 'Failed to save drafts.',
        });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error occurred while saving drafts.' });
    } finally {
      setIsSavingDrafts(false);
    }
  };

  // Open Publish Daily Set confirmation
  const handleOpenPublishModal = async () => {
    setIsPublishModalOpen(true);
    setIsValidatingPublish(true);
    try {
      const validation = await validateDailySetReadiness({
        date: selectedDate,
        language: selectedLanguage,
      });
      setPublishValidation(validation);
    } catch (err) {
      console.error("Validation error:", err);
    } finally {
      setIsValidatingPublish(false);
    }
  };

  // Confirm Publish Daily Set
  const handleConfirmPublishSet = async (publishReadyOnly: boolean) => {
    setIsPublishingSet(true);
    try {
      const res = await publishDailyRashiInsightsSet({
        date: selectedDate,
        language: selectedLanguage,
        publishReadyOnly,
      });

      if (res.success) {
        setNotification({ type: 'success', message: res.message || 'Daily Set successfully published!' });
        setIsPublishModalOpen(false);
        handleFetchMatrix(selectedDate, selectedLanguage);
      } else {
        setNotification({
          type: 'error',
          message: res.errors?.join(', ') || res.message || 'Failed to publish daily set.',
        });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error publishing daily set.' });
    } finally {
      setIsPublishingSet(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Heading Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/astrology"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Astrology Hub
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Sparkles className="h-6 w-6 text-amber-500" />
            12-Rashi Daily Insights Editorial Matrix
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Curate and publish authoritative daily Vedic planetary transits and guidance across all 12 Rashis from a single screen.
          </p>
        </div>

        {/* Date, Language & Primary Actions Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Picker with Prev/Next buttons */}
          <div className="flex items-center rounded-lg border border-border/70 bg-card p-1 shadow-xs">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleStepDay(-1)}
              title="Previous Day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="h-7 border-none bg-transparent px-2 text-xs font-semibold focus-visible:ring-0"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleStepDay(1)}
              title="Next Day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Language Switcher */}
          <div className="flex items-center rounded-lg border border-border/70 bg-card p-1 shadow-xs text-xs font-medium">
            <button
              onClick={() => handleLanguageChange("en")}
              className={"px-2.5 py-1 rounded transition-colors " + (
                selectedLanguage === "en"
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              English
            </button>
            <button
              onClick={() => handleLanguageChange("hi")}
              className={"px-2.5 py-1 rounded transition-colors " + (
                selectedLanguage === "hi"
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              हिन्दी (Hindi)
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleFetchMatrix(selectedDate, selectedLanguage)}
            disabled={isPending}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={"h-3.5 w-3.5 " + (isPending ? "animate-spin" : "")} />
            Refresh
          </Button>

          {/* Save All as Draft Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBulkSaveDrafts}
            disabled={isSavingDrafts || isPending}
            className="h-9 gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {isSavingDrafts ? "Saving..." : "Save All as Draft"}
          </Button>

          {/* Publish Daily Set Button */}
          <Button
            size="sm"
            onClick={handleOpenPublishModal}
            disabled={isPending}
            className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <Send className="h-3.5 w-3.5" />
            Publish Daily Set
          </Button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={"p-3.5 rounded-lg border text-xs flex items-center justify-between transition-all " + (
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
              : notification.type === 'error'
              ? 'bg-destructive/10 border-destructive/20 text-destructive'
              : 'bg-primary/10 border-primary/20 text-primary'
          )}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Matrix Overview Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/60 bg-card shadow-xs">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Total Rashis
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-foreground">12</span>
            <span className="text-[11px] text-muted-foreground font-mono">Zodiac Signs</span>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-xs">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Published
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-emerald-600">
              {matrix.summary.publishedCount} / 12
            </span>
            <span className="text-[11px] text-emerald-700/80">Active In-App</span>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5 shadow-xs">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Drafts
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-amber-600">
              {matrix.summary.draftCount}
            </span>
            <span className="text-[11px] text-amber-700/80">Saved Drafts</span>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20 bg-rose-500/5 shadow-xs">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Missing Content
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-rose-600">
              {matrix.summary.missingCount}
            </span>
            <span className="text-[11px] text-rose-700/80">Needs Curation</span>
          </CardContent>
        </Card>
      </div>

      {/* Centralized 12-Rashi Editorial Table */}
      <Card className="border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/70 bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 min-w-[170px]">Rashi</th>
                <th className="py-3 px-4 min-w-[220px]">General Outlook</th>
                <th className="py-3 px-4 min-w-[180px]">Career</th>
                <th className="py-3 px-4 min-w-[180px]">Finance</th>
                <th className="py-3 px-4 min-w-[180px]">Love</th>
                <th className="py-3 px-4 w-[110px] text-center">Status</th>
                <th className="py-3 px-4 w-[120px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {matrix.slots.map(({ rashi, insight }: RashiMatrixSlot) => {
                const isPublished = insight?.status === "published";
                const isDraft = insight?.status === "draft";
                const hasGeneral = insight?.general_outlook && insight.general_outlook.trim().length > 0;
                const hasCareer = insight?.career_business && insight.career_business.trim().length > 0;
                const hasFinance = insight?.finance_wealth && insight.finance_wealth.trim().length > 0;
                const hasLove = insight?.love_relationships && insight.love_relationships.trim().length > 0;

                const rowBg = isPublished ? "bg-card" : isDraft ? "bg-amber-500/5" : "bg-card/50";

                return (
                  <tr
                    key={rashi.id}
                    className={"hover:bg-muted/20 transition-colors group " + rowBg}
                  >
                    {/* 1. Rashi Column */}
                    <td className="py-3.5 px-4 font-medium">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl shrink-0">{rashi.symbol}</span>
                        <div>
                          <div className="font-bold text-foreground text-sm flex items-center gap-1.5">
                            {rashi.vedicName}
                            <span className="text-[11px] font-normal text-muted-foreground">
                              ({rashi.englishName})
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {rashi.element} • {rashi.rulingPlanet.split(" ")[0]}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 2. General Outlook Column (Click opens FIELD-SPECIFIC editor for General Outlook) */}
                    <td className="py-3.5 px-4">
                      {hasGeneral ? (
                        <div
                          onClick={() => handleOpenFieldEditor(rashi, insight, 'general_outlook')}
                          className="cursor-pointer group-hover:text-primary transition-colors"
                          title="Click to edit General Outlook ONLY"
                        >
                          <p className="line-clamp-2 text-foreground/90 leading-relaxed text-xs">
                            {insight.general_outlook}
                          </p>
                          <span className="text-[10px] text-primary underline opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 inline-block">
                            Edit Outlook
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenFieldEditor(rashi, insight, 'general_outlook')}
                          className="text-muted-foreground/70 hover:text-primary italic flex items-center gap-1 text-xs py-1 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Enter content
                        </button>
                      )}
                    </td>

                    {/* 3. Career Column (Click opens FIELD-SPECIFIC editor for Career) */}
                    <td className="py-3.5 px-4">
                      {hasCareer ? (
                        <div
                          onClick={() => handleOpenFieldEditor(rashi, insight, 'career_business')}
                          className="cursor-pointer group-hover:text-primary transition-colors"
                          title="Click to edit Career insight ONLY"
                        >
                          <p className="line-clamp-2 text-muted-foreground leading-relaxed text-xs">
                            {insight.career_business}
                          </p>
                          <span className="text-[10px] text-primary underline opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 inline-block">
                            Edit Career
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenFieldEditor(rashi, insight, 'career_business')}
                          className="text-muted-foreground/60 hover:text-primary italic flex items-center gap-1 text-xs py-1 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Add career insight
                        </button>
                      )}
                    </td>

                    {/* 4. Finance Column (Click opens FIELD-SPECIFIC editor for Finance) */}
                    <td className="py-3.5 px-4">
                      {hasFinance ? (
                        <div
                          onClick={() => handleOpenFieldEditor(rashi, insight, 'finance_wealth')}
                          className="cursor-pointer group-hover:text-primary transition-colors"
                          title="Click to edit Finance insight ONLY"
                        >
                          <p className="line-clamp-2 text-muted-foreground leading-relaxed text-xs">
                            {insight.finance_wealth}
                          </p>
                          <span className="text-[10px] text-primary underline opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 inline-block">
                            Edit Finance
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenFieldEditor(rashi, insight, 'finance_wealth')}
                          className="text-muted-foreground/60 hover:text-primary italic flex items-center gap-1 text-xs py-1 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Add finance insight
                        </button>
                      )}
                    </td>

                    {/* 5. Love Column (Click opens FIELD-SPECIFIC editor for Love) */}
                    <td className="py-3.5 px-4">
                      {hasLove ? (
                        <div
                          onClick={() => handleOpenFieldEditor(rashi, insight, 'love_relationships')}
                          className="cursor-pointer group-hover:text-primary transition-colors"
                          title="Click to edit Love insight ONLY"
                        >
                          <p className="line-clamp-2 text-muted-foreground leading-relaxed text-xs">
                            {insight.love_relationships}
                          </p>
                          <span className="text-[10px] text-primary underline opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 inline-block">
                            Edit Love
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenFieldEditor(rashi, insight, 'love_relationships')}
                          className="text-muted-foreground/60 hover:text-primary italic flex items-center gap-1 text-xs py-1 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Add love insight
                        </button>
                      )}
                    </td>

                    {/* 6. Status Column */}
                    <td className="py-3.5 px-4 text-center">
                      {isPublished ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-semibold">
                          Published
                        </Badge>
                      ) : isDraft ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-semibold">
                          Draft
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground/80 border-border text-[10px]">
                          Not Created
                        </Badge>
                      )}
                    </td>

                    {/* 7. Actions Column (Row-level Edit / Create opens COMPLETE multi-field Rashi modal) */}
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        size="sm"
                        variant={insight ? "outline" : "default"}
                        onClick={() => handleOpenFullEditor(rashi, insight)}
                        className="h-7 text-xs gap-1"
                      >
                        {insight ? (
                          <>
                            <Edit3 className="h-3 w-3" />
                            Edit
                          </>
                        ) : (
                          <>
                            <Plus className="h-3 w-3" />
                            Create
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 1. Compact Field-Specific Editor Modal (Contains ONLY the clicked field!) */}
      {activeFieldSlot && (
        <DailyInsightFieldModal
          rashi={activeFieldSlot.rashi}
          date={selectedDate}
          language={selectedLanguage}
          field={activeFieldSlot.field}
          existingInsight={activeFieldSlot.insight}
          isOpen={true}
          onClose={() => setActiveFieldSlot(null)}
          onSuccess={() => {
            handleFetchMatrix(selectedDate, selectedLanguage);
            setNotification({
              type: 'success',
              message: \`Saved \${activeFieldSlot.field.replace('_', ' ')} draft for \${activeFieldSlot.rashi.vedicName}.\`,
            });
          }}
        />
      )}

      {/* 2. Complete Rashi Form & Preview Modal (Contains ALL 7 categories & Mobile Preview) */}
      {activeFullSlot && (
        <DailyInsightsFormModal
          rashi={activeFullSlot.rashi}
          date={selectedDate}
          language={selectedLanguage}
          existingInsight={activeFullSlot.insight}
          isOpen={true}
          onClose={() => setActiveFullSlot(null)}
          onSuccess={() => {
            handleFetchMatrix(selectedDate, selectedLanguage);
            setNotification({
              type: 'success',
              message: \`Saved insight for \${activeFullSlot.rashi.vedicName}.\`,
            });
          }}
        />
      )}

      {/* Publish Daily Set Modal */}
      <PublishDailySetModal
        isOpen={isPublishModalOpen}
        date={selectedDate}
        language={selectedLanguage}
        validation={publishValidation}
        isValidating={isValidatingPublish}
        isPublishing={isPublishingSet}
        onClose={() => setIsPublishModalOpen(false)}
        onConfirmPublish={handleConfirmPublishSet}
        onEditRashi={(rashiId) => {
          setIsPublishModalOpen(false);
          const slot = matrix.slots.find((s) => s.rashi.id === rashiId);
          if (slot) {
            handleOpenFieldEditor(slot.rashi, slot.insight, 'general_outlook');
          }
        }}
      />
    </div>
  );
}
`;

fs.writeFileSync(path.join(adminDir, 'components/admin/astrology/daily-insights/daily-insight-field-modal.tsx'), fieldModalContent, 'utf8');
console.log('Created components/admin/astrology/daily-insights/daily-insight-field-modal.tsx');

fs.writeFileSync(path.join(adminDir, 'components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx'), matrixViewContent, 'utf8');
console.log('Saved updated components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx');

console.log('FIELD-SPECIFIC MODAL INTEGRATION COMPLETED!');

const fs = require('fs');
const path = require('path');

const adminDir = 'C:\\Projects\\kashi-veda-admin';

// 1. Update daily-insights-form-modal.tsx
const formModalContent = `"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { saveDailyRashiInsight } from "@/lib/actions/daily-insights-management";
import type {
  CanonicalRashi,
  DailyRashiInsightAdminItem,
  DailyInsightStatus,
} from "@/lib/types/daily-insights-management";
import { Loader2, X, AlertTriangle, Save, Eye, EyeOff, Send } from "lucide-react";

export type FocusedField = 'general_outlook' | 'career' | 'finance' | 'love' | 'health' | null;

interface DailyInsightsFormModalProps {
  rashi: CanonicalRashi;
  date: string;
  language: string;
  existingInsight?: DailyRashiInsightAdminItem | null;
  initialFocusedField?: FocusedField;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DailyInsightsFormModal({
  rashi,
  date,
  language,
  existingInsight,
  initialFocusedField,
  isOpen,
  onClose,
  onSuccess,
}: DailyInsightsFormModalProps) {
  const [generalOutlook, setGeneralOutlook] = useState("");
  const [careerBusiness, setCareerBusiness] = useState("");
  const [financeWealth, setFinanceWealth] = useState("");
  const [loveRelationships, setLoveRelationships] = useState("");
  const [healthWellbeing, setHealthWellbeing] = useState("");
  const [auspiciousColor, setAuspiciousColor] = useState("");
  const [auspiciousNumber, setAuspiciousNumber] = useState("");
  const [status, setStatus] = useState<DailyInsightStatus>("draft");

  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field element refs for context-aware focus and scroll
  const generalOutlookRef = useRef<HTMLTextAreaElement>(null);
  const careerBusinessRef = useRef<HTMLTextAreaElement>(null);
  const financeWealthRef = useRef<HTMLTextAreaElement>(null);
  const loveRelationshipsRef = useRef<HTMLTextAreaElement>(null);
  const healthWellbeingRef = useRef<HTMLTextAreaElement>(null);

  // Load existing data when modal opens or slot changes
  useEffect(() => {
    if (existingInsight) {
      setGeneralOutlook(existingInsight.general_outlook || "");
      setCareerBusiness(existingInsight.career_business || "");
      setFinanceWealth(existingInsight.finance_wealth || "");
      setLoveRelationships(existingInsight.love_relationships || "");
      setHealthWellbeing(existingInsight.health_wellbeing || "");
      setAuspiciousColor(existingInsight.auspicious_color || "");
      setAuspiciousNumber(existingInsight.auspicious_number != null ? String(existingInsight.auspicious_number) : "");
      setStatus(existingInsight.status || "draft");
    } else {
      setGeneralOutlook("");
      setCareerBusiness("");
      setFinanceWealth("");
      setLoveRelationships("");
      setHealthWellbeing("");
      setAuspiciousColor("");
      setAuspiciousNumber("");
      setStatus("draft");
    }
    setIsPreviewMode(false);
    setError(null);
  }, [existingInsight, rashi.id, date, language, isOpen]);

  // Context-aware focus management: focus and scroll requested field into view
  useEffect(() => {
    if (!isOpen || isPreviewMode) return;

    if (!initialFocusedField) return;

    const targetMap: Record<string, React.RefObject<HTMLTextAreaElement | null>> = {
      general_outlook: generalOutlookRef,
      career: careerBusinessRef,
      finance: financeWealthRef,
      love: loveRelationshipsRef,
      health: healthWellbeingRef,
    };

    const targetRef = targetMap[initialFocusedField];
    if (!targetRef) return;

    // Small delay to ensure DOM is fully rendered and animated in
    const timer = setTimeout(() => {
      const el = targetRef.current;
      if (el) {
        el.focus();
        if (el.value) {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [isOpen, isPreviewMode, initialFocusedField, rashi.id, date, language]);

  if (!isOpen) return null;

  const handleSubmit = async (targetStatus: DailyInsightStatus) => {
    setError(null);

    if (targetStatus === "published" && !generalOutlook.trim()) {
      setError("General Outlook is mandatory before publishing this insight.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await saveDailyRashiInsight({
        id: existingInsight?.id,
        insight_date: date,
        rashi_id: rashi.id,
        language,
        general_outlook: generalOutlook,
        career_business: careerBusiness,
        finance_wealth: financeWealth,
        love_relationships: loveRelationships,
        health_wellbeing: healthWellbeing,
        auspicious_color: auspiciousColor,
        auspicious_number: auspiciousNumber,
        status: targetStatus,
      });

      if (!res.success) {
        setError(res.error || "Failed to save daily insight.");
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setIsSubmitting(false);
    }
  };

  const statusBadgeColor = status === "published"
    ? "bg-emerald-500/10 text-emerald-600"
    : "bg-amber-500/10 text-amber-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border-border bg-card my-auto">
        {/* Modal Header */}
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{rashi.symbol}</span>
              <h2 className="text-lg font-bold text-foreground">
                {rashi.vedicName} ({rashi.englishName}) • Daily Insight
              </h2>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Date: <span className="font-semibold text-foreground">{date}</span> • Language:{" "}
              <span className="font-semibold uppercase text-foreground">{language}</span> • Ruling Planet:{" "}
              <span>{rashi.rulingPlanet}</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              className="h-8 text-xs gap-1.5"
            >
              {isPreviewMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {isPreviewMode ? "Edit Form" : "Mobile Preview"}
            </Button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>

        {/* Scrollable Modal Body */}
        <CardContent className="overflow-y-auto py-5 space-y-4 text-sm flex-1">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isPreviewMode ? (
            /* Mobile Feed Preview Simulation */
            <div className="rounded-xl border border-border/80 bg-neutral-950 p-4 space-y-3.5 max-w-md mx-auto shadow-inner text-neutral-100 font-sans">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{rashi.symbol}</span>
                  <div>
                    <h4 className="text-sm font-bold text-amber-400">{rashi.vedicName} ({rashi.englishName})</h4>
                    <span className="text-[10px] text-neutral-400 font-mono">{date} • {rashi.element} Sign</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                  {status === 'published' ? 'Published' : 'Draft Preview'}
                </Badge>
              </div>

              {(auspiciousColor || auspiciousNumber) && (
                <div className="flex items-center justify-around bg-neutral-900/80 rounded-lg p-2 text-xs border border-neutral-800">
                  {auspiciousColor && <span>🎨 Color: <strong>{auspiciousColor}</strong></span>}
                  {auspiciousNumber && <span>🔢 Lucky No: <strong>{auspiciousNumber}</strong></span>}
                </div>
              )}

              <div className="space-y-2">
                <h5 className="text-xs font-bold text-amber-300">🌟 दैनिक राशिफल (General Outlook)</h5>
                <p className="text-xs leading-relaxed text-neutral-200">
                  {generalOutlook || <span className="text-neutral-500 italic">No general outlook provided.</span>}
                </p>
              </div>

              {careerBusiness && (
                <div className="space-y-1 bg-neutral-900/50 p-2.5 rounded-md border border-neutral-800/60">
                  <h6 className="text-[11px] font-semibold text-neutral-300">💼 Career & Business</h6>
                  <p className="text-xs text-neutral-300 leading-relaxed">{careerBusiness}</p>
                </div>
              )}

              {financeWealth && (
                <div className="space-y-1 bg-neutral-900/50 p-2.5 rounded-md border border-neutral-800/60">
                  <h6 className="text-[11px] font-semibold text-neutral-300">💰 Finance & Wealth</h6>
                  <p className="text-xs text-neutral-300 leading-relaxed">{financeWealth}</p>
                </div>
              )}

              {loveRelationships && (
                <div className="space-y-1 bg-neutral-900/50 p-2.5 rounded-md border border-neutral-800/60">
                  <h6 className="text-[11px] font-semibold text-neutral-300">❤️ Love & Relationships</h6>
                  <p className="text-xs text-neutral-300 leading-relaxed">{loveRelationships}</p>
                </div>
              )}

              {healthWellbeing && (
                <div className="space-y-1 bg-neutral-900/50 p-2.5 rounded-md border border-neutral-800/60">
                  <h6 className="text-[11px] font-semibold text-neutral-300">🌿 Health & Wellbeing</h6>
                  <p className="text-xs text-neutral-300 leading-relaxed">{healthWellbeing}</p>
                </div>
              )}
            </div>
          ) : (
            /* Standard Edit Form with Field Refs & Focus Indicators */
            <div className="space-y-4">
              {/* General Outlook */}
              <div className="space-y-1.5">
                <Label htmlFor="general_outlook" className="font-semibold text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    General Outlook <span className="text-destructive">*</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    {generalOutlook.length} characters (Required for publication)
                  </span>
                </Label>
                <textarea
                  id="general_outlook"
                  ref={generalOutlookRef}
                  rows={3}
                  value={generalOutlook}
                  onChange={(e) => setGeneralOutlook(e.target.value)}
                  placeholder="Enter overall planetary influence, cosmic energy, and general day guidance..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                />
              </div>

              {/* Categorized Sections Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Career & Business */}
                <div className="space-y-1.5">
                  <Label htmlFor="career" className="font-semibold text-xs text-muted-foreground">
                    💼 Career & Business <span className="text-[10px] font-normal">(Optional)</span>
                  </Label>
                  <textarea
                    id="career"
                    ref={careerBusinessRef}
                    rows={2}
                    value={careerBusiness}
                    onChange={(e) => setCareerBusiness(e.target.value)}
                    placeholder="Professional decisions, office dynamics, deals..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  />
                </div>

                {/* Finance & Wealth */}
                <div className="space-y-1.5">
                  <Label htmlFor="finance" className="font-semibold text-xs text-muted-foreground">
                    💰 Finance & Wealth <span className="text-[10px] font-normal">(Optional)</span>
                  </Label>
                  <textarea
                    id="finance"
                    ref={financeWealthRef}
                    rows={2}
                    value={financeWealth}
                    onChange={(e) => setFinanceWealth(e.target.value)}
                    placeholder="Investments, expenditures, financial caution..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  />
                </div>

                {/* Love & Relationships */}
                <div className="space-y-1.5">
                  <Label htmlFor="love" className="font-semibold text-xs text-muted-foreground">
                    ❤️ Love & Relationships <span className="text-[10px] font-normal">(Optional)</span>
                  </Label>
                  <textarea
                    id="love"
                    ref={loveRelationshipsRef}
                    rows={2}
                    value={loveRelationships}
                    onChange={(e) => setLoveRelationships(e.target.value)}
                    placeholder="Family harmony, romantic transit, communication..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  />
                </div>

                {/* Health & Wellbeing */}
                <div className="space-y-1.5">
                  <Label htmlFor="health" className="font-semibold text-xs text-muted-foreground">
                    🌿 Health & Wellbeing <span className="text-[10px] font-normal">(Optional)</span>
                  </Label>
                  <textarea
                    id="health"
                    ref={healthWellbeingRef}
                    rows={2}
                    value={healthWellbeing}
                    onChange={(e) => setHealthWellbeing(e.target.value)}
                    placeholder="Vitality, mental peace, physical wellness tips..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  />
                </div>
              </div>

              {/* Auspicious Guidance Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/40">
                <div className="space-y-1.5">
                  <Label htmlFor="auspicious_color" className="font-semibold text-xs text-muted-foreground">
                    🎨 Auspicious Colour
                  </Label>
                  <Input
                    id="auspicious_color"
                    value={auspiciousColor}
                    onChange={(e) => setAuspiciousColor(e.target.value)}
                    placeholder="e.g. Saffron Yellow, Royal Red, Pearl White"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="auspicious_number" className="font-semibold text-xs text-muted-foreground">
                    🔢 Auspicious Number
                  </Label>
                  <Input
                    id="auspicious_number"
                    value={auspiciousNumber}
                    onChange={(e) => setAuspiciousNumber(e.target.value)}
                    placeholder="e.g. 3, 7, 9"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-6 py-3.5 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Status:</span>
            <span className={"font-semibold uppercase px-2 py-0.5 rounded text-[11px] " + statusBadgeColor}>
              {existingInsight?.status || "Not Created"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSubmit("draft")}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              Save Draft
            </Button>
            <Button
              size="sm"
              onClick={() => handleSubmit("published")}
              disabled={isSubmitting}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Publish This Rashi
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
`;

// 2. Update daily-insights-matrix-view.tsx to ensure handleOpenEditor passes null when opening without a specific field
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
  saveDailyRashiInsight,
} from "@/lib/actions/daily-insights-management";
import type {
  CanonicalRashi,
  DailyRashiInsightAdminItem,
  DailyInsightsMatrixResponse,
  RashiMatrixSlot,
  PublishSetValidationResult,
  DailyRashiInsightFormData,
} from "@/lib/types/daily-insights-management";
import { DailyInsightsFormModal, type FocusedField } from "./daily-insights-form-modal";
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
  Check,
} from "lucide-react";

interface DailyInsightsMatrixViewProps {
  initialData: DailyInsightsMatrixResponse;
}

export function DailyInsightsMatrixView({ initialData }: DailyInsightsMatrixViewProps) {
  const [matrix, setMatrix] = useState<DailyInsightsMatrixResponse>(initialData);
  const [selectedDate, setSelectedDate] = useState<string>(initialData.date);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialData.language);

  // Active individual modal state
  const [activeModalSlot, setActiveModalSlot] = useState<{
    rashi: CanonicalRashi;
    insight: DailyRashiInsightAdminItem | null;
    initialFocusedField?: FocusedField;
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

  // Open modal with context-aware field focus (or null if general action clicked)
  const handleOpenEditor = (
    rashi: CanonicalRashi,
    insight: DailyRashiInsightAdminItem | null,
    field?: FocusedField
  ) => {
    setActiveModalSlot({
      rashi,
      insight,
      initialFocusedField: field ?? null,
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

                    {/* 2. General Outlook Column */}
                    <td className="py-3.5 px-4">
                      {hasGeneral ? (
                        <div
                          onClick={() => handleOpenEditor(rashi, insight, 'general_outlook')}
                          className="cursor-pointer group-hover:text-primary transition-colors"
                          title="Click to edit General Outlook"
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
                          onClick={() => handleOpenEditor(rashi, insight, 'general_outlook')}
                          className="text-muted-foreground/70 hover:text-primary italic flex items-center gap-1 text-xs py-1 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Enter content
                        </button>
                      )}
                    </td>

                    {/* 3. Career Column */}
                    <td className="py-3.5 px-4">
                      {hasCareer ? (
                        <div
                          onClick={() => handleOpenEditor(rashi, insight, 'career')}
                          className="cursor-pointer group-hover:text-primary transition-colors"
                          title="Click to edit Career insight"
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
                          onClick={() => handleOpenEditor(rashi, insight, 'career')}
                          className="text-muted-foreground/60 hover:text-primary italic flex items-center gap-1 text-xs py-1 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Add career insight
                        </button>
                      )}
                    </td>

                    {/* 4. Finance Column */}
                    <td className="py-3.5 px-4">
                      {hasFinance ? (
                        <div
                          onClick={() => handleOpenEditor(rashi, insight, 'finance')}
                          className="cursor-pointer group-hover:text-primary transition-colors"
                          title="Click to edit Finance insight"
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
                          onClick={() => handleOpenEditor(rashi, insight, 'finance')}
                          className="text-muted-foreground/60 hover:text-primary italic flex items-center gap-1 text-xs py-1 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Add finance insight
                        </button>
                      )}
                    </td>

                    {/* 5. Love Column */}
                    <td className="py-3.5 px-4">
                      {hasLove ? (
                        <div
                          onClick={() => handleOpenEditor(rashi, insight, 'love')}
                          className="cursor-pointer group-hover:text-primary transition-colors"
                          title="Click to edit Love insight"
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
                          onClick={() => handleOpenEditor(rashi, insight, 'love')}
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

                    {/* 7. Actions Column */}
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        size="sm"
                        variant={insight ? "outline" : "default"}
                        onClick={() => handleOpenEditor(rashi, insight)}
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

      {/* Individual Form & Preview Modal */}
      {activeModalSlot && (
        <DailyInsightsFormModal
          rashi={activeModalSlot.rashi}
          date={selectedDate}
          language={selectedLanguage}
          existingInsight={activeModalSlot.insight}
          initialFocusedField={activeModalSlot.initialFocusedField}
          isOpen={true}
          onClose={() => setActiveModalSlot(null)}
          onSuccess={() => {
            handleFetchMatrix(selectedDate, selectedLanguage);
            setNotification({
              type: 'success',
              message: \`Saved insight for \${activeModalSlot.rashi.vedicName}.\`,
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
            handleOpenEditor(slot.rashi, slot.insight, 'general_outlook');
          }
        }}
      />
    </div>
  );
}
`;

fs.writeFileSync(path.join(adminDir, 'components/admin/astrology/daily-insights/daily-insights-form-modal.tsx'), formModalContent, 'utf8');
console.log('Saved updated components/admin/astrology/daily-insights/daily-insights-form-modal.tsx');

fs.writeFileSync(path.join(adminDir, 'components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx'), matrixViewContent, 'utf8');
console.log('Saved updated components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx');

console.log('FIELD FOCUS INTERACTION UPDATE COMPLETED!');

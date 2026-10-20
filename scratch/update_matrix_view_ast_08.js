const fs = require('fs');
const path = require('path');

const adminRoot = 'C:/Projects/kashi-veda-admin';
const targetFile = path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx');

const matrixViewCode = `"use client";

import { useState, useTransition, useEffect, useRef } from "react";
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
import {
  getMatrixIdentityKey,
  isMatrixSynced,
  MatrixRequestCoordinator,
} from "@/lib/astrology/daily-insights-matrix-coordinator";
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
import { BulkImportModal } from "./bulk-import-modal";
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
  FileSpreadsheet,
} from "lucide-react";

interface DailyInsightsMatrixViewProps {
  initialData: DailyInsightsMatrixResponse;
}

interface ActiveFieldSlotState {
  rashi: CanonicalRashi;
  insight: DailyRashiInsightAdminItem | null;
  field: InsightEditableField;
  boundDate: string;
  boundLanguage: string;
  boundMatrixKey: string;
}

interface ActiveFullSlotState {
  rashi: CanonicalRashi;
  insight: DailyRashiInsightAdminItem | null;
  boundDate: string;
  boundLanguage: string;
  boundMatrixKey: string;
}

export function DailyInsightsMatrixView({ initialData }: DailyInsightsMatrixViewProps) {
  // Authoritative matrix data loaded from database
  const [matrix, setMatrix] = useState<DailyInsightsMatrixResponse>(initialData);
  // Selected filter controls
  const [selectedDate, setSelectedDate] = useState<string>(initialData.date);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialData.language);
  // Explicit request failure state
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 1. Compact Field-Specific Editor Modal State
  const [activeFieldSlot, setActiveFieldSlot] = useState<ActiveFieldSlotState | null>(null);

  // 2. Complete Rashi Editor Modal State
  const [activeFullSlot, setActiveFullSlot] = useState<ActiveFullSlotState | null>(null);

  // 3. Bulk CSV Import Modal State
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);

  // 4. Publish daily set dialog state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishValidation, setPublishValidation] = useState<PublishSetValidationResult | null>(null);
  const [isValidatingPublish, setIsValidatingPublish] = useState(false);
  const [isPublishingSet, setIsPublishingSet] = useState(false);

  // Bulk draft saving state
  const [isSavingDrafts, setIsSavingDrafts] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const [isPending, startTransition] = useTransition();

  // AST-08 Matrix Coordination & Lifecycle Refs
  const coordinatorRef = useRef(new MatrixRequestCoordinator());
  const selectedKeyRef = useRef(getMatrixIdentityKey(initialData.date, initialData.language));
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      coordinatorRef.current.invalidate();
    };
  }, []);

  // Compute synchronization predicates
  const selectedKey = getMatrixIdentityKey(selectedDate, selectedLanguage);
  const loadedKey = getMatrixIdentityKey(matrix.date, matrix.language);
  const isSynced = isMatrixSynced({
    selectedDate,
    selectedLanguage,
    loadedDate: matrix.date,
    loadedLanguage: matrix.language,
    isPending,
    hasError: Boolean(fetchError),
  });

  // Auto-clear notifications after 6 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleFetchMatrix = (targetDate: string, targetLang: string) => {
    const token = coordinatorRef.current.startRequest(targetDate, targetLang);
    setFetchError(null);

    startTransition(async () => {
      try {
        const res = await getDailyRashiInsightsMatrix({ date: targetDate, language: targetLang });
        if (!isMountedRef.current) return;

        // AST-08: Reject out-of-order or obsolete response
        if (token !== coordinatorRef.current.getCurrentGeneration()) {
          return;
        }
        if (getMatrixIdentityKey(res.date, res.language) !== selectedKeyRef.current) {
          return;
        }

        setMatrix(res);
        setFetchError(null);
      } catch (err: any) {
        if (!isMountedRef.current) return;

        // AST-08: Reject obsolete request failure
        if (token !== coordinatorRef.current.getCurrentGeneration()) {
          return;
        }

        const msg = err.message || "Failed to load daily insights matrix.";
        setFetchError(msg);
        setNotification({ type: 'error', message: msg });
      }
    });
  };

  const handleDateChange = (newDate: string) => {
    // AST-08: Invalidate open modals immediately on filter change
    setActiveFieldSlot(null);
    setActiveFullSlot(null);
    setIsPublishModalOpen(false);
    setIsBulkImportOpen(false);

    setSelectedDate(newDate);
    selectedKeyRef.current = getMatrixIdentityKey(newDate, selectedLanguage);
    handleFetchMatrix(newDate, selectedLanguage);
  };

  const handleLanguageChange = (newLang: string) => {
    // AST-08: Invalidate open modals immediately on filter change
    setActiveFieldSlot(null);
    setActiveFullSlot(null);
    setIsPublishModalOpen(false);
    setIsBulkImportOpen(false);

    setSelectedLanguage(newLang);
    selectedKeyRef.current = getMatrixIdentityKey(selectedDate, newLang);
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
    if (!isSynced) {
      setNotification({
        type: 'error',
        message: 'Cannot edit: matrix data is loading or desynchronized with selected date/language.',
      });
      return;
    }
    setActiveFieldSlot({
      rashi,
      insight,
      field,
      boundDate: matrix.date,
      boundLanguage: matrix.language,
      boundMatrixKey: loadedKey,
    });
  };

  // Open complete Rashi modal (All fields for the Rashi)
  const handleOpenFullEditor = (
    rashi: CanonicalRashi,
    insight: DailyRashiInsightAdminItem | null
  ) => {
    if (!isSynced) {
      setNotification({
        type: 'error',
        message: 'Cannot edit: matrix data is loading or desynchronized with selected date/language.',
      });
      return;
    }
    setActiveFullSlot({
      rashi,
      insight,
      boundDate: matrix.date,
      boundLanguage: matrix.language,
      boundMatrixKey: loadedKey,
    });
  };

  // Bulk Save as Draft (Strictly bound to loaded matrix identity)
  const handleBulkSaveDrafts = async () => {
    if (!isSynced) {
      setNotification({
        type: 'error',
        message: 'Cannot save drafts: matrix is loading or desynchronized with selected date/language.',
      });
      return;
    }

    setIsSavingDrafts(true);
    setNotification(null);

    // AST-08: Derive write key strictly from authoritative loaded matrix key
    const itemsToSave: DailyRashiInsightFormData[] = matrix.slots
      .filter((slot) => slot.insight !== null)
      .map((slot) => ({
        id: slot.insight?.id,
        insight_date: matrix.date,
        rashi_id: slot.rashi.id,
        language: matrix.language,
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
        handleFetchMatrix(matrix.date, matrix.language);
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
    if (!isSynced) {
      setNotification({
        type: 'error',
        message: 'Cannot publish set: matrix is loading or desynchronized with selected date/language.',
      });
      return;
    }

    setIsPublishModalOpen(true);
    setIsValidatingPublish(true);
    try {
      const validation = await validateDailySetReadiness({
        date: matrix.date,
        language: matrix.language,
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
    if (!isSynced) {
      setNotification({
        type: 'error',
        message: 'Cannot publish set: matrix is loading or desynchronized with selected date/language.',
      });
      return;
    }

    setIsPublishingSet(true);
    try {
      const res = await publishDailyRashiInsightsSet({
        date: matrix.date,
        language: matrix.language,
        publishReadyOnly,
      });

      if (res.success) {
        setNotification({ type: 'success', message: res.message || 'Daily Set successfully published!' });
        setIsPublishModalOpen(false);
        handleFetchMatrix(matrix.date, matrix.language);
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

  // Open Bulk CSV Import
  const handleOpenBulkImport = () => {
    if (!isSynced) {
      setNotification({
        type: 'error',
        message: 'Cannot open CSV importer: matrix is loading or desynchronized with selected date/language.',
      });
      return;
    }
    setIsBulkImportOpen(true);
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
            Curate and publish authoritative daily Vedic planetary transits across all 12 Rashis via single-field edits, full form, or bulk CSV import.
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

          {/* Bulk Import Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenBulkImport}
            disabled={!isSynced || isPending}
            className="h-9 gap-1.5 border-amber-500/40 hover:bg-amber-500/10 text-amber-400"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-amber-500" />
            Bulk Import
          </Button>

          {/* Save All as Draft Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBulkSaveDrafts}
            disabled={!isSynced || isSavingDrafts || isPending}
            className="h-9 gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {isSavingDrafts ? "Saving..." : "Save All as Draft"}
          </Button>

          {/* Publish Daily Set Button */}
          <Button
            size="sm"
            onClick={handleOpenPublishModal}
            disabled={!isSynced || isPending}
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

      {/* AST-08 Matrix Desynchronization & Loading Indicators */}
      {fetchError && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-xs">
          <CardContent className="py-4 px-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <div className="font-semibold text-destructive text-sm">
                  Failed to load daily insights for {selectedDate} ({selectedLanguage.toUpperCase()})
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fetchError}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFetchMatrix(selectedDate, selectedLanguage)}
              className="gap-1.5 shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry Request
            </Button>
          </CardContent>
        </Card>
      )}

      {!isSynced && !fetchError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 animate-spin" />
            <span>
              <strong>Loading matrix for {selectedDate} ({selectedLanguage.toUpperCase()}):</strong> Table data currently displays {matrix.date} ({matrix.language.toUpperCase()}). All editing and publishing actions are locked until loaded.
            </span>
          </div>
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
              {matrix.summary.publishedCount}
            </span>
            <span className="text-[11px] text-emerald-700/80">Live in App</span>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5 shadow-xs">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Draft
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
                          onClick={() => isSynced && handleOpenFieldEditor(rashi, insight, 'general_outlook')}
                          className={isSynced ? "cursor-pointer group-hover:text-primary transition-colors" : "cursor-not-allowed opacity-60"}
                          title={isSynced ? "Click to edit General Outlook ONLY" : "Editing locked while matrix is loading or desynchronized"}
                        >
                          <p className="line-clamp-2 text-foreground/90 leading-relaxed text-xs">
                            {insight.general_outlook}
                          </p>
                          {isSynced && (
                            <span className="text-[10px] text-primary underline opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 inline-block">
                              Edit Outlook
                            </span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => isSynced && handleOpenFieldEditor(rashi, insight, 'general_outlook')}
                          disabled={!isSynced}
                          className={"text-muted-foreground/70 flex items-center gap-1 text-xs py-1 transition-colors " + (isSynced ? "hover:text-primary italic" : "cursor-not-allowed opacity-60")}
                          title={isSynced ? "Add general outlook" : "Editing locked"}
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
                          onClick={() => isSynced && handleOpenFieldEditor(rashi, insight, 'career_business')}
                          className={isSynced ? "cursor-pointer group-hover:text-primary transition-colors" : "cursor-not-allowed opacity-60"}
                          title={isSynced ? "Click to edit Career insight ONLY" : "Editing locked"}
                        >
                          <p className="line-clamp-2 text-muted-foreground leading-relaxed text-xs">
                            {insight.career_business}
                          </p>
                          {isSynced && (
                            <span className="text-[10px] text-primary underline opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 inline-block">
                              Edit Career
                            </span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => isSynced && handleOpenFieldEditor(rashi, insight, 'career_business')}
                          disabled={!isSynced}
                          className={"text-muted-foreground/60 flex items-center gap-1 text-xs py-1 transition-colors " + (isSynced ? "hover:text-primary italic" : "cursor-not-allowed opacity-60")}
                          title={isSynced ? "Add career insight" : "Editing locked"}
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
                          onClick={() => isSynced && handleOpenFieldEditor(rashi, insight, 'finance_wealth')}
                          className={isSynced ? "cursor-pointer group-hover:text-primary transition-colors" : "cursor-not-allowed opacity-60"}
                          title={isSynced ? "Click to edit Finance insight ONLY" : "Editing locked"}
                        >
                          <p className="line-clamp-2 text-muted-foreground leading-relaxed text-xs">
                            {insight.finance_wealth}
                          </p>
                          {isSynced && (
                            <span className="text-[10px] text-primary underline opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 inline-block">
                              Edit Finance
                            </span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => isSynced && handleOpenFieldEditor(rashi, insight, 'finance_wealth')}
                          disabled={!isSynced}
                          className={"text-muted-foreground/60 flex items-center gap-1 text-xs py-1 transition-colors " + (isSynced ? "hover:text-primary italic" : "cursor-not-allowed opacity-60")}
                          title={isSynced ? "Add finance insight" : "Editing locked"}
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
                          onClick={() => isSynced && handleOpenFieldEditor(rashi, insight, 'love_relationships')}
                          className={isSynced ? "cursor-pointer group-hover:text-primary transition-colors" : "cursor-not-allowed opacity-60"}
                          title={isSynced ? "Click to edit Love insight ONLY" : "Editing locked"}
                        >
                          <p className="line-clamp-2 text-muted-foreground leading-relaxed text-xs">
                            {insight.love_relationships}
                          </p>
                          {isSynced && (
                            <span className="text-[10px] text-primary underline opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 inline-block">
                              Edit Love
                            </span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => isSynced && handleOpenFieldEditor(rashi, insight, 'love_relationships')}
                          disabled={!isSynced}
                          className={"text-muted-foreground/60 flex items-center gap-1 text-xs py-1 transition-colors " + (isSynced ? "hover:text-primary italic" : "cursor-not-allowed opacity-60")}
                          title={isSynced ? "Add love insight" : "Editing locked"}
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
                        onClick={() => handleOpenFullEditor(rashi, insight)}
                        disabled={!isSynced}
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

      {/* 1. Compact Field-Specific Editor Modal */}
      {activeFieldSlot && (
        <DailyInsightFieldModal
          rashi={activeFieldSlot.rashi}
          date={activeFieldSlot.boundDate}
          language={activeFieldSlot.boundLanguage}
          boundMatrixKey={activeFieldSlot.boundMatrixKey}
          currentSelectedKey={selectedKey}
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

      {/* 2. Complete Rashi Form & Preview Modal */}
      {activeFullSlot && (
        <DailyInsightsFormModal
          rashi={activeFullSlot.rashi}
          date={activeFullSlot.boundDate}
          language={activeFullSlot.boundLanguage}
          boundMatrixKey={activeFullSlot.boundMatrixKey}
          currentSelectedKey={selectedKey}
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

      {/* 3. Bulk CSV Import Modal */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        selectedDate={matrix.date}
        selectedLanguage={matrix.language}
        existingInsights={matrix.slots.map((s) => s.insight)}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={() => {
          handleFetchMatrix(selectedDate, selectedLanguage);
          setNotification({
            type: 'success',
            message: 'Bulk CSV import completed successfully. All records saved as drafts.',
          });
        }}
      />

      {/* 4. Publish Daily Set Modal */}
      <PublishDailySetModal
        isOpen={isPublishModalOpen}
        date={matrix.date}
        language={matrix.language}
        validation={publishValidation}
        isValidating={isValidatingPublish}
        isPublishing={isPublishingSet}
        onClose={() => setIsPublishModalOpen(false)}
        onConfirmPublish={handleConfirmPublishSet}
        onEditRashi={(rashiId) => {
          setIsPublishModalOpen(false);
          const slot = matrix.slots.find((s) => s.rashi.id === rashiId);
          if (slot && isSynced) {
            handleOpenFieldEditor(slot.rashi, slot.insight, 'general_outlook');
          }
        }}
      />
    </div>
  );
}
`;

fs.writeFileSync(targetFile, matrixViewCode, 'utf8');
console.log('Successfully updated daily-insights-matrix-view.tsx!');

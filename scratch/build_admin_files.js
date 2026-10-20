const fs = require('fs');
const path = require('path');

const adminRoot = 'C:/Projects/kashi-veda-admin';

// 1. types/daily-insights-management.ts
const typesContent = `export interface CanonicalRashi {
  id: number;
  vedicName: string;
  englishName: string;
  symbol: string;
  element: 'Fire' | 'Earth' | 'Air' | 'Water';
  rulingPlanet: string;
}

export const CANONICAL_RASHIS: CanonicalRashi[] = [
  { id: 1, vedicName: 'Mesha', englishName: 'Aries', symbol: '♈', element: 'Fire', rulingPlanet: 'Mars (Mangal)' },
  { id: 2, vedicName: 'Vrishabha', englishName: 'Taurus', symbol: '♉', element: 'Earth', rulingPlanet: 'Venus (Shukra)' },
  { id: 3, vedicName: 'Mithuna', englishName: 'Gemini', symbol: '♊', element: 'Air', rulingPlanet: 'Mercury (Budh)' },
  { id: 4, vedicName: 'Karka', englishName: 'Cancer', symbol: '♋', element: 'Water', rulingPlanet: 'Moon (Chandra)' },
  { id: 5, vedicName: 'Simha', englishName: 'Leo', symbol: '♌', element: 'Fire', rulingPlanet: 'Sun (Surya)' },
  { id: 6, vedicName: 'Kanya', englishName: 'Virgo', symbol: '♍', element: 'Earth', rulingPlanet: 'Mercury (Budh)' },
  { id: 7, vedicName: 'Tula', englishName: 'Libra', symbol: '♎', element: 'Air', rulingPlanet: 'Venus (Shukra)' },
  { id: 8, vedicName: 'Vrishchika', englishName: 'Scorpio', symbol: '♏', element: 'Water', rulingPlanet: 'Mars (Mangal)' },
  { id: 9, vedicName: 'Dhanu', englishName: 'Sagittarius', symbol: '♐', element: 'Fire', rulingPlanet: 'Jupiter (Guru)' },
  { id: 10, vedicName: 'Makara', englishName: 'Capricorn', symbol: '♑', element: 'Earth', rulingPlanet: 'Saturn (Shani)' },
  { id: 11, vedicName: 'Kumbha', englishName: 'Aquarius', symbol: '♒', element: 'Air', rulingPlanet: 'Saturn (Shani)' },
  { id: 12, vedicName: 'Meena', englishName: 'Pisces', symbol: '♓', element: 'Water', rulingPlanet: 'Jupiter (Guru)' },
];

export type DailyInsightStatus = 'draft' | 'published';

export interface DailyRashiInsightAdminItem {
  id?: string;
  insight_date: string;
  rashi_id: number;
  rashi_name?: string;
  rashi_vedic_name?: string;
  language: string;
  general_outlook: string;
  career_business?: string | null;
  finance_wealth?: string | null;
  love_relationships?: string | null;
  health_wellbeing?: string | null;
  auspicious_color?: string | null;
  auspicious_number?: string | null;
  status: DailyInsightStatus;
  published_at?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DailyRashiInsightFormData {
  id?: string;
  insight_date: string;
  rashi_id: number;
  language: string;
  general_outlook: string;
  career_business?: string;
  finance_wealth?: string;
  love_relationships?: string;
  health_wellbeing?: string;
  auspicious_color?: string;
  auspicious_number?: string;
  status: DailyInsightStatus;
}

export interface RashiMatrixSlot {
  rashi: CanonicalRashi;
  insight: DailyRashiInsightAdminItem | null;
}

export interface DailyInsightsMatrixResponse {
  date: string;
  language: string;
  slots: RashiMatrixSlot[];
  summary: {
    totalRashis: number;
    publishedCount: number;
    draftCount: number;
    missingCount: number;
  };
}
`;

fs.writeFileSync(path.join(adminRoot, 'lib/types/daily-insights-management.ts'), typesContent, 'utf8');
console.log('Wrote lib/types/daily-insights-management.ts');

// 2. lib/actions/daily-insights-management.ts
const actionsContent = `/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/roles";
import { revalidatePath } from "next/cache";
import {
  CANONICAL_RASHIS,
  type DailyRashiInsightAdminItem,
  type DailyRashiInsightFormData,
  type DailyInsightsMatrixResponse,
} from "@/lib/types/daily-insights-management";

// =============================================================================
// 1. GET 12-RASHI MATRIX FOR SPECIFIC DATE & LANGUAGE
// =============================================================================
export async function getDailyRashiInsightsMatrix(params: {
  date: string;
  language?: string;
}): Promise<DailyInsightsMatrixResponse> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const date = params.date;
  const language = params.language || "en";

  // Query daily_rashi_insights for the selected date and language
  const { data, error } = await supabase
    .from("daily_rashi_insights")
    .select("*")
    .eq("insight_date", date)
    .eq("language", language);

  const rows: DailyRashiInsightAdminItem[] = (data || []).map((row: any) => ({
    id: row.id,
    insight_date: row.insight_date,
    rashi_id: row.rashi_id,
    language: row.language,
    general_outlook: row.general_outlook,
    career_business: row.career_business,
    finance_wealth: row.finance_wealth,
    love_relationships: row.love_relationships,
    health_wellbeing: row.health_wellbeing,
    auspicious_color: row.auspicious_color,
    auspicious_number: row.auspicious_number,
    status: row.status,
    published_at: row.published_at,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const insightMap = new Map<number, DailyRashiInsightAdminItem>();
  rows.forEach((item) => {
    insightMap.set(item.rashi_id, item);
  });

  let publishedCount = 0;
  let draftCount = 0;
  let missingCount = 0;

  const slots = CANONICAL_RASHIS.map((rashi) => {
    const insight = insightMap.get(rashi.id) || null;
    if (!insight) {
      missingCount++;
    } else if (insight.status === "published") {
      publishedCount++;
    } else {
      draftCount++;
    }
    return {
      rashi,
      insight,
    };
  });

  return {
    date,
    language,
    slots,
    summary: {
      totalRashis: 12,
      publishedCount,
      draftCount,
      missingCount,
    },
  };
}

// =============================================================================
// 2. SAVE OR PUBLISH DAILY RASHI INSIGHT
// =============================================================================
export async function saveDailyRashiInsight(
  formData: DailyRashiInsightFormData
): Promise<{ success: boolean; data?: any; error?: string }> {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);

  // Validation
  if (!formData.insight_date || !formData.rashi_id || !formData.language) {
    return { success: false, error: "Date, Rashi, and Language are required." };
  }

  if (formData.rashi_id < 1 || formData.rashi_id > 12) {
    return { success: false, error: "Rashi ID must be between 1 and 12." };
  }

  if (formData.status === "published" && !formData.general_outlook?.trim()) {
    return { success: false, error: "General Outlook is mandatory before publishing an insight." };
  }

  const payload: any = {
    insight_date: formData.insight_date,
    rashi_id: formData.rashi_id,
    language: formData.language.trim().toLowerCase(),
    general_outlook: (formData.general_outlook || "").trim(),
    career_business: formData.career_business ? formData.career_business.trim() : null,
    finance_wealth: formData.finance_wealth ? formData.finance_wealth.trim() : null,
    love_relationships: formData.love_relationships ? formData.love_relationships.trim() : null,
    health_wellbeing: formData.health_wellbeing ? formData.health_wellbeing.trim() : null,
    auspicious_color: formData.auspicious_color ? formData.auspicious_color.trim() : null,
    auspicious_number: formData.auspicious_number ? formData.auspicious_number.trim() : null,
    status: formData.status,
    published_at: formData.status === "published" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  try {
    let resultData: any = null;

    if (formData.id) {
      // Update by primary key ID
      const { data, error } = await supabase
        .from("daily_rashi_insights")
        .update(payload)
        .eq("id", formData.id)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      resultData = data;
    } else {
      // Upsert by composite unique key (insight_date, rashi_id, language)
      payload.created_by = adminUser.id;
      const { data, error } = await supabase
        .from("daily_rashi_insights")
        .upsert(payload, { onConflict: "insight_date,rashi_id,language" })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      resultData = data;
    }

    // Admin Audit Logging
    try {
      await supabase.from("admin_audit_logs").insert({
        actor_user_id: adminUser.id,
        action: formData.status === "published" ? "daily_rashi_insight_published" : "daily_rashi_insight_saved_draft",
        entity_type: "daily_rashi_insights",
        entity_id: resultData?.id || formData.id || "rashi-" + formData.rashi_id,
        details: {
          insight_date: formData.insight_date,
          rashi_id: formData.rashi_id,
          language: formData.language,
          status: formData.status,
        },
      });
    } catch (auditErr) {
      console.warn("Non-fatal: admin audit log insert failed", auditErr);
    }

    revalidatePath("/astrology");
    revalidatePath("/astrology/daily-insights");
    return { success: true, data: resultData };
  } catch (err: any) {
    return { success: false, error: err.message || "An unexpected error occurred." };
  }
}
`;

fs.writeFileSync(path.join(adminRoot, 'lib/actions/daily-insights-management.ts'), actionsContent, 'utf8');
console.log('Wrote lib/actions/daily-insights-management.ts');

// 3. components/admin/astrology/daily-insights/daily-insights-form-modal.tsx
const modalDir = path.join(adminRoot, 'components/admin/astrology/daily-insights');
if (!fs.existsSync(modalDir)) {
  fs.mkdirSync(modalDir, { recursive: true });
}

const formModalContent = `"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveDailyRashiInsight } from "@/lib/actions/daily-insights-management";
import type {
  CanonicalRashi,
  DailyRashiInsightAdminItem,
  DailyInsightStatus,
} from "@/lib/types/daily-insights-management";
import { Loader2, X, Sparkles, AlertTriangle, CheckCircle, Save } from "lucide-react";

interface DailyInsightsFormModalProps {
  rashi: CanonicalRashi;
  date: string;
  language: string;
  existingInsight?: DailyRashiInsightAdminItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DailyInsightsFormModal({
  rashi,
  date,
  language,
  existingInsight,
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingInsight) {
      setGeneralOutlook(existingInsight.general_outlook || "");
      setCareerBusiness(existingInsight.career_business || "");
      setFinanceWealth(existingInsight.finance_wealth || "");
      setLoveRelationships(existingInsight.love_relationships || "");
      setHealthWellbeing(existingInsight.health_wellbeing || "");
      setAuspiciousColor(existingInsight.auspicious_color || "");
      setAuspiciousNumber(existingInsight.auspicious_number || "");
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
    setError(null);
  }, [existingInsight, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (targetStatus: DailyInsightStatus) => {
    setError(null);

    if (targetStatus === "published" && !generalOutlook.trim()) {
      setError("General Outlook is required to publish this insight.");
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border-border bg-card my-auto">
        {/* Header */}
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
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>

        {/* Scrollable Form Body */}
        <CardContent className="overflow-y-auto py-5 space-y-4 text-sm flex-1">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* General Outlook */}
          <div className="space-y-1.5">
            <Label htmlFor="general_outlook" className="font-semibold text-xs flex items-center gap-1">
              General Outlook <span className="text-destructive">*</span>
              <span className="text-[10px] text-muted-foreground font-normal">(Required for publication)</span>
            </Label>
            <textarea
              id="general_outlook"
              rows={3}
              value={generalOutlook}
              onChange={(e) => setGeneralOutlook(e.target.value)}
              placeholder="Enter overall planetary influence, cosmic energy, and general day guidance..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                rows={2}
                value={careerBusiness}
                onChange={(e) => setCareerBusiness(e.target.value)}
                placeholder="Professional decisions, office dynamics, deals..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Finance & Wealth */}
            <div className="space-y-1.5">
              <Label htmlFor="finance" className="font-semibold text-xs text-muted-foreground">
                💰 Finance & Wealth <span className="text-[10px] font-normal">(Optional)</span>
              </Label>
              <textarea
                id="finance"
                rows={2}
                value={financeWealth}
                onChange={(e) => setFinanceWealth(e.target.value)}
                placeholder="Investments, expenditures, financial caution..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Love & Relationships */}
            <div className="space-y-1.5">
              <Label htmlFor="love" className="font-semibold text-xs text-muted-foreground">
                ❤️ Love & Relationships <span className="text-[10px] font-normal">(Optional)</span>
              </Label>
              <textarea
                id="love"
                rows={2}
                value={loveRelationships}
                onChange={(e) => setLoveRelationships(e.target.value)}
                placeholder="Family harmony, romantic transit, communication..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Health & Wellbeing */}
            <div className="space-y-1.5">
              <Label htmlFor="health" className="font-semibold text-xs text-muted-foreground">
                🌿 Health & Wellbeing <span className="text-[10px] font-normal">(Optional)</span>
              </Label>
              <textarea
                id="health"
                rows={2}
                value={healthWellbeing}
                onChange={(e) => setHealthWellbeing(e.target.value)}
                placeholder="Vitality, mental peace, physical wellness tips..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        </CardContent>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-6 py-3.5 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Status:</span>
            <span
              className={\`font-semibold uppercase px-2 py-0.5 rounded text-[11px] \${
                status === "published" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
              }\`}
            >
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
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              Publish Insight
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
`;

fs.writeFileSync(path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insights-form-modal.tsx'), formModalContent, 'utf8');
console.log('Wrote components/admin/astrology/daily-insights/daily-insights-form-modal.tsx');

// 4. components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx
const matrixViewContent = `"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getDailyRashiInsightsMatrix,
} from "@/lib/actions/daily-insights-management";
import type {
  CanonicalRashi,
  DailyRashiInsightAdminItem,
  DailyInsightsMatrixResponse,
  RashiMatrixSlot,
} from "@/lib/types/daily-insights-management";
import { DailyInsightsFormModal } from "./daily-insights-form-modal";
import {
  Sparkles,
  Calendar,
  Languages,
  CheckCircle2,
  Clock,
  AlertCircle,
  Edit3,
  Plus,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface DailyInsightsMatrixViewProps {
  initialData: DailyInsightsMatrixResponse;
}

export function DailyInsightsMatrixView({ initialData }: DailyInsightsMatrixViewProps) {
  const [matrix, setMatrix] = useState<DailyInsightsMatrixResponse>(initialData);
  const [selectedDate, setSelectedDate] = useState<string>(initialData.date);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialData.language);

  const [activeModalSlot, setActiveModalSlot] = useState<{
    rashi: CanonicalRashi;
    insight: DailyRashiInsightAdminItem | null;
  } | null>(null);

  const [isPending, startTransition] = useTransition();

  const handleFetchMatrix = (date: string, lang: string) => {
    startTransition(async () => {
      try {
        const res = await getDailyRashiInsightsMatrix({ date, language: lang });
        setMatrix(res);
      } catch (err) {
        console.error("Failed to load daily insights matrix:", err);
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

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
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
            Curate and publish authoritative daily Vedic planetary transits and guidance across all 12 Rashis.
          </p>
        </div>

        {/* Date & Language Selector Controls */}
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
              className={\`px-2.5 py-1 rounded transition-colors \${
                selectedLanguage === "en"
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }\`}
            >
              English
            </button>
            <button
              onClick={() => handleLanguageChange("hi")}
              className={\`px-2.5 py-1 rounded transition-colors \${
                selectedLanguage === "hi"
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }\`}
            >
              हिन्दी (Hindi)
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleFetchMatrix(selectedDate, selectedLanguage)}
            disabled={isPending}
            className="gap-1.5"
          >
            <RefreshCw className={\`h-3.5 w-3.5 \${isPending ? "animate-spin" : ""}\`} />
            Refresh
          </Button>
        </div>
      </div>

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

      {/* 12-Rashi Matrix Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {matrix.slots.map(({ rashi, insight }: RashiMatrixSlot) => {
          const isPublished = insight?.status === "published";
          const isDraft = insight?.status === "draft";
          const isMissing = !insight;

          return (
            <Card
              key={rashi.id}
              className={\`flex flex-col justify-between transition-all duration-150 \${
                isPublished
                  ? "border-emerald-500/30 bg-card hover:border-emerald-500/60"
                  : isDraft
                  ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60"
                  : "border-dashed border-border/80 bg-muted/20 hover:border-border"
              }\`}
            >
              {/* Card Top Header */}
              <div className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{rashi.symbol}</span>
                    <div>
                      <h3 className="text-sm font-bold text-foreground leading-tight">
                        {rashi.vedicName}
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        {rashi.englishName} • {rashi.element}
                      </p>
                    </div>
                  </div>

                  {isPublished ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-semibold">
                      Published
                    </Badge>
                  ) : isDraft ? (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-semibold">
                      Draft
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-[10px]">
                      Not Created
                    </Badge>
                  )}
                </div>

                {/* Content Preview */}
                <div className="mt-3">
                  {insight ? (
                    <div className="space-y-1.5">
                      <p className="text-xs text-foreground line-clamp-3 leading-relaxed">
                        {insight.general_outlook}
                      </p>
                      {(insight.auspicious_color || insight.auspicious_number) && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                          {insight.auspicious_color && (
                            <span>🎨 {insight.auspicious_color}</span>
                          )}
                          {insight.auspicious_number && (
                            <span>🔢 {insight.auspicious_number}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic py-3">
                      No astrological insight created for this date yet.
                    </p>
                  )}
                </div>
              </div>

              {/* Card Bottom Actions */}
              <div className="p-4 pt-2 border-t border-border/40 mt-2 bg-muted/10 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-mono">
                  {rashi.rulingPlanet.split(" ")[0]}
                </span>

                <Button
                  size="sm"
                  variant={isMissing ? "default" : "outline"}
                  onClick={() => setActiveModalSlot({ rashi, insight })}
                  className="h-7 text-xs gap-1"
                >
                  {isMissing ? (
                    <>
                      <Plus className="h-3 w-3" />
                      Create
                    </>
                  ) : (
                    <>
                      <Edit3 className="h-3 w-3" />
                      Edit
                    </>
                  )}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit / Create Form Modal */}
      {activeModalSlot && (
        <DailyInsightsFormModal
          rashi={activeModalSlot.rashi}
          date={selectedDate}
          language={selectedLanguage}
          existingInsight={activeModalSlot.insight}
          isOpen={true}
          onClose={() => setActiveModalSlot(null)}
          onSuccess={() => handleFetchMatrix(selectedDate, selectedLanguage)}
        />
      )}
    </div>
  );
}
`;

fs.writeFileSync(path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx'), matrixViewContent, 'utf8');
console.log('Wrote components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx');

// 5. app/(dashboard)/astrology/daily-insights/page.tsx
const pageDir = path.join(adminRoot, 'app/(dashboard)/astrology/daily-insights');
if (!fs.existsSync(pageDir)) {
  fs.mkdirSync(pageDir, { recursive: true });
}

const pageContent = `import { getDailyRashiInsightsMatrix } from "@/lib/actions/daily-insights-management";
import { DailyInsightsMatrixView } from "@/components/admin/astrology/daily-insights/daily-insights-matrix-view";

// Asia/Kolkata date resolution
function getIndianTodayDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export default async function DailyInsightsPage() {
  const today = getIndianTodayDate();
  const initialData = await getDailyRashiInsightsMatrix({ date: today, language: "en" });

  return <DailyInsightsMatrixView initialData={initialData} />;
}
`;

fs.writeFileSync(path.join(adminRoot, 'app/(dashboard)/astrology/daily-insights/page.tsx'), pageContent, 'utf8');
console.log('Wrote app/(dashboard)/astrology/daily-insights/page.tsx');

// 6. Update components/admin/astrology/astrology-overview-view.tsx with link to Daily Insights
const overviewPath = path.join(adminRoot, 'components/admin/astrology/astrology-overview-view.tsx');
let overviewContent = fs.readFileSync(overviewPath, 'utf8');
if (!overviewContent.includes('/astrology/daily-insights')) {
  overviewContent = overviewContent.replace(
    '<Link href="/astrology/content">',
    '<Link href="/astrology/daily-insights">\\n            <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">\\n              <Sparkles className="h-4 w-4" />\\n              Daily 12-Rashi Matrix\\n            </Button>\\n          </Link>\\n          <Link href="/astrology/content">'
  );
  fs.writeFileSync(overviewPath, overviewContent, 'utf8');
  console.log('Updated components/admin/astrology/astrology-overview-view.tsx');
}

console.log('ALL ADMIN FILES BUILT SUCCESSFULLY!');

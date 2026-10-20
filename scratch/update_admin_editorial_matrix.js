const fs = require('fs');
const path = require('path');

const adminRoot = 'C:/Projects/kashi-veda-admin';

// 1. Types file: lib/types/daily-insights-management.ts
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

export interface BulkDraftSaveResult {
  success: boolean;
  savedCount: number;
  failedCount: number;
  errors?: string[];
  message?: string;
}

export interface MissingRashiDetail {
  rashi_id: number;
  vedicName: string;
  englishName: string;
  reason: 'missing_record' | 'missing_general_outlook';
}

export interface PublishSetValidationResult {
  isReadyForPublish: boolean;
  totalRashis: number;
  readyCount: number;
  missingCount: number;
  missingRashis: MissingRashiDetail[];
}

export interface PublishSetResult {
  success: boolean;
  publishedCount: number;
  errors?: string[];
  message?: string;
}
`;

fs.writeFileSync(path.join(adminRoot, 'lib/types/daily-insights-management.ts'), typesContent, 'utf8');
console.log('Saved updated lib/types/daily-insights-management.ts');

// 2. Server actions: lib/actions/daily-insights-management.ts
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
  type BulkDraftSaveResult,
  type PublishSetValidationResult,
  type PublishSetResult,
  type MissingRashiDetail,
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

  if (error) {
    console.error("Error querying daily_rashi_insights:", error);
  }

  const rows: DailyRashiInsightAdminItem[] = (data || []).map((row: any) => ({
    id: row.id,
    insight_date: row.insight_date,
    rashi_id: row.rashi_id,
    rashi_name: row.rashi_name,
    language: row.language,
    general_outlook: row.general_outlook,
    career_business: row.career_business,
    finance_wealth: row.finance_wealth,
    love_relationships: row.love_relationships,
    health_wellbeing: row.health_wellbeing,
    auspicious_color: row.auspicious_color,
    auspicious_number: row.auspicious_number != null ? String(row.auspicious_number) : null,
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
// 2. SAVE OR PUBLISH INDIVIDUAL DAILY RASHI INSIGHT
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

  const rashiMeta = CANONICAL_RASHIS.find((r) => r.id === formData.rashi_id);
  const rashiName = rashiMeta ? rashiMeta.vedicName : \`Rashi-\${formData.rashi_id}\`;

  const payload: any = {
    insight_date: formData.insight_date,
    rashi_id: formData.rashi_id,
    rashi_name: rashiName,
    language: formData.language.trim().toLowerCase(),
    general_outlook: (formData.general_outlook || "").trim(),
    career_business: formData.career_business ? formData.career_business.trim() : null,
    finance_wealth: formData.finance_wealth ? formData.finance_wealth.trim() : null,
    love_relationships: formData.love_relationships ? formData.love_relationships.trim() : null,
    health_wellbeing: formData.health_wellbeing ? formData.health_wellbeing.trim() : null,
    auspicious_color: formData.auspicious_color ? formData.auspicious_color.trim() : null,
    auspicious_number: formData.auspicious_number && !isNaN(Number(formData.auspicious_number))
      ? Number(formData.auspicious_number)
      : null,
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
        entity_id: resultData?.id || formData.id || \`rashi-\${formData.rashi_id}\`,
        details: {
          insight_date: formData.insight_date,
          rashi_id: formData.rashi_id,
          rashi_name: rashiName,
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

// =============================================================================
// 3. BULK SAVE AS DRAFT
// Saves valid, non-empty edited entries across multiple Rashis in batch.
// =============================================================================
export async function bulkSaveDailyRashiInsightsDrafts(
  items: DailyRashiInsightFormData[]
): Promise<BulkDraftSaveResult> {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);

  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, savedCount: 0, failedCount: 0, message: "No entries to save." };
  }

  // Filter out completely blank entries (do not insert dummy empty rows)
  const validItems = items.filter((item) => {
    const hasGeneral = item.general_outlook && item.general_outlook.trim().length > 0;
    const hasCareer = item.career_business && item.career_business.trim().length > 0;
    const hasFinance = item.finance_wealth && item.finance_wealth.trim().length > 0;
    const hasLove = item.love_relationships && item.love_relationships.trim().length > 0;
    const hasHealth = item.health_wellbeing && item.health_wellbeing.trim().length > 0;
    const hasColor = item.auspicious_color && item.auspicious_color.trim().length > 0;
    const hasNumber = item.auspicious_number && item.auspicious_number.trim().length > 0;

    return hasGeneral || hasCareer || hasFinance || hasLove || hasHealth || hasColor || hasNumber;
  });

  if (validItems.length === 0) {
    return {
      success: true,
      savedCount: 0,
      failedCount: 0,
      message: "No non-empty entries to save as draft.",
    };
  }

  const errors: string[] = [];
  let savedCount = 0;

  // Process upserts
  for (const item of validItems) {
    if (item.rashi_id < 1 || item.rashi_id > 12) {
      errors.push(\`Invalid Rashi ID \${item.rashi_id}\`);
      continue;
    }

    const rashiMeta = CANONICAL_RASHIS.find((r) => r.id === item.rashi_id);
    const rashiName = rashiMeta ? rashiMeta.vedicName : \`Rashi-\${item.rashi_id}\`;

    const payload: any = {
      insight_date: item.insight_date,
      rashi_id: item.rashi_id,
      rashi_name: rashiName,
      language: (item.language || "en").trim().toLowerCase(),
      general_outlook: (item.general_outlook || "").trim(),
      career_business: item.career_business ? item.career_business.trim() : null,
      finance_wealth: item.finance_wealth ? item.finance_wealth.trim() : null,
      love_relationships: item.love_relationships ? item.love_relationships.trim() : null,
      health_wellbeing: item.health_wellbeing ? item.health_wellbeing.trim() : null,
      auspicious_color: item.auspicious_color ? item.auspicious_color.trim() : null,
      auspicious_number: item.auspicious_number && !isNaN(Number(item.auspicious_number))
        ? Number(item.auspicious_number)
        : null,
      status: "draft", // Always save as draft in bulk action
      updated_at: new Date().toISOString(),
    };

    if (item.id) {
      const { error } = await supabase
        .from("daily_rashi_insights")
        .update(payload)
        .eq("id", item.id);

      if (error) {
        errors.push(\`Failed to update \${rashiName}: \${error.message}\`);
      } else {
        savedCount++;
      }
    } else {
      payload.created_by = adminUser.id;
      const { error } = await supabase
        .from("daily_rashi_insights")
        .upsert(payload, { onConflict: "insight_date,rashi_id,language" });

      if (error) {
        errors.push(\`Failed to insert \${rashiName}: \${error.message}\`);
      } else {
        savedCount++;
      }
    }
  }

  // Audit logging for bulk operation
  if (savedCount > 0) {
    try {
      await supabase.from("admin_audit_logs").insert({
        actor_user_id: adminUser.id,
        action: "daily_rashi_insights_bulk_draft_saved",
        entity_type: "daily_rashi_insights",
        entity_id: \`bulk-\${items[0]?.insight_date || 'date'}\`,
        details: {
          insight_date: items[0]?.insight_date,
          language: items[0]?.language,
          saved_count: savedCount,
          failed_count: errors.length,
        },
      });
    } catch (auditErr) {
      console.warn("Non-fatal: bulk draft audit log failed", auditErr);
    }
  }

  revalidatePath("/astrology");
  revalidatePath("/astrology/daily-insights");

  const success = errors.length === 0;
  return {
    success,
    savedCount,
    failedCount: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    message: success
      ? \`Successfully saved \${savedCount} Rashi drafts.\`
      : \`Saved \${savedCount} drafts with \${errors.length} errors.\`,
  };
}

// =============================================================================
// 4. VALIDATE & PUBLISH DAILY SET
// Inspects all 12 Rashis for date/language, verifies completeness, publishes.
// =============================================================================
export async function validateDailySetReadiness(params: {
  date: string;
  language?: string;
}): Promise<PublishSetValidationResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const date = params.date;
  const language = params.language || "en";

  const { data } = await supabase
    .from("daily_rashi_insights")
    .select("rashi_id, general_outlook, status")
    .eq("insight_date", date)
    .eq("language", language);

  const existingMap = new Map<number, { general_outlook: string; status: string }>();
  (data || []).forEach((row: any) => {
    existingMap.set(row.rashi_id, {
      general_outlook: row.general_outlook || "",
      status: row.status,
    });
  });

  const missingRashis: MissingRashiDetail[] = [];
  let readyCount = 0;

  CANONICAL_RASHIS.forEach((rashi) => {
    const entry = existingMap.get(rashi.id);
    if (!entry) {
      missingRashis.push({
        rashi_id: rashi.id,
        vedicName: rashi.vedicName,
        englishName: rashi.englishName,
        reason: "missing_record",
      });
    } else if (!entry.general_outlook || entry.general_outlook.trim().length === 0) {
      missingRashis.push({
        rashi_id: rashi.id,
        vedicName: rashi.vedicName,
        englishName: rashi.englishName,
        reason: "missing_general_outlook",
      });
    } else {
      readyCount++;
    }
  });

  return {
    isReadyForPublish: missingRashis.length === 0,
    totalRashis: 12,
    readyCount,
    missingCount: missingRashis.length,
    missingRashis,
  };
}

export async function publishDailyRashiInsightsSet(params: {
  date: string;
  language?: string;
  publishReadyOnly?: boolean;
}): Promise<PublishSetResult> {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);

  const date = params.date;
  const language = params.language || "en";

  // Validate readiness first
  const validation = await validateDailySetReadiness({ date, language });

  if (!validation.isReadyForPublish && !params.publishReadyOnly) {
    const missingNames = validation.missingRashis.map((m) => m.vedicName).join(", ");
    return {
      success: false,
      publishedCount: 0,
      errors: [
        \`Cannot publish complete daily set. \${validation.missingCount} of 12 Rashis are missing required General Outlook: \${missingNames}\`,
      ],
      message: \`Incomplete daily set. \${validation.readyCount}/12 Rashis ready.\`,
    };
  }

  // Update status to 'published' for records with valid General Outlook
  const { data, error } = await supabase
    .from("daily_rashi_insights")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("insight_date", date)
    .eq("language", language)
    .neq("general_outlook", "")
    .select("id, rashi_id");

  if (error) {
    return {
      success: false,
      publishedCount: 0,
      errors: [error.message],
      message: "Failed to publish daily set.",
    };
  }

  const publishedCount = data?.length || 0;

  // Admin Audit Log
  try {
    await supabase.from("admin_audit_logs").insert({
      actor_user_id: adminUser.id,
      action: "daily_rashi_insights_daily_set_published",
      entity_type: "daily_rashi_insights",
      entity_id: \`set-\${date}-\${language}\`,
      details: {
        insight_date: date,
        language,
        published_count: publishedCount,
        publish_ready_only: !!params.publishReadyOnly,
      },
    });
  } catch (auditErr) {
    console.warn("Non-fatal: publish set audit log failed", auditErr);
  }

  revalidatePath("/astrology");
  revalidatePath("/astrology/daily-insights");

  return {
    success: true,
    publishedCount,
    message: \`Successfully published \${publishedCount} Rashis for \${date} (\${language.toUpperCase()}).\`,
  };
}
`;

fs.writeFileSync(path.join(adminRoot, 'lib/actions/daily-insights-management.ts'), actionsContent, 'utf8');
console.log('Saved updated lib/actions/daily-insights-management.ts');

// 3. Components: Publish Confirmation Dialog
const publishDialogContent = `"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PublishSetValidationResult } from "@/lib/types/daily-insights-management";
import { AlertTriangle, CheckCircle2, Loader2, X, Send } from "lucide-react";

interface PublishDailySetModalProps {
  isOpen: boolean;
  date: string;
  language: string;
  validation: PublishSetValidationResult | null;
  isValidating: boolean;
  isPublishing: boolean;
  onClose: () => void;
  onConfirmPublish: (publishReadyOnly: boolean) => void;
  onEditRashi: (rashiId: number) => void;
}

export function PublishDailySetModal({
  isOpen,
  date,
  language,
  validation,
  isValidating,
  isPublishing,
  onClose,
  onConfirmPublish,
  onEditRashi,
}: PublishDailySetModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <Card className="w-full max-w-lg shadow-2xl border-border bg-card">
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4">
          <div>
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Send className="h-4 w-4 text-emerald-500" />
              Publish Daily Insights Set
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Date: <span className="font-semibold text-foreground">{date}</span> • Language:{" "}
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

        {/* Content Body */}
        <CardContent className="py-5 space-y-4 text-sm">
          {isValidating ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">Verifying all 12 Rashis readiness...</span>
            </div>
          ) : validation ? (
            <div className="space-y-4">
              {/* Readiness Status Box */}
              {validation.isReadyForPublish ? (
                <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-700">All 12 Rashis Complete & Ready</h4>
                    <p className="text-xs text-emerald-800/80 mt-0.5 leading-relaxed">
                      Every zodiac sign contains verified General Outlook guidance. Publishing will activate this content for all subscribed mobile users.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3.5">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-700">
                        {validation.readyCount} of 12 Rashis Ready ({validation.missingCount} Incomplete)
                      </h4>
                      <p className="text-xs text-amber-800/80 mt-0.5 leading-relaxed">
                        The following signs are missing the required General Outlook content. You can complete them or publish only the ready signs.
                      </p>
                    </div>
                  </div>

                  {/* List of incomplete signs */}
                  <div className="rounded-lg border border-border/70 divide-y divide-border/50 max-h-48 overflow-y-auto">
                    {validation.missingRashis.map((missing) => (
                      <div key={missing.rashi_id} className="flex items-center justify-between p-2.5 text-xs bg-card">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{missing.vedicName}</span>
                          <span className="text-muted-foreground">({missing.englishName})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/20">
                            {missing.reason === 'missing_record' ? 'Not Created' : 'Missing Outlook'}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onEditRashi(missing.rashi_id)}
                            className="h-6 text-[11px] px-2"
                          >
                            Fill In →
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-6 py-3.5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPublishing}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {validation && !validation.isReadyForPublish && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onConfirmPublish(true)}
                disabled={isPublishing || validation.readyCount === 0}
                className="text-xs"
              >
                Publish Ready Only ({validation.readyCount})
              </Button>
            )}

            <Button
              size="sm"
              onClick={() => onConfirmPublish(false)}
              disabled={isPublishing || isValidating || (validation ? !validation.isReadyForPublish : true)}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Publish All 12 Rashis
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
`;

fs.writeFileSync(path.join(adminRoot, 'components/admin/astrology/daily-insights/publish-daily-set-modal.tsx'), publishDialogContent, 'utf8');
console.log('Saved components/admin/astrology/daily-insights/publish-daily-set-modal.tsx');

// 4. Form Modal with Live Mobile Preview Toggle & Publish This Rashi
const modalContent = `"use client";

import { useState, useEffect } from "react";
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
import { Loader2, X, Sparkles, AlertTriangle, CheckCircle, Save, Eye, EyeOff, Send } from "lucide-react";

interface DailyInsightsFormModalProps {
  rashi: CanonicalRashi;
  date: string;
  language: string;
  existingInsight?: DailyRashiInsightAdminItem | null;
  initialFocusedField?: 'general_outlook' | 'career' | 'finance' | 'love' | 'health' | null;
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
  }, [existingInsight, isOpen]);

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
                <h5 className="text-xs font-bold text-amber-300">॥ आज का राशिफल (General Outlook) ॥</h5>
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
            /* Standard Edit Form */
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
                  rows={3}
                  value={generalOutlook}
                  onChange={(e) => setGeneralOutlook(e.target.value)}
                  placeholder="Enter overall planetary influence, cosmic energy, and general day guidance..."
                  autoFocus={initialFocusedField === 'general_outlook'}
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
                    autoFocus={initialFocusedField === 'career'}
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
                    autoFocus={initialFocusedField === 'finance'}
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
                    autoFocus={initialFocusedField === 'love'}
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
                    autoFocus={initialFocusedField === 'health'}
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
            </div>
          )}
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

fs.writeFileSync(path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insights-form-modal.tsx'), modalContent, 'utf8');
console.log('Saved components/admin/astrology/daily-insights/daily-insights-form-modal.tsx');

// 5. Matrix Table View: components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx
const matrixTableViewContent = `"use client";

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
import { DailyInsightsFormModal } from "./daily-insights-form-modal";
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
    initialFocusedField?: 'general_outlook' | 'career' | 'finance' | 'love' | 'health' | null;
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

  // Open modal with specific field focus
  const handleOpenEditor = (
    rashi: CanonicalRashi,
    insight: DailyRashiInsightAdminItem | null,
    field?: 'general_outlook' | 'career' | 'finance' | 'love' | 'health'
  ) => {
    setActiveModalSlot({
      rashi,
      insight,
      initialFocusedField: field || 'general_outlook',
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
            className="h-9 gap-1.5"
          >
            <RefreshCw className={\`h-3.5 w-3.5 \${isPending ? "animate-spin" : ""}\`} />
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
          className={\`p-3.5 rounded-lg border text-xs flex items-center justify-between transition-all \${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
              : notification.type === 'error'
              ? 'bg-destructive/10 border-destructive/20 text-destructive'
              : 'bg-primary/10 border-primary/20 text-primary'
          }\`}
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

                return (
                  <tr
                    key={rashi.id}
                    className={\`hover:bg-muted/20 transition-colors group \${
                      isPublished ? "bg-card" : isDraft ? "bg-amber-500/5" : "bg-card/50"
                    }\`}
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

fs.writeFileSync(path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx'), matrixTableViewContent, 'utf8');
console.log('Saved components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx');

console.log('ALL EDITORIAL MATRIX UPGRADES COMPLETED!');

const fs = require('fs');
const path = require('path');

const adminRoot = 'C:/Projects/kashi-veda-admin';

// =============================================================================
// 1. UPDATE lib/actions/daily-insights-management.ts
// =============================================================================
const actionsPath = path.join(adminRoot, 'lib/actions/daily-insights-management.ts');
let actionsCode = fs.readFileSync(actionsPath, 'utf8');

// Add import of validateDailyInsightDraftPayload and MAX_CSV_ROW_COUNT
if (!actionsCode.includes('validateDailyInsightDraftPayload')) {
  actionsCode = actionsCode.replace(
    'import {\n  CANONICAL_RASHIS,',
    'import {\n  validateDailyInsightDraftPayload,\n  MAX_CSV_ROW_COUNT,\n} from "@/lib/astrology/daily-insights-csv-parser";\nimport {\n  CANONICAL_RASHIS,'
  );
}

// In bulkSaveDailyRashiInsightsDrafts, add max items check and strict validation
const targetLoop = `  // Process each draft via authoritative RPC with atomic overwrite guard (AST-11)
  for (const item of validItems) {
    const date = (item.insight_date || "").trim();
    const language = (item.language || "en").trim().toLowerCase();
    const rashiId = Number(item.rashi_id);

    if (isNaN(rashiId) || rashiId < 1 || rashiId > 12) {
      const errMsg = \`Invalid Rashi ID \${item.rashi_id}\`;
      errors.push(errMsg);
      results.push({
        insight_date: date,
        rashi_id: rashiId,
        language,
        outcome: "failed",
        error: errMsg,
        error_code: "INVALID_RASHI_ID",
      });
      continue;
    }`;

const replacementLoop = `  // Check resource limits on submission payload (AST-12)
  if (items.length > MAX_CSV_ROW_COUNT) {
    const errMsg = \`Batch size \${items.length} exceeds maximum allowed limit of \${MAX_CSV_ROW_COUNT} rows.\`;
    return {
      success: false,
      totalSubmitted: items.length,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      conflictedCount: 0,
      failedCount: items.length,
      savedCount: 0,
      results: [],
      errors: [errMsg],
      message: errMsg,
    };
  }

  // Process each draft via authoritative RPC with atomic overwrite guard (AST-11) & strict validation (AST-12)
  for (const item of validItems) {
    // Strict server-side payload validation
    const payloadValidation = validateDailyInsightDraftPayload(item);
    if (!payloadValidation.isValid) {
      const errMsg = payloadValidation.error || "Invalid payload format.";
      errors.push(errMsg);
      results.push({
        insight_date: (item.insight_date || "").trim(),
        rashi_id: Number(item.rashi_id) || 0,
        language: (item.language || "en").trim().toLowerCase(),
        outcome: "failed",
        error: errMsg,
        error_code: "VALIDATION_ERROR",
      });
      continue;
    }

    const date = (item.insight_date || "").trim();
    const language = (item.language || "en").trim().toLowerCase();
    const rashiId = Number(item.rashi_id);`;

actionsCode = actionsCode.replace(targetLoop, replacementLoop);
fs.writeFileSync(actionsPath, actionsCode, 'utf8');
console.log('Successfully updated daily-insights-management.ts with AST-12 server validation and limits.');

// =============================================================================
// 2. UPDATE components/admin/astrology/daily-insights/bulk-import-modal.tsx
// =============================================================================
const modalPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/bulk-import-modal.tsx');

const updatedModalContent = `/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  bulkSaveDailyRashiInsightsDrafts,
  checkDailyInsightsExistence,
} from "@/lib/actions/daily-insights-management";
import {
  parseAndValidateDailyInsightsCSV,
  MAX_CSV_FILE_SIZE,
  MAX_CSV_ROW_COUNT,
} from "@/lib/astrology/daily-insights-csv-parser";
import {
  CANONICAL_RASHIS,
  getDailyInsightCompositeKey,
  type DailyRashiInsightAdminItem,
  type DailyRashiInsightFormData,
  type BulkImportValidationResult,
} from "@/lib/types/daily-insights-management";
import {
  Loader2,
  X,
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  AlertCircle,
  FileText,
  Save,
  CheckCircle2,
} from "lucide-react";

export type ImportLifecycleState = "idle" | "reading" | "validating" | "ready" | "error";

interface BulkImportModalProps {
  isOpen: boolean;
  selectedDate: string;
  selectedLanguage: string;
  existingInsights: (DailyRashiInsightAdminItem | null)[];
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkImportModal({
  isOpen,
  selectedDate,
  selectedLanguage,
  existingInsights,
  onClose,
  onSuccess,
}: BulkImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<ImportLifecycleState>("idle");
  const [validation, setValidation] = useState<BulkImportValidationResult | null>(null);
  const [allowOverwrite, setAllowOverwrite] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileGenerationRef = useRef(0);
  const activeReaderRef = useRef<FileReader | null>(null);
  const isUnmountedRef = useRef(false);

  // Unmount protection
  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      if (activeReaderRef.current) {
        activeReaderRef.current.abort();
        activeReaderRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  // Build map of existing insights keyed by canonical composite key: (insight_date, rashi_id, language)
  const existingMap = new Map<string, { id?: string; version?: number | null; status?: string }>();
  existingInsights.forEach((item) => {
    if (item) {
      const key = getDailyInsightCompositeKey(item.insight_date, item.rashi_id, item.language);
      existingMap.set(key, { id: item.id, version: item.version, status: item.status });
    }
  });

  // Generate and download pre-populated CSV template
  const handleDownloadTemplate = () => {
    const headers = [
      "rashi_id",
      "rashi_name",
      "insight_date",
      "language",
      "general_outlook",
      "career_business",
      "finance_wealth",
      "love_relationships",
      "health_wellbeing",
      "auspicious_color",
      "auspicious_number",
    ];

    const sampleRows = CANONICAL_RASHIS.map((rashi) => [
      String(rashi.id),
      rashi.vedicName,
      selectedDate,
      selectedLanguage,
      \`"\${rashi.vedicName} outlook: Planetary energy brings focus and clarity."\`,
      \`"Lead office initiatives and execute plans."\`,
      \`"Maintain financial discipline and review budgets."\`,
      \`"Harmony with family and pleasant communication."\`,
      \`"Stay hydrated, practice yoga."\`,
      \`"Saffron Yellow"\`,
      String(((rashi.id * 3) % 9) + 1),
    ]);

    const csvContent = [headers.join(","), ...sampleRows.map((r) => r.join(","))].join("\\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", \`daily_insights_\${selectedDate}_\${selectedLanguage}.csv\`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Clear selected file and reset all preview state
  const handleClearFile = () => {
    fileGenerationRef.current++;
    if (activeReaderRef.current) {
      activeReaderRef.current.abort();
      activeReaderRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setFile(null);
    setValidation(null);
    setError(null);
    setImportState("idle");
  };

  // Handle CSV file selection and parsing with immediate invalidation and generation token (AST-12)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];

    // Immediately invalidate prior generation and state!
    const currentGen = ++fileGenerationRef.current;
    if (activeReaderRef.current) {
      activeReaderRef.current.abort();
      activeReaderRef.current = null;
    }

    setValidation(null);
    setError(null);

    if (!selectedFile) {
      setFile(null);
      setImportState("idle");
      return;
    }

    setFile(selectedFile);

    // Validate file extension
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setImportState("error");
      setError("Please select a valid .csv file.");
      return;
    }

    // Validate file size limit
    if (selectedFile.size > MAX_CSV_FILE_SIZE) {
      setImportState("error");
      setError(
        \`File size (\${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 2 MB.\`
      );
      return;
    }

    // Validate empty file
    if (selectedFile.size === 0) {
      setImportState("error");
      setError("Selected CSV file is empty (0 bytes).");
      return;
    }

    setImportState("reading");

    const reader = new FileReader();
    activeReaderRef.current = reader;

    reader.onerror = () => {
      if (currentGen !== fileGenerationRef.current || isUnmountedRef.current) return;
      setImportState("error");
      setError("Failed to read file from disk.");
      setValidation(null);
    };

    reader.onabort = () => {
      // Aborted because a newer file was selected or cancelled
    };

    reader.onload = async (event) => {
      if (currentGen !== fileGenerationRef.current || isUnmountedRef.current) return;

      try {
        setImportState("validating");
        const text = (event.target?.result as string) || "";

        // Parse and validate with strict RFC 4180 parser & token checks
        const outcome = parseAndValidateDailyInsightsCSV(text, {
          defaultDate: selectedDate,
          defaultLanguage: selectedLanguage,
          existingMap,
        });

        if (!outcome.success || !outcome.validation) {
          if (currentGen !== fileGenerationRef.current || isUnmountedRef.current) return;
          setImportState("error");
          setError(outcome.error || "Failed to parse CSV.");
          setValidation(null);
          return;
        }

        // Authoritative Database Existence Verification (AST-11)
        const validRows = outcome.validation.rows.filter((r) => r.isValid && r.rashi_id > 0);
        const keysToCheck = validRows.map((r) => ({
          insight_date: r.insight_date,
          rashi_id: r.rashi_id,
          language: r.language,
        }));

        let finalValidation = outcome.validation;

        if (keysToCheck.length > 0) {
          const existRes = await checkDailyInsightsExistence(keysToCheck);
          if (currentGen !== fileGenerationRef.current || isUnmountedRef.current) return;

          if (existRes.success && existRes.records) {
            const updatedRows = outcome.validation.rows.map((r) => {
              const key = getDailyInsightCompositeKey(r.insight_date, r.rashi_id, r.language);
              const dbRecord = existRes.records[key];
              const exists = !!(dbRecord && dbRecord.exists);
              return {
                ...r,
                isExisting: exists,
                existingVersion: dbRecord ? dbRecord.version : null,
              };
            });

            const updatedExistingCount = updatedRows.filter((r) => r.isValid && r.isExisting).length;
            finalValidation = {
              ...outcome.validation,
              existingConflictsCount: updatedExistingCount,
              newRowsCount: outcome.validation.validRowsCount - updatedExistingCount,
              rows: updatedRows,
            };
          }
        }

        if (currentGen !== fileGenerationRef.current || isUnmountedRef.current) return;
        setValidation(finalValidation);
        setImportState("ready");
      } catch (err: any) {
        if (currentGen !== fileGenerationRef.current || isUnmountedRef.current) return;
        setImportState("error");
        setError(err.message || "An unexpected error occurred while parsing the CSV.");
        setValidation(null);
      }
    };

    reader.readAsText(selectedFile);
  };

  // Commit Import (AST-11 Authoritative Execution)
  const handleCommitImport = async () => {
    if (importState !== "ready" || !validation || validation.validRowsCount === 0) return;

    setIsImporting(true);
    setError(null);

    try {
      const rowsToSave = validation.rows.filter((row) => row.isValid);

      if (rowsToSave.length === 0) {
        setError("No valid records to import.");
        setIsImporting(false);
        return;
      }

      const items: DailyRashiInsightFormData[] = rowsToSave.map((row) => ({
        expected_version: row.isExisting && row.existingVersion != null ? Number(row.existingVersion) : null,
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
        status: "draft",
      }));

      // Server and database enforce allowOverwrite atomically
      const res = await bulkSaveDailyRashiInsightsDrafts(items, { allowOverwrite });

      if (res.success) {
        setIsImporting(false);
        onSuccess();
        onClose();
      } else {
        setError(res.errors?.join(", ") || res.message || "Failed to commit bulk import.");
        setIsImporting(false);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during import.");
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <Card className="w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border-border bg-card my-auto">
        {/* Modal Header */}
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg font-bold text-foreground">
                Bulk Import 12-Rashi Daily Insights
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Default Date: <span className="font-semibold text-foreground">{selectedDate}</span> • Default Language:{" "}
              <span className="font-semibold uppercase text-foreground">{selectedLanguage}</span>
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>

        {/* Modal Body */}
        <CardContent className="overflow-y-auto py-5 space-y-4 text-sm flex-1">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Download Template or Upload */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Download Template Box */}
            <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                  <Download className="h-3.5 w-3.5 text-primary" />
                  <span>1. Download Spreadsheet Template</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Pre-populated CSV with all 12 canonical Rashis, date, and language structure.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="mt-3 text-xs h-8 gap-1.5 w-full border-primary/30 hover:bg-primary/10"
              >
                <Download className="h-3.5 w-3.5 text-primary" />
                Download CSV Template
              </Button>
            </div>

            {/* Upload Box */}
            <div className="p-3.5 rounded-lg border border-dashed border-border/80 bg-muted/10 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                  <UploadCloud className="h-3.5 w-3.5 text-amber-500" />
                  <span>2. Upload Prepared CSV</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Select your completed CSV file. Max {MAX_CSV_ROW_COUNT} rows, up to 2 MB.
                </p>
              </div>
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv"
                  className="hidden"
                />
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting || importState === "reading" || importState === "validating"}
                    className="text-xs h-8 gap-1.5 flex-1"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {file ? file.name : "Select CSV File"}
                  </Button>
                  {file && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleClearFile}
                      disabled={isImporting}
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                      title="Clear selected file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Progress / Loading Indicator */}
          {(importState === "reading" || importState === "validating") && (
            <div className="flex items-center justify-center gap-2 p-4 rounded-lg bg-muted/30 border border-border/60 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>{importState === "reading" ? "Reading CSV file..." : "Validating records against schema & database..."}</span>
            </div>
          )}

          {/* Step 2: Validation Results & Preview */}
          {importState === "ready" && validation && (
            <div className="space-y-3 pt-2">
              {/* Counter Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-border/60 bg-card">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                    {validation.totalRows} Total Rows
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                    {validation.validRowsCount} Valid Entries
                  </Badge>
                  {validation.invalidRowsCount > 0 && (
                    <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                      {validation.invalidRowsCount} Errors
                    </Badge>
                  )}
                </div>

                {validation.existingConflictsCount > 0 && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allow-overwrite"
                      checked={allowOverwrite}
                      onCheckedChange={(checked) => setAllowOverwrite(!!checked)}
                    />
                    <label
                      htmlFor="allow-overwrite"
                      className="text-xs font-medium cursor-pointer text-amber-500 select-none flex items-center gap-1"
                    >
                      <AlertCircle className="h-3 w-3" />
                      Allow updating {validation.existingConflictsCount} existing records
                    </label>
                  </div>
                )}
              </div>

              {/* Parsed Rows Preview Table */}
              <div className="border border-border/60 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-xs border-b border-border/70 text-muted-foreground font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">Row</th>
                      <th className="p-2.5">Target</th>
                      <th className="p-2.5">Rashi</th>
                      <th className="p-2.5">General Outlook</th>
                      <th className="p-2.5">Career</th>
                      <th className="p-2.5">Finance</th>
                      <th className="p-2.5">Love</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {validation.rows.map((row) => (
                      <tr
                        key={row.rowIndex}
                        className={row.isValid ? (row.isExisting ? "bg-amber-500/5" : "bg-card") : "bg-destructive/10"}
                      >
                        <td className="p-2.5 font-mono text-[11px] text-muted-foreground">#{row.rowIndex}</td>
                        <td className="p-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] text-foreground">{row.insight_date}</span>
                            <Badge variant="outline" className="text-[9px] uppercase px-1 py-0 h-4 font-semibold">
                              {row.language}
                            </Badge>
                          </div>
                        </td>
                        <td className="p-2.5 font-bold text-foreground">
                          {row.rashi_name} <span className="font-normal text-muted-foreground text-[10px]">({row.rashi_id})</span>
                        </td>
                        <td className="p-2.5 max-w-[150px] truncate text-muted-foreground" title={row.general_outlook}>
                          {row.general_outlook || <span className="italic text-muted-foreground/50">Empty</span>}
                        </td>
                        <td className="p-2.5 max-w-[100px] truncate text-muted-foreground" title={row.career_business}>
                          {row.career_business || "-"}
                        </td>
                        <td className="p-2.5 max-w-[100px] truncate text-muted-foreground" title={row.finance_wealth}>
                          {row.finance_wealth || "-"}
                        </td>
                        <td className="p-2.5 max-w-[100px] truncate text-muted-foreground" title={row.love_relationships}>
                          {row.love_relationships || "-"}
                        </td>
                        <td className="p-2.5 text-center">
                          {row.isValid ? (
                            row.isExisting ? (
                              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                                Update {row.existingVersion != null ? \`(v\${row.existingVersion})\` : ""}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                                New
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30" title={row.errors.join("; ")}>
                              Invalid
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-6 py-3 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isImporting}>
            Cancel
          </Button>

          <Button
            size="sm"
            onClick={handleCommitImport}
            disabled={importState !== "ready" || !validation || validation.validRowsCount === 0 || isImporting}
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
          >
            {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save {validation ? validation.validRowsCount : 0} Drafts
          </Button>
        </div>
      </Card>
    </div>
  );
}
`;

fs.writeFileSync(modalPath, updatedModalContent, 'utf8');
console.log('Successfully updated bulk-import-modal.tsx with AST-12 lifecycle, strict RFC 4180 parsing, and validation.');

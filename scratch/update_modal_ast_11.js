const fs = require('fs');

const modalPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/bulk-import-modal.tsx';

const updatedModalContent = `/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  bulkSaveDailyRashiInsightsDrafts,
  checkDailyInsightsExistence,
} from "@/lib/actions/daily-insights-management";
import {
  CANONICAL_RASHIS,
  getDailyInsightCompositeKey,
  type DailyRashiInsightAdminItem,
  type DailyRashiInsightFormData,
  type BulkImportParsedRow,
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
} from "lucide-react";

interface BulkImportModalProps {
  isOpen: boolean;
  selectedDate: string;
  selectedLanguage: string;
  existingInsights: (DailyRashiInsightAdminItem | null)[];
  onClose: () => void;
  onSuccess: () => void;
}

// RFC 4180 compliant CSV line parser
function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentToken = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentToken += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(currentToken.trim());
      currentToken = "";
    } else if ((char === "\\r" || char === "\\n") && !inQuotes) {
      if (char === "\\r" && nextChar === "\\n") {
        i++; // skip \\r\\n
      }
      row.push(currentToken.trim());
      currentToken = "";
      if (row.some((cell) => cell.length > 0)) {
        lines.push(row);
      }
      row = [];
    } else {
      currentToken += char;
    }
  }

  if (currentToken.length > 0 || row.length > 0) {
    row.push(currentToken.trim());
    if (row.some((cell) => cell.length > 0)) {
      lines.push(row);
    }
  }

  return lines;
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
  const [validation, setValidation] = useState<BulkImportValidationResult | null>(null);
  const [allowOverwrite, setAllowOverwrite] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Handle CSV file selection and parsing
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".csv")) {
      setError("Please select a valid .csv file.");
      return;
    }

    if (selectedFile.size > 2 * 1024 * 1024) {
      setError("File size exceeds 2 MB limit.");
      return;
    }

    setFile(selectedFile);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);

        if (rows.length < 2) {
          setError("The CSV file must contain a header row and at least one data row.");
          return;
        }

        const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ""));
        const getIdx = (candidates: string[]) =>
          header.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

        const idIdx = getIdx(["rashi_id", "rashid", "id", "sign_id"]);
        const nameIdx = getIdx(["rashi_name", "rashi", "sign", "vedic_name"]);
        const dateIdx = getIdx(["insight_date", "date"]);
        const langIdx = getIdx(["language", "lang"]);
        const generalIdx = getIdx(["general_outlook", "general", "outlook", "dosh"]);
        const careerIdx = getIdx(["career_business", "career", "business", "work"]);
        const financeIdx = getIdx(["finance_wealth", "finance", "wealth", "money"]);
        const loveIdx = getIdx(["love_relationships", "love", "relationships", "family"]);
        const healthIdx = getIdx(["health_wellbeing", "health", "wellness"]);
        const colorIdx = getIdx(["auspicious_color", "color"]);
        const numberIdx = getIdx(["auspicious_number", "number", "lucky_number"]);

        if (generalIdx === -1 && idIdx === -1 && nameIdx === -1) {
          setError("Could not find standard headers (rashi_id/rashi_name, general_outlook) in CSV.");
          return;
        }

        const parsedRows: BulkImportParsedRow[] = [];
        const seenCompositeKeys = new Set<string>();
        const generalErrors: string[] = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const rowErrors: string[] = [];

          // 1. Identify Rashi
          let rashiId = 0;
          let rashiName = "";

          if (idIdx !== -1 && row[idIdx]) {
            const parsedId = parseInt(row[idIdx], 10);
            if (!isNaN(parsedId) && parsedId >= 1 && parsedId <= 12) {
              rashiId = parsedId;
            }
          }

          if (rashiId === 0 && nameIdx !== -1 && row[nameIdx]) {
            const rawName = row[nameIdx].trim().toLowerCase();
            const matched = CANONICAL_RASHIS.find(
              (r) =>
                r.vedicName.toLowerCase() === rawName ||
                r.englishName.toLowerCase() === rawName ||
                rawName.includes(r.vedicName.toLowerCase())
            );
            if (matched) {
              rashiId = matched.id;
            }
          }

          const matchedCanonical = CANONICAL_RASHIS.find((r) => r.id === rashiId);
          if (!matchedCanonical) {
            rowErrors.push(\`Row \${i}: Unrecognized Rashi ("\${row[nameIdx] || row[idIdx] || "unknown"}"). Must be 1-12 or valid name.\`);
            rashiName = row[nameIdx] || \`Row-\${i}\`;
          } else {
            rashiName = matchedCanonical.vedicName;
          }

          // 2. Extract fields with canonical fallback to selected date/language
          const rowDate = (dateIdx !== -1 && row[dateIdx] && row[dateIdx].trim()) ? row[dateIdx].trim() : selectedDate;
          const rowLang = (langIdx !== -1 && row[langIdx] && row[langIdx].trim()) ? row[langIdx].trim().toLowerCase() : selectedLanguage;
          const rowGeneral = generalIdx !== -1 && row[generalIdx] ? row[generalIdx] : "";
          const rowCareer = careerIdx !== -1 && row[careerIdx] ? row[careerIdx] : "";
          const rowFinance = financeIdx !== -1 && row[financeIdx] ? row[financeIdx] : "";
          const rowLove = loveIdx !== -1 && row[loveIdx] ? row[loveIdx] : "";
          const rowHealth = healthIdx !== -1 && row[healthIdx] ? row[healthIdx] : "";
          const rowColor = colorIdx !== -1 && row[colorIdx] ? row[colorIdx] : "";
          const rowNumber = numberIdx !== -1 && row[numberIdx] ? row[numberIdx] : "";

          // 3. Composite Identity & Duplicate Detection (AST-11)
          const compositeKey = getDailyInsightCompositeKey(rowDate, rashiId, rowLang);

          if (seenCompositeKeys.has(compositeKey) && rashiId > 0) {
            rowErrors.push(\`Duplicate entry for \${rashiName} on \${rowDate} (\${rowLang.toUpperCase()}) found in row \${i}.\`);
          } else if (rashiId > 0) {
            seenCompositeKeys.add(compositeKey);
          }

          if (rowNumber && isNaN(Number(rowNumber))) {
            rowErrors.push(\`Auspicious number must be numeric (found "\${rowNumber}").\`);
          }

          const hasContent =
            rowGeneral.length > 0 ||
            rowCareer.length > 0 ||
            rowFinance.length > 0 ||
            rowLove.length > 0 ||
            rowHealth.length > 0;

          if (!hasContent) {
            rowErrors.push("Row has no content.");
          }

          const initialExisting = existingMap.get(compositeKey);
          const isExisting = rashiId > 0 && !!initialExisting;

          parsedRows.push({
            rowIndex: i,
            rashi_id: rashiId,
            rashi_name: rashiName,
            insight_date: rowDate,
            language: rowLang,
            general_outlook: rowGeneral,
            career_business: rowCareer,
            finance_wealth: rowFinance,
            love_relationships: rowLove,
            health_wellbeing: rowHealth,
            auspicious_color: rowColor,
            auspicious_number: rowNumber,
            isExisting,
            existingVersion: initialExisting?.version ?? null,
            isValid: rowErrors.length === 0,
            errors: rowErrors,
          });
        }

        const validRows = parsedRows.filter((r) => r.isValid);
        const invalidRows = parsedRows.filter((r) => !r.isValid);
        const existingConflicts = parsedRows.filter((r) => r.isExisting);

        setValidation({
          isValid: invalidRows.length === 0,
          totalRows: parsedRows.length,
          validRowsCount: validRows.length,
          invalidRowsCount: invalidRows.length,
          existingConflictsCount: existingConflicts.length,
          newRowsCount: parsedRows.length - existingConflicts.length,
          rows: parsedRows,
          generalErrors,
        });

        // 4. Authoritative Database Existence Verification (AST-11)
        // Queries PostgreSQL across all distinct composite keys in the CSV
        const keysToCheck = parsedRows
          .filter((r) => r.isValid && r.rashi_id > 0)
          .map((r) => ({
            insight_date: r.insight_date,
            rashi_id: r.rashi_id,
            language: r.language,
          }));

        if (keysToCheck.length > 0) {
          checkDailyInsightsExistence(keysToCheck).then((res) => {
            if (res.success && res.records) {
              setValidation((prev) => {
                if (!prev) return null;
                const updatedRows = prev.rows.map((r) => {
                  const key = getDailyInsightCompositeKey(r.insight_date, r.rashi_id, r.language);
                  const dbRecord = res.records[key];
                  const exists = !!(dbRecord && dbRecord.exists);
                  return {
                    ...r,
                    isExisting: exists,
                    existingVersion: dbRecord ? dbRecord.version : null,
                  };
                });

                const updatedExistingCount = updatedRows.filter((r) => r.isValid && r.isExisting).length;
                return {
                  ...prev,
                  existingConflictsCount: updatedExistingCount,
                  newRowsCount: prev.validRowsCount - updatedExistingCount,
                  rows: updatedRows,
                };
              });
            }
          });
        }
      } catch (err: any) {
        setError(\`Failed to parse CSV: \${err.message}\`);
      }
    };

    reader.readAsText(selectedFile);
  };

  // Commit Import (AST-11 Authoritative Execution)
  const handleCommitImport = async () => {
    if (!validation || validation.validRowsCount === 0) return;

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
                  Select your completed CSV file. Insights are validated prior to saving as drafts.
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
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 text-xs h-8 gap-1.5 w-full"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {file ? file.name : "Select CSV File"}
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2: Validation Results & Preview */}
          {validation && (
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
            disabled={!validation || validation.validRowsCount === 0 || isImporting}
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
console.log('Successfully updated bulk-import-modal.tsx with AST-11 composite identity and overwrite enforcement.');

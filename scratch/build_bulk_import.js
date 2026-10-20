const fs = require('fs');
const path = require('path');

const adminDir = 'C:\\Projects\\kashi-veda-admin';

// 1. Update lib/types/daily-insights-management.ts
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

// Bulk CSV Import Types
export interface BulkImportParsedRow {
  rowIndex: number;
  rashi_id: number;
  rashi_name: string;
  insight_date: string;
  language: string;
  general_outlook: string;
  career_business: string;
  finance_wealth: string;
  love_relationships: string;
  health_wellbeing: string;
  auspicious_color: string;
  auspicious_number: string;
  isExisting: boolean;
  isValid: boolean;
  errors: string[];
}

export interface BulkImportValidationResult {
  isValid: boolean;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  existingConflictsCount: number;
  newRowsCount: number;
  rows: BulkImportParsedRow[];
  generalErrors: string[];
}

export interface CommitBulkImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  errors?: string[];
  message?: string;
}
`;

fs.writeFileSync(path.join(adminDir, 'lib/types/daily-insights-management.ts'), typesContent, 'utf8');
console.log('Saved updated lib/types/daily-insights-management.ts');

// 2. Create components/admin/astrology/daily-insights/bulk-import-modal.tsx
const bulkImportModalContent = `"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { bulkSaveDailyRashiInsightsDrafts } from "@/lib/actions/daily-insights-management";
import {
  CANONICAL_RASHIS,
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
  CheckCircle2,
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
        i++; // skip \\n in Windows CRLF
      }
      row.push(currentToken.trim());
      if (row.some((cell) => cell.length > 0)) {
        lines.push(row);
      }
      row = [];
      currentToken = "";
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

  // Build map of existing insights for conflict detection
  const existingMap = new Map<number, DailyRashiInsightAdminItem>();
  existingInsights.forEach((item) => {
    if (item) existingMap.set(item.rashi_id, item);
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
    link.setAttribute("download", \`kashi_veda_daily_insights_\${selectedDate}_\${selectedLanguage}.csv\`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Validate parsed CSV rows
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setError(null);
    if (!selectedFile.name.endsWith(".csv")) {
      setError("Please select a valid CSV file (.csv).");
      return;
    }

    if (selectedFile.size > 2 * 1024 * 1024) {
      setError("File size exceeds 2MB limit.");
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) {
        setError("The uploaded file is empty.");
        return;
      }

      try {
        const rows = parseCSV(content);
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
        const seenRashiIds = new Set<number>();
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

          if (seenRashiIds.has(rashiId) && rashiId > 0) {
            rowErrors.push(\`Duplicate entry for \${rashiName} found in row \${i}.\`);
          } else if (rashiId > 0) {
            seenRashiIds.add(rashiId);
          }

          // 2. Extract fields
          const rowDate = (dateIdx !== -1 && row[dateIdx]) ? row[dateIdx] : selectedDate;
          const rowLang = (langIdx !== -1 && row[langIdx]) ? row[langIdx].toLowerCase() : selectedLanguage;
          const rowGeneral = generalIdx !== -1 && row[generalIdx] ? row[generalIdx] : "";
          const rowCareer = careerIdx !== -1 && row[careerIdx] ? row[careerIdx] : "";
          const rowFinance = financeIdx !== -1 && row[financeIdx] ? row[financeIdx] : "";
          const rowLove = loveIdx !== -1 && row[loveIdx] ? row[loveIdx] : "";
          const rowHealth = healthIdx !== -1 && row[healthIdx] ? row[healthIdx] : "";
          const rowColor = colorIdx !== -1 && row[colorIdx] ? row[colorIdx] : "";
          const rowNumber = numberIdx !== -1 && row[numberIdx] ? row[numberIdx] : "";

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

          const isExisting = rashiId > 0 && existingMap.has(rashiId);

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
      } catch (err: any) {
        setError(\`Failed to parse CSV: \${err.message}\`);
      }
    };

    reader.readAsText(selectedFile);
  };

  // Commit Import
  const handleCommitImport = async () => {
    if (!validation || validation.validRowsCount === 0) return;

    setIsImporting(true);
    setError(null);

    try {
      // Filter rows based on allowOverwrite setting
      const rowsToSave = validation.rows.filter((row) => {
        if (!row.isValid) return false;
        if (row.isExisting && !allowOverwrite) return false;
        return true;
      });

      if (rowsToSave.length === 0) {
        setError("No records eligible for import. Overwrite was disabled and all valid rows already exist.");
        setIsImporting(false);
        return;
      }

      const items: DailyRashiInsightFormData[] = rowsToSave.map((row) => {
        const existing = existingMap.get(row.rashi_id);
        return {
          id: existing?.id,
          insight_date: row.insight_date || selectedDate,
          rashi_id: row.rashi_id,
          language: row.language || selectedLanguage,
          general_outlook: row.general_outlook,
          career_business: row.career_business,
          finance_wealth: row.finance_wealth,
          love_relationships: row.love_relationships,
          health_wellbeing: row.health_wellbeing,
          auspicious_color: row.auspicious_color,
          auspicious_number: row.auspicious_number,
          status: "draft", // Always saved as draft
        };
      });

      const res = await bulkSaveDailyRashiInsightsDrafts(items);

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
              Target Date: <span className="font-semibold text-foreground">{selectedDate}</span> • Target Language:{" "}
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
                                Update
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
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-6 py-3.5 shrink-0">
          <div className="text-xs text-muted-foreground">
            {validation ? (
              <span>
                Ready to import <strong>{allowOverwrite ? validation.validRowsCount : validation.newRowsCount}</strong> drafts
              </span>
            ) : (
              <span>Upload CSV to preview and commit</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isImporting}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCommitImport}
              disabled={isImporting || !validation || validation.validRowsCount === 0}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isImporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save All as Drafts
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
`;

fs.writeFileSync(path.join(adminDir, 'components/admin/astrology/daily-insights/bulk-import-modal.tsx'), bulkImportModalContent, 'utf8');
console.log('Created components/admin/astrology/daily-insights/bulk-import-modal.tsx');

// 3. Update components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx to include the Bulk Import Button and Modal
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
            onClick={() => setIsBulkImportOpen(true)}
            disabled={isPending}
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

      {/* 3. Bulk CSV Import Modal */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        selectedDate={selectedDate}
        selectedLanguage={selectedLanguage}
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

fs.writeFileSync(path.join(adminDir, 'components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx'), matrixViewContent, 'utf8');
console.log('Saved updated components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx');

console.log('BULK IMPORT FEATURE COMPLETED!');

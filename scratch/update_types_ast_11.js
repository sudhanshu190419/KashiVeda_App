const fs = require('fs');

const typesPath = 'C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts';
let content = fs.readFileSync(typesPath, 'utf8');

// 1. Add canonical composite key helper
const compositeKeyHelper = `
export function getDailyInsightCompositeKey(
  date: string,
  rashiId: number,
  language: string = "en"
): string {
  const normDate = (date || "").trim();
  const normLang = (language || "en").trim().toLowerCase() || "en";
  return \`\${normDate}:\${rashiId}:\${normLang}\`;
}
`;

// 2. Replace BulkDraftSaveResult definition
const oldBulkDraftResult = `export interface BulkDraftSaveResult {
  success: boolean;
  savedCount: number;
  failedCount: number;
  errors?: string[];
  message?: string;
}`;

const newBulkDraftResult = `export type BulkImportRowOutcome =
  | 'inserted'
  | 'updated'
  | 'skipped'
  | 'duplicate'
  | 'conflict'
  | 'failed';

export interface BulkImportRowResult {
  insight_date: string;
  rashi_id: number;
  rashi_name?: string;
  language: string;
  outcome: BulkImportRowOutcome;
  version?: number | null;
  error?: string;
  error_code?: string;
  skip_reason?: string;
}

export interface BulkDraftSaveOptions {
  allowOverwrite?: boolean;
}

export interface BulkDraftSaveResult {
  success: boolean;
  totalSubmitted: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  conflictedCount: number;
  failedCount: number;
  savedCount: number; // insertedCount + updatedCount (preserves backwards compatibility)
  results: BulkImportRowResult[];
  errors?: string[];
  message?: string;
}`;

// 3. Update BulkImportParsedRow to include existingVersion
const oldParsedRow = `export interface BulkImportParsedRow {
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
}`;

const newParsedRow = `export interface BulkImportParsedRow {
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
  existingVersion?: number | null;
  isValid: boolean;
  errors: string[];
}`;

let updated = content;

// Insert helper right before BulkDraftSaveResult
if (updated.includes(oldBulkDraftResult)) {
  updated = updated.replace(oldBulkDraftResult, compositeKeyHelper + '\n' + newBulkDraftResult);
  console.log('Replaced BulkDraftSaveResult and inserted getDailyInsightCompositeKey.');
} else {
  console.log('oldBulkDraftResult not found');
}

if (updated.includes(oldParsedRow)) {
  updated = updated.replace(oldParsedRow, newParsedRow);
  console.log('Updated BulkImportParsedRow with existingVersion.');
} else {
  console.log('oldParsedRow not found');
}

fs.writeFileSync(typesPath, updated, 'utf8');
console.log('types file written successfully.');

const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts');
let content = fs.readFileSync(targetFile, 'utf8');

const targetSection = `export interface PublishSetValidationResult {
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
}`;

const replacementSection = `export type PublishRowOutcome = 'published' | 'failed' | 'skipped' | 'conflict';

export interface PublishRowResult {
  rashi_id: number;
  rashi_name: string;
  vedic_name?: string;
  insight_date: string;
  language: string;
  outcome: PublishRowOutcome;
  status: 'published' | 'draft' | 'archived' | 'not_created';
  version?: number | null;
  error?: string;
  error_code?: 'VERSION_CONFLICT' | 'RECORD_NOT_FOUND' | 'VALIDATION_ERROR' | 'DB_ERROR' | string;
  skip_reason?: 'missing_general_outlook' | 'missing_record' | 'not_requested' | 'not_ready' | string;
}

export type PublishSetOverallStatus = 'success' | 'partial_success' | 'failure' | 'prerequisite_error';

export interface PublishSetValidationResult {
  success?: boolean;
  isReadyForPublish: boolean;
  totalRashis: number;
  readyCount: number;
  missingCount: number;
  missingRashis: MissingRashiDetail[];
  error?: string;
}

export interface PublishSetResult {
  success: boolean;
  status: PublishSetOverallStatus;
  date: string;
  language: string;
  requestedCount: number;
  publishedCount: number;
  failedCount: number;
  skippedCount: number;
  results: PublishRowResult[];
  errors?: string[];
  message: string;
  prerequisiteError?: string;
}`;

if (!content.includes(targetSection)) {
  console.error("Target section not found in lib/types/daily-insights-management.ts");
  process.exit(1);
}

content = content.replace(targetSection, replacementSection);
fs.writeFileSync(targetFile, content, 'utf8');
console.log("Successfully updated lib/types/daily-insights-management.ts with AST-10 types.");

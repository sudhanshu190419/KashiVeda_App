const fs = require('fs');
const path = require('path');

const targetPath = 'C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts';

const content = `import {
  CANONICAL_RASHIS,
  getDailyInsightCompositeKey,
  type BulkImportParsedRow,
  type BulkImportValidationResult,
  type DailyRashiInsightFormData,
} from "@/lib/types/daily-insights-management";

// =============================================================================
// Resource Bounds & Supported Constants (AST-12)
// =============================================================================
export const MAX_CSV_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
export const MAX_CSV_ROW_COUNT = 1000;
export const SUPPORTED_LANGUAGES = ["en", "hi"] as const;

// =============================================================================
// Token Validation Utilities
// =============================================================================

export interface TokenValidationResult<T> {
  isValid: boolean;
  value?: T;
  error?: string;
}

/**
 * Strict integer token validator.
 * Rejects decimals ('1.5'), partial text ('1foo'), exponents, whitespace, NaN, and out-of-range values.
 */
export function validateIntegerToken(
  token: unknown,
  options: {
    fieldName: string;
    min?: number;
    max?: number;
    required?: boolean;
  }
): TokenValidationResult<number> {
  const { fieldName, min, max, required = true } = options;

  if (token === null || token === undefined || token === "") {
    if (required) {
      return { isValid: false, error: \`\${fieldName} is required.\` };
    }
    return { isValid: true };
  }

  const str = String(token).trim();
  if (str === "") {
    if (required) {
      return { isValid: false, error: \`\${fieldName} is required.\` };
    }
    return { isValid: true };
  }

  // Strict integer pattern: optional leading minus, followed only by digits
  if (!/^-?\\d+$/.test(str)) {
    return {
      isValid: false,
      error: \`\${fieldName} must be a valid whole integer, received "\${str}".\`,
    };
  }

  const num = Number(str);
  if (!Number.isSafeInteger(num)) {
    return {
      isValid: false,
      error: \`\${fieldName} is outside the safe integer range.\`,
    };
  }

  if (min !== undefined && num < min) {
    return {
      isValid: false,
      error: \`\${fieldName} must be at least \${min}, received \${num}.\`,
    };
  }

  if (max !== undefined && num > max) {
    return {
      isValid: false,
      error: \`\${fieldName} must be at most \${max}, received \${num}.\`,
    };
  }

  return { isValid: true, value: num };
}

/**
 * Strict calendar date validator.
 * Enforces YYYY-MM-DD format and validates Gregorian calendar bounds (no February 30th, rollover, etc.)
 */
export function validateDateToken(token: unknown): TokenValidationResult<string> {
  if (!token || typeof token !== "string" || token.trim() === "") {
    return { isValid: false, error: "Insight date is required." };
  }

  const trimmed = token.trim();
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(trimmed)) {
    return {
      isValid: false,
      error: \`Date must be formatted as YYYY-MM-DD, received "\${trimmed}".\`,
    };
  }

  const [yStr, mStr, dStr] = trimmed.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  if (y < 2000 || y > 2100) {
    return { isValid: false, error: \`Year \${y} is outside the valid operating window (2000-2100).\` };
  }

  if (m < 1 || m > 12) {
    return { isValid: false, error: \`Month \${m} is invalid in date "\${trimmed}".\` };
  }

  if (d < 1 || d > 31) {
    return { isValid: false, error: \`Day \${d} is invalid in date "\${trimmed}".\` };
  }

  // Check Gregorian calendar rollover using UTC
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  if (
    dateObj.getUTCFullYear() !== y ||
    dateObj.getUTCMonth() !== m - 1 ||
    dateObj.getUTCDate() !== d
  ) {
    return {
      isValid: false,
      error: \`Date "\${trimmed}" is not a valid calendar date (calendar rollover detected).\`,
    };
  }

  return { isValid: true, value: trimmed };
}

/**
 * Strict language validator.
 * Normalizes to lowercase and verifies presence in SUPPORTED_LANGUAGES ('en', 'hi').
 */
export function validateLanguageToken(token: unknown): TokenValidationResult<string> {
  if (!token || typeof token !== "string" || token.trim() === "") {
    return { isValid: false, error: "Language is required." };
  }

  const norm = token.trim().toLowerCase();
  if (!SUPPORTED_LANGUAGES.includes(norm as any)) {
    return {
      isValid: false,
      error: \`Unsupported language "\${token}". Supported languages are: \${SUPPORTED_LANGUAGES.join(", ")}.\`,
    };
  }

  return { isValid: true, value: norm };
}

// =============================================================================
// Strict RFC 4180 CSV Grammar Parser
// =============================================================================

export interface RFC4180ParseResult {
  success: boolean;
  rows: string[][];
  error?: string;
  line?: number;
  column?: number;
}

/**
 * Strict RFC 4180 CSV parser.
 * Handles:
 * - Commas inside quoted fields
 * - Escaped double quotes represented as doubled quotes ("")
 * - Valid multiline fields enclosed in quotes
 * - CRLF (\\r\\n) and LF (\\n) line endings
 * - Empty cells
 * Rejects:
 * - Unterminated quotes at EOF
 * - Unescaped quotes inside unquoted fields
 * - Unexpected characters after a closing quote
 * - Inconsistent column counts across rows
 */
export function parseRFC4180CSV(text: string): RFC4180ParseResult {
  if (!text || text.trim().length === 0) {
    return { success: false, rows: [], error: "CSV file is empty." };
  }

  const parsedRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let fieldStarted = false;
  let fieldHadQuotes = false;
  let quoteClosed = false;

  let lineNum = 1;
  let colNum = 0;
  let quoteStartLine = 1;
  let quoteStartCol = 1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    colNum++;

    if (inQuotes) {
      if (char === '"') {
        const nextChar = text[i + 1];
        if (nextChar === '"') {
          // Escaped quote: "" inside quoted field
          currentField += '"';
          i++;
          colNum++;
        } else {
          // Closing quote
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        if (char === "\\n") {
          lineNum++;
          colNum = 0;
        }
        currentField += char;
      }
    } else {
      // Outside quotes
      if (char === '"') {
        if (quoteClosed) {
          return {
            success: false,
            rows: [],
            error: \`Malformed CSV at line \${lineNum}, column \${colNum}: unexpected quote character after closing quote.\`,
            line: lineNum,
            column: colNum,
          };
        }
        if (fieldStarted && currentField.trim().length > 0) {
          return {
            success: false,
            rows: [],
            error: \`Malformed CSV at line \${lineNum}, column \${colNum}: unescaped quote character inside unquoted field.\`,
            line: lineNum,
            column: colNum,
          };
        }
        // Opening quote
        inQuotes = true;
        fieldStarted = true;
        fieldHadQuotes = true;
        quoteStartLine = lineNum;
        quoteStartCol = colNum;
      } else if (char === ",") {
        currentRow.push(fieldHadQuotes ? currentField : currentField.trim());
        currentField = "";
        fieldStarted = false;
        fieldHadQuotes = false;
        quoteClosed = false;
      } else if (char === "\\r") {
        if (text[i + 1] === "\\n") {
          i++; // skip \\r in \\r\\n
        }
        currentRow.push(fieldHadQuotes ? currentField : currentField.trim());
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].length > 0)) {
          parsedRows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
        fieldStarted = false;
        fieldHadQuotes = false;
        quoteClosed = false;
        lineNum++;
        colNum = 0;
      } else if (char === "\\n") {
        currentRow.push(fieldHadQuotes ? currentField : currentField.trim());
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].length > 0)) {
          parsedRows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
        fieldStarted = false;
        fieldHadQuotes = false;
        quoteClosed = false;
        lineNum++;
        colNum = 0;
      } else {
        // Regular characters
        if (quoteClosed) {
          if (char !== " " && char !== "\\t") {
            return {
              success: false,
              rows: [],
              error: \`Malformed CSV at line \${lineNum}, column \${colNum}: unexpected character '\${char}' after closing quote.\`,
              line: lineNum,
              column: colNum,
            };
          }
        } else {
          fieldStarted = true;
          currentField += char;
        }
      }
    }
  }

  if (inQuotes) {
    return {
      success: false,
      rows: [],
      error: \`Malformed CSV at line \${quoteStartLine}, column \${quoteStartCol}: unterminated quoted field.\`,
      line: quoteStartLine,
      column: quoteStartCol,
    };
  }

  // Push final field if any content was parsed
  if (fieldStarted || quoteClosed || currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(fieldHadQuotes ? currentField : currentField.trim());
  }

  if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].length > 0)) {
    parsedRows.push(currentRow);
  }

  // Verify file has data
  if (parsedRows.length === 0) {
    return { success: false, rows: [], error: "CSV file is empty." };
  }

  if (parsedRows.length === 1) {
    return {
      success: false,
      rows: [],
      error: "CSV file contains only a header row and no data entries.",
    };
  }

  // Enforce column count consistency across all rows
  const expectedColCount = parsedRows[0].length;
  for (let r = 1; r < parsedRows.length; r++) {
    if (parsedRows[r].length !== expectedColCount) {
      return {
        success: false,
        rows: [],
        error: \`Inconsistent column count at row \${r + 1}: expected \${expectedColCount} columns matching header, found \${parsedRows[r].length}.\`,
        line: r + 1,
      };
    }
  }

  return { success: true, rows: parsedRows };
}

// =============================================================================
// Comprehensive CSV Parsing & Validation Pipeline
// =============================================================================

export interface CSVParseAndValidateOptions {
  defaultDate: string;
  defaultLanguage: string;
  existingMap?: Map<string, { id?: string; version?: number | null; status?: string }>;
}

export interface CSVValidationOutcome {
  success: boolean;
  validation?: BulkImportValidationResult;
  error?: string;
}

export function parseAndValidateDailyInsightsCSV(
  text: string,
  options: CSVParseAndValidateOptions
): CSVValidationOutcome {
  const { defaultDate, defaultLanguage, existingMap } = options;

  // Step 1: Strict RFC 4180 Parse
  const parseRes = parseRFC4180CSV(text);
  if (!parseRes.success || !parseRes.rows) {
    return { success: false, error: parseRes.error || "Failed to parse CSV." };
  }

  const rows = parseRes.rows;

  // Step 2: Check row count limit
  const dataRowCount = rows.length - 1;
  if (dataRowCount > MAX_CSV_ROW_COUNT) {
    return {
      success: false,
      error: \`CSV row count (\${dataRowCount}) exceeds maximum limit of \${MAX_CSV_ROW_COUNT} rows.\`,
    };
  }

  // Step 3: Validate Headers
  const rawHeaders = rows[0];
  const normalizedHeaders = rawHeaders.map((h) =>
    h.toLowerCase().trim().replace(/[^a-z0-9_]/g, "")
  );

  // Check duplicate headers
  const seenHeaderSet = new Set<string>();
  for (let c = 0; c < normalizedHeaders.length; c++) {
    const h = normalizedHeaders[c];
    if (!h) {
      return { success: false, error: \`Header column \${c + 1} is empty.\` };
    }
    if (seenHeaderSet.has(h)) {
      return {
        success: false,
        error: \`Duplicate header "\${rawHeaders[c]}" found in column \${c + 1}.\`,
      };
    }
    seenHeaderSet.add(h);
  }

  const getIdx = (candidates: string[]) =>
    normalizedHeaders.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

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

  if (idIdx === -1 && nameIdx === -1) {
    return {
      success: false,
      error: 'CSV is missing a required header for Rashi identification ("rashi_id" or "rashi_name").',
    };
  }

  if (generalIdx === -1) {
    return {
      success: false,
      error: 'CSV is missing the required content header ("general_outlook").',
    };
  }

  // Step 4: Validate Data Rows
  const parsedRows: BulkImportParsedRow[] = [];
  const seenCompositeKeys = new Set<string>();
  const generalErrors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowErrors: string[] = [];

    // 1. Identify Rashi with strict token validation
    let rashiId = 0;
    let rashiName = "";

    const rawIdToken = idIdx !== -1 ? row[idIdx] : null;
    const rawNameToken = nameIdx !== -1 ? row[nameIdx] : null;

    if (rawIdToken && rawIdToken.trim().length > 0) {
      const idVal = validateIntegerToken(rawIdToken, {
        fieldName: \`Row \${i} Rashi ID\`,
        min: 1,
        max: 12,
        required: true,
      });

      if (!idVal.isValid) {
        rowErrors.push(idVal.error!);
      } else {
        rashiId = idVal.value!;
      }
    } else if (rawNameToken && rawNameToken.trim().length > 0) {
      const rawName = rawNameToken.trim().toLowerCase();
      const matched = CANONICAL_RASHIS.find(
        (r) =>
          r.vedicName.toLowerCase() === rawName ||
          r.englishName.toLowerCase() === rawName
      );
      if (matched) {
        rashiId = matched.id;
      } else {
        rowErrors.push(
          \`Row \${i}: Unrecognized Rashi name "\${rawNameToken.trim()}". Must match a valid Vedic or English sign name.\`
        );
      }
    } else {
      rowErrors.push(\`Row \${i}: Missing Rashi identification (rashi_id or rashi_name).\`);
    }

    const matchedCanonical = CANONICAL_RASHIS.find((r) => r.id === rashiId);
    if (matchedCanonical) {
      rashiName = matchedCanonical.vedicName;
    } else {
      rashiName = rawNameToken ? rawNameToken.trim() : \`Row-\${i}\`;
    }

    // 2. Validate Date
    let rowDate = defaultDate;
    if (dateIdx !== -1 && row[dateIdx] && row[dateIdx].trim().length > 0) {
      const dateVal = validateDateToken(row[dateIdx]);
      if (!dateVal.isValid) {
        rowErrors.push(\`Row \${i}: \${dateVal.error}\`);
      } else {
        rowDate = dateVal.value!;
      }
    }

    // 3. Validate Language
    let rowLang = defaultLanguage;
    if (langIdx !== -1 && row[langIdx] && row[langIdx].trim().length > 0) {
      const langVal = validateLanguageToken(row[langIdx]);
      if (!langVal.isValid) {
        rowErrors.push(\`Row \${i}: \${langVal.error}\`);
      } else {
        rowLang = langVal.value!;
      }
    }

    // 4. Content fields
    const rowGeneral = generalIdx !== -1 && row[generalIdx] ? row[generalIdx].trim() : "";
    const rowCareer = careerIdx !== -1 && row[careerIdx] ? row[careerIdx].trim() : "";
    const rowFinance = financeIdx !== -1 && row[financeIdx] ? row[financeIdx].trim() : "";
    const rowLove = loveIdx !== -1 && row[loveIdx] ? row[loveIdx].trim() : "";
    const rowHealth = healthIdx !== -1 && row[healthIdx] ? row[healthIdx].trim() : "";
    const rowColor = colorIdx !== -1 && row[colorIdx] ? row[colorIdx].trim() : "";
    const rawNumber = numberIdx !== -1 && row[numberIdx] ? row[numberIdx].trim() : "";

    // 5. Auspicious Number strict validation
    let rowNumber = "";
    if (rawNumber.length > 0) {
      const numVal = validateIntegerToken(rawNumber, {
        fieldName: \`Row \${i} Auspicious number\`,
        min: 1,
        max: 99,
        required: false,
      });
      if (!numVal.isValid) {
        rowErrors.push(numVal.error!);
      } else {
        rowNumber = String(numVal.value);
      }
    }

    // 6. Sectional content check
    const hasAnyContent =
      rowGeneral.length > 0 ||
      rowCareer.length > 0 ||
      rowFinance.length > 0 ||
      rowLove.length > 0 ||
      rowHealth.length > 0 ||
      rowColor.length > 0 ||
      rowNumber.length > 0;

    if (!hasAnyContent) {
      rowErrors.push(\`Row \${i} has no insight content.\`);
    } else if (rowGeneral.length === 0) {
      rowErrors.push(\`Row \${i} is missing mandatory General Outlook guidance.\`);
    }

    // 7. Composite Key Duplicate Tracking (AST-11)
    const compositeKey = getDailyInsightCompositeKey(rowDate, rashiId, rowLang);
    if (rashiId > 0) {
      if (seenCompositeKeys.has(compositeKey)) {
        rowErrors.push(
          \`Row \${i}: Duplicate entry for \${rashiName} on \${rowDate} (\${rowLang.toUpperCase()}) in CSV.\`
        );
      } else {
        seenCompositeKeys.add(compositeKey);
      }
    }

    const initialExisting = existingMap?.get(compositeKey);
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

  const validation: BulkImportValidationResult = {
    isValid: invalidRows.length === 0,
    totalRows: parsedRows.length,
    validRowsCount: validRows.length,
    invalidRowsCount: invalidRows.length,
    existingConflictsCount: existingConflicts.length,
    newRowsCount: parsedRows.length - existingConflicts.length,
    rows: parsedRows,
    generalErrors,
  };

  return { success: true, validation };
}

// =============================================================================
// Server-Side Payload Validator
// =============================================================================

/**
 * Validates a single DailyRashiInsightFormData payload on the server
 * before invoking database mutations.
 */
export function validateDailyInsightDraftPayload(
  item: DailyRashiInsightFormData
): { isValid: boolean; error?: string } {
  // 1. Rashi ID strict integer validation
  const idVal = validateIntegerToken(item.rashi_id, {
    fieldName: "Rashi ID",
    min: 1,
    max: 12,
    required: true,
  });
  if (!idVal.isValid) {
    return { isValid: false, error: idVal.error };
  }

  // 2. Date validation
  const dateVal = validateDateToken(item.insight_date);
  if (!dateVal.isValid) {
    return { isValid: false, error: dateVal.error };
  }

  // 3. Language validation
  const langVal = validateLanguageToken(item.language);
  if (!langVal.isValid) {
    return { isValid: false, error: langVal.error };
  }

  // 4. Auspicious number validation (optional)
  if (
    item.auspicious_number !== undefined &&
    item.auspicious_number !== null &&
    String(item.auspicious_number).trim() !== ""
  ) {
    const numVal = validateIntegerToken(item.auspicious_number, {
      fieldName: "Auspicious number",
      min: 1,
      max: 99,
      required: false,
    });
    if (!numVal.isValid) {
      return { isValid: false, error: numVal.error };
    }
  }

  // 5. General Outlook presence
  if (!item.general_outlook || item.general_outlook.trim() === "") {
    return { isValid: false, error: "General Outlook is required." };
  }

  return { isValid: true };
}
`;

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Created daily-insights-csv-parser.ts successfully');

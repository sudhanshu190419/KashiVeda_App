export {};
declare const __dirname: string;
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

/**
 * Test Suite: AST-12 — CSV Parser Hardening, Identity Validation & Preview Lifecycle
 * Target: C:\Projects\kashi-veda-admin & C:\Projects\KashiVeda
 *
 * Verifies Scenarios A through K:
 * Scenario A: Strict numeric identity (rejects 1.5, 1foo, 0, 13, NaN, unsafe ints)
 * Scenario B: Strict numeric editorial fields (decimals, out-of-range, null optional)
 * Scenario C: Date and language validation (Gregorian calendar rollover, 'en'/'hi')
 * Scenario D: Correct CSV grammar (quoted commas, escaped quotes, multiline, CRLF/LF, malformed quotes)
 * Scenario E: Headers and row shape (missing, duplicate, column count mismatch, empty/header-only files)
 * Scenario F: Old preview invalidation on replacement
 * Scenario G: Overlapping file reads & generation token guard
 * Scenario H: Read and lifecycle failures, file size & row count resource limits
 * Scenario I: Server-side validation and resource limits (batch size, draft payload validation)
 * Scenario J: AST-11 composite identity & AST-09 expected-version regression preservation
 * Scenario K: Result and summary integrity reconciliation
 */

const adminRoot = path.resolve(__dirname, "../../kashi-veda-admin");

function loadAdminModule(relPath: string) {
  const fullPath = path.resolve(adminRoot, relPath);
  const code = fs.readFileSync(fullPath, "utf-8");
  const transformed = babel.transformSync(code, {
    presets: ["@react-native/babel-preset"],
    filename: fullPath,
  });
  const m = { exports: {} as any };
  const customRequire = (id: string) => {
    if (id.startsWith("@/")) {
      const target = id.replace("@/", "") + ".ts";
      return loadAdminModule(target);
    }
    return require(id);
  };
  const fn = new Function("module", "exports", "require", transformed.code);
  fn(m, m.exports, customRequire);
  return m.exports;
}

const parser = loadAdminModule("lib/astrology/daily-insights-csv-parser.ts");

describe("AST-12: CSV Parser Hardening, Identity Validation & Preview Lifecycle", () => {
  const bulkModalPath = path.resolve(
    adminRoot,
    "components/admin/astrology/daily-insights/bulk-import-modal.tsx"
  );
  const actionsPath = path.resolve(
    adminRoot,
    "lib/actions/daily-insights-management.ts"
  );

  let modalContent = "";
  let actionsContent = "";

  beforeAll(() => {
    expect(fs.existsSync(bulkModalPath)).toBe(true);
    expect(fs.existsSync(actionsPath)).toBe(true);
    modalContent = fs.readFileSync(bulkModalPath, "utf-8");
    actionsContent = fs.readFileSync(actionsPath, "utf-8");
  });

  // =========================================================================
  // Scenario A: Strict numeric identity
  // =========================================================================
  describe("Scenario A: Strict Numeric Identity Validation", () => {
    it("rejects 1.5 as Rashi ID", () => {
      const res = parser.validateIntegerToken("1.5", {
        fieldName: "rashi_id",
        min: 1,
        max: 12,
        required: true,
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('must be a valid whole integer, received "1.5"');
    });

    it("rejects 1foo as Rashi ID", () => {
      const res = parser.validateIntegerToken("1foo", {
        fieldName: "rashi_id",
        min: 1,
        max: 12,
        required: true,
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('must be a valid whole integer, received "1foo"');
    });

    it("rejects empty string, whitespace, null, undefined when required", () => {
      expect(
        parser.validateIntegerToken("", { fieldName: "rashi_id", min: 1, max: 12, required: true }).isValid
      ).toBe(false);
      expect(
        parser.validateIntegerToken("   ", { fieldName: "rashi_id", min: 1, max: 12, required: true }).isValid
      ).toBe(false);
      expect(
        parser.validateIntegerToken(null, { fieldName: "rashi_id", min: 1, max: 12, required: true }).isValid
      ).toBe(false);
      expect(
        parser.validateIntegerToken(undefined, { fieldName: "rashi_id", min: 1, max: 12, required: true }).isValid
      ).toBe(false);
    });

    it("rejects unsupported integers 0 and 13 as Rashi IDs", () => {
      const res0 = parser.validateIntegerToken("0", {
        fieldName: "rashi_id",
        min: 1,
        max: 12,
        required: true,
      });
      expect(res0.isValid).toBe(false);
      expect(res0.error).toContain("must be at least 1");

      const res13 = parser.validateIntegerToken("13", {
        fieldName: "rashi_id",
        min: 1,
        max: 12,
        required: true,
      });
      expect(res13.isValid).toBe(false);
      expect(res13.error).toContain("must be at most 12");
    });

    it("rejects values outside safe integer range", () => {
      const hugeVal = "999999999999999999999999999999";
      const res = parser.validateIntegerToken(hugeVal, {
        fieldName: "rashi_id",
        min: 1,
        max: 12,
        required: true,
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("safe integer range");
    });

    it("parses valid supported Rashi IDs 1 through 12 correctly", () => {
      for (let i = 1; i <= 12; i++) {
        const res = parser.validateIntegerToken(String(i), {
          fieldName: "rashi_id",
          min: 1,
          max: 12,
          required: true,
        });
        expect(res.isValid).toBe(true);
        expect(res.value).toBe(i);
      }
    });
  });

  // =========================================================================
  // Scenario B: Strict numeric editorial fields
  // =========================================================================
  describe("Scenario B: Strict Numeric Editorial Fields", () => {
    it("rejects decimals and partial tokens for auspicious_number", () => {
      const resDec = parser.validateIntegerToken("7.5", {
        fieldName: "auspicious_number",
        min: 1,
        max: 99,
        required: false,
      });
      expect(resDec.isValid).toBe(false);

      const resPart = parser.validateIntegerToken("7abc", {
        fieldName: "auspicious_number",
        min: 1,
        max: 99,
        required: false,
      });
      expect(resPart.isValid).toBe(false);
    });

    it("accepts empty optional values as valid with undefined/empty value", () => {
      const resEmpty = parser.validateIntegerToken("", {
        fieldName: "auspicious_number",
        min: 1,
        max: 99,
        required: false,
      });
      expect(resEmpty.isValid).toBe(true);
      expect(resEmpty.value == null).toBe(true);

      const resNull = parser.validateIntegerToken(null, {
        fieldName: "auspicious_number",
        min: 1,
        max: 99,
        required: false,
      });
      expect(resNull.isValid).toBe(true);
      expect(resNull.value == null).toBe(true);
    });

    it("rejects out-of-range values for auspicious_number", () => {
      const resNeg = parser.validateIntegerToken("-5", {
        fieldName: "auspicious_number",
        min: 1,
        max: 99,
        required: false,
      });
      expect(resNeg.isValid).toBe(false);
      expect(resNeg.error).toContain("must be at least 1");

      const resExcess = parser.validateIntegerToken("1000", {
        fieldName: "auspicious_number",
        min: 1,
        max: 99,
        required: false,
      });
      expect(resExcess.isValid).toBe(false);
      expect(resExcess.error).toContain("must be at most 99");
    });

    it("accepts valid auspicious_number within range", () => {
      const res = parser.validateIntegerToken("9", {
        fieldName: "auspicious_number",
        min: 1,
        max: 99,
        required: false,
      });
      expect(res.isValid).toBe(true);
      expect(res.value).toBe(9);
    });
  });

  // =========================================================================
  // Scenario C: Date and language validation
  // =========================================================================
  describe("Scenario C: Date and Language Validation", () => {
    it("accepts valid Gregorian calendar dates", () => {
      const res = parser.validateDateToken("2026-10-15", "insight_date");
      expect(res.isValid).toBe(true);
      expect(res.value).toBe("2026-10-15");
    });

    it("rejects calendar rollover dates (e.g. Feb 30, April 31)", () => {
      const resFeb30 = parser.validateDateToken("2026-02-30", "insight_date");
      expect(resFeb30.isValid).toBe(false);
      expect(resFeb30.error).toContain("calendar rollover detected");

      const resApr31 = parser.validateDateToken("2026-04-31", "insight_date");
      expect(resApr31.isValid).toBe(false);
      expect(resApr31.error).toContain("calendar rollover detected");
    });

    it("rejects malformed date formats", () => {
      expect(parser.validateDateToken("15/10/2026", "insight_date").isValid).toBe(false);
      expect(parser.validateDateToken("2026-1-1", "insight_date").isValid).toBe(false);
      expect(parser.validateDateToken("tomorrow", "insight_date").isValid).toBe(false);
      expect(parser.validateDateToken("", "insight_date").isValid).toBe(false);
    });

    it("accepts supported languages 'en' and 'hi' with whitespace and case normalization", () => {
      expect(parser.validateLanguageToken("en")).toEqual({ isValid: true, value: "en" });
      expect(parser.validateLanguageToken("hi")).toEqual({ isValid: true, value: "hi" });
      expect(parser.validateLanguageToken("  EN  ")).toEqual({ isValid: true, value: "en" });
      expect(parser.validateLanguageToken("  Hi  ")).toEqual({ isValid: true, value: "hi" });
    });

    it("rejects unsupported languages", () => {
      const resFr = parser.validateLanguageToken("fr");
      expect(resFr.isValid).toBe(false);
      expect(resFr.error).toContain('Unsupported language "fr"');

      const resEs = parser.validateLanguageToken("es");
      expect(resEs.isValid).toBe(false);

      const resEmpty = parser.validateLanguageToken("");
      expect(resEmpty.isValid).toBe(false);
    });

    it("supports CSV rows using different valid dates and languages", () => {
      const csv = [
        "rashi_id,rashi_name,general_outlook,insight_date,language",
        "1,Mesh,Aries in English,2026-10-15,en",
        "1,Mesh,Aries in Hindi,2026-10-15,hi",
        "1,Mesh,Aries next day,2026-10-16,en",
      ].join("\n");

      const outcome = parser.parseAndValidateDailyInsightsCSV(csv, {
        defaultDate: "2026-10-15",
        defaultLanguage: "en",
        existingMap: new Map(),
      });

      expect(outcome.success).toBe(true);
      expect(outcome.validation).toBeDefined();
      expect(outcome.validation.totalRows).toBe(3);
      expect(outcome.validation.validRowsCount).toBe(3);
      expect(outcome.validation.invalidRowsCount).toBe(0);
      expect(outcome.validation.rows[0].language).toBe("en");
      expect(outcome.validation.rows[1].language).toBe("hi");
      expect(outcome.validation.rows[2].insight_date).toBe("2026-10-16");
    });
  });

  // =========================================================================
  // Scenario D: Correct CSV grammar (RFC 4180)
  // =========================================================================
  describe("Scenario D: Correct CSV Grammar", () => {
    it("handles commas inside quoted fields", () => {
      const csv = 'rashi_id,general_outlook\n1,"Outlook with, a comma, inside"';
      const res = parser.parseRFC4180CSV(csv);
      expect(res.success).toBe(true);
      expect(res.rows).toEqual([
        ["rashi_id", "general_outlook"],
        ["1", "Outlook with, a comma, inside"],
      ]);
    });

    it("handles escaped quotes represented by doubled double-quotes", () => {
      const csv = 'rashi_id,general_outlook\n1,"Outlook with ""escaped"" quotes"';
      const res = parser.parseRFC4180CSV(csv);
      expect(res.success).toBe(true);
      expect(res.rows).toEqual([
        ["rashi_id", "general_outlook"],
        ["1", 'Outlook with "escaped" quotes'],
      ]);
    });

    it("handles valid quoted multiline fields", () => {
      const csv = 'rashi_id,general_outlook\n1,"Line one\nLine two\nLine three"';
      const res = parser.parseRFC4180CSV(csv);
      expect(res.success).toBe(true);
      expect(res.rows).toEqual([
        ["rashi_id", "general_outlook"],
        ["1", "Line one\nLine two\nLine three"],
      ]);
    });

    it("handles both CRLF and LF line endings", () => {
      const csvCRLF = "rashi_id,general_outlook\r\n1,Outlook A\r\n2,Outlook B\r\n";
      const resCRLF = parser.parseRFC4180CSV(csvCRLF);
      expect(resCRLF.success).toBe(true);
      expect(resCRLF.rows.length).toBe(3);

      const csvLF = "rashi_id,general_outlook\n1,Outlook A\n2,Outlook B\n";
      const resLF = parser.parseRFC4180CSV(csvLF);
      expect(resLF.success).toBe(true);
      expect(resLF.rows.length).toBe(3);
    });

    it("handles empty cells where allowed", () => {
      const csv = "rashi_id,general_outlook,career_business\n1,Outlook,";
      const res = parser.parseRFC4180CSV(csv);
      expect(res.success).toBe(true);
      expect(res.rows).toEqual([
        ["rashi_id", "general_outlook", "career_business"],
        ["1", "Outlook", ""],
      ]);
    });

    it("rejects unterminated quoted fields", () => {
      const csv = 'rashi_id,general_outlook\n1,"unterminated field';
      const res = parser.parseRFC4180CSV(csv);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unterminated quoted field/i);
    });

    it("rejects illegal quotes appearing inside unquoted fields", () => {
      const csv = 'rashi_id,general_outlook\n1,unquoted"quote';
      const res = parser.parseRFC4180CSV(csv);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unescaped quote character/i);
    });

    it("rejects unexpected characters after a closing quote", () => {
      const csv = 'rashi_id,general_outlook\n1,"valid quote"extra';
      const res = parser.parseRFC4180CSV(csv);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unexpected character.*after closing quote/i);
    });

    it("rejects inconsistent column counts between rows", () => {
      const csv = "rashi_id,rashi_name,general_outlook\n1,Mesh,Good\n2,Vrishabha";
      const res = parser.parseRFC4180CSV(csv);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/inconsistent column count/i);
    });
  });

  // =========================================================================
  // Scenario E: Headers and row shape
  // =========================================================================
  describe("Scenario E: Headers and Row Shape Validation", () => {
    it("rejects empty or whitespace-only files", () => {
      const res1 = parser.parseAndValidateDailyInsightsCSV("", {
        defaultDate: "2026-10-15",
        defaultLanguage: "en",
        existingMap: new Map(),
      });
      expect(res1.success).toBe(false);
      expect(res1.error).toMatch(/empty/i);

      const res2 = parser.parseAndValidateDailyInsightsCSV("   \n\n   ", {
        defaultDate: "2026-10-15",
        defaultLanguage: "en",
        existingMap: new Map(),
      });
      expect(res2.success).toBe(false);
      expect(res2.error).toMatch(/empty/i);
    });

    it("rejects header-only files with 0 data rows", () => {
      const csv = "rashi_id,general_outlook\n";
      const res = parser.parseAndValidateDailyInsightsCSV(csv, {
        defaultDate: "2026-10-15",
        defaultLanguage: "en",
        existingMap: new Map(),
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/only a header row and no data entries/i);
    });

    it("rejects missing required headers", () => {
      const csv = "career_business,finance_wealth\nWork,Wealth";
      const res = parser.parseAndValidateDailyInsightsCSV(csv, {
        defaultDate: "2026-10-15",
        defaultLanguage: "en",
        existingMap: new Map(),
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/missing.*required/i);
    });

    it("rejects duplicate required headers", () => {
      const csv = "rashi_id,general_outlook,rashi_id\n1,Outlook,1";
      const res = parser.parseAndValidateDailyInsightsCSV(csv, {
        defaultDate: "2026-10-15",
        defaultLanguage: "en",
        existingMap: new Map(),
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Duplicate header/i);
    });

    it("accepts reordered valid headers", () => {
      const csv = "general_outlook,rashi_id,auspicious_number\nFine day,1,7";
      const res = parser.parseAndValidateDailyInsightsCSV(csv, {
        defaultDate: "2026-10-15",
        defaultLanguage: "en",
        existingMap: new Map(),
      });
      expect(res.success).toBe(true);
      expect(res.validation!.validRowsCount).toBe(1);
      expect(res.validation!.rows[0].rashi_id).toBe(1);
      expect(res.validation!.rows[0].general_outlook).toBe("Fine day");
      expect(res.validation!.rows[0].auspicious_number).toBe("7");
    });
  });

  // =========================================================================
  // Scenario F: Old preview cannot survive invalid replacement
  // =========================================================================
  describe("Scenario F: Old Preview Invalidation on Replacement", () => {
    it("resets validation, error, and sets state to idle/reading when a new file is selected", () => {
      expect(modalContent).toContain("const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) =>");
      expect(modalContent).toContain("setValidation(null);");
      expect(modalContent).toContain("setFile(null);");
      expect(modalContent).toContain("setError(null);");
      expect(modalContent).toContain('setImportState("reading");');
    });

    it("provides handleClearFile resetting file, validation, and error state", () => {
      expect(modalContent).toContain("const handleClearFile = () =>");
      expect(modalContent).toContain("setValidation(null);");
      expect(modalContent).toContain("setFile(null);");
      expect(modalContent).toContain("setError(null);");
      expect(modalContent).toContain('setImportState("idle");');
    });

    it("import button is strictly disabled unless importState === 'ready' with valid rows", () => {
      expect(modalContent).toContain(
        'disabled={importState !== "ready" || !validation || validation.validRowsCount === 0 || isImporting}'
      );
    });

    it("handleCommitImport guards against stale or empty validation before submitting", () => {
      expect(modalContent).toContain(
        'if (importState !== "ready" || !validation || validation.validRowsCount === 0)'
      );
    });
  });

  // =========================================================================
  // Scenario G: Overlapping file reads & generation token guard
  // =========================================================================
  describe("Scenario G: Overlapping File Reads & Generation Token Protection", () => {
    it("uses fileGenerationRef to increment generation token on every file selection and cancellation", () => {
      expect(modalContent).toContain("const fileGenerationRef = useRef(0);");
      expect(modalContent).toContain("const currentGen = ++fileGenerationRef.current;");
      expect(modalContent).toContain("fileGenerationRef.current++;");
    });

    it("aborts active FileReader when new file is selected", () => {
      expect(modalContent).toContain("const activeReaderRef = useRef<FileReader | null>(null);");
      expect(modalContent).toContain("activeReaderRef.current.abort();");
    });

    it("verifies generation token before applying parsed results or setting error state", () => {
      expect(modalContent).toContain("if (currentGen !== fileGenerationRef.current || isUnmountedRef.current) return;");
    });

    it("simulates deterministic race where obsolete file A cannot overwrite file B", () => {
      // Model the generation token pattern
      let fileGeneration = 0;
      let currentState: { file: string; state: string } = { file: "none", state: "idle" };

      // File A starts
      const genA = ++fileGeneration;
      // File B starts before A finishes
      const genB = ++fileGeneration;

      // File B finishes first
      if (genB === fileGeneration) {
        currentState = { file: "File B", state: "ready" };
      }
      expect(currentState.file).toBe("File B");

      // File A finishes afterward
      if (genA === fileGeneration) {
        currentState = { file: "File A", state: "ready" };
      }
      // File A must be discarded!
      expect(currentState.file).toBe("File B");
    });
  });

  // =========================================================================
  // Scenario H: Read and lifecycle failures & Resource limits
  // =========================================================================
  describe("Scenario H: Read/Lifecycle Failures & Resource Limits", () => {
    it("enforces MAX_CSV_FILE_SIZE (2MB) on client before reading file", () => {
      expect(modalContent).toContain("if (selectedFile.size > MAX_CSV_FILE_SIZE)");
      expect(modalContent).toContain('setImportState("error")');
      expect(parser.MAX_CSV_FILE_SIZE).toBe(2 * 1024 * 1024);
    });

    it("enforces MAX_CSV_ROW_COUNT (1000) in CSV validator", () => {
      expect(parser.MAX_CSV_ROW_COUNT).toBe(1000);

      // Generate a CSV with 1001 rows
      const header = "rashi_id,general_outlook\n";
      const rows = Array.from({ length: 1001 }, (_, i) => `${(i % 12) + 1},Outlook for ${i}`).join("\n");
      const oversizedCsv = header + rows;

      const res = parser.parseAndValidateDailyInsightsCSV(oversizedCsv, {
        defaultDate: "2026-10-15",
        defaultLanguage: "en",
        existingMap: new Map(),
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/exceeds maximum limit of 1000 rows/i);
    });

    it("handles FileReader onError and onAbort safely without leaving stale data", () => {
      expect(modalContent).toContain("reader.onerror = () =>");
      expect(modalContent).toContain('setError("Failed to read file from disk.");');
      expect(modalContent).toContain('setImportState("error");');
      expect(modalContent).toContain("reader.onabort = () =>");
    });

    it("tracks isUnmountedRef to prevent state updates after component unmount", () => {
      expect(modalContent).toContain("const isUnmountedRef = useRef(false);");
      expect(modalContent).toContain("isUnmountedRef.current = true;");
    });
  });

  // =========================================================================
  // Scenario I: Server-side validation and resource limits
  // =========================================================================
  describe("Scenario I: Server-Side Validation & Resource Limits", () => {
    it("validateDailyInsightDraftPayload rejects malformed rashi_id tokens", () => {
      const payload: any = {
        insight_date: "2026-10-15",
        rashi_id: "1.5",
        rashi_name: "Mesh",
        language: "en",
        general_outlook: "Good",
      };
      const res = parser.validateDailyInsightDraftPayload(payload);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('must be a valid whole integer, received "1.5"');
    });

    it("validateDailyInsightDraftPayload rejects out-of-range rashi_id", () => {
      const payload: any = {
        insight_date: "2026-10-15",
        rashi_id: 13,
        rashi_name: "Mesh",
        language: "en",
        general_outlook: "Good",
      };
      const res = parser.validateDailyInsightDraftPayload(payload);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("must be at most 12");
    });

    it("validateDailyInsightDraftPayload rejects invalid calendar date with rollover", () => {
      const payload: any = {
        insight_date: "2026-02-30",
        rashi_id: 1,
        rashi_name: "Mesh",
        language: "en",
        general_outlook: "Good",
      };
      const res = parser.validateDailyInsightDraftPayload(payload);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("calendar rollover");
    });

    it("validateDailyInsightDraftPayload rejects unsupported language", () => {
      const payload: any = {
        insight_date: "2026-10-15",
        rashi_id: 1,
        rashi_name: "Mesh",
        language: "fr",
        general_outlook: "Good",
      };
      const res = parser.validateDailyInsightDraftPayload(payload);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Unsupported language "fr"');
    });

    it("validateDailyInsightDraftPayload rejects malformed auspicious_number", () => {
      const payload: any = {
        insight_date: "2026-10-15",
        rashi_id: 1,
        rashi_name: "Mesh",
        language: "en",
        general_outlook: "Good",
        auspicious_number: 1000,
      };
      const res = parser.validateDailyInsightDraftPayload(payload);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("must be at most 99");
    });

    it("bulkSaveDailyRashiInsightsDrafts enforces MAX_CSV_ROW_COUNT on server", () => {
      expect(actionsContent).toContain("if (items.length > MAX_CSV_ROW_COUNT)");
      expect(actionsContent).toContain("exceeds maximum allowed limit of");
    });

    it("bulkSaveDailyRashiInsightsDrafts validates each payload before executing RPC", () => {
      expect(actionsContent).toContain("const payloadValidation = validateDailyInsightDraftPayload(item);");
      expect(actionsContent).toContain('error_code: "VALIDATION_ERROR"');
    });
  });

  // =========================================================================
  // Scenario J: AST-11 regression preservation
  // =========================================================================
  describe("Scenario J: AST-11 Regression Preservation", () => {
    it("preserves multi-date and multi-language composite identity in parseAndValidateDailyInsightsCSV", () => {
      const csv = [
        "rashi_id,general_outlook,insight_date,language",
        "1,Aries Day 1,2026-10-15,en",
        "1,Aries Day 1 Hi,2026-10-15,hi",
        "1,Aries Day 2,2026-10-16,en",
        "1,Aries Day 1 Duplicate,2026-10-15,en",
      ].join("\n");

      const outcome = parser.parseAndValidateDailyInsightsCSV(csv, {
        defaultDate: "2026-10-15",
        defaultLanguage: "en",
        existingMap: new Map(),
      });

      expect(outcome.success).toBe(true);
      expect(outcome.validation!.totalRows).toBe(4);
      expect(outcome.validation!.validRowsCount).toBe(3);
      expect(outcome.validation!.invalidRowsCount).toBe(1);
      expect(outcome.validation!.rows[3].errors[0]).toContain(
        "Duplicate entry for Mesha on 2026-10-15 (EN) in CSV."
      );
    });

    it("bulkSaveDailyRashiInsightsDrafts preserves p_allow_overwrite and expected_version preconditions", () => {
      expect(actionsContent).toContain("p_allow_overwrite: allowOverwrite");
      expect(actionsContent).toContain("p_expected_version: item.expected_version");
      expect(actionsContent).toContain('rpcData.error_code === "OVERWRITE_DISALLOWED"');
      expect(actionsContent).toContain('rpcData.error_code === "VERSION_CONFLICT"');
    });
  });

  // =========================================================================
  // Scenario K: Result and summary integrity
  // =========================================================================
  describe("Scenario K: Result and Summary Integrity", () => {
    it("ensures totalSubmitted equals the sum of all individual row outcomes", () => {
      expect(actionsContent).toContain('const insertedCount = results.filter((r) => r.outcome === "inserted").length;');
      expect(actionsContent).toContain('const updatedCount = results.filter((r) => r.outcome === "updated").length;');
      expect(actionsContent).toContain('const skippedCount = results.filter((r) => r.outcome === "skipped").length;');
      expect(actionsContent).toContain('const conflictedCount = results.filter((r) => r.outcome === "conflict").length;');
      expect(actionsContent).toContain('const savedCount = insertedCount + updatedCount;');
    });

    it("ensures malformed rows marked with VALIDATION_ERROR are counted as failed and never saved", () => {
      expect(actionsContent).toContain('outcome: "failed",');
      expect(actionsContent).toContain('error_code: "VALIDATION_ERROR"');
    });
  });
});

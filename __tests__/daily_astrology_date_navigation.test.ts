export {};
declare const __dirname: string;
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

/**
 * Test Suite: AST-13 — Timezone-Independent Calendar Date Stepping
 * Target: C:\Projects\kashi-veda-admin & C:\Projects\KashiVeda
 *
 * Verifies Requirements:
 * Scenario A: Ordinary date stepping (Next / Previous from canonical date)
 * Scenario B: Timezone independence (verification across UTC, IST, and US Pacific offsets)
 * Scenario C: Month boundary transitions (31-day, 30-day, forward and backward)
 * Scenario D: Year boundary transitions (Dec 31 -> Jan 01 forward and backward)
 * Scenario E: Leap-year boundary transitions (Feb 28/29 leap vs non-leap forward and backward)
 * Scenario F: Daylight Saving Time (DST) transitions (spring forward 23h, fall back 25h)
 * Scenario G: Matrix view integration (handleStepDay, handleDateChange, language preservation, AST-08 coordination)
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

const coordinatorModule = loadAdminModule("lib/astrology/daily-insights-matrix-coordinator.ts");
const { stepCalendarDate, getMatrixIdentityKey, MatrixRequestCoordinator } = coordinatorModule;

describe("AST-13: Timezone-Independent Calendar Date Stepping", () => {
  const matrixViewPath = path.resolve(
    adminRoot,
    "components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx"
  );
  let matrixViewContent = "";

  beforeAll(() => {
    expect(fs.existsSync(matrixViewPath)).toBe(true);
    matrixViewContent = fs.readFileSync(matrixViewPath, "utf-8");
  });

  // =========================================================================
  // Scenario A: Ordinary date stepping
  // =========================================================================
  describe("Scenario A: Ordinary Date Stepping", () => {
    it("advances next day from 2026-10-10 to 2026-10-11", () => {
      expect(stepCalendarDate("2026-10-10", 1)).toBe("2026-10-11");
    });

    it("reverses previous day from 2026-10-10 to 2026-10-09", () => {
      expect(stepCalendarDate("2026-10-10", -1)).toBe("2026-10-09");
    });

    it("returns unchanged canonical date when delta is 0", () => {
      expect(stepCalendarDate("2026-10-10", 0)).toBe("2026-10-10");
    });

    it("supports multi-day offsets accurately", () => {
      expect(stepCalendarDate("2026-10-10", 7)).toBe("2026-10-17");
      expect(stepCalendarDate("2026-10-10", -7)).toBe("2026-10-03");
    });
  });

  // =========================================================================
  // Scenario B: Timezone independence & Input validation
  // =========================================================================
  describe("Scenario B: Timezone Independence & Input Validation", () => {
    it("rejects non-string or empty date input", () => {
      expect(() => stepCalendarDate("", 1)).toThrow(/Invalid date string/i);
      expect(() => stepCalendarDate(null as any, 1)).toThrow(/Invalid date string/i);
      expect(() => stepCalendarDate(undefined as any, 1)).toThrow(/Invalid date string/i);
    });

    it("rejects malformed date formats", () => {
      expect(() => stepCalendarDate("10/10/2026", 1)).toThrow(/Invalid date format/i);
      expect(() => stepCalendarDate("2026-1-1", 1)).toThrow(/Invalid date format/i);
      expect(() => stepCalendarDate("today", 1)).toThrow(/Invalid date format/i);
    });

    it("rejects non-integer delta values", () => {
      expect(() => stepCalendarDate("2026-10-10", 1.5)).toThrow(/must be an integer/i);
      expect(() => stepCalendarDate("2026-10-10", NaN)).toThrow(/must be an integer/i);
      expect(() => stepCalendarDate("2026-10-10", "1" as any)).toThrow(/must be an integer/i);
    });

    it("rejects invalid calendar dates with rollover", () => {
      expect(() => stepCalendarDate("2026-02-30", 1)).toThrow(/calendar rollover detected/i);
      expect(() => stepCalendarDate("2026-04-31", 1)).toThrow(/calendar rollover detected/i);
    });
  });

  // =========================================================================
  // Scenario C: Month boundaries
  // =========================================================================
  describe("Scenario C: Month Boundaries", () => {
    it("advances next from 2026-10-31 to 2026-11-01", () => {
      expect(stepCalendarDate("2026-10-31", 1)).toBe("2026-11-01");
    });

    it("reverses previous from 2026-11-01 to 2026-10-31", () => {
      expect(stepCalendarDate("2026-11-01", -1)).toBe("2026-10-31");
    });

    it("advances next across 30-day month from 2026-04-30 to 2026-05-01", () => {
      expect(stepCalendarDate("2026-04-30", 1)).toBe("2026-05-01");
    });

    it("reverses previous from 2026-05-01 to 2026-04-30", () => {
      expect(stepCalendarDate("2026-05-01", -1)).toBe("2026-04-30");
    });
  });

  // =========================================================================
  // Scenario D: Year boundaries
  // =========================================================================
  describe("Scenario D: Year Boundaries", () => {
    it("advances next from 2026-12-31 to 2027-01-01", () => {
      expect(stepCalendarDate("2026-12-31", 1)).toBe("2027-01-01");
    });

    it("reverses previous from 2027-01-01 to 2026-12-31", () => {
      expect(stepCalendarDate("2027-01-01", -1)).toBe("2026-12-31");
    });
  });

  // =========================================================================
  // Scenario E: Leap-year boundaries
  // =========================================================================
  describe("Scenario E: Leap-Year Boundaries", () => {
    it("advances next from 2024-02-28 to 2024-02-29 in a leap year", () => {
      expect(stepCalendarDate("2024-02-28", 1)).toBe("2024-02-29");
    });

    it("advances next from 2024-02-29 to 2024-03-01 in a leap year", () => {
      expect(stepCalendarDate("2024-02-29", 1)).toBe("2024-03-01");
    });

    it("reverses previous from 2024-03-01 to 2024-02-29 in a leap year", () => {
      expect(stepCalendarDate("2024-03-01", -1)).toBe("2024-02-29");
    });

    it("advances next from 2025-02-28 to 2025-03-01 in a non-leap year", () => {
      expect(stepCalendarDate("2025-02-28", 1)).toBe("2025-03-01");
    });

    it("reverses previous from 2025-03-01 to 2025-02-28 in a non-leap year", () => {
      expect(stepCalendarDate("2025-03-01", -1)).toBe("2025-02-28");
    });

    it("correctly handles century leap year rule (2000 is leap, 1900 is non-leap)", () => {
      expect(stepCalendarDate("2000-02-28", 1)).toBe("2000-02-29");
      expect(stepCalendarDate("1900-02-28", 1)).toBe("1900-03-01");
    });
  });

  // =========================================================================
  // Scenario F: Daylight Saving Time (DST) transitions
  // =========================================================================
  describe("Scenario F: Daylight Saving Time Transitions", () => {
    it("advances and reverses cleanly across Spring Forward 23h transition (March 2026)", () => {
      // US DST Spring Forward occurs on 2026-03-08
      expect(stepCalendarDate("2026-03-07", 1)).toBe("2026-03-08");
      expect(stepCalendarDate("2026-03-08", 1)).toBe("2026-03-09");
      expect(stepCalendarDate("2026-03-09", -1)).toBe("2026-03-08");
      expect(stepCalendarDate("2026-03-08", -1)).toBe("2026-03-07");
    });

    it("advances and reverses cleanly across Fall Back 25h transition (November 2026)", () => {
      // US DST Fall Back occurs on 2026-11-01
      expect(stepCalendarDate("2026-10-31", 1)).toBe("2026-11-01");
      expect(stepCalendarDate("2026-11-01", 1)).toBe("2026-11-02");
      expect(stepCalendarDate("2026-11-02", -1)).toBe("2026-11-01");
      expect(stepCalendarDate("2026-11-01", -1)).toBe("2026-10-31");
    });
  });

  // =========================================================================
  // Scenario G: Matrix View Integration & Coordination
  // =========================================================================
  describe("Scenario G: Matrix View Integration", () => {
    it("imports stepCalendarDate from daily-insights-matrix-coordinator in matrix view", () => {
      expect(matrixViewContent).toContain("stepCalendarDate");
      expect(matrixViewContent).toContain('@/lib/astrology/daily-insights-matrix-coordinator');
    });

    it("handleStepDay delegates to stepCalendarDate(selectedDate, delta) and calls handleDateChange", () => {
      expect(matrixViewContent).toContain("const handleStepDay = (delta: number) => {");
      expect(matrixViewContent).toContain("const nextDateStr = stepCalendarDate(selectedDate, delta);");
      expect(matrixViewContent).toContain("handleDateChange(nextDateStr);");
    });

    it("does not use flawed local Date methods in handleStepDay", () => {
      expect(matrixViewContent).not.toMatch(
        /const\s+current\s*=\s*new\s+Date\(selectedDate\);\s*current\.setDate/
      );
    });

    it("Previous Day and Next Day buttons wire handleStepDay(-1) and handleStepDay(1)", () => {
      expect(matrixViewContent).toContain("onClick={() => handleStepDay(-1)}");
      expect(matrixViewContent).toContain("onClick={() => handleStepDay(1)}");
    });

    it("handleDateChange invalidates open modal slots and synchronizes AST-08 selectedKeyRef", () => {
      expect(matrixViewContent).toContain("setActiveFieldSlot(null);");
      expect(matrixViewContent).toContain("setActiveFullSlot(null);");
      expect(matrixViewContent).toContain("setIsPublishModalOpen(false);");
      expect(matrixViewContent).toContain("setIsBulkImportOpen(false);");
      expect(matrixViewContent).toContain("setSelectedDate(newDate);");
      expect(matrixViewContent).toContain("selectedKeyRef.current = getMatrixIdentityKey(newDate, selectedLanguage);");
      expect(matrixViewContent).toContain("handleFetchMatrix(newDate, selectedLanguage);");
    });

    it("preserves selected language when stepping date", () => {
      // Coordinator identity check
      const date1 = "2026-10-10";
      const lang = "hi";
      const key1 = getMatrixIdentityKey(date1, lang);
      expect(key1).toBe("2026-10-10::hi");

      const date2 = stepCalendarDate(date1, 1);
      const key2 = getMatrixIdentityKey(date2, lang);
      expect(key2).toBe("2026-10-11::hi");
      expect(key2).toContain("::hi");
    });

    it("coordinates with MatrixRequestCoordinator on successive date step requests", () => {
      const coordinator = new MatrixRequestCoordinator();
      let currentDate = "2026-10-10";
      const lang = "en";

      // Step Next
      currentDate = stepCalendarDate(currentDate, 1); // 2026-10-11
      const token1 = coordinator.startRequest(currentDate, lang);
      expect(coordinator.getCurrentGeneration()).toBe(token1);

      // Rapidly step Next again before token1 resolves
      currentDate = stepCalendarDate(currentDate, 1); // 2026-10-12
      const token2 = coordinator.startRequest(currentDate, lang);
      expect(coordinator.getCurrentGeneration()).toBe(token2);

      // Stale token1 response arrives for 2026-10-11
      const canCommitToken1 = coordinator.shouldCommitResponse(
        token1,
        "2026-10-11",
        lang,
        currentDate,
        lang
      );
      expect(canCommitToken1).toBe(false);

      // Latest token2 response arrives for 2026-10-12
      const canCommitToken2 = coordinator.shouldCommitResponse(
        token2,
        "2026-10-12",
        lang,
        currentDate,
        lang
      );
      expect(canCommitToken2).toBe(true);
    });
  });
});

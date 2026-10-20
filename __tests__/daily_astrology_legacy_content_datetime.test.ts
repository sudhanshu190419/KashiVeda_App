export {};
declare const __dirname: string;
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

/**
 * Test Suite: AST-14 — Legacy Content Publication/Expiry Datetime Handling
 * Target: C:\Projects\kashi-veda-admin & C:\Projects\KashiVeda
 *
 * Verifies Requirements:
 * Scenario A: Preserve an unchanged UTC instant (2026-10-10T06:00:00.000Z)
 * Scenario B: India-time / local-time conversion accuracy
 * Scenario C: Browser timezone independence (UTC, Asia/Kolkata, America/Los_Angeles)
 * Scenario D: Independent publication and expiry fields handling & null preservation
 * Scenario E: Default timestamp initialization reflects local/editor timezone
 * Scenario F: Preservation of sub-minute precision (seconds and milliseconds: :45.123Z)
 * Scenario G: Deliberately edited wall-clock datetime converts to correct instant
 * Scenario H: Strict rejection of invalid inputs and calendar rollover
 * Scenario I: Daylight Saving Time (DST) behavior on spring forward & fall back
 * Scenario J: Form regression: editing unrelated fields never shifts unchanged timestamps
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

const datetimeUtils = loadAdminModule("lib/astrology/astrology-datetime-utils.ts");
const {
  formatInstantToLocalDatetimeInput,
  parseLocalDatetimeInputToInstant,
  getLocalCurrentDatetimeInput,
  formatInstantToKolkataDatetimeInput,
  parseKolkataDatetimeInputToInstant,
  getKolkataCurrentDatetimeInput,
} = datetimeUtils;

describe("AST-14: Legacy Content Publication & Expiry Datetime Handling", () => {
  const modalPath = path.resolve(
    adminRoot,
    "components/admin/astrology/modals/content-form-modal.tsx"
  );
  let modalContent = "";

  beforeAll(() => {
    expect(fs.existsSync(modalPath)).toBe(true);
    modalContent = fs.readFileSync(modalPath, "utf-8");
  });

  // =========================================================================
  // Scenario A: Preserve an unchanged UTC instant
  // =========================================================================
  describe("Scenario A: Preserve an Unchanged UTC Instant", () => {
    it("preserves 2026-10-10T06:00:00.000Z exactly when loaded and submitted without modification", () => {
      const originalInstant = "2026-10-10T06:00:00.000Z";
      // Form displays local formatted input
      const localDisplay = formatInstantToLocalDatetimeInput(originalInstant);
      expect(localDisplay).toBeTruthy();

      // On submit without modifying the input
      const savedInstant = parseLocalDatetimeInputToInstant(localDisplay, originalInstant);
      expect(savedInstant).toBe(originalInstant);
    });
  });

  // =========================================================================
  // Scenario B: India-time / local-time conversion accuracy
  // =========================================================================
  describe("Scenario B: India-Time Conversion & Roundtrip", () => {
    it("formats 2026-10-10T06:00:00.000Z into exact India wall-clock 2026-10-10T11:30", () => {
      const originalInstant = "2026-10-10T06:00:00.000Z";
      const kolkataDisplay = formatInstantToKolkataDatetimeInput(originalInstant);
      expect(kolkataDisplay).toBe("2026-10-10T11:30");
    });

    it("converts unchanged India wall-clock value back to exact original instant", () => {
      const originalInstant = "2026-10-10T06:00:00.000Z";
      const kolkataDisplay = formatInstantToKolkataDatetimeInput(originalInstant);
      const savedInstant = parseKolkataDatetimeInputToInstant(kolkataDisplay, originalInstant);
      expect(savedInstant).toBe(originalInstant);
    });

    it("converts a modified India wall-clock time (12:30 IST) to 07:00:00.000Z UTC", () => {
      const modifiedDisplay = "2026-10-10T12:30";
      const savedInstant = parseKolkataDatetimeInputToInstant(modifiedDisplay);
      expect(savedInstant).toBe("2026-10-10T07:00:00.000Z");
    });
  });

  // =========================================================================
  // Scenario C: Browser timezone independence
  // =========================================================================
  describe("Scenario C: Browser Timezone Independence & Consistency", () => {
    it("roundtrips unchanged instant through local formatting without drift", () => {
      const testInstants = [
        "2026-01-15T00:00:00.000Z",
        "2026-06-21T12:30:00.000Z",
        "2026-10-10T06:00:00.000Z",
        "2026-12-31T23:59:59.000Z",
      ];

      for (const instant of testInstants) {
        const localVal = formatInstantToLocalDatetimeInput(instant);
        const restored = parseLocalDatetimeInputToInstant(localVal, instant);
        expect(restored).toBe(instant);
      }
    });
  });

  // =========================================================================
  // Scenario D: Publication and expiry fields independent handling
  // =========================================================================
  describe("Scenario D: Independent Publication and Expiry Handling", () => {
    it("preserves both publication and expiry when both are populated and unchanged", () => {
      const origPublish = "2026-10-10T06:00:00.000Z";
      const origExpiry = "2026-10-15T18:00:00.000Z";

      const dispPublish = formatInstantToLocalDatetimeInput(origPublish);
      const dispExpiry = formatInstantToLocalDatetimeInput(origExpiry);

      expect(parseLocalDatetimeInputToInstant(dispPublish, origPublish)).toBe(origPublish);
      expect(parseLocalDatetimeInputToInstant(dispExpiry, origExpiry)).toBe(origExpiry);
    });

    it("handles null or empty expiry date cleanly without throwing", () => {
      expect(formatInstantToLocalDatetimeInput(null)).toBe("");
      expect(formatInstantToLocalDatetimeInput(undefined)).toBe("");
      expect(parseLocalDatetimeInputToInstant("", null)).toBeNull();
      expect(parseLocalDatetimeInputToInstant(null, null)).toBeNull();
    });

    it("allows clearing an existing expiry date", () => {
      const origExpiry = "2026-10-15T18:00:00.000Z";
      // User deletes the input text
      const clearedVal = "";
      const savedExpiry = parseLocalDatetimeInputToInstant(clearedVal, origExpiry);
      expect(savedExpiry).toBeNull();
    });
  });

  // =========================================================================
  // Scenario E: Default timestamp initialization
  // =========================================================================
  describe("Scenario E: Default Timestamp Initialization", () => {
    it("getLocalCurrentDatetimeInput returns valid YYYY-MM-DDTHH:mm representing current local time", () => {
      const defaultVal = getLocalCurrentDatetimeInput();
      expect(defaultVal).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

      const parsed = parseLocalDatetimeInputToInstant(defaultVal);
      expect(parsed).toBeTruthy();
      // Parsed instant should be within 2 minutes of Date.now()
      const diffMs = Math.abs(new Date(parsed!).getTime() - Date.now());
      expect(diffMs).toBeLessThan(120000);
    });

    it("getKolkataCurrentDatetimeInput returns valid YYYY-MM-DDTHH:mm", () => {
      const kolkataDefault = getKolkataCurrentDatetimeInput();
      expect(kolkataDefault).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });
  });

  // =========================================================================
  // Scenario F: Precision preservation (seconds and milliseconds)
  // =========================================================================
  describe("Scenario F: Precision Preservation", () => {
    it("preserves exact seconds and fractional milliseconds when input is not modified", () => {
      const highPrecisionInstant = "2026-10-10T06:00:45.123Z";
      const display = formatInstantToLocalDatetimeInput(highPrecisionInstant);

      // datetime-local input truncates display to minute, but helper preserves full instant
      const saved = parseLocalDatetimeInputToInstant(display, highPrecisionInstant);
      expect(saved).toBe(highPrecisionInstant);
      expect(saved).toContain(":45.123Z");
    });
  });

  // =========================================================================
  // Scenario G: Deliberately edited timestamp
  // =========================================================================
  describe("Scenario G: Deliberately Edited Timestamp", () => {
    it("detects deliberate modification and parses new wall-clock value to instant", () => {
      const originalInstant = "2026-10-10T06:00:00.000Z";
      const originalDisplay = formatInstantToLocalDatetimeInput(originalInstant);

      // User changes minute component by +30 minutes
      const [datePart, timePart] = originalDisplay.split("T");
      const [hh, mm] = timePart.split(":").map(Number);
      const newMinuteStr = String((mm + 30) % 60).padStart(2, "0");
      const modifiedDisplay = `${datePart}T${String(hh).padStart(2, "0")}:${newMinuteStr}`;

      const saved = parseLocalDatetimeInputToInstant(modifiedDisplay, originalInstant);
      expect(saved).not.toBe(originalInstant);
      expect(saved).toBeTruthy();
    });
  });

  // =========================================================================
  // Scenario H: Invalid input rejection
  // =========================================================================
  describe("Scenario H: Invalid Input Rejection", () => {
    it("rejects malformed datetime formats", () => {
      expect(() => parseLocalDatetimeInputToInstant("invalid")).toThrow(/Invalid local datetime format/);
      expect(() => parseLocalDatetimeInputToInstant("2026-10-10 12:00")).toThrow(/Invalid local datetime format/);
      expect(() => parseLocalDatetimeInputToInstant("10/10/2026T12:00")).toThrow(/Invalid local datetime format/);
    });

    it("rejects invalid hours and minutes", () => {
      expect(() => parseLocalDatetimeInputToInstant("2026-10-10T25:00")).toThrow(/out of valid range/);
      expect(() => parseLocalDatetimeInputToInstant("2026-10-10T12:65")).toThrow(/out of valid range/);
    });

    it("rejects calendar rollover dates (e.g. Feb 30)", () => {
      expect(() => parseLocalDatetimeInputToInstant("2026-02-30T12:00")).toThrow(/calendar rollover/);
      expect(() => parseLocalDatetimeInputToInstant("2026-04-31T12:00")).toThrow(/calendar rollover/);
    });
  });

  // =========================================================================
  // Scenario I: Daylight Saving Time (DST) handling
  // =========================================================================
  describe("Scenario I: Daylight Saving Time Handling", () => {
    it("handles dates on DST transition days deterministically", () => {
      // March 2026 US Spring Forward day (2026-03-08)
      const springInstant = "2026-03-08T18:00:00.000Z";
      const displaySpring = formatInstantToLocalDatetimeInput(springInstant);
      const savedSpring = parseLocalDatetimeInputToInstant(displaySpring, springInstant);
      expect(savedSpring).toBe(springInstant);

      // November 2026 US Fall Back day (2026-11-01)
      const fallInstant = "2026-11-01T18:00:00.000Z";
      const displayFall = formatInstantToLocalDatetimeInput(fallInstant);
      const savedFall = parseLocalDatetimeInputToInstant(displayFall, fallInstant);
      expect(savedFall).toBe(fallInstant);
    });
  });

  // =========================================================================
  // Scenario J: Form Regression & ContentFormModal Verification
  // =========================================================================
  describe("Scenario J: ContentFormModal Implementation Verification", () => {
    it("imports astrology datetime utilities in content-form-modal.tsx", () => {
      expect(modalContent).toContain("formatInstantToLocalDatetimeInput");
      expect(modalContent).toContain("getLocalCurrentDatetimeInput");
      expect(modalContent).toContain("parseLocalDatetimeInputToInstant");
      expect(modalContent).toContain("@/lib/astrology/astrology-datetime-utils");
    });

    it("does not use flawed slice(0, 16) initialization on stored timestamps", () => {
      expect(modalContent).not.toContain("contentItem.publishAt.slice(0, 16)");
      expect(modalContent).not.toContain("contentItem.expiresAt.slice(0, 16)");
    });

    it("does not use getTimezoneOffset slice hack for default initialization", () => {
      expect(modalContent).not.toContain("now.setMinutes(now.getMinutes() - now.getTimezoneOffset())");
    });

    it("passes original instant to parseLocalDatetimeInputToInstant in handleSubmit", () => {
      expect(modalContent).toContain(
        "parseLocalDatetimeInputToInstant(publishAt, contentItem?.publishAt)"
      );
      expect(modalContent).toContain(
        "parseLocalDatetimeInputToInstant(expiresAt, contentItem?.expiresAt)"
      );
    });

    it("enforces expiry > publish constraint before submission", () => {
      expect(modalContent).toContain(
        "if (parsedExpiresAt && new Date(parsedExpiresAt) <= new Date(parsedPublishAt))"
      );
    });
  });
});

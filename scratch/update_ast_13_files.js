const fs = require('fs');
const path = require('path');

// 1. Update daily-insights-matrix-coordinator.ts
const coordPath = 'C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-matrix-coordinator.ts';
let coordCode = fs.readFileSync(coordPath, 'utf8');

const helperCode = `
/**
 * Timezone-independent calendar date stepper (AST-13).
 * Advances or decrements a canonical YYYY-MM-DD calendar date by exactly \`delta\` days.
 * Operates purely on calendar-day units using UTC arithmetic to eliminate browser/local
 * timezone distortions and daylight saving time (DST) shifts.
 *
 * @param dateStr Canonical YYYY-MM-DD date string
 * @param delta Number of calendar days to advance (+1) or reverse (-1)
 * @returns New canonical YYYY-MM-DD date string
 */
export function stepCalendarDate(dateStr: string, delta: number): string {
  if (!dateStr || typeof dateStr !== "string") {
    throw new Error(\`Invalid date string: expected YYYY-MM-DD, received "\${dateStr}".\`);
  }

  const match = dateStr.trim().match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (!match) {
    throw new Error(\`Invalid date format: expected YYYY-MM-DD, received "\${dateStr}".\`);
  }

  if (typeof delta !== "number" || !Number.isInteger(delta)) {
    throw new Error(\`Step delta must be an integer, received \${delta}.\`);
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // UTC midnight calendar instantiation prevents local timezone offset skew
  const initialDate = new Date(Date.UTC(year, month - 1, day));
  if (
    initialDate.getUTCFullYear() !== year ||
    initialDate.getUTCMonth() !== month - 1 ||
    initialDate.getUTCDate() !== day
  ) {
    throw new Error(\`Invalid calendar date "\${dateStr}" (calendar rollover detected).\`);
  }

  initialDate.setUTCDate(initialDate.getUTCDate() + delta);

  const yyyy = String(initialDate.getUTCFullYear()).padStart(4, "0");
  const mm = String(initialDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(initialDate.getUTCDate()).padStart(2, "0");

  return \`\${yyyy}-\${mm}-\${dd}\`;
}
`;

if (!coordCode.includes('export function stepCalendarDate')) {
  coordCode = coordCode.trimEnd() + '\n' + helperCode;
  fs.writeFileSync(coordPath, coordCode, 'utf8');
  console.log('Appended stepCalendarDate to daily-insights-matrix-coordinator.ts');
} else {
  console.log('stepCalendarDate already in coordinator');
}

// 2. Update daily-insights-matrix-view.tsx
const viewPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx';
let viewCode = fs.readFileSync(viewPath, 'utf8');

// Ensure stepCalendarDate is imported
if (!viewCode.includes('stepCalendarDate')) {
  viewCode = viewCode.replace(
    '  validateBulkDraftCoherence,\n} from "@/lib/astrology/daily-insights-matrix-coordinator";',
    '  validateBulkDraftCoherence,\n  stepCalendarDate,\n} from "@/lib/astrology/daily-insights-matrix-coordinator";'
  );
  console.log('Added stepCalendarDate import');
}

// Find handleStepDay
const startIdx = viewCode.indexOf('const handleStepDay = (delta: number) => {');
if (startIdx !== -1) {
  const endIdx = viewCode.indexOf('};', startIdx) + 2;
  const oldBlock = viewCode.substring(startIdx, endIdx);
  const newBlock = `const handleStepDay = (delta: number) => {
    try {
      // AST-13: Timezone-independent calendar date stepping
      const nextDateStr = stepCalendarDate(selectedDate, delta);
      handleDateChange(nextDateStr);
    } catch (err) {
      console.error("Failed to step calendar date:", err);
    }
  };`;
  viewCode = viewCode.replace(oldBlock, newBlock);
  fs.writeFileSync(viewPath, viewCode, 'utf8');
  console.log('Successfully replaced handleStepDay');
} else {
  console.error('Could not locate handleStepDay in matrix view');
}

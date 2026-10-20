import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminCoordinatorPath = path.resolve(
  __dirname,
  '../../kashi-veda-admin/lib/astrology/daily-insights-matrix-coordinator.ts'
);

const { stepCalendarDate } = await import(
  `file:///${adminCoordinatorPath.replace(/\\/g, '/')}`
);

const mode = process.argv[2];

if (mode === 'cases') {
  const TEST_CASES = [
    ['2026-10-10', 1, '2026-10-11', 'Ordinary step next (+1)'],
    ['2026-10-10', -1, '2026-10-09', 'Ordinary step prev (-1)'],
    ['2026-10-31', 1, '2026-11-01', 'Month boundary Oct 31 -> Nov 01'],
    ['2026-11-01', -1, '2026-10-31', 'Month boundary Nov 01 -> Oct 31'],
    ['2026-12-31', 1, '2027-01-01', 'Year boundary 2026-12-31 -> 2027-01-01'],
    ['2027-01-01', -1, '2026-12-31', 'Year boundary 2027-01-01 -> 2026-12-31'],
    ['2024-02-28', 1, '2024-02-29', 'Leap year Feb 28 -> Feb 29 (2024)'],
    ['2024-02-29', 1, '2024-03-01', 'Leap year Feb 29 -> Mar 01 (2024)'],
    ['2024-03-01', -1, '2024-02-29', 'Leap year Mar 01 -> Feb 29 (2024)'],
    ['2025-02-28', 1, '2025-03-01', 'Non-leap year Feb 28 -> Mar 01 (2025)'],
    ['2025-03-01', -1, '2025-02-28', 'Non-leap year Mar 01 -> Feb 28 (2025)'],
    ['2026-03-07', 1, '2026-03-08', 'US Spring forward transition 1 (2026-03-07 -> 08)'],
    ['2026-03-08', 1, '2026-03-09', 'US Spring forward transition 2 (2026-03-08 -> 09)'],
    ['2026-03-09', -1, '2026-03-08', 'US Spring forward reverse 1 (2026-03-09 -> 08)'],
    ['2026-03-08', -1, '2026-03-07', 'US Spring forward reverse 2 (2026-03-08 -> 07)'],
    ['2026-10-31', 1, '2026-11-01', 'US Fall back transition 1 (2026-10-31 -> 11-01)'],
    ['2026-11-01', 1, '2026-11-02', 'US Fall back transition 2 (2026-11-01 -> 11-02)'],
    ['2026-11-02', -1, '2026-11-01', 'US Fall back reverse 1 (2026-11-02 -> 11-01)'],
    ['2026-11-01', -1, '2026-10-31', 'US Fall back reverse 2 (2026-11-01 -> 10-31)'],
  ];

  for (const [inputDate, delta, expected, desc] of TEST_CASES) {
    const res = stepCalendarDate(inputDate, delta);
    if (res !== expected) {
      console.error(`FAILED [${desc}]: expected ${expected}, got ${res}`);
      process.exit(1);
    }
  }
  console.log('ALL_CASES_PASSED');
} else if (mode === 'compare') {
  const date = '2026-10-10';
  // Legacy buggy method
  const current = new Date(date);
  current.setDate(current.getDate() + 1);
  const yyyy = current.getFullYear();
  const mm = String(current.getMonth() + 1).padStart(2, '0');
  const dd = String(current.getDate()).padStart(2, '0');
  const legacyNext = `${yyyy}-${mm}-${dd}`;

  // Fixed AST-13 method
  const fixedNext = stepCalendarDate(date, 1);
  console.log(JSON.stringify({ legacyNext, fixedNext }));
}

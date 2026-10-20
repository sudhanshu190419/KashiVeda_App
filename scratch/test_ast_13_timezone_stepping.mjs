import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.resolve(__dirname, 'tz_worker.mjs');

const TIMEZONES = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles'];

for (const tz of TIMEZONES) {
  test(`AST-13 Timezone Verification: ${tz}`, () => {
    const out = execSync(`node "${workerPath}" cases`, {
      env: { ...process.env, TZ: tz },
    }).toString().trim();

    assert.equal(out, 'ALL_CASES_PASSED');
  });
}

test('AST-13 Defect Contrast: Legacy method fails in America/Los_Angeles while stepCalendarDate succeeds', () => {
  const rawOut = execSync(`node "${workerPath}" compare`, {
    env: { ...process.env, TZ: 'America/Los_Angeles' },
  }).toString().trim();

  const { legacyNext, fixedNext } = JSON.parse(rawOut);

  // Legacy method fails by remaining on the same day in America/Los_Angeles!
  assert.equal(legacyNext, '2026-10-10', 'Legacy implementation fails to step');
  // Fixed stepCalendarDate correctly advances to 2026-10-11
  assert.equal(fixedNext, '2026-10-11', 'stepCalendarDate correctly steps day');
});

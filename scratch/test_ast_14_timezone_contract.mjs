import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.resolve(__dirname, 'ast_14_tz_worker.mjs');

const TIMEZONES = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles'];

for (const tz of TIMEZONES) {
  test(`AST-14 Timezone Roundtrip Verification: ${tz}`, () => {
    const rawOut = execSync(`node "${workerPath}" roundtrip`, {
      env: { ...process.env, TZ: tz },
    }).toString().trim();

    const data = JSON.parse(rawOut);

    assert.equal(data.preserved1, true, `Instant 1 must be perfectly preserved in ${tz}`);
    assert.equal(data.preserved2, true, `Instant 2 with milliseconds must be perfectly preserved in ${tz}`);
    assert.equal(data.restored1, '2026-10-10T06:00:00.000Z');
    assert.equal(data.restored2, '2026-10-10T06:00:45.123Z');

    // Verify expected display wall-clock strings
    if (tz === 'UTC') {
      assert.equal(data.disp1, '2026-10-10T06:00');
    } else if (tz === 'Asia/Kolkata') {
      assert.equal(data.disp1, '2026-10-10T11:30');
    } else if (tz === 'America/Los_Angeles') {
      assert.equal(data.disp1, '2026-10-09T23:00');
    }
  });

  test(`AST-14 Defect Contrast vs Legacy Slicing: ${tz}`, () => {
    const rawOut = execSync(`node "${workerPath}" legacy_contrast`, {
      env: { ...process.env, TZ: tz },
    }).toString().trim();

    const data = JSON.parse(rawOut);

    // Fixed implementation always preserves 0ms drift
    assert.equal(data.fixedDriftMs, 0, `Fixed method must have 0ms drift in ${tz}`);
    assert.equal(data.fixedSaved, '2026-10-10T06:00:00.000Z');

    // In non-UTC timezones, legacy implementation severely shifts the instant
    if (tz === 'Asia/Kolkata') {
      // IST is +5h30m, so legacy shift is -5.5 hours (-19800000 ms)
      assert.equal(data.legacySaved, '2026-10-10T00:30:00.000Z');
      assert.equal(data.legacyDriftMs, -19800000);
    } else if (tz === 'America/Los_Angeles') {
      // PDT is -7h, so legacy shift is +7 hours (+25200000 ms)
      assert.equal(data.legacySaved, '2026-10-10T13:00:00.000Z');
      assert.equal(data.legacyDriftMs, 25200000);
    }
  });

  test(`AST-14 Deliberate Edit Serialization: ${tz}`, () => {
    const rawOut = execSync(`node "${workerPath}" edit`, {
      env: { ...process.env, TZ: tz },
    }).toString().trim();

    const data = JSON.parse(rawOut);
    // Advancing wall-clock time by 1 hour should advance UTC instant by exactly 60 minutes
    assert.equal(data.diffMinutes, 60, `Deliberate 1-hour edit must advance instant by 60 minutes in ${tz}`);
  });
}

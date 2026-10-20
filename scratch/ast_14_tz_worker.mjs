import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminUtilsPath = path.resolve(
  __dirname,
  '../../kashi-veda-admin/lib/astrology/astrology-datetime-utils.ts'
);

const {
  formatInstantToLocalDatetimeInput,
  parseLocalDatetimeInputToInstant,
} = await import(`file:///${adminUtilsPath.replace(/\\/g, '/')}`);

const mode = process.argv[2];

if (mode === 'roundtrip') {
  const sample1 = '2026-10-10T06:00:00.000Z';
  const sample2 = '2026-10-10T06:00:45.123Z';

  const disp1 = formatInstantToLocalDatetimeInput(sample1);
  const disp2 = formatInstantToLocalDatetimeInput(sample2);

  const restored1 = parseLocalDatetimeInputToInstant(disp1, sample1);
  const restored2 = parseLocalDatetimeInputToInstant(disp2, sample2);

  console.log(
    JSON.stringify({
      tz: process.env.TZ,
      disp1,
      disp2,
      restored1,
      restored2,
      preserved1: restored1 === sample1,
      preserved2: restored2 === sample2,
    })
  );
} else if (mode === 'legacy_contrast') {
  const original = '2026-10-10T06:00:00.000Z';

  // Legacy method: slice(0, 16) then new Date(input).toISOString()
  const legacyDisplay = original.slice(0, 16);
  const legacySaved = new Date(legacyDisplay).toISOString();

  // Fixed method: formatInstantToLocalDatetimeInput then parseLocalDatetimeInputToInstant
  const fixedDisplay = formatInstantToLocalDatetimeInput(original);
  const fixedSaved = parseLocalDatetimeInputToInstant(fixedDisplay, original);

  console.log(
    JSON.stringify({
      tz: process.env.TZ,
      original,
      legacyDisplay,
      legacySaved,
      legacyDriftMs: new Date(legacySaved).getTime() - new Date(original).getTime(),
      fixedDisplay,
      fixedSaved,
      fixedDriftMs: new Date(fixedSaved).getTime() - new Date(original).getTime(),
    })
  );
} else if (mode === 'edit') {
  const original = '2026-10-10T06:00:00.000Z';
  // User changes time forward by 1 hour (e.g. via date picker)
  const d = new Date(original);
  d.setHours(d.getHours() + 1);
  const editedDisplay = formatInstantToLocalDatetimeInput(d.toISOString());
  const editedSaved = parseLocalDatetimeInputToInstant(editedDisplay, original);

  console.log(
    JSON.stringify({
      tz: process.env.TZ,
      original,
      editedDisplay,
      editedSaved,
      diffMinutes: Math.round(
        (new Date(editedSaved).getTime() - new Date(original).getTime()) / 60000
      ),
    })
  );
}

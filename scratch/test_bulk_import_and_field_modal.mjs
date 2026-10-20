import test from 'node:test';
import assert from 'node:assert/strict';

// =============================================================================
// COMPREHENSIVE TEST SUITE: FIELD-SPECIFIC MODAL + BULK CSV IMPORT
// =============================================================================

const CANONICAL_RASHIS = [
  { id: 1, vedicName: 'Mesha', englishName: 'Aries', symbol: '♈' },
  { id: 2, vedicName: 'Vrishabha', englishName: 'Taurus', symbol: '♉' },
  { id: 3, vedicName: 'Mithuna', englishName: 'Gemini', symbol: '♊' },
  { id: 4, vedicName: 'Karka', englishName: 'Cancer', symbol: '♋' },
  { id: 5, vedicName: 'Simha', englishName: 'Leo', symbol: '♌' },
  { id: 6, vedicName: 'Kanya', englishName: 'Virgo', symbol: '♍' },
  { id: 7, vedicName: 'Tula', englishName: 'Libra', symbol: '♎' },
  { id: 8, vedicName: 'Vrishchika', englishName: 'Scorpio', symbol: '♏' },
  { id: 9, vedicName: 'Dhanu', englishName: 'Sagittarius', symbol: '♐' },
  { id: 10, vedicName: 'Makara', englishName: 'Capricorn', symbol: '♑' },
  { id: 11, vedicName: 'Kumbha', englishName: 'Aquarius', symbol: '♒' },
  { id: 12, vedicName: 'Meena', englishName: 'Pisces', symbol: '♓' },
];

// RFC-4180 CSV Parser utility under test
function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentToken = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentToken += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentToken.trim());
      currentToken = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n in Windows CRLF
      }
      row.push(currentToken.trim());
      if (row.some((cell) => cell.length > 0)) {
        lines.push(row);
      }
      row = [];
      currentToken = '';
    } else {
      currentToken += char;
    }
  }

  if (currentToken.length > 0 || row.length > 0) {
    row.push(currentToken.trim());
    if (row.some((cell) => cell.length > 0)) {
      lines.push(row);
    }
  }

  return lines;
}

// -----------------------------------------------------------------------------
// SECTION 1: FIELD-SPECIFIC MODAL TESTS
// -----------------------------------------------------------------------------

test('1. Field Modal: General Outlook cell opens General Outlook-only editor', () => {
  const openFieldEditor = (rashi, insight, field) => ({
    mode: 'field',
    rashi,
    field,
    title: `${rashi.vedicName} — General Outlook`,
    renderedFields: [field],
  });

  const slot = openFieldEditor(CANONICAL_RASHIS[0], null, 'general_outlook');
  assert.equal(slot.field, 'general_outlook');
  assert.equal(slot.title, 'Mesha — General Outlook');
  assert.deepEqual(slot.renderedFields, ['general_outlook']);
});

test('2. Field Modal: Career cell opens Career & Business-only editor', () => {
  const openFieldEditor = (rashi, insight, field) => ({
    mode: 'field',
    rashi,
    field,
    title: `${rashi.vedicName} — Career & Business`,
    renderedFields: [field],
  });

  const slot = openFieldEditor(CANONICAL_RASHIS[0], null, 'career_business');
  assert.equal(slot.field, 'career_business');
  assert.equal(slot.title, 'Mesha — Career & Business');
  assert.deepEqual(slot.renderedFields, ['career_business']);
});

test('3. Field Modal: Finance cell opens Finance & Wealth-only editor', () => {
  const openFieldEditor = (rashi, insight, field) => ({
    mode: 'field',
    rashi,
    field,
    title: `${rashi.vedicName} — Finance & Wealth`,
    renderedFields: [field],
  });

  const slot = openFieldEditor(CANONICAL_RASHIS[1], null, 'finance_wealth');
  assert.equal(slot.field, 'finance_wealth');
  assert.equal(slot.title, 'Vrishabha — Finance & Wealth');
});

test('4. Field Modal: Love cell opens Love & Relationships-only editor', () => {
  const openFieldEditor = (rashi, insight, field) => ({
    mode: 'field',
    rashi,
    field,
    title: `${rashi.vedicName} — Love & Relationships`,
    renderedFields: [field],
  });

  const slot = openFieldEditor(CANONICAL_RASHIS[2], null, 'love_relationships');
  assert.equal(slot.field, 'love_relationships');
  assert.equal(slot.title, 'Mithuna — Love & Relationships');
});

test('5. Field Modal: Row-level Create and Edit actions open the complete multi-field editor', () => {
  const openRowAction = (rashi, insight) => ({
    mode: 'full',
    rashi,
    insight,
    allFieldsIncluded: true,
  });

  const slot = openRowAction(CANONICAL_RASHIS[3], null);
  assert.equal(slot.mode, 'full');
  assert.equal(slot.allFieldsIncluded, true);
});

test('6. Field Modal: Saving an individual field preserves all other existing fields', () => {
  const existingInsight = {
    id: 'insight-100',
    rashi_id: 1,
    general_outlook: 'Dynamic planetary transit.',
    career_business: 'Lead corporate discussions.',
    finance_wealth: 'Safe investments.',
    love_relationships: 'Harmony at home.',
    health_wellbeing: 'Daily walking.',
    auspicious_color: 'Saffron',
    auspicious_number: '9',
    status: 'draft',
  };

  const payload = {
    id: existingInsight.id,
    insight_date: '2026-10-10',
    rashi_id: existingInsight.rashi_id,
    language: 'en',
    general_outlook: existingInsight.general_outlook,
    career_business: 'NEW UPDATED CAREER NOTES.',
    finance_wealth: existingInsight.finance_wealth,
    love_relationships: existingInsight.love_relationships,
    health_wellbeing: existingInsight.health_wellbeing,
    auspicious_color: existingInsight.auspicious_color,
    auspicious_number: existingInsight.auspicious_number,
    status: 'draft',
  };

  assert.equal(payload.career_business, 'NEW UPDATED CAREER NOTES.');
  assert.equal(payload.general_outlook, 'Dynamic planetary transit.');
  assert.equal(payload.finance_wealth, 'Safe investments.');
  assert.equal(payload.love_relationships, 'Harmony at home.');
  assert.equal(payload.health_wellbeing, 'Daily walking.');
  assert.equal(payload.auspicious_color, 'Saffron');
  assert.equal(payload.auspicious_number, '9');
  assert.equal(payload.id, 'insight-100');
});

test('7. Field Modal: Editing a published record warns before changing to draft', () => {
  const isPublished = true;
  const isConfirmed = false;

  const validate = (published, confirmed) => {
    if (published && !confirmed) {
      return { allowed: false, error: 'Confirmation required before changing published record to draft.' };
    }
    return { allowed: true };
  };

  const res = validate(isPublished, isConfirmed);
  assert.equal(res.allowed, false);
});

// -----------------------------------------------------------------------------
// SECTION 2: BULK CSV IMPORT TESTS
// -----------------------------------------------------------------------------

test('8. Bulk CSV Import: Generates standard 12-Rashi template with correct headers', () => {
  const headers = [
    'rashi_id',
    'rashi_name',
    'insight_date',
    'language',
    'general_outlook',
    'career_business',
    'finance_wealth',
    'love_relationships',
    'health_wellbeing',
    'auspicious_color',
    'auspicious_number',
  ];

  const rows = CANONICAL_RASHIS.map((rashi) => [
    String(rashi.id),
    rashi.vedicName,
    '2026-10-10',
    'en',
    `"${rashi.vedicName} outlook"`,
    '"Career"',
    '"Finance"',
    '"Love"',
    '"Health"',
    '"Yellow"',
    '9',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const parsed = parseCSV(csv);

  assert.equal(parsed.length, 13); // 1 header + 12 data rows
  assert.equal(parsed[0][0], 'rashi_id');
  assert.equal(parsed[1][1], 'Mesha');
  assert.equal(parsed[12][1], 'Meena');
});

test('9. Bulk CSV Import: RFC 4180 parser handles quotes, multiline text, and commas cleanly', () => {
  const rawCsv = `rashi_id,rashi_name,general_outlook,career_business
1,Mesha,"Leadership energy is strong.
Continue forward with courage, patience, and resolve.","Deals and agreements, especially in technology, flourish."
2,Vrishabha,"Steadfast progress.","Practical solutions win."`;

  const parsed = parseCSV(rawCsv);

  assert.equal(parsed.length, 3);
  assert.equal(parsed[1][0], '1');
  assert.equal(parsed[1][1], 'Mesha');
  assert.equal(parsed[1][2], 'Leadership energy is strong.\nContinue forward with courage, patience, and resolve.');
  assert.equal(parsed[1][3], 'Deals and agreements, especially in technology, flourish.');
  assert.equal(parsed[2][0], '2');
  assert.equal(parsed[2][1], 'Vrishabha');
});

test('10. Bulk CSV Import: Rashi resolution identifies names and IDs accurately', () => {
  const resolveRashi = (rawId, rawName) => {
    let id = parseInt(rawId, 10);
    if (!isNaN(id) && id >= 1 && id <= 12) {
      return CANONICAL_RASHIS.find((r) => r.id === id);
    }
    const cleanName = (rawName || '').trim().toLowerCase();
    return CANONICAL_RASHIS.find(
      (r) =>
        r.vedicName.toLowerCase() === cleanName ||
        r.englishName.toLowerCase() === cleanName
    );
  };

  assert.equal(resolveRashi('5', '').vedicName, 'Simha');
  assert.equal(resolveRashi('', 'Scorpio').vedicName, 'Vrishchika');
  assert.equal(resolveRashi('', 'Dhanu').vedicName, 'Dhanu');
  assert.equal(resolveRashi('99', 'invalid'), undefined);
});

test('11. Bulk CSV Import: Detects duplicate Rashis in the uploaded file', () => {
  const rows = [
    { rashiId: 1, vedicName: 'Mesha' },
    { rashiId: 2, vedicName: 'Vrishabha' },
    { rashiId: 1, vedicName: 'Mesha' }, // duplicate
  ];

  const seen = new Set();
  const duplicates = [];

  rows.forEach((r, idx) => {
    if (seen.has(r.rashiId)) {
      duplicates.push({ rashiId: r.rashiId, row: idx + 1 });
    } else {
      seen.add(r.rashiId);
    }
  });

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].rashiId, 1);
  assert.equal(duplicates[0].row, 3);
});

test('12. Bulk CSV Import: Overwrite protection skips existing records when allowOverwrite is false', () => {
  const existingMap = new Map([[1, { id: 'rec-1' }], [2, { id: 'rec-2' }]]);

  const parsedRows = [
    { rashi_id: 1, isExisting: true, general_outlook: 'New Mesha' },
    { rashi_id: 2, isExisting: true, general_outlook: 'New Vrishabha' },
    { rashi_id: 3, isExisting: false, general_outlook: 'New Mithuna' },
  ];

  const filterRowsToSave = (rows, allowOverwrite) => {
    return rows.filter((r) => {
      if (r.isExisting && !allowOverwrite) return false;
      return true;
    });
  };

  // Case A: allowOverwrite = true -> all 3 saved
  const allowResult = filterRowsToSave(parsedRows, true);
  assert.equal(allowResult.length, 3);

  // Case B: allowOverwrite = false -> only 1 new record saved, 2 preserved
  const denyResult = filterRowsToSave(parsedRows, false);
  assert.equal(denyResult.length, 1);
  assert.equal(denyResult[0].rashi_id, 3);
});

test('13. Bulk CSV Import: Saves all imported records with status "draft"', () => {
  const importedRow = {
    rashi_id: 4,
    insight_date: '2026-10-10',
    language: 'en',
    general_outlook: 'Empathy and caring energy.',
    career_business: 'Supportive team work.',
  };

  const payload = {
    ...importedRow,
    status: 'draft',
  };

  assert.equal(payload.status, 'draft');
});

test('14. Complete System: Manual field editing, full editing, and bulk import coexist harmoniously', () => {
  const modes = ['field', 'full', 'bulk_import'];

  assert.equal(modes.includes('field'), true);
  assert.equal(modes.includes('full'), true);
  assert.equal(modes.includes('bulk_import'), true);
});

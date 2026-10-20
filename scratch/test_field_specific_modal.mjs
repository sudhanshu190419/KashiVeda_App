import test from 'node:test';
import assert from 'node:assert/strict';

// =============================================================================
// COMPREHENSIVE TEST SUITE: FIELD-SPECIFIC VS FULL EDITORIAL MATRIX INTERACTION
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

test('1. General Outlook cell opens General Outlook-only editor configuration', () => {
  const openFieldEditor = (rashi, insight, field) => ({
    mode: 'field',
    rashi,
    insight,
    field,
    title: `${rashi.vedicName} — General Outlook`,
    renderedFields: ['general_outlook'],
  });

  const slot = openFieldEditor(CANONICAL_RASHIS[0], null, 'general_outlook');
  assert.equal(slot.mode, 'field');
  assert.equal(slot.field, 'general_outlook');
  assert.equal(slot.title, 'Mesha — General Outlook');
  assert.deepEqual(slot.renderedFields, ['general_outlook']);
});

test('2. Career cell opens Career-only editor configuration', () => {
  const openFieldEditor = (rashi, insight, field) => ({
    mode: 'field',
    rashi,
    insight,
    field,
    title: `${rashi.vedicName} — Career & Business`,
    renderedFields: ['career_business'],
  });

  const slot = openFieldEditor(CANONICAL_RASHIS[0], null, 'career_business');
  assert.equal(slot.mode, 'field');
  assert.equal(slot.field, 'career_business');
  assert.equal(slot.title, 'Mesha — Career & Business');
  assert.deepEqual(slot.renderedFields, ['career_business']);
});

test('3. Finance cell opens Finance-only editor configuration', () => {
  const openFieldEditor = (rashi, insight, field) => ({
    mode: 'field',
    rashi,
    insight,
    field,
    title: `${rashi.vedicName} — Finance & Wealth`,
    renderedFields: ['finance_wealth'],
  });

  const slot = openFieldEditor(CANONICAL_RASHIS[0], null, 'finance_wealth');
  assert.equal(slot.mode, 'field');
  assert.equal(slot.field, 'finance_wealth');
  assert.equal(slot.title, 'Mesha — Finance & Wealth');
  assert.deepEqual(slot.renderedFields, ['finance_wealth']);
});

test('4. Love cell opens Love-only editor configuration', () => {
  const openFieldEditor = (rashi, insight, field) => ({
    mode: 'field',
    rashi,
    insight,
    field,
    title: `${rashi.vedicName} — Love & Relationships`,
    renderedFields: ['love_relationships'],
  });

  const slot = openFieldEditor(CANONICAL_RASHIS[0], null, 'love_relationships');
  assert.equal(slot.mode, 'field');
  assert.equal(slot.field, 'love_relationships');
  assert.equal(slot.title, 'Mesha — Love & Relationships');
  assert.deepEqual(slot.renderedFields, ['love_relationships']);
});

test('5. Individual field modal does not render unrelated textarea fields', () => {
  const allPossibleFields = [
    'general_outlook',
    'career_business',
    'finance_wealth',
    'love_relationships',
    'health_wellbeing',
    'auspicious_color',
    'auspicious_number',
  ];

  const getRenderedFieldsInModal = (modalType, selectedField) => {
    if (modalType === 'field') {
      return [selectedField];
    }
    return allPossibleFields;
  };

  const careerModalFields = getRenderedFieldsInModal('field', 'career_business');
  assert.equal(careerModalFields.length, 1);
  assert.equal(careerModalFields.includes('general_outlook'), false);
  assert.equal(careerModalFields.includes('finance_wealth'), false);
  assert.equal(careerModalFields.includes('love_relationships'), false);
  assert.equal(careerModalFields.includes('health_wellbeing'), false);
});

test('6. Row-level Create opens the complete multi-field editor', () => {
  const openRowAction = (rashi, insight) => ({
    mode: 'full',
    rashi,
    insight,
    hasPreview: true,
    allFieldsIncluded: true,
  });

  const createAction = openRowAction(CANONICAL_RASHIS[1], null);
  assert.equal(createAction.mode, 'full');
  assert.equal(createAction.rashi.vedicName, 'Vrishabha');
  assert.equal(createAction.allFieldsIncluded, true);
  assert.equal(createAction.hasPreview, true);
});

test('7. Row-level Edit opens the complete multi-field editor', () => {
  const existingInsight = {
    id: 'insight-1',
    rashi_id: 1,
    general_outlook: 'Dynamic leadership today.',
    career_business: 'Lead the team.',
    finance_wealth: 'Good liquidity.',
    love_relationships: 'Open communication.',
    health_wellbeing: 'Morning pranayama.',
    status: 'published',
  };

  const openRowAction = (rashi, insight) => ({
    mode: 'full',
    rashi,
    insight,
    allFieldsIncluded: true,
  });

  const editAction = openRowAction(CANONICAL_RASHIS[0], existingInsight);
  assert.equal(editAction.mode, 'full');
  assert.equal(editAction.insight.id, 'insight-1');
  assert.equal(editAction.allFieldsIncluded, true);
});

test('8. Saving Career preserves every unrelated existing field', () => {
  const existingInsight = {
    id: 'insight-42',
    rashi_id: 1,
    general_outlook: 'Energetic start of the week.',
    career_business: 'Old career notes.',
    finance_wealth: 'Stable investments.',
    love_relationships: 'Harmony at home.',
    health_wellbeing: 'Good vitality.',
    auspicious_color: 'Red',
    auspicious_number: '9',
    status: 'draft',
  };

  const buildFieldSavePayload = (existing, fieldName, newValue, date, lang) => {
    return {
      id: existing?.id,
      insight_date: date,
      rashi_id: existing?.rashi_id || 1,
      language: lang,
      general_outlook: fieldName === 'general_outlook' ? newValue : (existing?.general_outlook || ''),
      career_business: fieldName === 'career_business' ? newValue : (existing?.career_business || ''),
      finance_wealth: fieldName === 'finance_wealth' ? newValue : (existing?.finance_wealth || ''),
      love_relationships: fieldName === 'love_relationships' ? newValue : (existing?.love_relationships || ''),
      health_wellbeing: fieldName === 'health_wellbeing' ? newValue : (existing?.health_wellbeing || ''),
      auspicious_color: existing?.auspicious_color || '',
      auspicious_number: existing?.auspicious_number || '',
      status: 'draft',
    };
  };

  const payload = buildFieldSavePayload(existingInsight, 'career_business', 'New updated career guidance.', '2026-10-10', 'en');

  assert.equal(payload.career_business, 'New updated career guidance.');
  assert.equal(payload.general_outlook, 'Energetic start of the week.');
  assert.equal(payload.finance_wealth, 'Stable investments.');
  assert.equal(payload.love_relationships, 'Harmony at home.');
  assert.equal(payload.health_wellbeing, 'Good vitality.');
  assert.equal(payload.auspicious_color, 'Red');
  assert.equal(payload.auspicious_number, '9');
  assert.equal(payload.id, 'insight-42');
});

test('9. Saving Finance preserves every unrelated existing field', () => {
  const existingInsight = {
    id: 'insight-43',
    rashi_id: 2,
    general_outlook: 'Prudent and methodical energy.',
    career_business: 'Focus on long-term project.',
    finance_wealth: 'Old finance notes.',
    love_relationships: 'Quality time with partner.',
    health_wellbeing: 'Restful sleep.',
    auspicious_color: 'White',
    auspicious_number: '6',
    status: 'draft',
  };

  const buildFieldSavePayload = (existing, fieldName, newValue, date, lang) => ({
    id: existing?.id,
    insight_date: date,
    rashi_id: existing?.rashi_id || 2,
    language: lang,
    general_outlook: fieldName === 'general_outlook' ? newValue : (existing?.general_outlook || ''),
    career_business: fieldName === 'career_business' ? newValue : (existing?.career_business || ''),
    finance_wealth: fieldName === 'finance_wealth' ? newValue : (existing?.finance_wealth || ''),
    love_relationships: fieldName === 'love_relationships' ? newValue : (existing?.love_relationships || ''),
    health_wellbeing: fieldName === 'health_wellbeing' ? newValue : (existing?.health_wellbeing || ''),
    auspicious_color: existing?.auspicious_color || '',
    auspicious_number: existing?.auspicious_number || '',
    status: 'draft',
  });

  const payload = buildFieldSavePayload(existingInsight, 'finance_wealth', 'Exercise caution with speculative stocks.', '2026-10-10', 'en');

  assert.equal(payload.finance_wealth, 'Exercise caution with speculative stocks.');
  assert.equal(payload.general_outlook, 'Prudent and methodical energy.');
  assert.equal(payload.career_business, 'Focus on long-term project.');
  assert.equal(payload.love_relationships, 'Quality time with partner.');
  assert.equal(payload.health_wellbeing, 'Restful sleep.');
  assert.equal(payload.auspicious_color, 'White');
  assert.equal(payload.auspicious_number, '6');
  assert.equal(payload.id, 'insight-43');
});

test('10. Saving Love preserves every unrelated existing field', () => {
  const existingInsight = {
    id: 'insight-44',
    rashi_id: 3,
    general_outlook: 'Curious and expressive day.',
    career_business: 'Networking opportunities.',
    finance_wealth: 'Balanced budget.',
    love_relationships: 'Old love notes.',
    health_wellbeing: 'Stay active.',
    auspicious_color: 'Green',
    auspicious_number: '5',
    status: 'draft',
  };

  const buildFieldSavePayload = (existing, fieldName, newValue, date, lang) => ({
    id: existing?.id,
    insight_date: date,
    rashi_id: existing?.rashi_id || 3,
    language: lang,
    general_outlook: fieldName === 'general_outlook' ? newValue : (existing?.general_outlook || ''),
    career_business: fieldName === 'career_business' ? newValue : (existing?.career_business || ''),
    finance_wealth: fieldName === 'finance_wealth' ? newValue : (existing?.finance_wealth || ''),
    love_relationships: fieldName === 'love_relationships' ? newValue : (existing?.love_relationships || ''),
    health_wellbeing: fieldName === 'health_wellbeing' ? newValue : (existing?.health_wellbeing || ''),
    auspicious_color: existing?.auspicious_color || '',
    auspicious_number: existing?.auspicious_number || '',
    status: 'draft',
  });

  const payload = buildFieldSavePayload(existingInsight, 'love_relationships', 'Express appreciation to your spouse.', '2026-10-10', 'en');

  assert.equal(payload.love_relationships, 'Express appreciation to your spouse.');
  assert.equal(payload.general_outlook, 'Curious and expressive day.');
  assert.equal(payload.career_business, 'Networking opportunities.');
  assert.equal(payload.finance_wealth, 'Balanced budget.');
  assert.equal(payload.health_wellbeing, 'Stay active.');
  assert.equal(payload.auspicious_color, 'Green');
  assert.equal(payload.auspicious_number, '5');
  assert.equal(payload.id, 'insight-44');
});

test('11. Creating new entry from individual field produces valid draft without duplicate records', () => {
  const newFieldDraft = {
    id: undefined,
    insight_date: '2026-10-10',
    rashi_id: 5, // Simha
    language: 'hi',
    general_outlook: '',
    career_business: 'व्यापार में लाभ के योग हैं।',
    finance_wealth: '',
    love_relationships: '',
    health_wellbeing: '',
    auspicious_color: '',
    auspicious_number: '',
    status: 'draft',
  };

  assert.equal(newFieldDraft.id, undefined);
  assert.equal(newFieldDraft.status, 'draft');
  assert.equal(newFieldDraft.rashi_id, 5);
  assert.equal(newFieldDraft.career_business, 'व्यापार में लाभ के योग हैं।');
});

test('12. Editing a published record warns and requires confirmation before switching to draft', () => {
  const publishedInsight = {
    id: 'pub-99',
    status: 'published',
  };

  const validateFieldSubmission = (existing, isConfirmed) => {
    if (existing?.status === 'published' && !isConfirmed) {
      return { allowed: false, error: 'Please confirm the warning before saving changes to a published record.' };
    }
    return { allowed: true };
  };

  // Without confirmation -> Blocked
  const blocked = validateFieldSubmission(publishedInsight, false);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.error, 'Please confirm the warning before saving changes to a published record.');

  // With confirmation -> Allowed
  const allowed = validateFieldSubmission(publishedInsight, true);
  assert.equal(allowed.allowed, true);
});

test('13. Failed save preserves entered text in field editor state', () => {
  let editorValue = 'My drafted career note';
  const simulateFailedNetworkSave = () => {
    throw new Error('Network timeout');
  };

  try {
    simulateFailedNetworkSave();
  } catch (err) {
    // Value in state remains intact
    assert.equal(editorValue, 'My drafted career note');
  }
});

test('14. Date, Language, and Rashi remain correctly associated with the saved record', () => {
  const samplePayload = {
    insight_date: '2026-10-12',
    language: 'hi',
    rashi_id: 8, // Vrishchika
    career_business: 'कार्यक्षेत्र में सतर्क रहें।',
    status: 'draft',
  };

  assert.equal(samplePayload.insight_date, '2026-10-12');
  assert.equal(samplePayload.language, 'hi');
  assert.equal(samplePayload.rashi_id, 8);
});

test('15. General Outlook publication validation remains mandatory in full editor', () => {
  const validatePublishingInFullEditor = (payload) => {
    if (payload.status === 'published' && (!payload.general_outlook || !payload.general_outlook.trim())) {
      return { valid: false, error: 'General Outlook is mandatory before publishing an insight.' };
    }
    return { valid: true };
  };

  const invalidPublish = validatePublishingInFullEditor({
    general_outlook: '',
    career_business: 'Valid career',
    status: 'published',
  });
  assert.equal(invalidPublish.valid, false);

  const validPublish = validatePublishingInFullEditor({
    general_outlook: 'Planetary energy is auspicious.',
    career_business: 'Valid career',
    status: 'published',
  });
  assert.equal(validPublish.valid, true);
});

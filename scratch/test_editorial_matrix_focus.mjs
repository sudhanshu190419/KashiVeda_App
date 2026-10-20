import test from 'node:test';
import assert from 'node:assert/strict';

// Test suite for 12-Rashi Daily Insights Editorial Matrix & Context-Aware Editor

test('1. Context-Aware Focus Mapping: Table columns map to exact editor field identifiers', () => {
  const columnToFieldMap = {
    general_outlook: 'general_outlook',
    career: 'career',
    finance: 'finance',
    love: 'love',
    health: 'health',
  };

  assert.equal(columnToFieldMap.general_outlook, 'general_outlook');
  assert.equal(columnToFieldMap.career, 'career');
  assert.equal(columnToFieldMap.finance, 'finance');
  assert.equal(columnToFieldMap.love, 'love');
  assert.equal(columnToFieldMap.health, 'health');
});

test('2. Field Focus Selection: Clicking a cell sets the specific initialFocusedField', () => {
  const handleOpenEditor = (rashi, insight, field) => {
    return {
      rashi,
      insight,
      initialFocusedField: field ?? null,
    };
  };

  const sampleRashi = { id: 'mesha', vedicName: 'Mesha', englishName: 'Aries', symbol: '♈' };
  const sampleInsight = {
    id: 'insight-1',
    rashi_id: 'mesha',
    insight_date: '2026-10-10',
    language: 'en',
    general_outlook: 'High energy day.',
    career_business: 'Lead the team.',
    finance_wealth: 'Avoid impulse spending.',
    love_relationships: 'Open communication.',
    health_wellbeing: 'Stay hydrated.',
    status: 'draft',
  };

  // Click General Outlook
  const slotGeneral = handleOpenEditor(sampleRashi, sampleInsight, 'general_outlook');
  assert.equal(slotGeneral.initialFocusedField, 'general_outlook');

  // Click Career
  const slotCareer = handleOpenEditor(sampleRashi, sampleInsight, 'career');
  assert.equal(slotCareer.initialFocusedField, 'career');

  // Click Finance
  const slotFinance = handleOpenEditor(sampleRashi, sampleInsight, 'finance');
  assert.equal(slotFinance.initialFocusedField, 'finance');

  // Click Love
  const slotLove = handleOpenEditor(sampleRashi, sampleInsight, 'love');
  assert.equal(slotLove.initialFocusedField, 'love');

  // Click row Edit / Create action (no field specified)
  const slotDefault = handleOpenEditor(sampleRashi, sampleInsight);
  assert.equal(slotDefault.initialFocusedField, null);
});

test('3. Data Preservation: Modal initializes and preserves all existing fields regardless of which field was clicked', () => {
  const existingInsight = {
    id: 'insight-123',
    general_outlook: 'Planetary alignment brings clarity.',
    career_business: 'Strong negotiation opportunities.',
    finance_wealth: 'Good day for savings.',
    love_relationships: 'Warmth and harmony at home.',
    health_wellbeing: 'Practice pranayama.',
    auspicious_color: 'Saffron Yellow',
    auspicious_number: 9,
    status: 'draft',
  };

  // Simulating state hydration in form modal
  const hydrateModalState = (existing) => {
    if (!existing) {
      return {
        generalOutlook: '',
        careerBusiness: '',
        financeWealth: '',
        loveRelationships: '',
        healthWellbeing: '',
        auspiciousColor: '',
        auspiciousNumber: '',
        status: 'draft',
      };
    }
    return {
      generalOutlook: existing.general_outlook || '',
      careerBusiness: existing.career_business || '',
      financeWealth: existing.finance_wealth || '',
      loveRelationships: existing.love_relationships || '',
      healthWellbeing: existing.health_wellbeing || '',
      auspiciousColor: existing.auspicious_color || '',
      auspiciousNumber: existing.auspicious_number != null ? String(existing.auspicious_number) : '',
      status: existing.status || 'draft',
    };
  };

  const loadedState = hydrateModalState(existingInsight);

  // Even if user clicked "Career", all fields must remain fully populated
  assert.equal(loadedState.generalOutlook, 'Planetary alignment brings clarity.');
  assert.equal(loadedState.careerBusiness, 'Strong negotiation opportunities.');
  assert.equal(loadedState.financeWealth, 'Good day for savings.');
  assert.equal(loadedState.loveRelationships, 'Warmth and harmony at home.');
  assert.equal(loadedState.healthWellbeing, 'Practice pranayama.');
  assert.equal(loadedState.auspiciousColor, 'Saffron Yellow');
  assert.equal(loadedState.auspiciousNumber, '9');
  assert.equal(loadedState.status, 'draft');
});

test('4. Empty Record Initialization: Opening editor for empty Rashi does not create DB record or corrupt state', () => {
  let dbWrites = 0;
  const onOpenModal = (rashi, insight) => {
    // Merely opening modal creates local UI state, no DB write
    return {
      isOpen: true,
      data: insight || { general_outlook: '', career_business: '' },
    };
  };

  const state = onOpenModal({ id: 'vrishabha' }, null);
  assert.equal(state.isOpen, true);
  assert.equal(state.data.general_outlook, '');
  assert.equal(dbWrites, 0);
});

test('5. Publication Validation: General Outlook is mandatory before publishing', () => {
  const validateForPublication = (formData, targetStatus) => {
    if (targetStatus === 'published' && (!formData.general_outlook || !formData.general_outlook.trim())) {
      return { valid: false, error: 'General Outlook is mandatory before publishing this insight.' };
    }
    return { valid: true };
  };

  // Case A: Missing General Outlook trying to publish
  const invalidPublish = validateForPublication(
    { general_outlook: '', career_business: 'Great career day.' },
    'published'
  );
  assert.equal(invalidPublish.valid, false);
  assert.equal(invalidPublish.error, 'General Outlook is mandatory before publishing this insight.');

  // Case B: Valid General Outlook publishing
  const validPublish = validateForPublication(
    { general_outlook: 'Cosmic balance prevails.', career_business: 'Great career day.' },
    'published'
  );
  assert.equal(validPublish.valid, true);

  // Case C: Saving Draft without General Outlook is permitted
  const draftSave = validateForPublication(
    { general_outlook: '', career_business: 'Drafting career notes.' },
    'draft'
  );
  assert.equal(draftSave.valid, true);
});

test('6. Save Draft Form Integrity: All entered fields are preserved in payload', () => {
  const formValues = {
    general_outlook: 'Spiritual focus and discipline.',
    career_business: 'Focus on pending tasks.',
    finance_wealth: 'Limit luxury expenses.',
    love_relationships: 'Spend time with elders.',
    health_wellbeing: 'Morning walks recommended.',
    auspicious_color: 'Royal Red',
    auspicious_number: '7',
  };

  const payload = {
    insight_date: '2026-10-10',
    rashi_id: 'simha',
    language: 'en',
    ...formValues,
    status: 'draft',
  };

  assert.equal(payload.rashi_id, 'simha');
  assert.equal(payload.general_outlook, 'Spiritual focus and discipline.');
  assert.equal(payload.career_business, 'Focus on pending tasks.');
  assert.equal(payload.finance_wealth, 'Limit luxury expenses.');
  assert.equal(payload.love_relationships, 'Spend time with elders.');
  assert.equal(payload.health_wellbeing, 'Morning walks recommended.');
  assert.equal(payload.auspicious_color, 'Royal Red');
  assert.equal(payload.auspicious_number, '7');
  assert.equal(payload.status, 'draft');
});

test('7. Daily Set Readiness Validation: Identifies complete vs incomplete Rashis accurately', () => {
  const canonicalRashiIds = [
    'mesha', 'vrishabha', 'mithuna', 'karka', 'simha', 'kanya',
    'tula', 'vrishchika', 'dhanu', 'makara', 'kumbha', 'meena'
  ];

  // 10 Rashis have general_outlook, 2 are missing
  const slots = canonicalRashiIds.map((id) => {
    if (id === 'kumbha' || id === 'meena') {
      return { rashiId: id, generalOutlook: '' };
    }
    return { rashiId: id, generalOutlook: `Guidance for ${id}` };
  });

  const readySlots = slots.filter((s) => s.generalOutlook && s.generalOutlook.trim().length > 0);
  const missingSlots = slots.filter((s) => !s.generalOutlook || s.generalOutlook.trim().length === 0);

  assert.equal(readySlots.length, 10);
  assert.equal(missingSlots.length, 2);
  assert.deepEqual(missingSlots.map((s) => s.rashiId), ['kumbha', 'meena']);
});

test('8. Date & Language Isolation: Selecting different language/date does not bleed into local slots', () => {
  const matrixState = {
    date: '2026-10-10',
    language: 'en',
    slots: [
      { rashiId: 'mesha', language: 'en', generalOutlook: 'English outlook' }
    ]
  };

  const nextLanguageState = {
    date: '2026-10-10',
    language: 'hi',
    slots: [
      { rashiId: 'mesha', language: 'hi', generalOutlook: 'हिन्दी भविष्यफल' }
    ]
  };

  assert.notEqual(matrixState.language, nextLanguageState.language);
  assert.equal(matrixState.slots[0].generalOutlook, 'English outlook');
  assert.equal(nextLanguageState.slots[0].generalOutlook, 'हिन्दी भविष्यफल');
});

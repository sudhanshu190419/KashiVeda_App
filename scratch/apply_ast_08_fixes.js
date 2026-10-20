const fs = require('fs');
const path = require('path');

const adminRoot = 'C:/Projects/kashi-veda-admin';

// =============================================================================
// 1. lib/astrology/daily-insights-matrix-coordinator.ts
// =============================================================================
const coordinatorContent = `// AST-08: Explicit Matrix Identity, Out-of-Order Response Guard, and Write-Key Integrity Coordinator

export interface MatrixIdentity {
  date: string;
  language: string;
}

export function getMatrixIdentityKey(date: string, language: string = 'en'): string {
  return \`\${(date || '').trim()}::\${(language || 'en').trim().toLowerCase()}\`;
}

export interface MatrixSyncCheckParams {
  selectedDate: string;
  selectedLanguage: string;
  loadedDate?: string | null;
  loadedLanguage?: string | null;
  isPending: boolean;
  hasError: boolean;
}

export function isMatrixSynced(params: MatrixSyncCheckParams): boolean {
  if (params.isPending || params.hasError) {
    return false;
  }
  if (!params.loadedDate || !params.loadedLanguage) {
    return false;
  }
  const selectedKey = getMatrixIdentityKey(params.selectedDate, params.selectedLanguage);
  const loadedKey = getMatrixIdentityKey(params.loadedDate, params.loadedLanguage);
  return selectedKey === loadedKey;
}

export class MatrixRequestCoordinator {
  private currentGen: number = 0;
  private inFlightKey: string | null = null;

  public startRequest(date: string, language: string): number {
    this.currentGen += 1;
    this.inFlightKey = getMatrixIdentityKey(date, language);
    return this.currentGen;
  }

  public shouldCommitResponse(
    token: number,
    responseDate: string,
    responseLanguage: string,
    currentSelectedDate: string,
    currentSelectedLanguage: string
  ): boolean {
    if (token !== this.currentGen) {
      return false;
    }
    const respKey = getMatrixIdentityKey(responseDate, responseLanguage);
    const selectedKey = getMatrixIdentityKey(currentSelectedDate, currentSelectedLanguage);
    return respKey === selectedKey;
  }

  public shouldCommitError(token: number): boolean {
    return token === this.currentGen;
  }

  public invalidate(): void {
    this.currentGen += 1;
    this.inFlightKey = null;
  }

  public getCurrentGeneration(): number {
    return this.currentGen;
  }

  public getInFlightKey(): string | null {
    return this.inFlightKey;
  }
}

export function isModalBoundKeyValid(boundMatrixKey: string, currentSelectedKey: string): boolean {
  return Boolean(boundMatrixKey && currentSelectedKey && boundMatrixKey === currentSelectedKey);
}

export function validateWriteKeyIntegrity(params: {
  boundMatrixKey: string;
  currentSelectedKey: string;
  targetDate: string;
  targetLanguage: string;
  rashiId: number;
}): { isValid: boolean; error?: string } {
  if (params.boundMatrixKey !== params.currentSelectedKey) {
    return {
      isValid: false,
      error: \`Matrix key changed (bound to \${params.boundMatrixKey}, currently selected \${params.currentSelectedKey}). Operation aborted to prevent key mismatch.\`,
    };
  }
  const targetKey = getMatrixIdentityKey(params.targetDate, params.targetLanguage);
  if (targetKey !== params.boundMatrixKey) {
    return {
      isValid: false,
      error: \`Target write key (\${targetKey}) does not match bound matrix identity (\${params.boundMatrixKey}).\`,
    };
  }
  if (params.rashiId < 1 || params.rashiId > 12) {
    return {
      isValid: false,
      error: \`Invalid Rashi ID: \${params.rashiId}. Must be between 1 and 12.\`,
    };
  }
  return { isValid: true };
}

export function validateBulkDraftCoherence(
  items: { insight_date: string; language: string; rashi_id: number }[],
  expectedDate: string,
  expectedLanguage: string
): { isValid: boolean; error?: string } {
  const expectedKey = getMatrixIdentityKey(expectedDate, expectedLanguage);
  for (const item of items) {
    const itemKey = getMatrixIdentityKey(item.insight_date, item.language);
    if (itemKey !== expectedKey) {
      return {
        isValid: false,
        error: \`Inconsistent item in bulk draft: item key \${itemKey} does not match expected matrix key \${expectedKey}.\`,
      };
    }
    if (item.rashi_id < 1 || item.rashi_id > 12) {
      return {
        isValid: false,
        error: \`Invalid Rashi ID in bulk draft: \${item.rashi_id}.\`,
      };
    }
  }
  return { isValid: true };
}
`;

// =============================================================================
// 2. lib/actions/daily-insights-management.ts (Throw on query error in getDailyRashiInsightsMatrix)
// =============================================================================
const actionsPath = path.join(adminRoot, 'lib/actions/daily-insights-management.ts');
let actionsContent = fs.readFileSync(actionsPath, 'utf8');

// Replace error handling in getDailyRashiInsightsMatrix so it throws instead of quiet empty set
if (actionsContent.includes('if (error) {\n    console.error("Error querying daily_rashi_insights:", error);\n  }')) {
  actionsContent = actionsContent.replace(
    'if (error) {\n    console.error("Error querying daily_rashi_insights:", error);\n  }',
    'if (error) {\n    console.error("Error querying daily_rashi_insights:", error);\n    throw new Error(`Failed to load daily insights: ${error.message}`);\n  }'
  );
} else if (actionsContent.includes('if (error) {\r\n    console.error("Error querying daily_rashi_insights:", error);\r\n  }')) {
  actionsContent = actionsContent.replace(
    'if (error) {\r\n    console.error("Error querying daily_rashi_insights:", error);\r\n  }',
    'if (error) {\r\n    console.error("Error querying daily_rashi_insights:", error);\r\n    throw new Error(`Failed to load daily insights: ${error.message}`);\r\n  }'
  );
}

// =============================================================================
// 3. components/admin/astrology/daily-insights/daily-insight-field-modal.tsx
// Add boundMatrixKey, currentSelectedKey props and submission guard
// =============================================================================
const fieldModalPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insight-field-modal.tsx');
let fieldModalContent = fs.readFileSync(fieldModalPath, 'utf8');

// Ensure props include boundMatrixKey and currentSelectedKey
if (!fieldModalContent.includes('boundMatrixKey?: string;')) {
  fieldModalContent = fieldModalContent.replace(
    '  existingInsight?: DailyRashiInsightAdminItem | null;\n  isOpen: boolean;',
    '  existingInsight?: DailyRashiInsightAdminItem | null;\n  boundMatrixKey?: string;\n  currentSelectedKey?: string;\n  isOpen: boolean;'
  );
  if (!fieldModalContent.includes('boundMatrixKey?: string;')) {
    fieldModalContent = fieldModalContent.replace(
      '  existingInsight?: DailyRashiInsightAdminItem | null;\r\n  isOpen: boolean;',
      '  existingInsight?: DailyRashiInsightAdminItem | null;\r\n  boundMatrixKey?: string;\r\n  currentSelectedKey?: string;\r\n  isOpen: boolean;'
    );
  }
}

// Ensure function arguments unpack boundMatrixKey and currentSelectedKey
if (!fieldModalContent.includes('boundMatrixKey,')) {
  fieldModalContent = fieldModalContent.replace(
    '  existingInsight,\n  isOpen,\n  onClose,',
    '  existingInsight,\n  boundMatrixKey,\n  currentSelectedKey,\n  isOpen,\n  onClose,'
  );
  if (!fieldModalContent.includes('boundMatrixKey,')) {
    fieldModalContent = fieldModalContent.replace(
      '  existingInsight,\r\n  isOpen,\r\n  onClose,',
      '  existingInsight,\r\n  boundMatrixKey,\r\n  currentSelectedKey,\r\n  isOpen,\r\n  onClose,'
    );
  }
}

// Add validation check inside handleSubmit
const fieldSubmitTarget = '  const handleSubmit = async () => {\n    setError(null);';
const fieldSubmitTargetCRLF = '  const handleSubmit = async () => {\r\n    setError(null);';
const fieldKeyGuardCode = `  const isKeyMismatched = Boolean(
    boundMatrixKey && currentSelectedKey && boundMatrixKey !== currentSelectedKey
  );

  const handleSubmit = async () => {
    setError(null);

    if (isKeyMismatched) {
      setError(
        "Matrix key changed: selected date or language has changed while this editor was open. Please close and reopen from the current matrix."
      );
      return;
    }`;

if (fieldModalContent.includes(fieldSubmitTarget)) {
  fieldModalContent = fieldModalContent.replace(fieldSubmitTarget, fieldKeyGuardCode);
} else if (fieldModalContent.includes(fieldSubmitTargetCRLF)) {
  fieldModalContent = fieldModalContent.replace(fieldSubmitTargetCRLF, fieldKeyGuardCode);
}

// Add warning banner if isKeyMismatched inside modal body
const modalBodyHeaderTarget = '{/* Field Editor Header */}';
const modalMismatchBanner = `{/* AST-08 Matrix Key Mismatch Warning */}
        {isKeyMismatched && (
          <div className="bg-destructive/10 border-b border-destructive/20 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              <strong>Matrix Selection Changed:</strong> This editor is bound to {boundMatrixKey}, but the matrix is now set to {currentSelectedKey}. Saving is disabled to prevent data corruption.
            </span>
          </div>
        )}
        {/* Field Editor Header */}`;

if (!fieldModalContent.includes('AST-08 Matrix Key Mismatch Warning') && fieldModalContent.includes(modalBodyHeaderTarget)) {
  fieldModalContent = fieldModalContent.replace(modalBodyHeaderTarget, modalMismatchBanner);
}

// Also disable Save button if isKeyMismatched
fieldModalContent = fieldModalContent.replace(
  'disabled={isSubmitting}',
  'disabled={isSubmitting || isKeyMismatched}'
);

// =============================================================================
// 4. components/admin/astrology/daily-insights/daily-insights-form-modal.tsx
// Add boundMatrixKey, currentSelectedKey props and submission guard
// =============================================================================
const formModalPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insights-form-modal.tsx');
let formModalContent = fs.readFileSync(formModalPath, 'utf8');

// Ensure props include boundMatrixKey and currentSelectedKey
if (!formModalContent.includes('boundMatrixKey?: string;')) {
  formModalContent = formModalContent.replace(
    '  existingInsight?: DailyRashiInsightAdminItem | null;\n  initialFocusedField?: FocusedField;',
    '  existingInsight?: DailyRashiInsightAdminItem | null;\n  boundMatrixKey?: string;\n  currentSelectedKey?: string;\n  initialFocusedField?: FocusedField;'
  );
  if (!formModalContent.includes('boundMatrixKey?: string;')) {
    formModalContent = formModalContent.replace(
      '  existingInsight?: DailyRashiInsightAdminItem | null;\r\n  initialFocusedField?: FocusedField;',
      '  existingInsight?: DailyRashiInsightAdminItem | null;\r\n  boundMatrixKey?: string;\r\n  currentSelectedKey?: string;\r\n  initialFocusedField?: FocusedField;'
    );
  }
}

// Unpack in component
if (!formModalContent.includes('boundMatrixKey,')) {
  formModalContent = formModalContent.replace(
    '  existingInsight,\n  initialFocusedField,\n  isOpen,',
    '  existingInsight,\n  boundMatrixKey,\n  currentSelectedKey,\n  initialFocusedField,\n  isOpen,'
  );
  if (!formModalContent.includes('boundMatrixKey,')) {
    formModalContent = formModalContent.replace(
      '  existingInsight,\r\n  initialFocusedField,\r\n  isOpen,',
      '  existingInsight,\r\n  boundMatrixKey,\r\n  currentSelectedKey,\r\n  initialFocusedField,\r\n  isOpen,'
    );
  }
}

// Add key mismatch check in handleSubmit
const formSubmitTarget = '  const handleSubmit = async (targetStatus: DailyInsightStatus) => {\n    setError(null);';
const formSubmitTargetCRLF = '  const handleSubmit = async (targetStatus: DailyInsightStatus) => {\r\n    setError(null);';
const formKeyGuardCode = `  const isKeyMismatched = Boolean(
    boundMatrixKey && currentSelectedKey && boundMatrixKey !== currentSelectedKey
  );

  const handleSubmit = async (targetStatus: DailyInsightStatus) => {
    setError(null);

    if (isKeyMismatched) {
      setError(
        "Matrix key changed: selected date or language has changed while this editor was open. Please close and reopen from the current matrix."
      );
      return;
    }`;

if (formModalContent.includes(formSubmitTarget)) {
  formModalContent = formModalContent.replace(formSubmitTarget, formKeyGuardCode);
} else if (formModalContent.includes(formSubmitTargetCRLF)) {
  formModalContent = formModalContent.replace(formSubmitTargetCRLF, formKeyGuardCode);
}

// Add warning banner if isKeyMismatched
const formHeaderTarget = '{/* Header */}';
const formMismatchBanner = `{/* AST-08 Matrix Key Mismatch Warning */}
        {isKeyMismatched && (
          <div className="bg-destructive/10 border-b border-destructive/20 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              <strong>Matrix Selection Changed:</strong> This editor is bound to {boundMatrixKey}, but the matrix is now set to {currentSelectedKey}. Saving is disabled to prevent data corruption.
            </span>
          </div>
        )}
        {/* Header */}`;

if (!formModalContent.includes('AST-08 Matrix Key Mismatch Warning') && formModalContent.includes(formHeaderTarget)) {
  formModalContent = formModalContent.replace(formHeaderTarget, formMismatchBanner);
}

// =============================================================================
// Write out coordinator and updated modals
// =============================================================================
const coordDir = path.join(adminRoot, 'lib/astrology');
if (!fs.existsSync(coordDir)) {
  fs.mkdirSync(coordDir, { recursive: true });
}
fs.writeFileSync(path.join(coordDir, 'daily-insights-matrix-coordinator.ts'), coordinatorContent, 'utf8');
fs.writeFileSync(actionsPath, actionsContent, 'utf8');
fs.writeFileSync(fieldModalPath, fieldModalContent, 'utf8');
fs.writeFileSync(formModalPath, formModalContent, 'utf8');

console.log('Successfully wrote coordinator, updated actions and modals!');

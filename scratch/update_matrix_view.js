// Script to update daily-insights-matrix-view.tsx for AST-20
const fs = require('fs');
const path = require('path');

const filePath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add DailyMatrixReadStatus to type import
if (!content.includes('DailyMatrixReadStatus')) {
  content = content.replace(
    'DailyInsightsMatrixResponse,',
    'DailyInsightsMatrixResponse,\n  DailyMatrixReadStatus,'
  );
}

// 2. Add isUnavailable definition
if (!content.includes('const isUnavailable =')) {
  const syncPredicateSearch = `  // Compute synchronization predicates
  const selectedKey = getMatrixIdentityKey(selectedDate, selectedLanguage);
  const loadedKey = getMatrixIdentityKey(matrix.date, matrix.language);
  const isSynced = isMatrixSynced({
    selectedDate,
    selectedLanguage,
    loadedDate: matrix.date,
    loadedLanguage: matrix.language,
    isPending,
    hasError: Boolean(fetchError),
  });`;

  const newSyncPredicate = `  // Compute synchronization predicates
  const selectedKey = getMatrixIdentityKey(selectedDate, selectedLanguage);
  const loadedKey = getMatrixIdentityKey(matrix.date, matrix.language);
  const isUnavailable = Boolean(fetchError) || matrix.readStatus === 'unavailable';
  const isSynced = isMatrixSynced({
    selectedDate,
    selectedLanguage,
    loadedDate: matrix.date,
    loadedLanguage: matrix.language,
    isPending,
    hasError: Boolean(fetchError) || matrix.readStatus === 'unavailable',
  });`;

  content = content.replace(syncPredicateSearch, newSyncPredicate);
}

// 3. Update handleFetchMatrix catch block to set matrix.readStatus = 'unavailable'
const oldCatch = `        const msg = err.message || "Failed to load daily insights matrix.";
        setFetchError(msg);
        setNotification({ type: 'error', message: msg });`;

const newCatch = `        const msg = err.message || "Failed to load daily insights matrix.";
        setFetchError(msg);
        setMatrix((prev) => ({
          ...prev,
          readStatus: 'unavailable',
          error: msg,
        }));
        setNotification({ type: 'error', message: msg });`;

if (content.includes(oldCatch)) {
  content = content.replace(oldCatch, newCatch);
}

// 4. Update top action buttons disabled states
content = content.replace(
  'disabled={!isSynced || isPending}\n            className="h-9 gap-1.5 border-amber-500/40 hover:bg-amber-500/10 text-amber-400"',
  'disabled={!isSynced || isPending || isUnavailable}\n            className="h-9 gap-1.5 border-amber-500/40 hover:bg-amber-500/10 text-amber-400"'
);

content = content.replace(
  'disabled={!isSynced || isSavingDrafts || isPending}\n            className="h-9 gap-1.5"',
  'disabled={!isSynced || isSavingDrafts || isPending || isUnavailable}\n            className="h-9 gap-1.5"'
);

content = content.replace(
  'disabled={!isSynced || isPending}\n            className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"',
  'disabled={!isSynced || isPending || isUnavailable}\n            className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"'
);

// 5. Add 5-State Status Badge in header
if (!content.includes('{/* AST-20 5-State Matrix Read Status Badge */}')) {
  const headerSearch = `<p className="text-sm text-muted-foreground mt-0.5">
            Curate and publish authoritative daily Vedic planetary transits across all 12 Rashis via single-field edits, full form, or bulk CSV import.
          </p>
        </div>`;

  const headerReplacement = `<p className="text-sm text-muted-foreground mt-0.5">
            Curate and publish authoritative daily Vedic planetary transits across all 12 Rashis via single-field edits, full form, or bulk CSV import.
          </p>
          {/* AST-20 5-State Matrix Read Status Badge */}
          <div className="flex items-center gap-2 mt-2">
            {isPending ? (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1.5 text-xs">
                <RefreshCw className="h-3 w-3 animate-spin" /> Loading Matrix...
              </Badge>
            ) : isUnavailable ? (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1.5 text-xs font-semibold">
                <AlertCircle className="h-3 w-3" /> Read Unavailable
              </Badge>
            ) : matrix.readStatus === 'complete' ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1.5 text-xs font-semibold">
                <CheckCircle2 className="h-3 w-3" /> Complete (12/12 Published)
              </Badge>
            ) : matrix.readStatus === 'empty' ? (
              <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1.5 text-xs">
                <AlertCircle className="h-3 w-3" /> Empty Matrix (0/12 Created)
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1.5 text-xs font-semibold">
                <Clock className="h-3 w-3" /> Incomplete ({matrix.summary.publishedCount}/12 Published, {matrix.summary.draftCount} Drafts, {matrix.summary.missingCount} Missing)
              </Badge>
            )}
          </div>
        </div>`;

  content = content.replace(headerSearch, headerReplacement);
}

// 6. Update KPI summary cards to distinguish unavailable from real 0
const oldKpiSection = `        <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-xs">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Published
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-emerald-600">
              {matrix.summary.publishedCount}
            </span>
            <span className="text-[11px] text-emerald-700/80">Live in App</span>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5 shadow-xs">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Draft
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-amber-600">
              {matrix.summary.draftCount}
            </span>
            <span className="text-[11px] text-amber-700/80">Saved Drafts</span>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20 bg-rose-500/5 shadow-xs">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Missing Content
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-rose-600">
              {matrix.summary.missingCount}
            </span>
            <span className="text-[11px] text-rose-700/80">Needs Curation</span>
          </CardContent>
        </Card>`;

const newKpiSection = `        <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-xs">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Published
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-emerald-600">
              {isUnavailable ? (
                <span className="text-sm font-normal text-muted-foreground italic">Unavailable</span>
              ) : (
                matrix.summary.publishedCount
              )}
            </span>
            <span className="text-[11px] text-emerald-700/80">Live in App</span>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5 shadow-xs">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Draft
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-amber-600">
              {isUnavailable ? (
                <span className="text-sm font-normal text-muted-foreground italic">Unavailable</span>
              ) : (
                matrix.summary.draftCount
              )}
            </span>
            <span className="text-[11px] text-amber-700/80">Saved Drafts</span>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20 bg-rose-500/5 shadow-xs">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Missing Content
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-rose-600">
              {isUnavailable ? (
                <span className="text-sm font-normal text-muted-foreground italic">Unavailable</span>
              ) : (
                matrix.summary.missingCount
              )}
            </span>
            <span className="text-[11px] text-rose-700/80">Needs Curation</span>
          </CardContent>
        </Card>`;

if (content.includes(oldKpiSection)) {
  content = content.replace(oldKpiSection, newKpiSection);
}

// 7. Update Central Table to conditionally render Read Unavailable Card or Empty Banner
const oldTableStart = `      {/* Centralized 12-Rashi Editorial Table */}
      <Card className="border-border/60 bg-card shadow-sm overflow-hidden">`;

const newTableStart = `      {/* AST-20 Editorial Matrix Render: Unavailable vs Empty vs Populated Table */}
      {isUnavailable ? (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm p-8 text-center">
          <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-3">
            <div className="p-3 rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-foreground">
              Daily Insights Matrix Unavailable
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Failed to load daily insights for {selectedDate} ({selectedLanguage.toUpperCase()}).
              Slot completeness and publication statuses cannot be determined because the database query failed.
              Content editing and bulk actions are locked to prevent misleading edits or accidental data loss.
            </p>
            {(fetchError || matrix.error) && (
              <div className="p-2.5 rounded bg-muted/60 text-[11px] font-mono text-destructive text-left w-full overflow-x-auto">
                {fetchError || matrix.error}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFetchMatrix(selectedDate, selectedLanguage)}
              className="gap-2 mt-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Loading Matrix
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {matrix.readStatus === 'empty' && (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3.5 text-xs text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
              <span>
                <strong>Empty Matrix:</strong> No daily insights have been created yet for {matrix.date} ({matrix.language.toUpperCase()}). You can enter content for individual signs below or use <strong>Bulk Import</strong>.
              </span>
            </div>
          )}

          {/* Centralized 12-Rashi Editorial Table */}
          <Card className="border-border/60 bg-card shadow-sm overflow-hidden">`;

if (content.includes(oldTableStart)) {
  content = content.replace(oldTableStart, newTableStart);

  // Close the fragment at the end of the table card
  const oldTableEnd = `        </div>
      </Card>

      {/* Field-Specific Quick Edit Modal (AST-08 Isolated Field Modal) */}`;

  const newTableEnd = `        </div>
      </Card>
        </>
      )}

      {/* Field-Specific Quick Edit Modal (AST-08 Isolated Field Modal) */}`;

  content = content.replace(oldTableEnd, newTableEnd);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated daily-insights-matrix-view.tsx');

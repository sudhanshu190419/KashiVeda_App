const fs = require('fs');

const actionsPath = 'C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts';
let actionsContent = fs.readFileSync(actionsPath, 'utf8');

// 1. Early return status logic
const oldEarlyReturn = `    return {
      success: false,
      status: "failure",
      date,
      language,
      requestedCount: 12,
      publishedCount: 0,
      failedCount: 0,
      skippedCount: validation.missingCount,
      results: skippedResults,
      errors: [
        \`Cannot publish complete daily set. \${validation.missingCount} of 12 Rashis are missing required General Outlook: \${missingNames}\`,
      ],
      message: \`Incomplete daily set. \${validation.readyCount}/12 Rashis ready.\`,
    };`;

const newEarlyReturn = `    const isAllSkipped = validation.readyCount === 0;
    const earlyStatus: PublishSetOverallStatus = isAllSkipped ? "no_eligible_rows" : "failure";
    const earlyMsg = isAllSkipped
      ? \`No signs were eligible for publication: all \${validation.missingCount} signs were skipped because required General Outlook is missing.\`
      : \`Cannot publish complete daily set: \${validation.readyCount}/12 Rashis ready, \${validation.missingCount} missing required General Outlook: \${missingNames}\`;

    return {
      success: false,
      status: earlyStatus,
      date,
      language,
      requestedCount: 12,
      publishedCount: 0,
      failedCount: 0,
      skippedCount: validation.missingCount,
      results: skippedResults,
      errors: [
        \`Cannot publish complete daily set. \${validation.missingCount} of 12 Rashis are missing required General Outlook: \${missingNames}\`,
      ],
      message: earlyMsg,
    };`;

// 2. Loop: never re-publish already published row during targeted retry
const oldLoopStart = `  for (const rashi of targetRashiList) {
    const row = existingMap.get(rashi.id);

    // If row doesn't exist or general_outlook is missing
    if (!row || !row.general_outlook || !row.general_outlook.trim()) {`;

const newLoopStart = `  for (const rashi of targetRashiList) {
    const row = existingMap.get(rashi.id);

    // If already published and this is a targeted retry, never re-submit or increment version
    if (params.targetRashiIds && params.targetRashiIds.length > 0 && row && row.status === "published") {
      results.push({
        rashi_id: rashi.id,
        rashi_name: rashi.vedicName,
        vedic_name: rashi.vedicName,
        insight_date: date,
        language,
        outcome: "published",
        status: "published",
        version: row.version ?? null,
      });
      continue;
    }

    // If row doesn't exist or general_outlook is missing
    if (!row || !row.general_outlook || !row.general_outlook.trim()) {`;

// 3. Status logic at the end of publishDailyRashiInsightsSet
const oldStatusBlock = `  let status: PublishSetOverallStatus;
  let message: string;

  if (failedCount === 0 && skippedCount === 0 && publishedCount > 0) {
    status = "success";
    message = \`Successfully published all \${publishedCount} Rashis for \${date} (\${language.toUpperCase()}).\`;
  } else if (publishedCount > 0) {
    status = "partial_success";
    message = \`Partially published: \${publishedCount} succeeded, \${failedCount} failed, \${skippedCount} skipped for \${date} (\${language.toUpperCase()}).\`;
  } else if (failedCount > 0) {
    status = "failure";
    message = \`Publication failed: all \${failedCount} attempted Rashis failed to publish.\`;
  } else {
    status = "failure";
    message = \`No Rashis published: all \${skippedCount} requested Rashis were skipped because required content is missing.\`;
  }`;

const newStatusBlock = `  let status: PublishSetOverallStatus;
  let message: string;

  if (failedCount === 0 && skippedCount === 0 && publishedCount > 0) {
    status = "success";
    message = \`Successfully published all \${publishedCount} Rashis for \${date} (\${language.toUpperCase()}).\`;
  } else if (publishedCount > 0) {
    status = "partial_success";
    const conflictCount = results.filter((r) => r.outcome === "conflict").length;
    const conflictNote = conflictCount > 0 ? \` (\${conflictCount} conflict\${conflictCount > 1 ? "s" : ""})\` : "";
    message = \`Partially published: \${publishedCount} succeeded, \${failedCount} failed\${conflictNote}, \${skippedCount} skipped for \${date} (\${language.toUpperCase()}).\`;
  } else if (publishedCount === 0 && failedCount === 0 && skippedCount > 0) {
    status = "no_eligible_rows";
    message = \`No signs were eligible for publication: all \${skippedCount} requested signs were skipped because required General Outlook is missing.\`;
  } else if (failedCount > 0 && skippedCount > 0) {
    status = "failure";
    message = \`Publication failed: \${failedCount} attempted signs failed and \${skippedCount} signs were skipped.\`;
  } else {
    status = "failure";
    message = \`Publication failed: all \${failedCount} attempted Rashis failed to publish.\`;
  }`;

let changed = 0;
if (actionsContent.includes(oldEarlyReturn)) {
  actionsContent = actionsContent.replace(oldEarlyReturn, newEarlyReturn);
  changed++;
}
if (actionsContent.includes(oldLoopStart)) {
  actionsContent = actionsContent.replace(oldLoopStart, newLoopStart);
  changed++;
}
if (actionsContent.includes(oldStatusBlock)) {
  actionsContent = actionsContent.replace(oldStatusBlock, newStatusBlock);
  changed++;
}

console.log('Replacements made in actions:', changed);
if (changed > 0) {
  fs.writeFileSync(actionsPath, actionsContent, 'utf8');
  console.log('Successfully written updated actions.');
}

const fs = require('fs');

const typesPath = 'C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts';
let typesContent = fs.readFileSync(typesPath, 'utf8');

// Update PublishSetOverallStatus to include 'no_eligible_rows'
const oldStatusType = "export type PublishSetOverallStatus = 'success' | 'partial_success' | 'failure' | 'prerequisite_error';";
const newStatusType = "export type PublishSetOverallStatus = 'success' | 'partial_success' | 'failure' | 'no_eligible_rows' | 'prerequisite_error';";

if (typesContent.includes(oldStatusType)) {
  typesContent = typesContent.replace(oldStatusType, newStatusType);
  fs.writeFileSync(typesPath, typesContent, 'utf8');
  console.log('Successfully updated PublishSetOverallStatus in types file.');
} else {
  console.log('types file already updated or match not found.');
}

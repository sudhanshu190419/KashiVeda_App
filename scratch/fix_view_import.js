const fs = require('fs');

const viewPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx';
let view = fs.readFileSync(viewPath, 'utf8');

const target = '  MatrixRequestCoordinator,\n} from "@/lib/astrology/daily-insights-matrix-coordinator";';
const replacement = '  MatrixRequestCoordinator,\n  stepCalendarDate,\n} from "@/lib/astrology/daily-insights-matrix-coordinator";';

if (view.includes(target)) {
  view = view.replace(target, replacement);
  fs.writeFileSync(viewPath, view, 'utf8');
  console.log('Successfully added stepCalendarDate to imports in daily-insights-matrix-view.tsx');
} else {
  console.log('Target import not found, checking existing content...');
}

const fs = require('fs');
const path = require('path');

const file = path.resolve('C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);",
  "const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; message: string } | null>(null);"
);

const oldNotificationClass = `            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
              : notification.type === 'error'
              ? 'bg-destructive/10 border-destructive/20 text-destructive'
              : 'bg-primary/10 border-primary/20 text-primary'`;

const newNotificationClass = `            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
              : notification.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-600'
              : notification.type === 'error'
              ? 'bg-destructive/10 border-destructive/20 text-destructive'
              : 'bg-primary/10 border-primary/20 text-primary'`;

content = content.replace(oldNotificationClass, newNotificationClass);

const oldNotificationIcon = `            {notification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            )}`;

const newNotificationIcon = `            {notification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : notification.type === 'warning' ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            )}`;

content = content.replace(oldNotificationIcon, newNotificationIcon);

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated notification types in daily-insights-matrix-view.tsx');

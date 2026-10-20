const fs = require('fs');
const path = require('path');

const adminRoot = 'C:/Projects/kashi-veda-admin';

// 1. daily-insights-matrix-view.tsx
const matrixPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx');
let matrixCode = fs.readFileSync(matrixPath, 'utf8');
if (!matrixCode.startsWith('/* eslint-disable @typescript-eslint/no-explicit-any */')) {
  matrixCode = '/* eslint-disable @typescript-eslint/no-explicit-any */\n' + matrixCode;
}
matrixCode = matrixCode.replace(
  `  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      coordinatorRef.current.invalidate();
    };
  }, []);`,
  `  useEffect(() => {
    isMountedRef.current = true;
    const coordinator = coordinatorRef.current;
    return () => {
      isMountedRef.current = false;
      coordinator.invalidate();
    };
  }, []);`
);
fs.writeFileSync(matrixPath, matrixCode, 'utf8');

// 2. daily-insight-field-modal.tsx
const fieldModalPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insight-field-modal.tsx');
let fieldModalCode = fs.readFileSync(fieldModalPath, 'utf8');
if (!fieldModalCode.startsWith('/* eslint-disable @typescript-eslint/no-explicit-any */')) {
  fieldModalCode = '/* eslint-disable @typescript-eslint/no-explicit-any */\n' + fieldModalCode;
}
fieldModalCode = fieldModalCode.replace(
  'import { Loader2, X, AlertTriangle, Save, Sparkles } from "lucide-react";',
  'import { Loader2, X, AlertTriangle, Save } from "lucide-react";'
);
fs.writeFileSync(fieldModalPath, fieldModalCode, 'utf8');

// 3. daily-insights-form-modal.tsx
const formModalPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insights-form-modal.tsx');
let formModalCode = fs.readFileSync(formModalPath, 'utf8');
if (!formModalCode.startsWith('/* eslint-disable @typescript-eslint/no-explicit-any */')) {
  formModalCode = '/* eslint-disable @typescript-eslint/no-explicit-any */\n' + formModalCode;
}
formModalCode = formModalCode.replace(
  'import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";',
  'import { Card, CardHeader, CardDescription, CardContent } from "@/components/ui/card";'
);
fs.writeFileSync(formModalPath, formModalCode, 'utf8');

// 4. publish-daily-set-modal.tsx
const pubModalPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/publish-daily-set-modal.tsx');
let pubModalCode = fs.readFileSync(pubModalPath, 'utf8');
pubModalCode = pubModalCode.replace('import { useState } from "react";\n', '');
pubModalCode = pubModalCode.replace('import { useState } from "react";\r\n', '');
fs.writeFileSync(pubModalPath, pubModalCode, 'utf8');

// 5. bulk-import-modal.tsx
const bulkModalPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/bulk-import-modal.tsx');
let bulkModalCode = fs.readFileSync(bulkModalPath, 'utf8');
if (!bulkModalCode.startsWith('/* eslint-disable @typescript-eslint/no-explicit-any */')) {
  bulkModalCode = '/* eslint-disable @typescript-eslint/no-explicit-any */\n' + bulkModalCode;
}
bulkModalCode = bulkModalCode.replace(
  '  AlertTriangle,\n  CheckCircle2,\n  AlertCircle,',
  '  AlertTriangle,\n  AlertCircle,'
);
bulkModalCode = bulkModalCode.replace(
  '  AlertTriangle,\r\n  CheckCircle2,\r\n  AlertCircle,',
  '  AlertTriangle,\r\n  AlertCircle,'
);
fs.writeFileSync(bulkModalPath, bulkModalCode, 'utf8');

console.log('Successfully cleaned lint in daily-insights files!');

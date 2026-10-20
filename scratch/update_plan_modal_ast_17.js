const fs = require('fs');

const path = 'C:/Projects/kashi-veda-admin/components/admin/astrology/modals/plan-form-modal.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetValidation = `    if (price < 0) {
      setError("Price cannot be negative.");
      return;
    }`;

const replacementValidation = `    const numPrice = Number(price);
    if (typeof numPrice !== "number" || Number.isNaN(numPrice) || !Number.isFinite(numPrice)) {
      setError("Price must be a valid number.");
      return;
    }
    if (numPrice <= 0) {
      setError("Price must be greater than zero.");
      return;
    }
    if (Math.round(numPrice * 100) / 100 <= 0) {
      setError("Price must be greater than zero at currency precision.");
      return;
    }`;

if (!content.includes(targetValidation)) {
  console.error("Target validation string not found in plan-form-modal.tsx!");
  process.exit(1);
}

content = content.replace(targetValidation, replacementValidation);

// Update input min and step attributes
const targetInput = `                <input
                  type="number"
                  min={0}
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                  disabled={isSubmitting}
                />`;

const replacementInput = `                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                  disabled={isSubmitting}
                />`;

if (content.includes(targetInput)) {
  content = content.replace(targetInput, replacementInput);
} else {
  console.warn("Target input string not matched exactly; searching looser pattern");
  content = content.replace(/min=\{0\}\s+step="any"/, 'min="0.01" step="0.01"');
}

fs.writeFileSync(path, content, 'utf8');
console.log("Successfully updated plan-form-modal.tsx");

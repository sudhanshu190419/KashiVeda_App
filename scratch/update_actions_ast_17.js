const fs = require('fs');

const path = 'C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `  if (formData.price === undefined || formData.price < 0) {
    return { success: false, error: "Price cannot be negative." };
  }`;

const replacementStr = `  const rawPrice = formData.price;
  if (
    rawPrice === undefined ||
    rawPrice === null ||
    rawPrice === "" ||
    (typeof rawPrice === "string" && (rawPrice as string).trim() === "")
  ) {
    return { success: false, error: "Price is required." };
  }
  const numPrice = typeof rawPrice === "number" ? rawPrice : Number(rawPrice);
  if (typeof numPrice !== "number" || Number.isNaN(numPrice) || !Number.isFinite(numPrice)) {
    return { success: false, error: "Price must be a valid number." };
  }
  if (numPrice <= 0) {
    return { success: false, error: "Price must be greater than zero." };
  }
  // Database precision: NUMERIC(12, 2)
  const roundedPrice = Math.round(numPrice * 100) / 100;
  if (roundedPrice <= 0) {
    return { success: false, error: "Price must be greater than zero at currency precision." };
  }`;

if (!content.includes(targetStr)) {
  console.error("Target string not found in astrology-management.ts!");
  process.exit(1);
}

content = content.replace(targetStr, replacementStr);

// Also update p_price: formData.price to p_price: roundedPrice
content = content.replace('p_price: formData.price,', 'p_price: roundedPrice,');

fs.writeFileSync(path, content, 'utf8');
console.log("Successfully updated saveAstrologyPlan in astrology-management.ts");

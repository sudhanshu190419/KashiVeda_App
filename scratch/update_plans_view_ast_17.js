const fs = require('fs');

const path = 'C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-plans-view.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetPriceCell = `                    <td className="px-4 py-3 font-semibold text-foreground">
                      {plan.currency} {plan.price.toLocaleString("en-IN")}
                    </td>`;

const replacementPriceCell = `                    <td className="px-4 py-3 font-semibold text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>{plan.currency} {plan.price.toLocaleString("en-IN")}</span>
                        {plan.price <= 0 && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 font-normal">
                            Unpurchasable (≤ 0)
                          </Badge>
                        )}
                      </div>
                    </td>`;

if (!content.includes(targetPriceCell)) {
  console.error("Target price cell not found in astrology-plans-view.tsx!");
  process.exit(1);
}

content = content.replace(targetPriceCell, replacementPriceCell);
fs.writeFileSync(path, content, 'utf8');
console.log("Successfully updated astrology-plans-view.tsx");

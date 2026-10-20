const fs = require('fs');

const detailPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-subscription-detail-view.tsx';
let content = fs.readFileSync(detailPath, 'utf8');

// Target 1: Transactions and refunds block
const targetTxRf = `              {/* Transactions */}
              {subscription.transactions.length > 0 && (
                <div className="pt-2 border-t border-border/40">
                  <span className="text-xs font-semibold text-foreground block mb-2">
                    Captured Gateway Transactions
                  </span>
                  <div className="space-y-1.5">
                    {subscription.transactions.map((tx) => (
                      <div key={tx.id} className="flex justify-between items-center text-xs bg-card p-2 rounded border border-border/40">
                        <div className="font-mono text-muted-foreground">
                          {tx.providerPaymentId || tx.id}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {tx.status}
                          </Badge>
                          <span className="font-semibold text-foreground">
                            ₹{tx.amount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Refunds */}
              {subscription.refunds.length > 0 && (
                <div className="pt-2 border-t border-border/40">
                  <span className="text-xs font-semibold text-foreground block mb-2">
                    Refund Obligations (M17 Gateway Pipeline)
                  </span>
                  <div className="space-y-1.5">
                    {subscription.refunds.map((rf) => (
                      <div key={rf.id} className="flex justify-between items-center text-xs bg-destructive/5 p-2 rounded border border-destructive/20">
                        <div>
                          <div className="font-mono text-destructive font-semibold">
                            Refund ID: {rf.id.slice(0, 8)}...
                          </div>
                          {rf.reason && <div className="text-[11px] text-muted-foreground">{rf.reason}</div>}
                        </div>
                        <div className="flex items-center gap-2 text-right">
                          <Badge
                            variant="outline"
                            className={
                              rf.status === "processed"
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            }
                          >
                            {rf.status}
                          </Badge>
                          <span className="font-semibold text-foreground">
                            ₹{rf.amount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}`;

const replacementTxRf = `              {/* Transactions */}
              <div className="pt-2 border-t border-border/40">
                <span className="text-xs font-semibold text-foreground block mb-2">
                  Captured Gateway Transactions
                </span>
                {subscription.transactionsError ? (
                  <div className="rounded border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{subscription.transactionsError}</span>
                  </div>
                ) : subscription.transactions.length > 0 ? (
                  <div className="space-y-1.5">
                    {subscription.transactions.map((tx) => (
                      <div key={tx.id} className="flex justify-between items-center text-xs bg-card p-2 rounded border border-border/40">
                        <div className="font-mono text-muted-foreground">
                          {tx.providerPaymentId || tx.id}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {tx.status}
                          </Badge>
                          <span className="font-semibold text-foreground">
                            ₹{tx.amount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic py-1">
                    No gateway transactions recorded for this order.
                  </div>
                )}
              </div>

              {/* Refunds */}
              {subscription.refundsError ? (
                <div className="pt-2 border-t border-border/40">
                  <span className="text-xs font-semibold text-foreground block mb-2">
                    Refund Obligations (M17 Gateway Pipeline)
                  </span>
                  <div className="rounded border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{subscription.refundsError}</span>
                  </div>
                </div>
              ) : subscription.refunds.length > 0 ? (
                <div className="pt-2 border-t border-border/40">
                  <span className="text-xs font-semibold text-foreground block mb-2">
                    Refund Obligations (M17 Gateway Pipeline)
                  </span>
                  <div className="space-y-1.5">
                    {subscription.refunds.map((rf) => (
                      <div key={rf.id} className="flex justify-between items-center text-xs bg-destructive/5 p-2 rounded border border-destructive/20">
                        <div>
                          <div className="font-mono text-destructive font-semibold">
                            Refund ID: {rf.id.slice(0, 8)}...
                          </div>
                          {rf.reason && <div className="text-[11px] text-muted-foreground">{rf.reason}</div>}
                        </div>
                        <div className="flex items-center gap-2 text-right">
                          <Badge
                            variant="outline"
                            className={
                              rf.status === "processed"
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            }
                          >
                            {rf.status}
                          </Badge>
                          <span className="font-semibold text-foreground">
                            ₹{rf.amount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}`;

// Target 2: Deliveries block
const targetDel = `          {subscription.deliveries.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No deliveries dispatched for this subscription yet.
            </div>
          ) : (`;

const replacementDel = `          {subscription.deliveriesError ? (
            <div className="py-4 px-3 rounded border border-destructive/20 bg-destructive/10 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{subscription.deliveriesError}</span>
            </div>
          ) : subscription.deliveries.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No deliveries dispatched for this subscription yet.
            </div>
          ) : (`;

if (!content.includes(targetTxRf)) {
  console.error('targetTxRf not found in astrology-subscription-detail-view.tsx');
  process.exit(1);
}
if (!content.includes(targetDel)) {
  console.error('targetDel not found in astrology-subscription-detail-view.tsx');
  process.exit(1);
}

content = content.replace(targetTxRf, replacementTxRf);
content = content.replace(targetDel, replacementDel);

fs.writeFileSync(detailPath, content, 'utf8');
console.log('Successfully updated components/admin/astrology/astrology-subscription-detail-view.tsx');

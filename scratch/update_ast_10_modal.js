const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/publish-daily-set-modal.tsx');

const modalContent = `"use client";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PublishSetValidationResult, PublishSetResult } from "@/lib/types/daily-insights-management";
import { AlertTriangle, CheckCircle2, AlertCircle, Loader2, X, Send, RefreshCw } from "lucide-react";

interface PublishDailySetModalProps {
  isOpen: boolean;
  date: string;
  language: string;
  validation: PublishSetValidationResult | null;
  isValidating: boolean;
  isPublishing: boolean;
  publishResult?: PublishSetResult | null;
  onClose: () => void;
  onConfirmPublish: (publishReadyOnly: boolean) => void;
  onRetryFailed?: (failedRashiIds: number[]) => void;
  onEditRashi: (rashiId: number) => void;
  onResetResult?: () => void;
}

export function PublishDailySetModal({
  isOpen,
  date,
  language,
  validation,
  isValidating,
  isPublishing,
  publishResult,
  onClose,
  onConfirmPublish,
  onRetryFailed,
  onEditRashi,
}: PublishDailySetModalProps) {
  if (!isOpen) return null;

  // Extract failed Rashi IDs from result for retry
  const failedRashiIds = publishResult
    ? publishResult.results
        .filter((r) => r.outcome === "failed" || r.outcome === "conflict")
        .map((r) => r.rashi_id)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <Card className="w-full max-w-lg shadow-2xl border-border bg-card">
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4">
          <div>
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Send className="h-4 w-4 text-emerald-500" />
              {publishResult ? "Publication Outcome" : "Publish Daily Insights Set"}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Date: <span className="font-semibold text-foreground">{date}</span> • Language:{" "}
              <span className="font-semibold uppercase text-foreground">{language}</span>
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>

        {/* Content Body */}
        <CardContent className="py-5 space-y-4 text-sm">
          {/* STATE 1: PUBLISHING IN PROGRESS */}
          {isPublishing ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <div className="text-center">
                <span className="text-xs font-semibold text-foreground">Publishing Daily Set...</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Invoking authoritative database RPCs and verifying row versions.
                </p>
              </div>
            </div>
          ) : publishResult ? (
            /* STATE 2: PUBLICATION RESULT VIEW (AST-10) */
            <div className="space-y-4">
              {/* Overall Outcome Status Banner */}
              {publishResult.status === "success" && (
                <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-700">Complete Success</h4>
                    <p className="text-xs text-emerald-800/80 mt-0.5 leading-relaxed">
                      All {publishResult.publishedCount} requested zodiac signs were successfully published to the live mobile feed.
                    </p>
                  </div>
                </div>
              )}

              {publishResult.status === "partial_success" && (
                <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3.5">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-700">
                      Partial Success: {publishResult.publishedCount} Published, {publishResult.failedCount} Failed
                      {publishResult.skippedCount > 0 && \`, \${publishResult.skippedCount} Skipped\`}
                    </h4>
                    <p className="text-xs text-amber-800/80 mt-0.5 leading-relaxed">
                      Some signs published successfully, while others encountered errors or concurrency conflicts. You can review the details below and safely retry the failed signs.
                    </p>
                  </div>
                </div>
              )}

              {publishResult.status === "failure" && (
                <div className="flex items-start gap-3 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3.5">
                  <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-700">Publication Failed</h4>
                    <p className="text-xs text-rose-800/80 mt-0.5 leading-relaxed">
                      {publishResult.message || "None of the requested zodiac signs could be published."}
                    </p>
                  </div>
                </div>
              )}

              {publishResult.status === "prerequisite_error" && (
                <div className="flex items-start gap-3 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3.5">
                  <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-700">Prerequisite Database Error</h4>
                    <p className="text-xs text-rose-800/80 mt-0.5 leading-relaxed">
                      {publishResult.prerequisiteError || "A required database read failed before publication could proceed."}
                    </p>
                  </div>
                </div>
              )}

              {/* Per-Row Detailed Results List */}
              {publishResult.results && publishResult.results.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground px-1">
                    <span>Zodiac Sign</span>
                    <span>Result</span>
                  </div>
                  <div className="rounded-lg border border-border/70 divide-y divide-border/50 max-h-52 overflow-y-auto bg-card">
                    {publishResult.results.map((item) => (
                      <div key={item.rashi_id} className="p-2.5 text-xs space-y-1 bg-card hover:bg-muted/30 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-foreground">{item.vedic_name || item.rashi_name}</span>
                          </div>
                          <div>
                            {item.outcome === "published" && (
                              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Published
                              </Badge>
                            )}
                            {item.outcome === "conflict" && (
                              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
                                <AlertTriangle className="h-3 w-3" /> Version Conflict
                              </Badge>
                            )}
                            {item.outcome === "failed" && (
                              <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/20 gap-1">
                                <AlertCircle className="h-3 w-3" /> Failed
                              </Badge>
                            )}
                            {item.outcome === "skipped" && (
                              <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border">
                                Skipped
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Error or skip reason detail */}
                        {item.error && (
                          <p className={"text-[11px] leading-tight " + (item.outcome === "conflict" ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400")}>
                            {item.outcome === "conflict"
                              ? "Modified by another editor since loaded. Please reload matrix before retrying."
                              : item.error}
                          </p>
                        )}
                        {item.skip_reason && !item.error && (
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            Skipped: {item.skip_reason === "missing_general_outlook" ? "General Outlook is empty" : item.skip_reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : isValidating ? (
            /* STATE 3: VALIDATING READINESS */
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">Verifying all 12 Rashis readiness...</span>
            </div>
          ) : validation ? (
            /* STATE 4: READINESS SUMMARY (PRE-PUBLISH) */
            <div className="space-y-4">
              {validation.error ? (
                <div className="flex items-start gap-3 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3.5">
                  <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-700">Database Query Failed</h4>
                    <p className="text-xs text-rose-800/80 mt-0.5 leading-relaxed">
                      {validation.error}
                    </p>
                  </div>
                </div>
              ) : validation.isReadyForPublish ? (
                <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-700">All 12 Rashis Complete & Ready</h4>
                    <p className="text-xs text-emerald-800/80 mt-0.5 leading-relaxed">
                      Every zodiac sign contains verified General Outlook guidance. Publishing will activate this content for all subscribed mobile users.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3.5">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-700">
                        {validation.readyCount} of 12 Rashis Ready ({validation.missingCount} Incomplete)
                      </h4>
                      <p className="text-xs text-amber-800/80 mt-0.5 leading-relaxed">
                        The following signs are missing the required General Outlook content. You can complete them or publish only the ready signs.
                      </p>
                    </div>
                  </div>

                  {/* List of incomplete signs */}
                  <div className="rounded-lg border border-border/70 divide-y divide-border/50 max-h-48 overflow-y-auto">
                    {validation.missingRashis.map((missing) => (
                      <div key={missing.rashi_id} className="flex items-center justify-between p-2.5 text-xs bg-card">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{missing.vedicName}</span>
                          <span className="text-muted-foreground">({missing.englishName})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/20">
                            {missing.reason === "missing_record" ? "Not Created" : "Missing Outlook"}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onEditRashi(missing.rashi_id)}
                            className="h-6 text-[11px] px-2"
                          >
                            Fill In →
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-6 py-3.5">
          {publishResult ? (
            /* Result View Footer */
            <>
              <Button variant="outline" size="sm" onClick={onClose} disabled={isPublishing}>
                Close
              </Button>

              <div className="flex items-center gap-2">
                {failedRashiIds.length > 0 && onRetryFailed && (
                  <Button
                    size="sm"
                    onClick={() => onRetryFailed(failedRashiIds)}
                    disabled={isPublishing}
                    className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                  >
                    {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Retry Failed Signs ({failedRashiIds.length})
                  </Button>
                )}
              </div>
            </>
          ) : (
            /* Pre-Publish Readiness Footer */
            <>
              <Button variant="outline" size="sm" onClick={onClose} disabled={isPublishing}>
                Cancel
              </Button>

              <div className="flex items-center gap-2">
                {validation && !validation.isReadyForPublish && !validation.error && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onConfirmPublish(true)}
                    disabled={isPublishing || validation.readyCount === 0}
                    className="text-xs"
                  >
                    Publish Ready Only ({validation.readyCount})
                  </Button>
                )}

                <Button
                  size="sm"
                  onClick={() => onConfirmPublish(false)}
                  disabled={
                    isPublishing ||
                    isValidating ||
                    (validation ? !validation.isReadyForPublish || !!validation.error : true)
                  }
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                >
                  {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Publish All 12 Rashis
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
`;

fs.writeFileSync(targetFile, modalContent, 'utf8');
console.log("Successfully updated publish-daily-set-modal.tsx for AST-10.");

const fs = require('fs');
const path = require('path');

const baseDir = 'C:\\Projects\\kashi-veda-admin';
const reviewsDir = path.join(baseDir, 'components', 'admin', 'reviews');

// 1. components/admin/reviews/review-moderate-modal.tsx
const modalContent = `"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { moderateReviewAction } from "@/lib/actions/review-management";
import type { AdminReviewItem, ReviewVisibilityStatus } from "@/lib/types/review-management";
import { Loader2, X, AlertCircle, ShieldAlert, CheckCircle2 } from "lucide-react";

interface ReviewModerateModalProps {
  review: AdminReviewItem | null;
  targetStatus: ReviewVisibilityStatus | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReviewModerateModal({
  review,
  targetStatus,
  isOpen,
  onClose,
  onSuccess,
}: ReviewModerateModalProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !review || !targetStatus) return null;

  const isHiding = targetStatus === "hidden";
  const title = isHiding ? "Hide Customer Review" : "Restore Customer Review";
  const description = isHiding
    ? "Hiding this review will remove it from the Pandit's public profile and exclude its rating from the overall average."
    : "Restoring this review will make it publicly visible again on the Pandit's profile and recalculate the overall average rating.";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError("Please provide a reason of at least 3 characters.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await moderateReviewAction(review.id, targetStatus, reason.trim());
      if (res.success) {
        setReason("");
        onSuccess();
        onClose();
      } else {
        setError(res.error || "Failed to update review visibility.");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in-50">
      <Card className="relative w-full max-w-lg border-border/60 bg-card shadow-2xl">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className={\`flex h-9 w-9 items-center justify-center rounded-lg \${isHiding ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}\`}>
              {isHiding ? <ShieldAlert className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Review Details Snapshot */}
            <div className="rounded-lg bg-muted/50 p-3 border border-border/50 text-xs space-y-1">
              <div className="flex justify-between font-medium">
                <span>Pandit: {review.pandit_name}</span>
                <span className="text-amber-500 font-bold">{"★".repeat(review.rating)} ({review.rating}/5)</span>
              </div>
              <div className="text-muted-foreground truncate">
                Devotee: {review.customer_name} ({review.customer_email})
              </div>
              {review.comment ? (
                <div className="italic text-foreground/80 pt-1 border-t border-border/40 mt-1">
                  "{review.comment}"
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="moderation-reason">Moderation Reason *</Label>
              <textarea
                id="moderation-reason"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={isHiding ? "e.g. Profanity, spam, or personal phone number included..." : "e.g. Review verified and confirmed compliant with community guidelines..."}
                value={reason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
                rows={3}
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive border border-destructive/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant={isHiding ? "destructive" : "default"} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : isHiding ? (
                  "Hide Review"
                ) : (
                  "Restore Review"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
`;

fs.writeFileSync(path.join(reviewsDir, 'review-moderate-modal.tsx'), modalContent, 'utf8');

// 2. components/admin/reviews/review-table.tsx
const tableContent = `"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EyeOff, Eye, Star } from "lucide-react";
import type { AdminReviewItem } from "@/lib/types/review-management";

interface ReviewTableProps {
  reviews: AdminReviewItem[];
  onModerate: (review: AdminReviewItem, targetStatus: "published" | "hidden") => void;
}

export function ReviewTable({ reviews, onModerate }: ReviewTableProps) {
  if (reviews.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center animate-in fade-in-50">
        <Star className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <h3 className="font-semibold text-foreground">No Reviews Found</h3>
        <p className="text-sm text-muted-foreground">
          There are no reviews matching the selected filter criteria.
        </p>
      </div>
    );
  }

  const formatMode = (mode: string) => {
    switch (mode) {
      case "home":
        return <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/10">Home</Badge>;
      case "temple":
        return <Badge variant="outline" className="border-purple-500/40 text-purple-600 bg-purple-500/10">Temple</Badge>;
      case "remote":
        return <Badge variant="outline" className="border-blue-500/40 text-blue-600 bg-blue-500/10">Online</Badge>;
      default:
        return <Badge variant="outline">{mode}</Badge>;
    }
  };

  return (
    <div className="rounded-md border bg-card overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b bg-muted/40">
          <tr className="border-b transition-colors hover:bg-muted/50">
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground w-[110px]">Rating</th>
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Devotee</th>
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Assigned Pandit</th>
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Ritual & Format</th>
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground max-w-[280px]">Comment / Feedback</th>
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {reviews.map((r) => {
            const isPublished = r.visibility_status === "published";
            const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);

            return (
              <tr key={r.id} className="border-b transition-colors hover:bg-muted/50">
                <td className="p-4 align-middle font-medium">
                  <div className="flex flex-col">
                    <span className="text-amber-500 tracking-wider text-sm">{stars}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{r.rating} / 5</span>
                  </div>
                </td>
                <td className="p-4 align-middle">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground text-sm">{r.customer_name}</span>
                    <span className="text-xs text-muted-foreground">{r.customer_email}</span>
                  </div>
                </td>
                <td className="p-4 align-middle">
                  <span className="font-medium text-sm text-foreground">{r.pandit_name}</span>
                </td>
                <td className="p-4 align-middle">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{r.puja_name}</span>
                    <div className="flex items-center gap-1.5">
                      {formatMode(r.service_mode)}
                      <span className="text-[11px] text-muted-foreground font-mono">{r.booking_number}</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 align-middle max-w-[280px]">
                  {r.comment ? (
                    <p className="text-xs text-foreground/90 line-clamp-2 italic" title={r.comment}>
                      "{r.comment}"
                    </p>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No written comment</span>
                  )}
                </td>
                <td className="p-4 align-middle">
                  {isPublished ? (
                    <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20">
                      Published
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="bg-rose-500/15 text-rose-600 border-rose-500/30 hover:bg-rose-500/20">
                      Hidden
                    </Badge>
                  )}
                </td>
                <td className="p-4 align-middle text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="p-4 align-middle text-right">
                  {isPublished ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                      onClick={() => onModerate(r, "hidden")}
                    >
                      <EyeOff className="h-3.5 w-3.5 mr-1" />
                      Hide
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                      onClick={() => onModerate(r, "published")}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Restore
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
`;

fs.writeFileSync(path.join(reviewsDir, 'review-table.tsx'), tableContent, 'utf8');

// 3. components/admin/reviews/review-list-view.tsx
const listViewContent = `"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, EyeOff, CheckCircle2, MessageSquare } from "lucide-react";
import { ReviewTable } from "./review-table";
import { ReviewModerateModal } from "./review-moderate-modal";
import type { AdminReviewItem, ReviewOverviewData, ReviewVisibilityStatus } from "@/lib/types/review-management";

interface ReviewListViewProps {
  initialData: ReviewOverviewData;
}

export function ReviewListView({ initialData }: ReviewListViewProps) {
  const [filter, setFilter] = useState<"all" | "published" | "hidden">("all");
  const [selectedReview, setSelectedReview] = useState<AdminReviewItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<ReviewVisibilityStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredReviews = initialData.reviews.filter((r) => {
    if (filter === "all") return true;
    return r.visibility_status === filter;
  });

  const handleOpenModerate = (review: AdminReviewItem, status: ReviewVisibilityStatus) => {
    setSelectedReview(review);
    setTargetStatus(status);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Rating
            </CardTitle>
            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {initialData.averageRating > 0 ? \`\${initialData.averageRating} ★\` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From {initialData.publishedCount} published ratings
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Reviews
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{initialData.totalCount}</div>
            <p className="text-xs text-muted-foreground mt-1">All customer submissions</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Published Reviews
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-emerald-600">
              {initialData.publishedCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active on priest profiles</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Hidden Reviews
            </CardTitle>
            <EyeOff className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-rose-600">
              {initialData.hiddenCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Moderated / suppressed</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-lg">Customer Reviews & Ratings</CardTitle>
            <CardDescription>
              Moderate customer reviews, inspect ritual feedback, and enforce community sanctity
            </CardDescription>
          </div>

          <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
            <button
              onClick={() => setFilter("all")}
              className={\`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all \${filter === "all" ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"}\`}
            >
              All ({initialData.totalCount})
            </button>
            <button
              onClick={() => setFilter("published")}
              className={\`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all \${filter === "published" ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"}\`}
            >
              Published ({initialData.publishedCount})
            </button>
            <button
              onClick={() => setFilter("hidden")}
              className={\`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all \${filter === "hidden" ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"}\`}
            >
              Hidden ({initialData.hiddenCount})
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <ReviewTable
            reviews={filteredReviews}
            onModerate={handleOpenModerate}
          />
        </CardContent>
      </Card>

      {/* Moderate Action Modal */}
      <ReviewModerateModal
        review={selectedReview}
        targetStatus={targetStatus}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedReview(null);
          setTargetStatus(null);
        }}
        onSuccess={() => {
          // Revalidation handles data refresh
        }}
      />
    </div>
  );
}
`;

fs.writeFileSync(path.join(reviewsDir, 'review-list-view.tsx'), listViewContent, 'utf8');

console.log("Successfully updated admin review components!");

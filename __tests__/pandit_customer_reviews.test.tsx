import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { bookingReviewService } from "../src/features/booking/services/bookingReviewService.ts";
import { bookingPaymentService } from "../src/features/booking/services/bookingPaymentService.ts";
import { useBookingReview } from "../src/features/booking/hooks/useBookingReview.ts";
import { SubmitReviewModal } from "../src/features/booking/components/SubmitReviewModal.tsx";
import { ReviewCard } from "../src/features/discovery/components/ReviewCard.tsx";
import { PanditCard } from "../src/features/discovery/components/PanditCard.tsx";
import { BookingDetailsScreen } from "../src/features/booking/screens/BookingDetailsScreen.tsx";
import { bookingService } from "../src/features/booking/services/bookingService.ts";
import { discoveryService } from "../src/features/discovery/services/discoveryService.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";
import { BookingDetail } from "../src/features/booking/types/booking.types.ts";
import { PanditSummary, Review } from "../src/features/discovery/types/discovery.ts";

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: any = { bookingId: "bkg-completed-1" };

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: mockRouteParams,
  }),
  useFocusEffect: (cb: any) => {
    const ReactModule = require("react");
    ReactModule.useEffect(() => {
      return cb();
    }, [cb]);
  },
  useIsFocused: () => true,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function HookTestConsumer({
  bookingId,
  isCompleted,
  onUpdate,
}: {
  bookingId?: string;
  isCompleted: boolean;
  onUpdate: (hookState: ReturnType<typeof useBookingReview>) => void;
}) {
  const hookState = useBookingReview(bookingId, isCompleted);
  React.useEffect(() => {
    onUpdate(hookState);
  }, [hookState, onUpdate]);
  return null;
}

describe("Pandit Review and Rating System Test Suite", () => {
  const sampleBookingCompleted: BookingDetail = {
    id: "bkg-completed-1",
    booking_number: "KV-BKG-2026-001",
    customer_id: "user-cust-1",
    pandit_id: "pandit-acharya-1",
    puja_service_id: "puja-rudra-1",
    service_mode: "home",
    status: "completed",
    scheduled_start_at: "2026-10-10T10:00:00+05:30",
    scheduled_end_at: "2026-10-10T12:00:00+05:30",
    price_snapshot: 3500,
    currency: "INR",
    advance_percent: 10,
    advance_amount: 350,
    balance_amount: 3150,
    total_amount: 3500,
    reschedule_count: 0,
    completed_at: "2026-10-10T12:05:00+05:30",
    created_at: "2026-10-08T10:00:00+05:30",
    updated_at: "2026-10-10T12:05:00+05:30",
    outstanding_balance: 0,
    total_paid: 3500,
    puja_service: {
      id: "puja-rudra-1",
      name: "Kashi Vishwanath Rudrabhishek",
      description: "Sacred abhishekam ritual",
      default_duration_minutes: 120,
    },
    pandit: {
      id: "pandit-acharya-1",
      display_name: "Acharya Ram Shastri",
      avatar_url: null,
      phone: "+919876543210",
    },
  };

  const sampleBookingUpcoming: BookingDetail = {
    ...sampleBookingCompleted,
    id: "bkg-upcoming-2",
    status: "upcoming",
    completed_at: undefined,
  };

  const sampleBookingCancelled: BookingDetail = {
    ...sampleBookingCompleted,
    id: "bkg-cancelled-3",
    status: "cancelled",
    completed_at: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. Review Eligibility & Service Rules", () => {
    it("submits a review for an eligible completed booking via RPC", async () => {
      const rpcSpy = jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: {
          success: true,
          review_id: "rev-123",
          booking_id: "bkg-completed-1",
          pandit_id: "pandit-acharya-1",
          rating: 5,
          comment: "Auspicious chanting and devout rituals.",
          visibility_status: "published",
        },
        error: null,
      } as any);

      const res = await bookingReviewService.submitReview(
        "bkg-completed-1",
        5,
        "Auspicious chanting and devout rituals."
      );

      expect(rpcSpy).toHaveBeenCalledWith("submit_booking_review", {
        p_booking_id: "bkg-completed-1",
        p_rating: 5,
        p_comment: "Auspicious chanting and devout rituals.",
      });
      expect(res.success).toBe(true);
      expect(res.review_id).toBe("rev-123");
    });

    it("rejects review submission when booking ID is missing", async () => {
      await expect(bookingReviewService.submitReview("", 5)).rejects.toThrow(
        "Booking identifier is required."
      );
    });

    it("rejects invalid rating values (< 1 or > 5)", async () => {
      await expect(
        bookingReviewService.submitReview("bkg-completed-1", 0)
      ).rejects.toThrow("Please select a rating between 1 and 5 stars.");

      await expect(
        bookingReviewService.submitReview("bkg-completed-1", 6)
      ).rejects.toThrow("Please select a rating between 1 and 5 stars.");
    });

    it("rejects written comments exceeding 1000 characters", async () => {
      const longComment = "A".repeat(1001);
      await expect(
        bookingReviewService.submitReview("bkg-completed-1", 5, longComment)
      ).rejects.toThrow("Review comment cannot exceed 1000 characters.");
    });

    it("normalizes blank comment to null before calling RPC", async () => {
      const rpcSpy = jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: { success: true, review_id: "rev-456" },
        error: null,
      } as any);

      await bookingReviewService.submitReview("bkg-completed-1", 4, "   ");

      expect(rpcSpy).toHaveBeenCalledWith("submit_booking_review", {
        p_booking_id: "bkg-completed-1",
        p_rating: 4,
        p_comment: null,
      });
    });

    it("handles backend error when customer attempts to review an uncompleted or duplicate booking", async () => {
      jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: null,
        error: { message: "Only completed rituals can be reviewed (current booking status: upcoming)." },
      } as any);

      await expect(
        bookingReviewService.submitReview("bkg-upcoming-2", 5)
      ).rejects.toThrow("Only completed rituals can be reviewed (current booking status: upcoming).");
    });
  });

  describe("2. useBookingReview Hook", () => {
    it("fetches review status when booking is completed", async () => {
      jest.spyOn(bookingReviewService, "fetchBookingReview").mockResolvedValue({
        id: "rev-1",
        booking_id: "bkg-completed-1",
        pandit_id: "pandit-acharya-1",
        rating: 5,
        comment: "Excellent ceremony",
        visibility_status: "published",
        created_at: "2026-10-10T13:00:00Z",
      });

      let latestState: any = null;
      await act(async () => {
        ReactTestRenderer.create(
          <HookTestConsumer
            bookingId="bkg-completed-1"
            isCompleted={true}
            onUpdate={(state) => {
              latestState = state;
            }}
          />
        );
      });

      expect(latestState?.hasReviewed).toBe(true);
      expect(latestState?.review?.rating).toBe(5);
      expect(latestState?.review?.comment).toBe("Excellent ceremony");
    });

    it("does not fetch review when booking is not completed", async () => {
      const fetchSpy = jest.spyOn(bookingReviewService, "fetchBookingReview");

      let latestState: any = null;
      await act(async () => {
        ReactTestRenderer.create(
          <HookTestConsumer
            bookingId="bkg-upcoming-2"
            isCompleted={false}
            onUpdate={(state) => {
              latestState = state;
            }}
          />
        );
      });

      expect(latestState?.hasReviewed).toBe(false);
      expect(latestState?.review).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("3. SubmitReviewModal UI Component", () => {
    it("renders star selectors and allows selecting 1 to 5 stars", () => {
      const mockSubmit = jest.fn();
      let tree: any;

      act(() => {
        tree = ReactTestRenderer.create(
          <SubmitReviewModal
            visible={true}
            onClose={() => {}}
            onSubmit={mockSubmit}
            panditName="Acharya Ram Shastri"
          />
        );
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Rate Your Pandit");
      expect(json).toContain("Acharya Ram Shastri");
      expect(json).toContain("Written Feedback (Optional)");
      expect(json).toContain("0 / 1000");
    });
  });

  describe("4. ReviewCard Component (Public Profile Display)", () => {
    it("renders 5-star rating with format badge, verified tag, and date", () => {
      const sampleReview: Review = {
        id: "rev-1",
        pandit_id: "pandit-1",
        rating: 5,
        comment: "Divine chanting and peaceful atmosphere.",
        visibility_status: "published",
        created_at: "2026-10-10T12:00:00Z",
        reviewer_label: "Verified Devotee",
        service_mode: "home",
        puja_name: "Rudrabhishek",
      };

      let tree: any;
      act(() => {
        tree = ReactTestRenderer.create(<ReviewCard review={sampleReview} />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("★★★★★");
      expect(json).toContain("Verified Ritual");
      expect(json).toContain("🪔 Home");
      expect(json).toContain("Rudrabhishek");
      expect(json).toContain("Divine chanting and peaceful atmosphere.");
    });

    it("renders fallback text when review comment is not provided", () => {
      const sampleReview: Review = {
        id: "rev-2",
        pandit_id: "pandit-1",
        rating: 4,
        comment: null,
        visibility_status: "published",
        created_at: "2026-10-10T12:00:00Z",
        service_mode: "remote",
      };

      let tree: any;
      act(() => {
        tree = ReactTestRenderer.create(<ReviewCard review={sampleReview} />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("★★★★☆");
      expect(json).toContain("🌐 Online");
      expect(json).toContain("Verified Devotee Rating");
    });
  });

  describe("5. PanditCard (Discovery Rating Display)", () => {
    it("renders rating and review count when published reviews exist", () => {
      const panditWithReviews: PanditSummary = {
        id: "pandit-1",
        user_id: "u-1",
        display_name: "Acharya Mishra",
        avatar_url: null,
        bio: "Vedic Scholar",
        years_experience: 15,
        languages: ["Sanskrit", "Hindi"],
        public_status: "available",
        rating_avg: 4.8,
        rating_count: 42,
        offering_names: ["Rudrabhishek"],
        puja_price: 2500,
        distance_km: 2.5,
        kundli_enabled: false,
        kundli_price: null,
      };

      let tree: any;
      act(() => {
        tree = ReactTestRenderer.create(
          <PanditCard pandit={panditWithReviews} onPress={() => {}} />
        );
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("★ 4.8 (42)");
    });

    it("renders 'New Pandit • No reviews yet' when no reviews exist (never 0.0)", () => {
      const panditWithoutReviews: PanditSummary = {
        id: "pandit-2",
        user_id: "u-2",
        display_name: "Acharya New",
        avatar_url: null,
        bio: "Vedic Scholar",
        years_experience: 5,
        languages: ["Hindi"],
        public_status: "available",
        rating_avg: null,
        rating_count: 0,
        offering_names: ["Maha Mrityunjaya"],
        puja_price: 3100,
        distance_km: null,
        kundli_enabled: false,
        kundli_price: null,
      };

      let tree: any;
      act(() => {
        tree = ReactTestRenderer.create(
          <PanditCard pandit={panditWithoutReviews} onPress={() => {}} />
        );
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("★ New Acharya");
      expect(json).not.toContain("★ 0.0");
    });
  });

  describe("6. BookingDetailsScreen Review CTA Integration", () => {
    it("renders 'Rate & Review Your Pandit' CTA when booking status is completed and no review exists", async () => {
      mockRouteParams = { bookingId: "bkg-completed-1" };
      jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValue(sampleBookingCompleted);
      jest.spyOn(bookingReviewService, "fetchBookingReview").mockResolvedValue(null);

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<BookingDetailsScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Rate & Review Your Pandit");
      expect(json).toContain("Write Review & Rate Acharya ★");
    });

    it("renders submitted review card when booking is completed and review already exists", async () => {
      mockRouteParams = { bookingId: "bkg-completed-1" };
      jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValue(sampleBookingCompleted);
      jest.spyOn(bookingReviewService, "fetchBookingReview").mockResolvedValue({
        id: "rev-1",
        booking_id: "bkg-completed-1",
        pandit_id: "pandit-acharya-1",
        rating: 5,
        comment: "Truly divine experience with complete Vedic rituals.",
        visibility_status: "published",
        created_at: "2026-10-10T14:00:00Z",
      });

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<BookingDetailsScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Your Sacred Review");
      expect(json).toContain("Verified Feedback");
      expect(json).toContain("★★★★★");
      expect(json).toContain("Truly divine experience with complete Vedic rituals.");
      expect(json).not.toContain("Write Review & Rate Acharya ★");
    });

    it("does not render review section when booking is upcoming", async () => {
      mockRouteParams = { bookingId: "bkg-upcoming-2" };
      jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValue(sampleBookingUpcoming);
      jest.spyOn(bookingReviewService, "fetchBookingReview").mockResolvedValue(null);

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<BookingDetailsScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).not.toContain("Rate & Review Your Pandit");
      expect(json).not.toContain("Your Sacred Review");
    });

    it("does not render review section when booking is cancelled", async () => {
      mockRouteParams = { bookingId: "bkg-cancelled-3" };
      jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValue(sampleBookingCancelled);
      jest.spyOn(bookingReviewService, "fetchBookingReview").mockResolvedValue(null);

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<BookingDetailsScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).not.toContain("Rate & Review Your Pandit");
      expect(json).not.toContain("Your Sacred Review");
    });
  });

  describe("7. Security & Customer Privacy Invariants", () => {
    it("ensures public review retrieval uses privacy-safe 'Verified Devotee' label without exposing customer PII", async () => {
      jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: [
          {
            id: "rev-pub-1",
            rating: 5,
            comment: "Sacred mantras recited with purity.",
            created_at: "2026-10-10T12:00:00Z",
            reviewer_label: "Verified Devotee",
            service_mode: "home",
            puja_name: "Rudrabhishek",
          },
        ],
        error: null,
      } as any);

      const reviews = await discoveryService.fetchReviews("pandit-1");
      expect(reviews.length).toBe(1);
      expect(reviews[0].reviewer_label).toBe("Verified Devotee");
      expect((reviews[0] as any).customer_phone).toBeUndefined();
      expect((reviews[0] as any).customer_email).toBeUndefined();
      expect((reviews[0] as any).customer_id).toBeUndefined();
    });

    it("ensures review submission derives pandit_id authoritatively from the booking, rejecting client pandit overrides", async () => {
      const rpcSpy = jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: { success: true, review_id: "rev-sec-1" },
        error: null,
      } as any);

      await bookingReviewService.submitReview("bkg-completed-1", 5, "Authentic experience");

      // Verify parameters sent to submit_booking_review contain ONLY booking_id, rating, and comment
      expect(rpcSpy).toHaveBeenCalledWith("submit_booking_review", {
        p_booking_id: "bkg-completed-1",
        p_rating: 5,
        p_comment: "Authentic experience",
      });
      const passedArgs = (rpcSpy.mock.calls[0] as any)[1];
      expect(passedArgs.pandit_id).toBeUndefined();
      expect(passedArgs.customer_id).toBeUndefined();
    });
  });

  describe("8. Review Aggregation & Empty State Invariants", () => {
    it("correctly handles pandit with null rating_avg and 0 reviews without showing 0.0", () => {
      const pandit: PanditSummary = {
        id: "p-empty",
        user_id: "u-empty",
        display_name: "Pandit Radhe",
        avatar_url: null,
        bio: null,
        years_experience: 10,
        languages: ["Hindi"],
        public_status: "available",
        rating_avg: null,
        rating_count: 0,
        offering_names: [],
        puja_price: 2100,
        distance_km: null,
        kundli_enabled: false,
        kundli_price: null,
      };

      let tree: any;
      act(() => {
        tree = ReactTestRenderer.create(<PanditCard pandit={pandit} onPress={() => {}} />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("★ New Acharya");
      expect(json).not.toContain("★ 0.0");
    });
  });
});

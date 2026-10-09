-- =============================================================================
-- Migration: 018_seed_config.sql
-- Description: Phase 1 Seed Configuration: Canonical booking policy singleton row
--              with approved baseline advance percentages and reschedule limit.
-- Source of Truth:
--   1. Kashi Veda Phase 1 Development Ready Scope
--   2. Kashi Veda Phase 1 Supabase-Native Implementation Specification (Section 14 & 16)
--   3. Actual migrations 001–017
-- =============================================================================

-- =============================================================================
-- 1. Canonical Booking Policy Settings (Singleton id = 1)
-- =============================================================================
-- APPROVED PHASE 1 BASELINE DEFAULTS:
--   - home_advance_percent:    10.00% (Approved Phase 1 Home advance obligation)
--   - remote_advance_percent:  50.00% (Approved Phase 1 Remote advance obligation)
--   - samagri_advance_percent: 100.00% (Approved Phase 1 100% upfront Samagri payment)
--   - kundli_advance_percent:  100.00% (Approved Phase 1 100% upfront Kundli payment)
--   - max_reschedules:         1 (Approved Phase 1 single-reschedule policy)
--
-- INTENTIONALLY UNFINALIZED / ADMIN-CONFIGURED VALUES (LEFT NULL):
--   - temple_advance_percent:  NULL (Client value unfinalized; Temple booking RPC
--                              safely requires explicit percentage before checkout)
--   - prepone_window_hours:    NULL (Exact timing window to be finalized by Admin)
--   - postpone_window_hours:   NULL (Exact timing window to be finalized by Admin)
--
-- IDEMPOTENCY GUARANTEE:
-- Uses ON CONFLICT (id) DO NOTHING. If an Administrator updates policy values
-- post-deployment, replaying this migration will NOT overwrite customized values.
-- =============================================================================

INSERT INTO public.booking_policy_settings (
    id,
    home_advance_percent,
    temple_advance_percent,
    remote_advance_percent,
    samagri_advance_percent,
    kundli_advance_percent,
    max_reschedules,
    prepone_window_hours,
    postpone_window_hours
) VALUES (
    1,
    10.00,
    NULL,
    50.00,
    100.00,
    100.00,
    1,
    NULL,
    NULL
)
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 2. Architecture Notice: Unseeded Client/Admin Configuration Domains
-- =============================================================================
-- In strict adherence to Section 14 and Section 16 of the authoritative Phase 1
-- Specification, the following tables are INTENTIONALLY LEFT EMPTY:
--
-- 1. public.platform_settings:
--    - Generic configuration table; key-value pairs are populated on-demand
--      by administrative workflows rather than arbitrary migration defaults.
--
-- 2. public.cancellation_policy_rules:
--    - Exact refund percentage slabs and timing tiers are pending final client
--      approval. RPC cancel_booking_and_calculate_refund() safely defaults to
--      non-refundable (0% refund, 100% deduction) when no active rule matches.
--
-- 3. public.astrology_subscription_plans:
--    - Commercial plan tiers, durations, and pricing are client-supplied and
--      configured by Admin prior to launch.
--
-- 4. public.live_pricing_rules:
--    - Per-minute video rates and billing rounding rules depend on the final
--      live-video provider selection.
--
-- 5. Master Ritual Catalogs:
--    - public.puja_categories, public.puja_services, public.samagri_items,
--      public.samagri_packages, public.samagri_package_items, public.prasad_items,
--      public.temples.
--    - Client supplies verified Puja descriptions, packages, and temple venues.
--
-- 6. User Accounts & Verification Data:
--    - public.profiles, public.user_roles, public.pandit_profiles, etc.
--    - Created dynamically via Supabase Auth signup triggers and verification flows.
-- =============================================================================

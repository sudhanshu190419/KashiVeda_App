-- =============================================================================
-- Migration: 014_storage_setup.sql
-- Description: Phase 1 Supabase Storage configuration: Private and public bucket
--              declarations and granular Row Level Security (RLS) policies on storage.objects.
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification (Section 7)
-- Migrations 001-013 are immutable and authoritative.
-- =============================================================================

-- =============================================================================
-- 1. Storage Bucket Declarations
-- =============================================================================
-- Declares the 6 canonical storage buckets required for Kashi Veda Phase 1.
-- Enforces strict private/public visibility, maximum upload size limits, and allowed MIME types.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    (
        'pandit-documents',
        'pandit-documents',
        false,
        10485760, -- 10 MB
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
    ),
    (
        'kundli-documents',
        'kundli-documents',
        false,
        26214400, -- 25 MB
        ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
    ),
    (
        'profile-images',
        'profile-images',
        true,
        5242880,  -- 5 MB
        ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    ),
    (
        'puja-media',
        'puja-media',
        false,
        52428800, -- 50 MB
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']::text[]
    ),
    (
        'samagri-images',
        'samagri-images',
        true,
        5242880,  -- 5 MB
        ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    ),
    (
        'service-media',
        'service-media',
        true,
        10485760, -- 10 MB
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']::text[]
    )
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;


-- =============================================================================
-- 2. Storage Objects Row Level Security (RLS) Policies
-- Note: storage.objects has RLS enabled by default in Supabase storage extension.
-- =============================================================================


-- =============================================================================
-- 3. Pandit Documents Policies (Private Bucket: pandit-documents)
-- Path Convention: {pandit_id}/{filename}
-- =============================================================================

-- 3.1 SELECT: Pandit can read own documents; Admins can read all documents
DROP POLICY IF EXISTS "pandit_documents_select" ON storage.objects;
CREATE POLICY "pandit_documents_select"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'pandit-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (storage.foldername(name))[1] = public.get_pandit_id_for_user()::text
        )
    );

-- 3.2 INSERT: Pandit can upload documents only to their own pandit_id folder; Admins can upload
DROP POLICY IF EXISTS "pandit_documents_insert" ON storage.objects;
CREATE POLICY "pandit_documents_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'pandit-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (storage.foldername(name))[1] = public.get_pandit_id_for_user()::text
        )
    );

-- 3.3 UPDATE: Pandit can update own documents while onboarding/verification is pending; Admins can update
DROP POLICY IF EXISTS "pandit_documents_update" ON storage.objects;
CREATE POLICY "pandit_documents_update"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'pandit-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (
                (storage.foldername(name))[1] = public.get_pandit_id_for_user()::text
                AND EXISTS (
                    SELECT 1 FROM public.pandit_profiles pp
                    WHERE pp.id = public.get_pandit_id_for_user()
                      AND pp.verification_status = 'pending'
                )
            )
        )
    )
    WITH CHECK (
        bucket_id = 'pandit-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (
                (storage.foldername(name))[1] = public.get_pandit_id_for_user()::text
                AND EXISTS (
                    SELECT 1 FROM public.pandit_profiles pp
                    WHERE pp.id = public.get_pandit_id_for_user()
                      AND pp.verification_status = 'pending'
                )
            )
        )
    );

-- 3.4 DELETE: Pandit can delete own documents while onboarding/verification is pending; Admins can delete
DROP POLICY IF EXISTS "pandit_documents_delete" ON storage.objects;
CREATE POLICY "pandit_documents_delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'pandit-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (
                (storage.foldername(name))[1] = public.get_pandit_id_for_user()::text
                AND EXISTS (
                    SELECT 1 FROM public.pandit_profiles pp
                    WHERE pp.id = public.get_pandit_id_for_user()
                      AND pp.verification_status = 'pending'
                )
            )
        )
    );


-- =============================================================================
-- 4. Kundli Documents Policies (Private Bucket: kundli-documents)
-- Path Convention: {kundli_order_id}/{filename}
-- =============================================================================

-- 4.1 SELECT: Customer owning the Kundli order, assigned verified Pandit, or Admin
DROP POLICY IF EXISTS "kundli_documents_select" ON storage.objects;
CREATE POLICY "kundli_documents_select"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'kundli-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1 FROM public.kundli_orders ko
                WHERE ko.id::text = (storage.foldername(name))[1]
                  AND (
                      ko.customer_id = auth.uid()
                      OR ko.pandit_id = public.get_pandit_id_for_user()
                  )
            )
        )
    );

-- 4.2 INSERT: Assigned Pandit (for paid / in_progress / document_uploaded orders) or Admin
DROP POLICY IF EXISTS "kundli_documents_insert" ON storage.objects;
CREATE POLICY "kundli_documents_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'kundli-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1 FROM public.kundli_orders ko
                WHERE ko.id::text = (storage.foldername(name))[1]
                  AND ko.pandit_id = public.get_pandit_id_for_user()
                  AND ko.status IN ('paid', 'in_progress', 'document_uploaded')
            )
        )
    );

-- 4.3 UPDATE: Assigned Pandit (prior to completion) or Admin
DROP POLICY IF EXISTS "kundli_documents_update" ON storage.objects;
CREATE POLICY "kundli_documents_update"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'kundli-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1 FROM public.kundli_orders ko
                WHERE ko.id::text = (storage.foldername(name))[1]
                  AND ko.pandit_id = public.get_pandit_id_for_user()
                  AND ko.status NOT IN ('completed', 'cancelled')
            )
        )
    )
    WITH CHECK (
        bucket_id = 'kundli-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1 FROM public.kundli_orders ko
                WHERE ko.id::text = (storage.foldername(name))[1]
                  AND ko.pandit_id = public.get_pandit_id_for_user()
                  AND ko.status NOT IN ('completed', 'cancelled')
            )
        )
    );

-- 4.4 DELETE: Assigned Pandit (prior to completion) or Admin
DROP POLICY IF EXISTS "kundli_documents_delete" ON storage.objects;
CREATE POLICY "kundli_documents_delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'kundli-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1 FROM public.kundli_orders ko
                WHERE ko.id::text = (storage.foldername(name))[1]
                  AND ko.pandit_id = public.get_pandit_id_for_user()
                  AND ko.status NOT IN ('completed', 'cancelled')
            )
        )
    );


-- =============================================================================
-- 5. Profile Images Policies (Public Bucket: profile-images)
-- Path Convention: {user_id}/{filename}
-- =============================================================================

-- 5.1 SELECT: Public access to avatar images
DROP POLICY IF EXISTS "profile_images_select_public" ON storage.objects;
CREATE POLICY "profile_images_select_public"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'profile-images');

-- 5.2 INSERT: Authenticated user can upload only to their own user_id folder; Admin can upload
DROP POLICY IF EXISTS "profile_images_insert_own" ON storage.objects;
CREATE POLICY "profile_images_insert_own"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'profile-images'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (storage.foldername(name))[1] = auth.uid()::text
        )
    );

-- 5.3 UPDATE: Authenticated user can update only in their own user_id folder; Admin can update
DROP POLICY IF EXISTS "profile_images_update_own" ON storage.objects;
CREATE POLICY "profile_images_update_own"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'profile-images'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (storage.foldername(name))[1] = auth.uid()::text
        )
    )
    WITH CHECK (
        bucket_id = 'profile-images'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (storage.foldername(name))[1] = auth.uid()::text
        )
    );

-- 5.4 DELETE: Authenticated user can delete only in their own user_id folder; Admin can delete
DROP POLICY IF EXISTS "profile_images_delete_own" ON storage.objects;
CREATE POLICY "profile_images_delete_own"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'profile-images'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (storage.foldername(name))[1] = auth.uid()::text
        )
    );


-- =============================================================================
-- 6. Puja Ceremony Media Policies (Private Bucket: puja-media)
-- Path Convention: {booking_id}/{filename}
-- =============================================================================

-- 6.1 SELECT: Customer of the booking, assigned Pandit, or Admin
DROP POLICY IF EXISTS "puja_media_select" ON storage.objects;
CREATE POLICY "puja_media_select"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'puja-media'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1 FROM public.bookings b
                WHERE b.id::text = (storage.foldername(name))[1]
                  AND (
                      b.customer_id = auth.uid()
                      OR b.pandit_id = public.get_pandit_id_for_user()
                  )
            )
        )
    );

-- 6.2 INSERT: Assigned Pandit or Admin
DROP POLICY IF EXISTS "puja_media_insert" ON storage.objects;
CREATE POLICY "puja_media_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'puja-media'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1 FROM public.bookings b
                WHERE b.id::text = (storage.foldername(name))[1]
                  AND b.pandit_id = public.get_pandit_id_for_user()
            )
        )
    );

-- 6.3 UPDATE: Assigned Pandit or Admin
DROP POLICY IF EXISTS "puja_media_update" ON storage.objects;
CREATE POLICY "puja_media_update"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'puja-media'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1 FROM public.bookings b
                WHERE b.id::text = (storage.foldername(name))[1]
                  AND b.pandit_id = public.get_pandit_id_for_user()
            )
        )
    )
    WITH CHECK (
        bucket_id = 'puja-media'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1 FROM public.bookings b
                WHERE b.id::text = (storage.foldername(name))[1]
                  AND b.pandit_id = public.get_pandit_id_for_user()
            )
        )
    );

-- 6.4 DELETE: Assigned Pandit or Admin
DROP POLICY IF EXISTS "puja_media_delete" ON storage.objects;
CREATE POLICY "puja_media_delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'puja-media'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1 FROM public.bookings b
                WHERE b.id::text = (storage.foldername(name))[1]
                  AND b.pandit_id = public.get_pandit_id_for_user()
            )
        )
    );


-- =============================================================================
-- 7. Samagri Catalog Images Policies (Public Bucket: samagri-images)
-- Path Convention: {samagri_item_id_or_package_id}/{filename} or catalog/{filename}
-- =============================================================================

-- 7.1 SELECT: Public catalog browsing
DROP POLICY IF EXISTS "samagri_images_select_public" ON storage.objects;
CREATE POLICY "samagri_images_select_public"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'samagri-images');

-- 7.2 ALL: Admin-only management
DROP POLICY IF EXISTS "samagri_images_all_admin" ON storage.objects;
CREATE POLICY "samagri_images_all_admin"
    ON storage.objects FOR ALL
    USING (
        bucket_id = 'samagri-images'
        AND public.is_admin()
    )
    WITH CHECK (
        bucket_id = 'samagri-images'
        AND public.is_admin()
    );


-- =============================================================================
-- 8. Service & Puja Catalog Media Policies (Public Bucket: service-media)
-- Path Convention: {puja_service_id_or_category_id}/{filename} or catalog/{filename}
-- =============================================================================

-- 8.1 SELECT: Public catalog browsing
DROP POLICY IF EXISTS "service_media_select_public" ON storage.objects;
CREATE POLICY "service_media_select_public"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'service-media');

-- 8.2 ALL: Admin-only management
DROP POLICY IF EXISTS "service_media_all_admin" ON storage.objects;
CREATE POLICY "service_media_all_admin"
    ON storage.objects FOR ALL
    USING (
        bucket_id = 'service-media'
        AND public.is_admin()
    )
    WITH CHECK (
        bucket_id = 'service-media'
        AND public.is_admin()
    );

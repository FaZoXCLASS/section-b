-- ==============================================================================
-- GÉNIE CIVIL SECTION B — SUPABASE SCHEMA & SECURITY
-- ==============================================================================
-- Idempotent setup script. Run once in the Supabase SQL Editor.
-- Configures tables, constraints, indexes, strict RLS policies,
-- security-definer RPC functions, and storage bucket settings.
-- ==============================================================================

-- 1. EXTENSIONS
-- pgcrypto provides digest() for SHA-256 device token hashing.
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- 2. TABLES

-- 2.1 Members table
-- Stores student device tokens (hashed) and member lifecycle status.
-- Real name is visible only to the administrator.
CREATE TABLE IF NOT EXISTS public.members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    real_name text NOT NULL,
    pseudo text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'active', 'rejected', 'removed')),
    device_token_hash text UNIQUE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    approved_at timestamptz,
    activated_at timestamptz
);

-- Case-insensitive uniqueness index for student pseudonyms
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_lower_pseudo ON public.members (lower(pseudo)) WHERE pseudo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_device_token_hash ON public.members (device_token_hash);
CREATE INDEX IF NOT EXISTS idx_members_status ON public.members (status);

-- 2.2 Modules table
-- Organised in 3 fixed categories: 'cours', 'td', 'tp'.
CREATE TABLE IF NOT EXISTS public.modules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category text NOT NULL CHECK (category IN ('cours', 'td', 'tp')),
    name text NOT NULL,
    teacher text,
    sort_order int NOT NULL DEFAULT 0,
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_modules_category_name UNIQUE (category, name)
);

CREATE INDEX IF NOT EXISTS idx_modules_cat_sort ON public.modules (category, sort_order ASC, name ASC);

-- 2.3 Posts table
-- Student or admin posts within a specific module.
CREATE TABLE IF NOT EXISTS public.posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
    author_label text, -- Used for admin posts or author display snapshot
    message text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_module_created ON public.posts (module_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_member_created ON public.posts (member_id, created_at DESC);

-- 2.4 Post files table
-- Stores references to images and PDF files uploaded to Supabase Storage.
CREATE TABLE IF NOT EXISTS public.post_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('image', 'pdf')),
    volume text NOT NULL DEFAULT 'primary',
    storage_path text NOT NULL,
    thumb_path text,
    original_name text NOT NULL,
    mime text NOT NULL,
    size_bytes bigint NOT NULL DEFAULT 0,
    width int,
    height int,
    sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_post_files_post_sort ON public.post_files (post_id, sort_order ASC);

-- 2.5 Admins table
-- Maps Supabase Auth user IDs to administrator privileges.
CREATE TABLE IF NOT EXISTS public.admins (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2.6 Settings table
-- Global tunable configuration for the platform.
CREATE TABLE IF NOT EXISTS public.settings (
    key text PRIMARY KEY,
    value text NOT NULL
);

-- Seed default settings
INSERT INTO public.settings (key, value) VALUES
    ('site_name', 'Génie civil Section B'),
    ('admin_display_name', 'Admin (Section B)'),
    ('storage_quota_bytes', '1073741824'), -- 1 GB quota
    ('max_files_per_post', '30')
ON CONFLICT (key) DO NOTHING;


-- ==============================================================================
-- 3. SECURITY & ACCESS CONTROL (RLS)
-- ==============================================================================

-- 3.1 Helper function to check if the current user is an admin.
-- Runs with SECURITY DEFINER to bypass table RLS recursion when reading admins.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admins WHERE user_id = auth.uid()
    );
$$;

-- 3.2 Enable Row Level Security on all tables
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- 3.3 Revoke all direct privileges from public/anon role.
-- Students CANNOT query or modify tables directly via REST API.
REVOKE ALL ON TABLE public.members FROM anon;
REVOKE ALL ON TABLE public.modules FROM anon;
REVOKE ALL ON TABLE public.posts FROM anon;
REVOKE ALL ON TABLE public.post_files FROM anon;
REVOKE ALL ON TABLE public.admins FROM anon;
REVOKE ALL ON TABLE public.settings FROM anon;

REVOKE ALL ON TABLE public.members FROM authenticated;
REVOKE ALL ON TABLE public.modules FROM authenticated;
REVOKE ALL ON TABLE public.posts FROM authenticated;
REVOKE ALL ON TABLE public.post_files FROM authenticated;
REVOKE ALL ON TABLE public.admins FROM authenticated;
REVOKE ALL ON TABLE public.settings FROM authenticated;

-- 3.4 Grant table permissions to authenticated role for Admin operations
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.post_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.settings TO authenticated;

-- 3.5 RLS Policies for Admin users (auth.uid() present in admins table)
DROP POLICY IF EXISTS admin_all_members ON public.members;
CREATE POLICY admin_all_members ON public.members FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_all_modules ON public.modules;
CREATE POLICY admin_all_modules ON public.modules FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_all_posts ON public.posts;
CREATE POLICY admin_all_posts ON public.posts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_all_post_files ON public.post_files;
CREATE POLICY admin_all_post_files ON public.post_files FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_all_admins ON public.admins;
CREATE POLICY admin_all_admins ON public.admins FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_all_settings ON public.settings;
CREATE POLICY admin_all_settings ON public.settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ==============================================================================
-- 4. STORAGE BUCKET & STORAGE POLICIES
-- ==============================================================================

-- Create bucket 'class-files' if it does not already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'class-files',
    'class-files',
    true,
    52428800, -- 50 MB max per single file
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[];

-- Public read access for objects in 'class-files'
-- Files have unguessable paths generated by the Edge function.
DROP POLICY IF EXISTS "Public read on class-files" ON storage.objects;
CREATE POLICY "Public read on class-files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'class-files');

-- Authenticated Admin full management on storage objects
DROP POLICY IF EXISTS "Admin manage class-files" ON storage.objects;
CREATE POLICY "Admin manage class-files"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'class-files' AND public.is_admin())
WITH CHECK (bucket_id = 'class-files' AND public.is_admin());


-- ==============================================================================
-- 5. HELPER & RPC FUNCTIONS (SECURITY DEFINER)
-- ==============================================================================

-- Helper: lookup member by raw device token
CREATE OR REPLACE FUNCTION public.get_member_by_token(p_token text)
RETURNS public.members
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hash text;
    v_member public.members%ROWTYPE;
BEGIN
    IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
        RETURN NULL;
    END IF;
    v_hash := encode(extensions.digest(p_token::bytea, 'sha256'), 'hex');
    SELECT * INTO v_member FROM public.members WHERE device_token_hash = v_hash LIMIT 1;
    RETURN v_member;
END;
$$;

-- 5.1 ping(): Public healthcheck & keepalive endpoint
CREATE OR REPLACE FUNCTION public.ping()
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
AS $$
    SELECT 'pong'::text;
$$;
GRANT EXECUTE ON FUNCTION public.ping() TO anon, authenticated;

-- 5.2 submit_request(): Submit access request with real name
CREATE OR REPLACE FUNCTION public.submit_request(p_token text, p_real_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hash text;
    v_member public.members%ROWTYPE;
    v_clean_name text;
    v_pending_count int;
BEGIN
    IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
        RAISE EXCEPTION 'Jeton d''appareil invalide';
    END IF;

    v_clean_name := trim(p_real_name);
    IF v_clean_name IS NULL OR length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'Veuillez saisir votre nom et prénom (au moins 2 caractères).';
    END IF;

    IF length(v_clean_name) > 60 THEN
        RAISE EXCEPTION 'Le nom est trop long (maximum 60 caractères).';
    END IF;

    -- Anti-spam: cap on active pending requests
    SELECT count(*) INTO v_pending_count FROM public.members WHERE status = 'pending';
    IF v_pending_count >= 50 THEN
        RAISE EXCEPTION 'Trop de demandes en attente actuellement. Réessaie plus tard.';
    END IF;

    v_hash := encode(extensions.digest(p_token::bytea, 'sha256'), 'hex');
    SELECT * INTO v_member FROM public.members WHERE device_token_hash = v_hash;

    IF v_member.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', v_member.status,
            'pseudo', v_member.pseudo,
            'message', 'Demande déjà enregistrée pour cet appareil'
        );
    END IF;

    INSERT INTO public.members (real_name, device_token_hash, status)
    VALUES (v_clean_name, v_hash, 'pending')
    RETURNING * INTO v_member;

    RETURN jsonb_build_object(
        'status', v_member.status,
        'message', 'Demande enregistrée avec succès'
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_request(text, text) TO anon, authenticated;

-- 5.3 get_my_status(): Query member lifecycle status for device token
CREATE OR REPLACE FUNCTION public.get_my_status(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hash text;
    v_member public.members%ROWTYPE;
BEGIN
    IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
        RETURN jsonb_build_object('status', 'none');
    END IF;

    v_hash := encode(extensions.digest(p_token::bytea, 'sha256'), 'hex');
    SELECT * INTO v_member FROM public.members WHERE device_token_hash = v_hash;

    IF v_member.id IS NULL THEN
        RETURN jsonb_build_object('status', 'none');
    END IF;

    RETURN jsonb_build_object(
        'status', v_member.status,
        'pseudo', v_member.pseudo,
        'member_id', CASE WHEN v_member.status = 'active' THEN v_member.id ELSE NULL END
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_status(text) TO anon, authenticated;

-- 5.4 set_pseudo(): Choose pseudonym once approved
CREATE OR REPLACE FUNCTION public.set_pseudo(p_token text, p_pseudo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_hash text;
    v_member public.members%ROWTYPE;
    v_clean_pseudo text;
    v_lower text;
BEGIN
    IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
        RAISE EXCEPTION 'Jeton d''appareil invalide';
    END IF;

    v_hash := encode(extensions.digest(p_token::bytea, 'sha256'), 'hex');
    SELECT * INTO v_member FROM public.members WHERE device_token_hash = v_hash;

    IF v_member.id IS NULL THEN
        RAISE EXCEPTION 'Appareil inconnu';
    END IF;

    IF v_member.status = 'active' THEN
        RETURN jsonb_build_object(
            'status', 'active',
            'pseudo', v_member.pseudo,
            'message', 'Pseudo déjà configuré'
        );
    END IF;

    IF v_member.status <> 'approved' THEN
        RAISE EXCEPTION 'Statut non autorisé pour choisir un pseudo: %', v_member.status;
    END IF;

    v_clean_pseudo := trim(p_pseudo);
    IF length(v_clean_pseudo) < 3 OR length(v_clean_pseudo) > 20 THEN
        RAISE EXCEPTION 'Le pseudo doit contenir entre 3 et 20 caractères.';
    END IF;

    -- Valid characters: letters (with accents), numbers, spaces, dots, underscores, hyphens
    IF NOT (v_clean_pseudo ~ '^[a-zA-Z0-9À-ÿ\s\._\-]+$') THEN
        RAISE EXCEPTION 'Le pseudo contient des caractères non autorisés (lettres, chiffres, espaces, . _ - uniquement).';
    END IF;

    v_lower := lower(v_clean_pseudo);
    -- Block reserved words
    IF v_lower IN ('admin', 'administrateur', 'moderateur', 'modérateur', 'root', 'system', 'système', 'null', 'undefined', 'anonymous', 'anonyme') THEN
        RAISE EXCEPTION 'Ce pseudo est réservé.';
    END IF;

    -- Uniqueness check
    IF EXISTS (SELECT 1 FROM public.members WHERE lower(pseudo) = v_lower AND id <> v_member.id) THEN
        RAISE EXCEPTION 'Ce pseudo est déjà utilisé par un autre membre.';
    END IF;

    UPDATE public.members
    SET pseudo = v_clean_pseudo,
        status = 'active',
        activated_at = now()
    WHERE id = v_member.id
    RETURNING * INTO v_member;

    RETURN jsonb_build_object(
        'status', 'active',
        'pseudo', v_member.pseudo,
        'member_id', v_member.id,
        'message', 'Pseudo validé avec succès'
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_pseudo(text, text) TO anon, authenticated;

-- 5.5 list_modules(): List non-archived modules (or all if admin) with post counts
CREATE OR REPLACE FUNCTION public.list_modules(p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_member public.members%ROWTYPE;
    v_is_adm boolean := false;
    v_result jsonb;
BEGIN
    v_is_adm := public.is_admin();
    IF NOT v_is_adm THEN
        v_member := public.get_member_by_token(p_token);
        IF v_member.id IS NULL OR v_member.status <> 'active' THEN
            RAISE EXCEPTION 'Accès refusé : membre inactif ou inconnu';
        END IF;
    END IF;

    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', m.id,
            'category', m.category,
            'name', m.name,
            'teacher', m.teacher,
            'sort_order', m.sort_order,
            'is_archived', m.is_archived,
            'post_count', count(p.id),
            'latest_post_at', max(p.created_at)
        ) ORDER BY m.sort_order ASC, m.name ASC
    ), '[]'::jsonb)
    INTO v_result
    FROM public.modules m
    LEFT JOIN public.posts p ON p.module_id = m.id
    WHERE (v_is_adm OR m.is_archived = false)
    GROUP BY m.id, m.category, m.name, m.teacher, m.sort_order, m.is_archived;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_modules(text) TO anon, authenticated;

-- 5.6 list_posts(): Paginated feed for a module with attached images & PDFs
CREATE OR REPLACE FUNCTION public.list_posts(
    p_token text DEFAULT NULL,
    p_module_id uuid DEFAULT NULL,
    p_limit int DEFAULT 12,
    p_before timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_member public.members%ROWTYPE;
    v_is_adm boolean := false;
    v_effective_limit int;
    v_result jsonb;
BEGIN
    v_is_adm := public.is_admin();
    IF NOT v_is_adm THEN
        v_member := public.get_member_by_token(p_token);
        IF v_member.id IS NULL OR v_member.status <> 'active' THEN
            RAISE EXCEPTION 'Accès refusé : membre inactif ou inconnu';
        END IF;
    END IF;

    IF p_module_id IS NULL THEN
        RAISE EXCEPTION 'Identifiant du module obligatoire';
    END IF;

    v_effective_limit := least(greatest(coalesce(p_limit, 12), 1), 30);

    WITH target_posts AS (
        SELECT p.*
        FROM public.posts p
        WHERE p.module_id = p_module_id
          AND (p_before IS NULL OR p.created_at < p_before)
        ORDER BY p.created_at DESC
        LIMIT v_effective_limit
    ),
    post_files_agg AS (
        SELECT
            pf.post_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', pf.id,
                    'kind', pf.kind,
                    'volume', pf.volume,
                    'storage_path', pf.storage_path,
                    'thumb_path', pf.thumb_path,
                    'original_name', pf.original_name,
                    'mime', pf.mime,
                    'size_bytes', pf.size_bytes,
                    'width', pf.width,
                    'height', pf.height,
                    'sort_order', pf.sort_order
                ) ORDER BY pf.sort_order ASC
            ) AS files
        FROM public.post_files pf
        WHERE pf.post_id IN (SELECT id FROM target_posts)
        GROUP BY pf.post_id
    )
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', tp.id,
            'module_id', tp.module_id,
            'author_label', CASE
                WHEN tp.member_id IS NULL THEN coalesce(tp.author_label, 'Admin')
                ELSE m.pseudo
            END,
            'author_pseudo', m.pseudo,
            'is_admin_post', (tp.member_id IS NULL),
            'is_mine', (v_is_adm OR (v_member.id IS NOT NULL AND tp.member_id = v_member.id)),
            'message', tp.message,
            'created_at', tp.created_at,
            'files', coalesce(pfa.files, '[]'::jsonb)
        ) ORDER BY tp.created_at DESC
    ), '[]'::jsonb)
    INTO v_result
    FROM target_posts tp
    LEFT JOIN public.members m ON tp.member_id = m.id
    LEFT JOIN post_files_agg pfa ON pfa.post_id = tp.id;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_posts(text, uuid, int, timestamptz) TO anon, authenticated;

-- 5.7 create_post(): Create a post with files metadata
CREATE OR REPLACE FUNCTION public.create_post(
    p_token text DEFAULT NULL,
    p_module_id uuid DEFAULT NULL,
    p_message text DEFAULT NULL,
    p_files jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_member public.members%ROWTYPE;
    v_is_adm boolean := false;
    v_clean_msg text;
    v_max_files int := 30;
    v_max_setting text;
    v_admin_name text := 'Admin (Section B)';
    v_post public.posts%ROWTYPE;
    v_file jsonb;
    v_idx int := 0;
BEGIN
    v_is_adm := public.is_admin();
    IF NOT v_is_adm THEN
        v_member := public.get_member_by_token(p_token);
        IF v_member.id IS NULL OR v_member.status <> 'active' THEN
            RAISE EXCEPTION 'Accès refusé : membre inactif ou inconnu';
        END IF;
    ELSE
        -- Admin posting: check if a student token was provided, else post as admin
        IF p_token IS NOT NULL AND length(trim(p_token)) >= 16 THEN
            v_member := public.get_member_by_token(p_token);
        END IF;
    END IF;

    IF p_module_id IS NULL THEN
        RAISE EXCEPTION 'Identifiant du module obligatoire';
    END IF;

    -- Module validation
    IF NOT EXISTS (SELECT 1 FROM public.modules WHERE id = p_module_id AND (v_is_adm OR is_archived = false)) THEN
        RAISE EXCEPTION 'Module introuvable ou archivé';
    END IF;

    v_clean_msg := trim(p_message);
    IF v_clean_msg IS NULL OR length(v_clean_msg) < 1 THEN
        RAISE EXCEPTION 'Le message est obligatoire';
    END IF;
    IF length(v_clean_msg) > 2000 THEN
        RAISE EXCEPTION 'Le message ne doit pas dépasser 2000 caractères';
    END IF;

    -- File count limit
    SELECT value INTO v_max_setting FROM public.settings WHERE key = 'max_files_per_post';
    IF v_max_setting IS NOT NULL THEN
        v_max_files := v_max_setting::int;
    END IF;

    IF jsonb_array_length(p_files) > v_max_files THEN
        RAISE EXCEPTION 'Trop de fichiers (maximum % fichiers par publication)', v_max_files;
    END IF;

    IF v_is_adm AND v_member.id IS NULL THEN
        SELECT value INTO v_admin_name FROM public.settings WHERE key = 'admin_display_name';
        IF v_admin_name IS NULL THEN
            v_admin_name := 'Admin (Section B)';
        END IF;
    END IF;

    INSERT INTO public.posts (module_id, member_id, author_label, message)
    VALUES (
        p_module_id,
        v_member.id,
        CASE WHEN v_member.id IS NULL THEN v_admin_name ELSE NULL END,
        v_clean_msg
    )
    RETURNING * INTO v_post;

    -- Insert attached file records
    FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
        INSERT INTO public.post_files (
            post_id,
            kind,
            volume,
            storage_path,
            thumb_path,
            original_name,
            mime,
            size_bytes,
            width,
            height,
            sort_order
        ) VALUES (
            v_post.id,
            (v_file->>'kind'),
            coalesce(v_file->>'volume', 'primary'),
            (v_file->>'storage_path'),
            (v_file->>'thumb_path'),
            coalesce(v_file->>'original_name', 'fichier'),
            coalesce(v_file->>'mime', 'application/octet-stream'),
            coalesce((v_file->>'size_bytes')::bigint, 0),
            (v_file->>'width')::int,
            (v_file->>'height')::int,
            coalesce((v_file->>'sort_order')::int, v_idx)
        );
        v_idx := v_idx + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'id', v_post.id,
        'module_id', v_post.module_id,
        'message', v_post.message,
        'created_at', v_post.created_at,
        'author_label', CASE WHEN v_member.id IS NULL THEN v_admin_name ELSE v_member.pseudo END,
        'is_mine', true
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_post(text, uuid, text, jsonb) TO anon, authenticated;

-- 5.8 list_members(): List active member pseudonyms only
CREATE OR REPLACE FUNCTION public.list_members(p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_member public.members%ROWTYPE;
    v_is_adm boolean := false;
    v_pseudos jsonb;
    v_total int;
BEGIN
    v_is_adm := public.is_admin();
    IF NOT v_is_adm THEN
        v_member := public.get_member_by_token(p_token);
        IF v_member.id IS NULL OR v_member.status <> 'active' THEN
            RAISE EXCEPTION 'Accès refusé : membre inactif ou inconnu';
        END IF;
    END IF;

    SELECT
        coalesce(jsonb_agg(pseudo ORDER BY lower(pseudo) ASC), '[]'::jsonb),
        count(*)
    INTO v_pseudos, v_total
    FROM public.members
    WHERE status = 'active' AND pseudo IS NOT NULL;

    RETURN jsonb_build_object(
        'total', v_total,
        'members', v_pseudos
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_members(text) TO anon, authenticated;

-- 5.9 get_post_for_deletion(): Validate ownership & retrieve files to delete
CREATE OR REPLACE FUNCTION public.get_post_for_deletion(p_token text DEFAULT NULL, p_post_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_member public.members%ROWTYPE;
    v_is_adm boolean := false;
    v_post public.posts%ROWTYPE;
    v_files jsonb;
BEGIN
    v_is_adm := public.is_admin();
    IF NOT v_is_adm THEN
        v_member := public.get_member_by_token(p_token);
        IF v_member.id IS NULL OR v_member.status <> 'active' THEN
            RAISE EXCEPTION 'Accès refusé : membre inactif ou inconnu';
        END IF;
    END IF;

    IF p_post_id IS NULL THEN
        RAISE EXCEPTION 'Identifiant de publication obligatoire';
    END IF;

    SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
    IF v_post.id IS NULL THEN
        RAISE EXCEPTION 'Publication introuvable';
    END IF;

    IF NOT v_is_adm AND (v_post.member_id IS NULL OR v_post.member_id <> v_member.id) THEN
        RAISE EXCEPTION 'Vous n''êtes pas autorisé à supprimer cette publication';
    END IF;

    SELECT coalesce(jsonb_agg(
        jsonb_build_object('storage_path', storage_path, 'thumb_path', thumb_path)
    ), '[]'::jsonb)
    INTO v_files
    FROM public.post_files
    WHERE post_id = p_post_id;

    RETURN jsonb_build_object(
        'authorized', true,
        'post_id', v_post.id,
        'files', v_files
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_post_for_deletion(text, uuid) TO anon, authenticated;

-- 5.10 delete_post_row(): Delete post record and cascade to post_files
CREATE OR REPLACE FUNCTION public.delete_post_row(p_token text DEFAULT NULL, p_post_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_member public.members%ROWTYPE;
    v_is_adm boolean := false;
    v_post public.posts%ROWTYPE;
BEGIN
    v_is_adm := public.is_admin();
    IF NOT v_is_adm THEN
        v_member := public.get_member_by_token(p_token);
        IF v_member.id IS NULL OR v_member.status <> 'active' THEN
            RAISE EXCEPTION 'Accès refusé : membre inactif ou inconnu';
        END IF;
    END IF;

    IF p_post_id IS NULL THEN
        RAISE EXCEPTION 'Identifiant de publication obligatoire';
    END IF;

    SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
    IF v_post.id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'Publication déjà supprimée');
    END IF;

    IF NOT v_is_adm AND (v_post.member_id IS NULL OR v_post.member_id <> v_member.id) THEN
        RAISE EXCEPTION 'Vous n''êtes pas autorisé à supprimer cette publication';
    END IF;

    DELETE FROM public.posts WHERE id = p_post_id;
    RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_post_row(text, uuid) TO anon, authenticated;


-- ==============================================================================
-- 6. ADMIN-SPECIFIC RPC FUNCTIONS
-- ==============================================================================

-- 6.1 get_storage_stats(): Storage usage breakdown and quota metrics
CREATE OR REPLACE FUNCTION public.get_storage_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quota bigint := 1073741824; -- 1 GB
    v_quota_setting text;
    v_image_bytes bigint := 0;
    v_pdf_bytes bigint := 0;
    v_total_bytes bigint := 0;
    v_image_count bigint := 0;
    v_pdf_count bigint := 0;
    v_posts_count bigint := 0;
    v_members_count bigint := 0;
    v_pending_count bigint := 0;
BEGIN
    SELECT value INTO v_quota_setting FROM public.settings WHERE key = 'storage_quota_bytes';
    IF v_quota_setting IS NOT NULL THEN
        v_quota := v_quota_setting::bigint;
    END IF;

    SELECT
        coalesce(sum(CASE WHEN kind = 'image' THEN size_bytes ELSE 0 END), 0),
        coalesce(sum(CASE WHEN kind = 'pdf' THEN size_bytes ELSE 0 END), 0),
        coalesce(sum(size_bytes), 0),
        count(CASE WHEN kind = 'image' THEN 1 END),
        count(CASE WHEN kind = 'pdf' THEN 1 END)
    INTO v_image_bytes, v_pdf_bytes, v_total_bytes, v_image_count, v_pdf_count
    FROM public.post_files;

    SELECT count(*) INTO v_posts_count FROM public.posts;
    SELECT count(*) INTO v_members_count FROM public.members WHERE status = 'active';
    SELECT count(*) INTO v_pending_count FROM public.members WHERE status = 'pending';

    RETURN jsonb_build_object(
        'quota_bytes', v_quota,
        'used_bytes', v_total_bytes,
        'image_bytes', v_image_bytes,
        'pdf_bytes', v_pdf_bytes,
        'image_count', v_image_count,
        'pdf_count', v_pdf_count,
        'posts_count', v_posts_count,
        'active_members_count', v_members_count,
        'pending_requests_count', v_pending_count,
        'usage_percent', CASE WHEN v_quota > 0 THEN round((v_total_bytes::numeric / v_quota::numeric) * 100, 2) ELSE 0 END
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_storage_stats() TO authenticated, anon;

-- 6.2 admin_list_requests(): List pending requests with matching name badges
CREATE OR REPLACE FUNCTION public.admin_list_requests()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accès réservé à l''administrateur';
    END IF;

    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'real_name', p.real_name,
            'created_at', p.created_at,
            'status', p.status,
            'has_duplicate_name', EXISTS (
                SELECT 1 FROM public.members a
                WHERE a.status IN ('active', 'approved')
                  AND lower(trim(a.real_name)) = lower(trim(p.real_name))
                  AND a.id <> p.id
            ),
            'matching_members', (
                SELECT coalesce(jsonb_agg(
                    jsonb_build_object(
                        'id', m.id,
                        'real_name', m.real_name,
                        'pseudo', m.pseudo,
                        'status', m.status
                    )
                ), '[]'::jsonb)
                FROM public.members m
                WHERE m.status IN ('active', 'approved')
                  AND lower(trim(m.real_name)) = lower(trim(p.real_name))
                  AND m.id <> p.id
            )
        ) ORDER BY p.created_at ASC
    ), '[]'::jsonb)
    INTO v_result
    FROM public.members p
    WHERE p.status = 'pending';

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_requests() TO authenticated;

-- 6.3 admin_approve_request(): Approve new member OR link device to existing member
CREATE OR REPLACE FUNCTION public.admin_approve_request(
    p_member_id uuid,
    p_link_to_member_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pending public.members%ROWTYPE;
    v_target public.members%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accès réservé à l''administrateur';
    END IF;

    SELECT * INTO v_pending FROM public.members WHERE id = p_member_id;
    IF v_pending.id IS NULL THEN
        RAISE EXCEPTION 'Demande introuvable';
    END IF;

    IF p_link_to_member_id IS NOT NULL THEN
        -- Link new device token to existing member profile
        SELECT * INTO v_target FROM public.members WHERE id = p_link_to_member_id;
        IF v_target.id IS NULL THEN
            RAISE EXCEPTION 'Membre existant introuvable';
        END IF;

        UPDATE public.members
        SET device_token_hash = v_pending.device_token_hash
        WHERE id = v_target.id;

        -- Remove temporary pending record
        DELETE FROM public.members WHERE id = v_pending.id;

        RETURN jsonb_build_object(
            'success', true,
            'mode', 'linked',
            'target_id', v_target.id,
            'pseudo', v_target.pseudo
        );
    ELSE
        -- Approve as a new member
        UPDATE public.members
        SET status = 'approved',
            approved_at = now()
        WHERE id = v_pending.id;

        RETURN jsonb_build_object(
            'success', true,
            'mode', 'new_member',
            'member_id', v_pending.id
        );
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_approve_request(uuid, uuid) TO authenticated;

-- 6.4 admin_reject_request(): Reject pending access request
CREATE OR REPLACE FUNCTION public.admin_reject_request(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accès réservé à l''administrateur';
    END IF;

    UPDATE public.members
    SET status = 'rejected'
    WHERE id = p_member_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_reject_request(uuid) TO authenticated;

-- 6.5 admin_update_pseudo(): Administrator edit of member pseudonym
CREATE OR REPLACE FUNCTION public.admin_update_pseudo(p_member_id uuid, p_new_pseudo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean text;
    v_lower text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accès réservé à l''administrateur';
    END IF;

    v_clean := trim(p_new_pseudo);
    IF length(v_clean) < 3 OR length(v_clean) > 20 THEN
        RAISE EXCEPTION 'Le pseudo doit contenir entre 3 et 20 caractères.';
    END IF;

    v_lower := lower(v_clean);
    IF EXISTS (SELECT 1 FROM public.members WHERE lower(pseudo) = v_lower AND id <> p_member_id) THEN
        RAISE EXCEPTION 'Ce pseudo est déjà utilisé par un autre membre.';
    END IF;

    UPDATE public.members
    SET pseudo = v_clean
    WHERE id = p_member_id;

    RETURN jsonb_build_object('success', true, 'pseudo', v_clean);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_pseudo(uuid, text) TO authenticated;

-- 6.6 admin_set_member_status(): Ban/remove or restore a member
CREATE OR REPLACE FUNCTION public.admin_set_member_status(
    p_member_id uuid,
    p_new_status text,
    p_delete_posts boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_files_to_delete jsonb := '[]'::jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accès réservé à l''administrateur';
    END IF;

    IF p_new_status NOT IN ('active', 'removed', 'rejected') THEN
        RAISE EXCEPTION 'Statut cible non valide';
    END IF;

    IF p_delete_posts AND p_new_status = 'removed' THEN
        -- Collect storage paths before deleting posts
        SELECT coalesce(jsonb_agg(
            jsonb_build_object('storage_path', storage_path, 'thumb_path', thumb_path)
        ), '[]'::jsonb)
        INTO v_files_to_delete
        FROM public.post_files pf
        JOIN public.posts p ON p.id = pf.post_id
        WHERE p.member_id = p_member_id;

        -- Delete all posts by this member
        DELETE FROM public.posts WHERE member_id = p_member_id;
    END IF;

    UPDATE public.members
    SET status = p_new_status
    WHERE id = p_member_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', p_new_status,
        'files_to_delete', v_files_to_delete
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_member_status(uuid, text, boolean) TO authenticated;

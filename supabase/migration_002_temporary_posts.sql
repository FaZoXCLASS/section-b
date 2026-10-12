-- ==============================================================================
-- MIGRATION 002 : Publications temporaires (10 jours) & Correction compteurs
-- Site "Génie civil Section B"
--
-- Description :
-- 1. Ajoute le champ `expires_at` à la table `posts` avec un index partiel.
-- 2. Ajoute le réglage global `temp_post_days` (10 jours par défaut).
-- 3. Met à jour `create_post` pour accepter le paramètre `p_temporary` et calculer
--    l'expiration côté serveur de façon sécurisée.
-- 4. Met à jour `list_posts` pour filtrer automatiquement les posts expirés
--    (expires_at IS NULL OR expires_at > now()) et renvoyer `expires_at`.
-- 5. Corrige et optimise `list_modules` :
--    - Compte distinct des publications (1 post avec 3 fichiers = 1 publication).
--    - Compte exact des fichiers associés (file_count).
--    - Date relative de la dernière publication active (latest_post_at).
--    - Ignore les publications expirées.
--    - Compatible avec la consultation étudiant (jeton) et administrateur.
-- 6. Met à jour `get_storage_stats` pour inclure les métriques des posts temporaires
--    (temp_posts_count, temp_posts_bytes) et les détails de la dernière purge (last_purge).
-- ==============================================================================

-- 1. MODIFICATION DE LA TABLE POSTS
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;

-- Index partiel pour les requêtes de purge et de filtrage
CREATE INDEX IF NOT EXISTS idx_posts_expires_at 
ON public.posts (expires_at) 
WHERE expires_at IS NOT NULL;

-- 2. INSERTION DU PARAMÈTRE DE CONFIGURATION PAR DÉFAUT
INSERT INTO public.settings (key, value)
VALUES ('temp_post_days', '10')
ON CONFLICT (key) DO NOTHING;


-- 3. SUPPRESSION DE L'ANCIENNE SIGNATURE DE CREATE_POST (POUR ÉVITER LES AMBIGUÏTÉS DE SURCHARGE)
DROP FUNCTION IF EXISTS public.create_post(text, uuid, text, jsonb);


-- 4. MISE À JOUR DE LA FONCTION CREATE_POST
CREATE OR REPLACE FUNCTION public.create_post(
    p_token text DEFAULT NULL,
    p_module_id uuid DEFAULT NULL,
    p_message text DEFAULT NULL,
    p_files jsonb DEFAULT '[]'::jsonb,
    p_temporary boolean DEFAULT false
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
    v_temp_days_setting text;
    v_temp_days int := 10;
    v_admin_name text := 'Admin (Section B)';
    v_post public.posts%ROWTYPE;
    v_file jsonb;
    v_idx int := 0;
    v_expires_at timestamptz := NULL;
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
    IF v_max_setting IS NOT NULL AND v_max_setting ~ '^[0-9]+$' THEN
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

    -- Calcul de l'expiration côté serveur si publication temporaire demandée
    IF p_temporary IS TRUE THEN
        SELECT value INTO v_temp_days_setting FROM public.settings WHERE key = 'temp_post_days';
        IF v_temp_days_setting IS NOT NULL AND v_temp_days_setting ~ '^[0-9]+$' THEN
            v_temp_days := v_temp_days_setting::int;
        END IF;
        v_expires_at := now() + (v_temp_days || ' days')::interval;
    END IF;

    INSERT INTO public.posts (module_id, member_id, author_label, message, expires_at)
    VALUES (
        p_module_id,
        v_member.id,
        CASE WHEN v_member.id IS NULL THEN v_admin_name ELSE NULL END,
        v_clean_msg,
        v_expires_at
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
        'expires_at', v_post.expires_at,
        'author_label', CASE WHEN v_member.id IS NULL THEN v_admin_name ELSE v_member.pseudo END,
        'is_mine', true
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_post(text, uuid, text, jsonb, boolean) TO anon, authenticated;


-- 5. MISE À JOUR DE LIST_POSTS (FILTRAGE DE L'EXPIRATION ET RENVOI DE EXPIRES_AT)
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
          AND (p.expires_at IS NULL OR p.expires_at > now())
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
            'expires_at', tp.expires_at,
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


-- 6. CORRECTION ET OPTIMISATION DE LIST_MODULES (COMPTE DISTINCT ET DÉTAILS FICHIERS)
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
        IF p_token IS NOT NULL AND length(trim(p_token)) >= 16 THEN
            v_member := public.get_member_by_token(p_token);
        END IF;
        IF v_member.id IS NULL OR v_member.status <> 'active' THEN
            RAISE EXCEPTION 'Accès refusé : membre inactif ou inconnu';
        END IF;
    END IF;

    WITH active_posts AS (
        SELECT
            p.id,
            p.module_id,
            p.created_at
        FROM public.posts p
        WHERE (p.expires_at IS NULL OR p.expires_at > now())
    ),
    post_stats AS (
        SELECT
            ap.module_id,
            count(DISTINCT ap.id) AS post_count,
            count(pf.id) AS file_count,
            max(ap.created_at) AS latest_post_at
        FROM active_posts ap
        LEFT JOIN public.post_files pf ON pf.post_id = ap.id
        GROUP BY ap.module_id
    )
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', m.id,
            'category', m.category,
            'name', m.name,
            'teacher', m.teacher,
            'sort_order', m.sort_order,
            'is_archived', m.is_archived,
            'post_count', coalesce(ps.post_count, 0),
            'file_count', coalesce(ps.file_count, 0),
            'latest_post_at', ps.latest_post_at
        ) ORDER BY m.sort_order ASC, m.name ASC
    ), '[]'::jsonb)
    INTO v_result
    FROM public.modules m
    LEFT JOIN post_stats ps ON ps.module_id = m.id
    WHERE (v_is_adm OR m.is_archived = false);

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_modules(text) TO anon, authenticated;


-- 7. MISE À JOUR DE GET_STORAGE_STATS (MÉTRIQUES TEMPORAIRES & DERNIÈRE PURGE)
CREATE OR REPLACE FUNCTION public.get_storage_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quota bigint := 1073741824; -- 1 GB par défaut
    v_quota_setting text;
    v_image_bytes bigint := 0;
    v_pdf_bytes bigint := 0;
    v_total_bytes bigint := 0;
    v_image_count bigint := 0;
    v_pdf_count bigint := 0;
    v_posts_count bigint := 0;
    v_members_count bigint := 0;
    v_pending_count bigint := 0;
    v_temp_posts_count bigint := 0;
    v_temp_posts_bytes bigint := 0;
    v_last_purge jsonb := '{}'::jsonb;
    v_last_purge_raw text;
BEGIN
    SELECT value INTO v_quota_setting FROM public.settings WHERE key = 'storage_quota_bytes';
    IF v_quota_setting IS NOT NULL AND v_quota_setting ~ '^[0-9]+$' THEN
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

    -- Métriques des publications temporaires actives
    SELECT
        count(DISTINCT p.id),
        coalesce(sum(pf.size_bytes), 0)
    INTO v_temp_posts_count, v_temp_posts_bytes
    FROM public.posts p
    LEFT JOIN public.post_files pf ON pf.post_id = p.id
    WHERE p.expires_at IS NOT NULL AND p.expires_at > now();

    -- Métadonnées de la dernière purge automatique
    SELECT value INTO v_last_purge_raw FROM public.settings WHERE key = 'last_purge';
    IF v_last_purge_raw IS NOT NULL THEN
        BEGIN
            v_last_purge := v_last_purge_raw::jsonb;
        EXCEPTION WHEN OTHERS THEN
            v_last_purge := '{}'::jsonb;
        END;
    END IF;

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
        'temp_posts_count', v_temp_posts_count,
        'temp_posts_bytes', v_temp_posts_bytes,
        'last_purge', v_last_purge,
        'usage_percent', CASE WHEN v_quota > 0 THEN round((v_total_bytes::numeric / v_quota::numeric) * 100, 2) ELSE 0 END
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_storage_stats() TO authenticated, anon;

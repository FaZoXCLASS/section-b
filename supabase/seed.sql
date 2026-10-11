-- ==============================================================================
-- GÉNIE CIVIL SECTION B — SEED DATA (MODULES)
-- ==============================================================================
-- Idempotent module insertion based on Section B semester 1 timetable.
-- All entries can be edited, archived or reordered later via the admin dashboard.
-- ==============================================================================

INSERT INTO public.modules (category, name, teacher, sort_order)
VALUES
    -- ================= COURS =================
    ('cours', 'Chimie', 'BOZETINE', 1),
    ('cours', 'Physique 1', 'N. BELKAHLA', 2),
    ('cours', 'Algèbre 1', 'S. BELHADJ', 3),
    ('cours', 'Probabilités & Statistiques (Prob&Stat)', 'F. ARIOUI', 4),
    ('cours', 'Analyse 1', 'S. AMRANE', 5),
    ('cours', 'Histoire', NULL, 6),
    ('cours', 'Éthique', 'K. BOUSSAFEUR', 7),

    -- =================== TD ==================
    ('td', 'Physique 1', 'N. BELKAHLA', 1),
    ('td', 'Chimie', 'L. ABANE', 2),
    ('td', 'Probabilités & Statistiques (Prob&Stat)', 'F. ARIOUI', 3),
    ('td', 'Algèbre 1', 'S. BELHADJ', 4),
    ('td', 'Analyse 1', 'S. AMRANE', 5),

    -- =================== TP ==================
    ('tp', 'Structure des ordinateurs & applications (StrucOrd&App)', 'L. HAMOUTENE', 1),
    ('tp', 'Chimie', 'S. MENDIL', 2),
    ('tp', 'Physique 1', 'LEKADIR', 3)
ON CONFLICT (category, name) 
DO UPDATE SET 
    teacher = EXCLUDED.teacher,
    sort_order = EXCLUDED.sort_order;

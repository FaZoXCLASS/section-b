// ==============================================================================
// CONFIGURATION GLOBALE — GÉNIE CIVIL SECTION B
// ==============================================================================
// C'est le SEUL fichier que vous devez modifier pour configurer votre projet.
// NE JAMAIS METTRE la clé service_role ici ! Uniquement l'URL et la clé 'anon'.
// ==============================================================================

export const CONFIG = {
  // 1. Paramètres Supabase (trouvés dans Dashboard -> Project Settings -> API)
  SUPABASE_URL: 'https://ccutzmlqausxkbqlnaju.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_i8Xx_tmvmPCmm0JSDfn22A_Ua2k6yB1',

  // 2. Nom de l'Edge Function et du Bucket de stockage
  EDGE_FUNCTION_NAME: 'files',
  STORAGE_BUCKET: 'class-files',

  // 3. Route d'administration secrète (configurable pour rester discrète)
  ADMIN_ROUTE: '#/admin',

  // 4. Identité et textes du site
  SITE_NAME: 'Génie civil Section B',
  SITE_SUBTITLE: 'Entraide & ressources de la section',
  ACADEMIC_YEAR: '1ère Année Ingénieur — Semestre 1',

  // 5. Paramètres de compression et médias (optimisation du forfait gratuit)
  // 1800 px max permet de conserver une lisibilité nette des écritures sur tableau
  MAX_IMAGE_DIMENSION: 1800,
  // 480 px pour les miniatures de galerie (environ 30 à 60 Ko par vignette)
  THUMB_DIMENSION: 480,
  // Qualité d'encodage WebP (0.80 = excellent compromis poids/netteté)
  IMAGE_QUALITY: 0.80,
  // Concurrence de compression (2 à 3 simultanés pour préserver la RAM des téléphones)
  IMAGE_CONCURRENCY: 2,

  // 6. Limites et quotas
  MAX_FILES_PER_POST: 30,
  // Durée de validité des publications temporaires (en jours)
  TEMP_POST_DAYS: 10,
  // Quota indicatif par défaut en octets (1 Go = 1073741824 octets)
  STORAGE_QUOTA_BYTES: 1073741824,

  // 7. Cycle de vie & sondage (polling en millisecondes pour l'écran d'attente)
  POLL_INTERVAL_PENDING_MS: 4000,
  POLL_MAX_BACKOFF_MS: 12000,

  // 8. CDN Bibliothèque Supabase officielle (épinglée à une version exacte)
  SUPABASE_JS_CDN: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.8/+esm',
};

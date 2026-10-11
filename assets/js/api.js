// ==============================================================================
// GÉNIE CIVIL SECTION B — COUCHE API CENTRALE (api.js)
// ==============================================================================

import { CONFIG } from '../../config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.8/+esm';

// Nettoyage de sécurité de l'URL Supabase (retire tout /rest/v1 et slashes de fin)
export const cleanBaseUrl = (CONFIG.SUPABASE_URL || '')
  .trim()
  .replace(/\/rest\/v1\/?$/, '')
  .replace(/\/+$/, '');

// Initialisation unique du client Supabase avec la clé anon publique
export const supabase = createClient(cleanBaseUrl, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Traduit les erreurs techniques en messages clairs et bienveillants en français.
 * @param {Error|Object} err
 * @returns {string}
 */
export function formatApiError(err) {
  if (!err) return 'Une erreur inconnue est survenue.';
  const msg = err.message || String(err);

  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Connexion réseau impossible. Vérifie ta connexion Internet ou réessaie.';
  }
  if (msg.includes('Trop de demandes')) {
    return 'Trop de demandes en attente actuellement. Réessaie plus tard.';
  }
  if (msg.includes('déjà utilisé')) {
    return 'Ce pseudo est déjà utilisé par un autre membre de la section.';
  }
  if (msg.includes('réservé')) {
    return 'Ce pseudo est réservé, choisis-en un autre.';
  }
  if (msg.includes('caractères non autorisés')) {
    return 'Le pseudo contient des caractères non autorisés (lettres, chiffres, espaces, . _ - uniquement).';
  }
  if (msg.includes('JWT') || msg.includes('Invalid login credentials')) {
    return 'Identifiants administrateur incorrects.';
  }
  if (msg.includes('presque plein')) {
    return 'L\'espace de stockage est presque plein (≥ 95%). Contacte l\'administrateur.';
  }
  if (msg.includes('uq_modules_category_name') || (msg.includes('duplicate key') && msg.includes('modules'))) {
    return 'Cette matière existe déjà dans cette catégorie (Cours, TD ou TP). Choisis un autre nom ou modifie la matière existante dans la liste.';
  }
  if (msg.includes('duplicate key')) {
    return 'Cet élément existe déjà dans la base de données.';
  }

  return msg;
}

export const api = {
  // ============================================================================
  // ÉTUDIANTS : FONCTIONS DU PORTAIL D'ACCÈS (GATE RPC)
  // ============================================================================

  /**
   * Envoie une nouvelle demande d'accès avec le nom réel (visible admin uniquement).
   * @param {string} token Jeton d'appareil
   * @param {string} realName Nom et prénom
   */
  async submitRequest(token, realName) {
    const { data, error } = await supabase.rpc('submit_request', {
      p_token: token,
      p_real_name: realName,
    });
    if (error) throw new Error(formatApiError(error));
    return data;
  },

  /**
   * Récupère le statut actuel de l'appareil (none, pending, approved, active, rejected, removed).
   * @param {string} token
   */
  async getMyStatus(token) {
    const { data, error } = await supabase.rpc('get_my_status', {
      p_token: token,
    });
    if (error) throw new Error(formatApiError(error));
    return data || { status: 'none' };
  },

  /**
   * Valide le choix définitif du pseudonyme pour un membre au statut 'approved'.
   * @param {string} token
   * @param {string} pseudo
   */
  async setPseudo(token, pseudo) {
    const { data, error } = await supabase.rpc('set_pseudo', {
      p_token: token,
      p_pseudo: pseudo,
    });
    if (error) throw new Error(formatApiError(error));
    return data;
  },

  // ============================================================================
  // ÉTUDIANTS : CONSULTATION & PUBLICATIONS (STUDENT RPC)
  // ============================================================================

  /**
   * Liste les modules actifs avec le nombre de publications et la date de la dernière publication.
   * @param {string} [token]
   */
  async listModules(token = null) {
    const { data, error } = await supabase.rpc('list_modules', {
      p_token: token,
    });
    if (error) throw new Error(formatApiError(error));
    return data || [];
  },

  /**
   * Récupère le flux paginé des publications d'un module avec leurs fichiers attachés.
   * @param {string} [token]
   * @param {string} moduleId
   * @param {number} [limit=12]
   * @param {string|null} [beforeTs=null]
   */
  async listPosts(token = null, moduleId, limit = 12, beforeTs = null) {
    const { data, error } = await supabase.rpc('list_posts', {
      p_token: token,
      p_module_id: moduleId,
      p_limit: limit,
      p_before: beforeTs,
    });
    if (error) throw new Error(formatApiError(error));
    return data || [];
  },

  /**
   * Crée une nouvelle publication avec les métadonnées des fichiers téléversés.
   * @param {string} [token]
   * @param {string} moduleId
   * @param {string} message
   * @param {Array} [files=[]]
   */
  async createPost(token = null, moduleId, message, files = []) {
    const { data, error } = await supabase.rpc('create_post', {
      p_token: token,
      p_module_id: moduleId,
      p_message: message,
      p_files: files,
    });
    if (error) throw new Error(formatApiError(error));
    return data;
  },

  /**
   * Liste les pseudos de tous les membres actifs de la section (aucun nom ni date).
   * @param {string} [token]
   */
  async listMembers(token = null) {
    const { data, error } = await supabase.rpc('list_members', {
      p_token: token,
    });
    if (error) throw new Error(formatApiError(error));
    return data || { total: 0, members: [] };
  },

  // ============================================================================
  // GESTION DES FICHIERS VIA L'EDGE FUNCTION (Deno)
  // ============================================================================

  /**
   * Demande des URLs de téléversement signées à l'Edge Function.
   * @param {string|null} token Jeton d'appareil (ou null si admin)
   * @param {Array<{ name: string, mime: string, size: number, kind: string, hasThumb: boolean }>} files
   */
  async signUpload(token, files) {
    const { data: sessionData } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }

    const res = await fetch(`${cleanBaseUrl}/functions/v1/${CONFIG.EDGE_FUNCTION_NAME}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'sign_upload',
        token,
        files,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Erreur lors de la préparation du téléversement.');
    }
    return result.signedFiles || [];
  },

  /**
   * Supprime une publication et ses fichiers physiques de Storage via l'Edge Function.
   * @param {string|null} token Jeton d'appareil (ou null si admin)
   * @param {string} postId
   */
  async deletePost(token, postId) {
    const { data: sessionData } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }

    const res = await fetch(`${cleanBaseUrl}/functions/v1/${CONFIG.EDGE_FUNCTION_NAME}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'delete_post',
        token,
        postId,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Impossible de supprimer cette publication.');
    }
    return result;
  },

  /**
   * Nettoie les fichiers orphelins en cas d'annulation ou échec de publication.
   * @param {string|null} token
   * @param {string[]} paths Chemins de stockage
   */
  async cancelUpload(token, paths) {
    if (!paths || paths.length === 0) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (sessionData?.session?.access_token) {
        headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
      }

      await fetch(`${cleanBaseUrl}/functions/v1/${CONFIG.EDGE_FUNCTION_NAME}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'cancel_upload',
          token,
          paths,
        }),
      });
    } catch (err) {
      console.warn('[API] Erreur silencieuse d\'annulation de téléversement:', err);
    }
  },

  // ============================================================================
  // ESPACE ADMINISTRATEUR (AUTHENTICATION & RPC)
  // ============================================================================

  /**
   * Connexion administrateur avec email et mot de passe (Supabase Auth).
   * @param {string} email
   * @param {string} password
   */
  async adminLogin(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(formatApiError(error));
    return data;
  },

  /**
   * Déconnexion de la session administrateur.
   */
  async adminLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(formatApiError(error));
  },

  /**
   * Récupère les métriques de stockage et les compteurs pour le dashboard admin.
   */
  async getStorageStats() {
    const { data, error } = await supabase.rpc('get_storage_stats');
    if (error) throw new Error(formatApiError(error));
    return data;
  },

  /**
   * Récupère la liste des demandes en attente avec indication des doublons de noms.
   */
  async adminListRequests() {
    const { data, error } = await supabase.rpc('admin_list_requests');
    if (error) throw new Error(formatApiError(error));
    return data || [];
  },

  /**
   * Valide une demande en attente (soit nouveau membre, soit liaison avec un compte existant).
   * @param {string} memberId
   * @param {string|null} [linkToMemberId=null]
   */
  async adminApproveRequest(memberId, linkToMemberId = null) {
    const { data, error } = await supabase.rpc('admin_approve_request', {
      p_member_id: memberId,
      p_link_to_member_id: linkToMemberId,
    });
    if (error) throw new Error(formatApiError(error));
    return data;
  },

  /**
   * Rejette une demande d'accès.
   * @param {string} memberId
   */
  async adminRejectRequest(memberId) {
    const { data, error } = await supabase.rpc('admin_reject_request', {
      p_member_id: memberId,
    });
    if (error) throw new Error(formatApiError(error));
    return data;
  },

  /**
   * Modifie le pseudonyme d'un membre.
   * @param {string} memberId
   * @param {string} newPseudo
   */
  async adminUpdatePseudo(memberId, newPseudo) {
    const { data, error } = await supabase.rpc('admin_update_pseudo', {
      p_member_id: memberId,
      p_new_pseudo: newPseudo,
    });
    if (error) throw new Error(formatApiError(error));
    return data;
  },

  /**
   * Modifie le statut d'un membre (ex: 'removed' pour bannir, avec option de suppression des posts).
   * @param {string} memberId
   * @param {string} newStatus
   * @param {boolean} [deletePosts=false]
   */
  async adminSetMemberStatus(memberId, newStatus, deletePosts = false) {
    const { data, error } = await supabase.rpc('admin_set_member_status', {
      p_member_id: memberId,
      p_new_status: newStatus,
      p_delete_posts: deletePosts,
    });
    if (error) throw new Error(formatApiError(error));

    // Si des fichiers physiques doivent être purgés suite à la suppression des posts
    if (data?.files_to_delete && data.files_to_delete.length > 0) {
      const paths = [];
      data.files_to_delete.forEach((f) => {
        if (f.storage_path) paths.push(f.storage_path);
        if (f.thumb_path) paths.push(f.thumb_path);
      });
      if (paths.length > 0) {
        await supabase.storage.from(CONFIG.STORAGE_BUCKET).remove(paths);
      }
    }

    return data;
  },

  /**
   * Récupère la liste complète des membres pour l'administration (avec vrais noms et compte de posts).
   */
  async adminGetMembers() {
    const { data, error } = await supabase
      .from('members')
      .select('id, real_name, pseudo, status, created_at, approved_at, activated_at, posts(count)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(formatApiError(error));
    return data || [];
  },

  /**
   * Supprime définitivement la ligne d'un membre de la base.
   * @param {string} memberId
   */
  async adminDeleteMember(memberId) {
    const { error } = await supabase.from('members').delete().eq('id', memberId);
    if (error) throw new Error(formatApiError(error));
  },

  /**
   * Crée un nouveau module dans une catégorie.
   * @param {string} category 'cours'|'td'|'tp'
   * @param {string} name
   * @param {string|null} teacher
   * @param {number} [sortOrder=0]
   */
  async adminCreateModule(category, name, teacher = null, sortOrder = 0) {
    const { data, error } = await supabase
      .from('modules')
      .insert({
        category,
        name: name.trim(),
        teacher: teacher ? teacher.trim() : null,
        sort_order: sortOrder,
      })
      .select()
      .single();
    if (error) throw new Error(formatApiError(error));
    return data;
  },

  /**
   * Met à jour un module (nom, enseignant, archivage, ordre).
   * @param {string} id
   * @param {Object} updates
   */
  async adminUpdateModule(id, updates) {
    const { data, error } = await supabase
      .from('modules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(formatApiError(error));
    return data;
  },

  /**
   * Supprime un module (supprime également ses publications par cascade).
   * @param {string} id
   */
  async adminDeleteModule(id) {
    const { error } = await supabase.from('modules').delete().eq('id', id);
    if (error) throw new Error(formatApiError(error));
  },

  /**
   * Récupère les paramètres de configuration globale.
   */
  async adminGetSettings() {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) throw new Error(formatApiError(error));
    const map = {};
    (data || []).forEach((row) => {
      map[row.key] = row.value;
    });
    return map;
  },

  /**
   * Met à jour un paramètre dans la table settings.
   * @param {string} key
   * @param {string} value
   */
  async adminUpdateSetting(key, value) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value: String(value) });
    if (error) throw new Error(formatApiError(error));
  },

  /**
   * Récupère toutes les publications pour la vue de modération.
   * @param {string|null} [moduleId=null]
   */
  async adminListModerationPosts(moduleId = null) {
    let query = supabase
      .from('posts')
      .select(`
        id, module_id, author_label, message, created_at,
        modules(id, name, category),
        members(id, pseudo, real_name),
        post_files(id, kind, original_name, size_bytes)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (moduleId) {
      query = query.eq('module_id', moduleId);
    }

    const { data, error } = await query;
    if (error) throw new Error(formatApiError(error));
    return data || [];
  },
};

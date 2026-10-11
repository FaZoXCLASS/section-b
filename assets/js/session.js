// ==============================================================================
// GÉNIE CIVIL SECTION B — GESTION DE SESSION & JETON D'APPAREIL (session.js)
// ==============================================================================

import { CONFIG } from '../../config.js';
import { api, supabase } from './api.js';

const STORAGE_KEY = 'gc_device_token';

class SessionManager {
  constructor() {
    this.deviceToken = null;
    this.status = 'loading'; // 'loading', 'none', 'pending', 'approved', 'active', 'rejected', 'removed'
    this.pseudo = null;
    this.memberId = null;
    this.isAdmin = false;
    this.adminUser = null;

    this.pollTimer = null;
    this.pollInterval = CONFIG.POLL_INTERVAL_PENDING_MS || 4000;
    this.listeners = new Set();
  }

  /**
   * Récupère ou génère un jeton d'appareil cryptographique (≥ 128 bits).
   * @returns {string}
   */
  getDeviceToken() {
    if (this.deviceToken) return this.deviceToken;

    let token = null;
    try {
      token = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Échec si localStorage est bloqué
    }

    if (!token || token.length < 16) {
      // Génération de 256 bits d'aléa via Web Crypto
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const hex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
      token = `${crypto.randomUUID()}-${hex}`;

      try {
        localStorage.setItem(STORAGE_KEY, token);
      } catch {
        // Fallback cookie
        document.cookie = `${STORAGE_KEY}=${encodeURIComponent(token)};path=/;max-age=315360000;SameSite=Strict`;
      }
    }

    this.deviceToken = token;
    return token;
  }

  /**
   * S'abonne aux changements d'état de la session.
   * @param {Function} callback (state: Object) => void
   * @returns {Function} Désabonnement
   */
  subscribe(callback) {
    this.listeners.add(callback);
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach((cb) => {
      try {
        cb(state);
      } catch (err) {
        console.error('[Session] Erreur dans un abonné:', err);
      }
    });
  }

  getState() {
    return {
      deviceToken: this.deviceToken,
      status: this.status,
      pseudo: this.pseudo,
      memberId: this.memberId,
      isAdmin: this.isAdmin,
      adminUser: this.adminUser,
    };
  }

  /**
   * Initialise la session : vérifie à la fois la session admin Supabase et le token étudiant.
   */
  async initSession() {
    const token = this.getDeviceToken();

    // 1. Vérification session Admin (Supabase Auth)
    try {
      const { data: authData } = await supabase.auth.getSession();
      if (authData?.session?.user) {
        this.adminUser = authData.session.user;
        // Vérifier si présent dans la table admins
        const { data: adminRecord } = await supabase
          .from('admins')
          .select('user_id')
          .eq('user_id', authData.session.user.id)
          .maybeSingle();

        if (adminRecord) {
          this.isAdmin = true;
        }
      }
    } catch {
      // Non admin
    }

    // Écouteur de changement d'état d'authentification Supabase
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        this.adminUser = session.user;
        const { data: adminRecord } = await supabase
          .from('admins')
          .select('user_id')
          .eq('user_id', session.user.id)
          .maybeSingle();
        this.isAdmin = !!adminRecord;
      } else {
        this.adminUser = null;
        this.isAdmin = false;
      }
      this.notify();
    });

    // 2. Vérification statut Membre étudiant via RPC
    await this.refreshMemberStatus();
    return this.getState();
  }

  /**
   * Rafraîchit le statut de l'appareil auprès de Supabase.
   */
  async refreshMemberStatus() {
    const token = this.getDeviceToken();

    try {
      const result = await api.getMyStatus(token);
      this.status = result.status || 'none';
      this.pseudo = result.pseudo || null;
      this.memberId = result.member_id || null;
    } catch (err) {
      console.warn('[Session] Impossible de récupérer le statut du jeton:', err);
      this.status = 'none';
    }

    this.notify();
    return this.status;
  }

  /**
   * Démarre le sondage automatique (polling) avec back-off pour l'écran d'attente.
   * Réactive également une vérification immédiate quand l'onglet redevient visible.
   * @param {Function} onStatusChange (newStatus: string) => void
   */
  startPendingPoll(onStatusChange) {
    this.stopPendingPoll();

    const check = async () => {
      const oldStatus = this.status;
      const newStatus = await this.refreshMemberStatus();

      if (newStatus !== oldStatus && typeof onStatusChange === 'function') {
        onStatusChange(newStatus);
      }

      if (newStatus === 'pending') {
        // Backoff progressif jusqu'à CONFIG.POLL_MAX_BACKOFF_MS
        this.pollInterval = Math.min(this.pollInterval + 1000, CONFIG.POLL_MAX_BACKOFF_MS || 12000);
        this.pollTimer = setTimeout(check, this.pollInterval);
      } else {
        this.stopPendingPoll();
      }
    };

    // Gestion de la visibilité de l'onglet (wake-up check)
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible' && this.status === 'pending') {
        this.pollInterval = CONFIG.POLL_INTERVAL_PENDING_MS || 4000;
        check();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    this.pollTimer = setTimeout(check, this.pollInterval);
  }

  /**
   * Arrête le sondage en cours.
   */
  stopPendingPoll() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.pollInterval = CONFIG.POLL_INTERVAL_PENDING_MS || 4000;
  }
}

export const session = new SessionManager();

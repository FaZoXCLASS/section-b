// ==============================================================================
// GÉNIE CIVIL SECTION B — APPLICATION ENTRY POINT (app.js)
// ==============================================================================

import { CONFIG } from '../../config.js';
import { Router } from './router.js';
import { h, icon } from './utils.js';
import { session } from './session.js';
import { renderGate } from './pages/gate.js';
import { renderHome } from './pages/home.js';
import { renderCategory } from './pages/category.js';
import { renderModule } from './pages/module.js';
import { renderMembers } from './pages/members.js';
import { renderAdmin } from './pages/admin.js';
import { openCreatePostModal } from './ui/postModal.js';
import { toast } from './ui/toast.js';

export const router = new Router();

/**
 * Met à jour le header principal du site.
 * @param {Object} [state]
 * @param {string|null} [state.pseudo]
 * @param {boolean} [state.isAdmin]
 */
export function updateHeader(state = {}) {
  const header = document.getElementById('site-header');
  if (!header) return;

  if (!state.pseudo && !state.isAdmin) {
    header.style.display = 'none';
    return;
  }

  header.style.display = 'block';
  header.innerHTML = '';

  const brand = h('a', { href: '#/', className: 'site-brand' }, [
    h('img', { src: 'assets/img/favicon.svg', alt: 'Logo', className: 'site-logo' }),
    h('div', { className: 'brand-info' }, [
      h('span', { className: 'brand-title' }, CONFIG.SITE_NAME),
      h('span', { className: 'brand-subtitle' }, CONFIG.SITE_SUBTITLE),
    ]),
  ]);

  const nav = h('nav', { className: 'header-nav' }, [
    h('a', { href: '#/', className: 'nav-link' }, 'Accueil'),
    h('a', { href: '#/cours', className: 'nav-link' }, 'Cours'),
    h('a', { href: '#/td', className: 'nav-link' }, 'TD'),
    h('a', { href: '#/tp', className: 'nav-link' }, 'TP'),
    h('a', { href: '#/membres', className: 'nav-link' }, 'Membres'),
  ]);

  if (state.isAdmin) {
    nav.appendChild(
      h('a', { href: CONFIG.ADMIN_ROUTE, className: 'nav-link' }, 'Admin')
    );
  }

  const userPill = h('div', { className: 'user-badge' }, [
    icon('shield'),
    state.pseudo ? state.pseudo : 'Admin',
  ]);

  const container = h('div', { className: 'header-container' }, [
    brand,
    nav,
    userPill,
  ]);

  header.appendChild(container);
}

/**
 * Met à jour la barre d'onglets mobile inférieure.
 * @param {Object} [state]
 */
export function updateBottomNav(state = {}) {
  const bottomNav = document.getElementById('bottom-nav');
  if (!bottomNav) return;

  if (!state.pseudo && !state.isAdmin) {
    bottomNav.classList.remove('is-visible');
    bottomNav.style.display = 'none';
    return;
  }

  bottomNav.classList.add('is-visible');
  bottomNav.style.display = '';
  bottomNav.innerHTML = '';

  const homeTab = h('a', { href: '#/', className: 'tab-item' }, [
    icon('home', 'tab-icon'),
    h('span', {}, 'Accueil'),
  ]);

  const publishBtn = h('button', {
    type: 'button',
    className: 'tab-item tab-action-btn',
    'aria-label': 'Publier une leçon',
    onClick: () => {
      // Événement global pour ouvrir le dialogue de publication
      window.dispatchEvent(new CustomEvent('app:open-publish-modal'));
    },
  }, icon('plus'));

  const membersTab = h('a', { href: '#/membres', className: 'tab-item' }, [
    icon('users', 'tab-icon'),
    h('span', {}, 'Membres'),
  ]);

  bottomNav.appendChild(homeTab);
  bottomNav.appendChild(publishBtn);
  bottomNav.appendChild(membersTab);
}

// Gestionnaire 404 personnalisé
router.notFound(() => {
  const mainView = document.getElementById('main-view');
  if (!mainView) return;

  mainView.innerHTML = '';
  const notFoundEl = h('div', { className: 'empty-state animate-fade' }, [
    icon('fileText', 'empty-icon'),
    h('h2', {}, 'Page introuvable'),
    h('p', {}, 'Le lien demandé semble incorrect ou a été déplacé.'),
    h('a', { href: '#/', className: 'btn btn-primary' }, 'Retour à l\'accueil'),
  ]);
  mainView.appendChild(notFoundEl);
});

// Synchronisation visuelle de l'onglet actif après chaque navigation
router.afterEach((path) => {
  document.querySelectorAll('.nav-link, .tab-item').forEach((link) => {
    const href = link.getAttribute('href');
    if (href) {
      const linkPath = href.replace(/^#\/?/, '');
      if (linkPath === path || (linkPath && path.startsWith(linkPath))) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    }
  });
  window.scrollTo(0, 0);
});

// Garde de navigation : protection des routes par le portail d'accès
router.beforeEach(async (toPath) => {
  // L'accès à la route admin est toujours permis (elle gère son propre formulaire de connexion)
  const cleanAdminRoute = CONFIG.ADMIN_ROUTE.replace(/^#\/?/, '');
  if (toPath === cleanAdminRoute || toPath.startsWith(`${cleanAdminRoute}/`)) {
    return true;
  }

  // Si l'administrateur est connecté, il accède à toutes les pages
  if (session.isAdmin) {
    updateHeader(session.getState());
    updateBottomNav(session.getState());
    return true;
  }

  // Pour les étudiants : vérification du statut du jeton d'appareil
  if (session.status !== 'active') {
    // Affiche l'écran du portail approprié (demande, attente, choix pseudo, refusé, retiré)
    renderGate(session.status);
    return false; // Interrompt la navigation vers la page demandée
  }

  // Membre actif : mettre à jour l'en-tête et autoriser la navigation
  updateHeader(session.getState());
  updateBottomNav(session.getState());
  return true;
});

// Déclaration des routes étudiantes
router.add('/', () => renderHome());
router.add('/cours', () => renderCategory('cours'));
router.add('/td', () => renderCategory('td'));
router.add('/tp', () => renderCategory('tp'));
router.add('/cours/:moduleId', ({ moduleId }) => renderModule('cours', moduleId));
router.add('/td/:moduleId', ({ moduleId }) => renderModule('td', moduleId));
router.add('/tp/:moduleId', ({ moduleId }) => renderModule('tp', moduleId));
router.add('/membres', () => renderMembers());
router.add(CONFIG.ADMIN_ROUTE, () => renderAdmin());

// Écouteur global pour ouvrir la modale de publication (ex: depuis la barre mobile)
window.addEventListener('app:open-publish-modal', () => {
  openCreatePostModal({
    onPostCreated: () => {
      // Si l'utilisateur est déjà sur une page de module, actualiser la vue
      router.resolve();
    },
  });
});

// Démarrage initial et chargement de la session
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await session.initSession();
  } catch (err) {
    console.error('[App] Erreur initialisation session:', err);
  }
  router.start();
});

// Détection de l'état réseau (en ligne / hors-ligne)
window.addEventListener('offline', () => {
  toast.warning('Connexion Internet perdue. Tu es actuellement hors-ligne.', 5000);
});

window.addEventListener('online', () => {
  toast.success('Connexion Internet rétablie.', 3000);
  // Re-synchronisation de l'état
  session.refreshMemberStatus();
});

// Re-vérification du statut si l'onglet redevient actif (expulsion si banni pendant navigation)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !session.isAdmin) {
    const oldStatus = session.status;
    const newStatus = await session.refreshMemberStatus();
    if (oldStatus === 'active' && newStatus !== 'active') {
      toast.warning('Ton statut a été mis à jour par l\'administrateur.');
      router.resolve();
    }
  }
});


// ==============================================================================
// GÉNIE CIVIL SECTION B — PAGE D'ACCUEIL (home.js)
// ==============================================================================

import { CONFIG } from '../../../config.js';
import { api } from '../api.js';
import { session } from '../session.js';
import { router } from '../app.js';
import { h, icon, formatDate } from '../utils.js';
import { skeleton } from '../ui/skeleton.js';

export async function renderHome() {
  const mainView = document.getElementById('main-view');
  if (!mainView) return;

  mainView.innerHTML = '';
  mainView.appendChild(skeleton.cardList(3));

  const token = session.getDeviceToken();
  let modules = [];
  try {
    modules = await api.listModules(token);
  } catch (err) {
    console.error('[Home] Erreur de chargement des modules:', err);
  }

  mainView.innerHTML = '';

  const userState = session.getState();
  const pseudoName = userState.pseudo || (userState.isAdmin ? 'Admin' : 'Camarade');

  // Bannière de bienvenue
  const banner = h('div', { className: 'home-welcome-banner animate-fade' }, [
    h('div', { className: 'badge badge-cours', style: 'margin-bottom: 12px;' }, CONFIG.ACADEMIC_YEAR),
    h('h1', { style: 'margin-bottom: 8px;' }, `Salut, ${pseudoName} !`),
    h('p', { style: 'font-size: var(--text-base); color: var(--text-secondary); max-width: 600px;' },
      'Bienvenue sur l\'espace d\'entraide de la Section B. Retrouve ici les cours, les corrigés de TD et les comptes-rendus de TP partagés par tes camarades.'
    ),
  ]);

  // Calcul du nombre de modules par catégorie
  const countCours = modules.filter((m) => m.category === 'cours' && !m.is_archived).length;
  const countTD = modules.filter((m) => m.category === 'td' && !m.is_archived).length;
  const countTP = modules.filter((m) => m.category === 'tp' && !m.is_archived).length;

  // Grille des 3 grandes catégories
  const categoryGrid = h('div', { className: 'category-grid' }, [
    createCategoryCard('cours', 'Cours', 'Leçons théoriques, polycopiés et notes de tableau', countCours, 'badge-cours', 'card-category-cours'),
    createCategoryCard('td', 'Travaux Dirigés (TD)', 'Exercices, fiches de TD et résolutions détaillées', countTD, 'badge-td', 'card-category-td'),
    createCategoryCard('tp', 'Travaux Pratiques (TP)', 'Comptes-rendus, manipulations et protocoles', countTP, 'badge-tp', 'card-category-tp'),
  ]);

  // Section de raccourci vers la liste des membres
  const membersStrip = h('div', {
    className: 'card animate-fade',
    style: 'display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-8); padding: var(--space-4) var(--space-5);',
  }, [
    h('div', { style: 'display: flex; align-items: center; gap: 12px;' }, [
      icon('users', 'svg-icon'),
      h('div', {}, [
        h('div', { style: 'font-weight: 600; font-size: var(--text-sm);' }, 'Membres de la section'),
        h('div', { style: 'font-size: var(--text-xs); color: var(--text-muted);' }, 'Consulter les pseudonymes actifs de la promo'),
      ]),
    ]),
    h('a', { href: '#/membres', className: 'btn btn-secondary btn-sm' }, 'Voir les membres'),
  ]);

  mainView.appendChild(banner);
  mainView.appendChild(categoryGrid);
  mainView.appendChild(membersStrip);
}

function createCategoryCard(key, label, desc, count, badgeClass, cardBorderClass) {
  const card = h('a', {
    href: `#/${key}`,
    className: `card card-interactive ${cardBorderClass} category-card animate-fade`,
  }, [
    h('div', { className: 'category-header' }, [
      h('span', { className: `badge ${badgeClass}` }, key.toUpperCase()),
      h('span', { className: 'category-count' }, `${count} matières`),
    ]),
    h('div', {}, [
      h('h3', { style: 'margin-bottom: 4px;' }, label),
      h('p', { style: 'font-size: var(--text-xs); color: var(--text-secondary);' }, desc),
    ]),
    h('div', {
      style: 'display: flex; align-items: center; gap: 6px; font-size: var(--text-xs); color: var(--accent-gold); font-weight: 500; margin-top: 12px;',
    }, [
      h('span', {}, 'Explorer les matières'),
      icon('chevronRight'),
    ]),
  ]);

  return card;
}

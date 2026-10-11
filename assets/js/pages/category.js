// ==============================================================================
// GÉNIE CIVIL SECTION B — PAGE CATÉGORIE / LISTE DES MODULES (category.js)
// ==============================================================================

import { api } from '../api.js';
import { session } from '../session.js';
import { h, icon, formatDate } from '../utils.js';
import { skeleton } from '../ui/skeleton.js';

const categoryTitles = {
  cours: { title: 'Cours', badgeClass: 'badge-cours', desc: 'Notes de cours, polycopiés et résumés théoriques' },
  td: { title: 'Travaux Dirigés (TD)', badgeClass: 'badge-td', desc: 'Séries d\'exercices, corrigés et fiches méthodologiques' },
  tp: { title: 'Travaux Pratiques (TP)', badgeClass: 'badge-tp', desc: 'Protocoles de manipulation et comptes-rendus de laboratoire' },
};

export async function renderCategory(categoryKey) {
  const mainView = document.getElementById('main-view');
  if (!mainView) return;

  const meta = categoryTitles[categoryKey] || categoryTitles.cours;

  mainView.innerHTML = '';
  mainView.appendChild(skeleton.cardList(6));

  const token = session.getDeviceToken();
  let allModules = [];
  try {
    allModules = await api.listModules(token);
  } catch (err) {
    console.error('[Category] Erreur chargement modules:', err);
  }

  mainView.innerHTML = '';

  const modules = allModules.filter((m) => m.category === categoryKey && !m.is_archived);

  // Fil d'Ariane
  const breadcrumb = h('nav', { className: 'breadcrumb' }, [
    h('a', { href: '#/' }, 'Accueil'),
    icon('chevronRight'),
    h('span', {}, meta.title),
  ]);

  // En-tête de catégorie
  const header = h('div', { style: 'margin-bottom: var(--space-6);' }, [
    breadcrumb,
    h('div', { style: 'display: flex; align-items: center; gap: 12px; margin-top: 6px;' }, [
      h('h1', { style: 'margin: 0;' }, meta.title),
      h('span', { className: `badge ${meta.badgeClass}` }, `${modules.length} matières`),
    ]),
    h('p', { style: 'margin-top: 6px;' }, meta.desc),
  ]);

  mainView.appendChild(header);

  if (modules.length === 0) {
    const empty = h('div', { className: 'empty-state animate-fade' }, [
      icon('folder', 'empty-icon'),
      h('h3', {}, 'Aucune matière dans cette catégorie pour le moment.'),
      h('p', {}, 'L\'administrateur peut ajouter les modules depuis son tableau de bord.'),
      h('a', { href: '#/', className: 'btn btn-secondary btn-sm' }, 'Retour à l\'accueil'),
    ]);
    mainView.appendChild(empty);
    return;
  }

  const grid = h('div', { className: 'modules-grid' });

  modules.forEach((mod) => {
    const latestPostText = mod.latest_post_at
      ? `Dernier ajout : ${formatDate(mod.latest_post_at).relative}`
      : 'Aucun partage';

    const card = h('a', {
      href: `#/${categoryKey}/${mod.id}`,
      className: `card card-interactive module-card animate-fade card-category-${categoryKey}`,
    }, [
      h('div', {}, [
        mod.teacher ? h('div', { className: 'module-teacher' }, [
          icon('bookOpen'),
          h('span', {}, `Enseignant : ${mod.teacher}`),
        ]) : null,
        h('h3', { style: 'font-size: var(--text-lg); margin-bottom: 6px;' }, mod.name),
      ]),
      h('div', { className: 'module-stats' }, [
        h('span', {}, `${mod.post_count || 0} publication${(mod.post_count || 0) > 1 ? 's' : ''}`),
        h('span', {}, latestPostText),
      ]),
    ]);

    grid.appendChild(card);
  });

  mainView.appendChild(grid);
}

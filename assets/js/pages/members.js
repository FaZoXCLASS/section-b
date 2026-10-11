// ==============================================================================
// GÉNIE CIVIL SECTION B — PAGE MEMBRES DE LA SECTION (members.js)
// ==============================================================================

import { api } from '../api.js';
import { session } from '../session.js';
import { h, icon } from '../utils.js';
import { skeleton } from '../ui/skeleton.js';

export async function renderMembers() {
  const mainView = document.getElementById('main-view');
  if (!mainView) return;

  mainView.innerHTML = '';
  mainView.appendChild(skeleton.cardList(4));

  const token = session.getDeviceToken();
  let membersData = { total: 0, members: [] };

  try {
    membersData = await api.listMembers(token);
  } catch (err) {
    console.error('[Members] Erreur chargement membres:', err);
  }

  mainView.innerHTML = '';

  const currentPseudo = session.pseudo;
  const list = membersData.members || [];
  const total = membersData.total || list.length;

  // Fil d'Ariane
  const breadcrumb = h('nav', { className: 'breadcrumb' }, [
    h('a', { href: '#/' }, 'Accueil'),
    icon('chevronRight'),
    h('span', {}, 'Membres'),
  ]);

  // En-tête
  const header = h('div', { style: 'margin-bottom: var(--space-6);' }, [
    breadcrumb,
    h('div', { style: 'display: flex; align-items: center; gap: 12px; margin-top: 4px;' }, [
      h('h1', { style: 'margin: 0;' }, 'Membres de la section'),
      h('span', { className: 'badge badge-cours' }, `${total} membre${total > 1 ? 's' : ''}`),
    ]),
    h('p', { style: 'margin-top: 6px;' },
      'Liste alphabétique des camarades actifs dans la section Génie Civil B. Seuls les pseudonymes sont publics.'
    ),
  ]);

  // Champ de recherche en direct
  const searchInput = h('input', {
    type: 'search',
    className: 'input',
    placeholder: 'Rechercher un pseudo...',
    style: 'max-width: 360px; margin-bottom: var(--space-6);',
  });

  const grid = h('div', { className: 'members-list-grid' });

  function renderList(filteredList) {
    grid.innerHTML = '';

    if (filteredList.length === 0) {
      grid.appendChild(h('div', {
        className: 'empty-state',
        style: 'grid-column: 1 / -1;',
      }, [
        icon('users', 'empty-icon'),
        h('h3', {}, 'Aucun pseudo correspondant'),
        h('p', {}, 'Essaie une autre recherche.'),
      ]));
      return;
    }

    filteredList.forEach((pseudo) => {
      const isMe = currentPseudo && pseudo.toLowerCase() === currentPseudo.toLowerCase();
      const initial = pseudo.charAt(0).toUpperCase();

      const chip = h('div', {
        className: `member-chip animate-fade ${isMe ? 'is-current-user' : ''}`,
      }, [
        h('div', { className: 'avatar-initial', style: 'width: 32px; height: 32px; font-size: 0.85rem;' }, initial),
        h('div', { style: 'flex: 1; min-width: 0;' }, [
          h('div', {
            style: 'font-weight: 600; font-size: var(--text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
          }, pseudo),
          isMe ? h('span', { className: 'badge badge-cours', style: 'font-size: 10px; padding: 1px 6px;' }, 'Toi') : null,
        ]),
      ]);

      grid.appendChild(chip);
    });
  }

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = list.filter((p) => p.toLowerCase().includes(query));
    renderList(filtered);
  });

  renderList(list);

  mainView.appendChild(header);
  mainView.appendChild(searchInput);
  mainView.appendChild(grid);
}

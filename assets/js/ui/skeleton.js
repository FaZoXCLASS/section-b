// ==============================================================================
// GÉNIE CIVIL SECTION B — SQUELETTES DE CHARGEMENT (skeleton.js)
// ==============================================================================

import { h } from '../utils.js';

export const skeleton = {
  /**
   * Crée un bloc de squelette de carte générique.
   * @param {number} [count=3]
   * @returns {HTMLElement}
   */
  cardList(count = 3) {
    const list = h('div', { className: 'modules-grid' });
    for (let i = 0; i < count; i++) {
      const card = h('div', { className: 'card skeleton-card skeleton' });
      list.appendChild(card);
    }
    return list;
  },

  /**
   * Crée des squelettes de publications pour le flux de module.
   * @param {number} [count=3]
   * @returns {HTMLElement}
   */
  postList(count = 3) {
    const feed = h('div', { className: 'posts-feed' });
    for (let i = 0; i < count; i++) {
      const postCard = h('div', { className: 'post-card' }, [
        h('div', { style: 'display:flex; align-items:center; gap:12px; margin-bottom:16px;' }, [
          h('div', { className: 'skeleton', style: 'width:38px; height:38px; border-radius:50%;' }),
          h('div', { style: 'flex:1;' }, [
            h('div', { className: 'skeleton skeleton-text', style: 'width:40%;' }),
            h('div', { className: 'skeleton skeleton-text', style: 'width:20%; height:10px;' }),
          ]),
        ]),
        h('div', { className: 'skeleton skeleton-text', style: 'width:90%; height:16px;' }),
        h('div', { className: 'skeleton skeleton-text', style: 'width:70%; height:16px; margin-bottom:16px;' }),
        h('div', { className: 'skeleton', style: 'height:160px; border-radius:8px;' }),
      ]);
      feed.appendChild(postCard);
    }
    return feed;
  },
};

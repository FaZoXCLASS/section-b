// ==============================================================================
// GÉNIE CIVIL SECTION B — GESTIONNAIRE DE MODALES & DIALOGUES (modal.js)
// ==============================================================================

import { h, icon } from '../utils.js';

let activeBackdrop = null;
let previousActiveElement = null;

export const modal = {
  /**
   * Ouvre une boîte de dialogue modale accessible avec capture du focus.
   * @param {Object} options
   * @param {string} options.title Titre de la modale
   * @param {HTMLElement|string} options.content Contenu central
   * @param {HTMLElement|string} [options.footer] Pied de page optionnel avec boutons
   * @param {Function} [options.onClose] Fonction appelée à la fermeture
   * @returns {{ close: Function, el: HTMLElement }}
   */
  open({ title, content, footer, onClose }) {
    this.close(); // Ferme toute modale active existante

    previousActiveElement = document.activeElement;

    const closeBtn = h(
      'button',
      {
        type: 'button',
        className: 'btn btn-ghost btn-sm',
        'aria-label': 'Fermer',
        onClick: () => this.close(),
      },
      icon('x')
    );

    const headerEl = h('div', { className: 'modal-header' }, [
      h('h3', { className: 'modal-title' }, title),
      closeBtn,
    ]);

    const bodyEl = h('div', { className: 'modal-body' }, content);

    const dialogElements = [headerEl, bodyEl];
    if (footer) {
      dialogElements.push(h('div', { className: 'modal-footer' }, footer));
    }

    const dialogEl = h('div', { className: 'modal-dialog', role: 'dialog', 'aria-modal': 'true' }, dialogElements);

    const backdropEl = h(
      'div',
      {
        className: 'modal-backdrop',
        onClick: (e) => {
          if (e.target === backdropEl) this.close();
        },
      },
      dialogEl
    );

    document.body.appendChild(backdropEl);
    document.body.style.overflow = 'hidden';

    // Animation d'ouverture
    requestAnimationFrame(() => {
      backdropEl.classList.add('is-open');
      closeBtn.focus();
    });

    // Écouteur de touche Échap
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    activeBackdrop = {
      el: backdropEl,
      handleKeyDown,
      onClose,
    };

    return {
      close: () => this.close(),
      el: backdropEl,
    };
  },

  /**
   * Ferme la modale active.
   */
  close() {
    if (!activeBackdrop) return;

    const { el, handleKeyDown, onClose } = activeBackdrop;
    document.removeEventListener('keydown', handleKeyDown);

    el.classList.remove('is-open');
    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
      document.body.style.overflow = '';
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus();
      }
      if (typeof onClose === 'function') {
        onClose();
      }
    }, 200);

    activeBackdrop = null;
  },

  /**
   * Dialogue de confirmation asynchrone (retourne une Promise<boolean>).
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.message
   * @param {string} [options.confirmText='Confirmer']
   * @param {string} [options.cancelText='Annuler']
   * @param {boolean} [options.isDanger=false]
   * @returns {Promise<boolean>}
   */
  confirm({
    title,
    message,
    confirmText = 'Confirmer',
    cancelText = 'Annuler',
    isDanger = false,
  }) {
    return new Promise((resolve) => {
      const cancelBtn = h(
        'button',
        {
          type: 'button',
          className: 'btn btn-secondary',
          onClick: () => {
            modal.close();
            resolve(false);
          },
        },
        cancelText
      );

      const confirmBtn = h(
        'button',
        {
          type: 'button',
          className: `btn ${isDanger ? 'btn-danger' : 'btn-primary'}`,
          onClick: () => {
            modal.close();
            resolve(true);
          },
        },
        confirmText
      );

      modal.open({
        title,
        content: h('p', { style: 'color: var(--text-secondary); line-height: 1.5;' }, message),
        footer: [cancelBtn, confirmBtn],
        onClose: () => resolve(false),
      });
    });
  },
};

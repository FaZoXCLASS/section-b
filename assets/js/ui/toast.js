// ==============================================================================
// GÉNIE CIVIL SECTION B — TOAST NOTIFICATIONS (toast.js)
// ==============================================================================

import { h, icon } from '../utils.js';

let container = null;

function ensureContainer() {
  if (!container || !document.body.contains(container)) {
    container = document.getElementById('toast-container');
    if (!container) {
      container = h('div', { id: 'toast-container', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(container);
    }
  }
  return container;
}

export const toast = {
  /**
   * Affiche une notification toast.
   * @param {string} message Message à afficher
   * @param {'info'|'success'|'warning'|'error'} [type='info'] Type de toast
   * @param {number} [duration=4000] Durée en millisecondes
   */
  show(message, type = 'info', duration = 4000) {
    const parent = ensureContainer();

    const iconMap = {
      success: 'check',
      error: 'x',
      warning: 'shield',
      info: 'fileText',
    };

    const iconName = iconMap[type] || 'fileText';
    const toastEl = h(
      'div',
      { className: `toast toast-${type}` },
      [
        icon(iconName, 'toast-status-icon'),
        h('span', { className: 'toast-message' }, message),
      ]
    );

    parent.appendChild(toastEl);

    // Auto-suppression après durée
    setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(-10px)';
      toastEl.style.transition = 'all 200ms ease';
      setTimeout(() => {
        if (toastEl.parentNode) {
          toastEl.parentNode.removeChild(toastEl);
        }
      }, 200);
    }, duration);
  },

  success(msg, duration = 4000) {
    this.show(msg, 'success', duration);
  },

  error(msg, duration = 5000) {
    this.show(msg, 'error', duration);
  },

  warning(msg, duration = 4500) {
    this.show(msg, 'warning', duration);
  },

  info(msg, duration = 4000) {
    this.show(msg, 'info', duration);
  },
};

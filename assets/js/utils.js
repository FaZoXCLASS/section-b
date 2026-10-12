// ==============================================================================
// GÉNIE CIVIL SECTION B — UTILITAIRES & AIDES DOM (utils.js)
// ==============================================================================

/**
 * Sécurisation XSS : Échappe les caractères HTML dangereux.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Créateur d'éléments DOM sécurisé contre XSS.
 * Évite d'insérer des chaînes brutes dans innerHTML.
 * @param {string} tag Nom de la balise
 * @param {Object} [props={}] Attributs et gestionnaires d'événements
 * @param {(HTMLElement|string|Array)[]} [children=[]] Enfants (éléments ou chaînes de texte)
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, children = []) {
  const element = document.createElement(tag);

  for (const [key, val] of Object.entries(props)) {
    if (val === undefined || val === null) continue;

    if (key.startsWith('on') && typeof val === 'function') {
      const eventName = key.slice(2).toLowerCase();
      element.addEventListener(eventName, val);
    } else if (key === 'className' || key === 'class') {
      element.className = val;
    } else if (key === 'dataset' && typeof val === 'object') {
      Object.assign(element.dataset, val);
    } else if (key === 'style' && typeof val === 'object') {
      Object.assign(element.style, val);
    } else if (typeof val === 'boolean') {
      if (val) element.setAttribute(key, '');
    } else {
      element.setAttribute(key, String(val));
    }
  }

  const appendChildSafe = (child) => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(appendChildSafe);
    } else if (child instanceof Node) {
      element.appendChild(child);
    } else {
      element.appendChild(document.createTextNode(String(child)));
    }
  };

  if (Array.isArray(children)) {
    children.forEach(appendChildSafe);
  } else {
    appendChildSafe(children);
  }

  return element;
}

/**
 * Formate une taille en octets vers une chaîne lisible (Ko, Mo, Go) en fr-FR.
 * @param {number|bigint} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  const num = Number(bytes);
  if (isNaN(num) || num <= 0) return '0 Ko';

  const units = ['octets', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  const val = num / Math.pow(1024, i);

  if (i === 0) return `${num} octets`;
  return `${val.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} ${units[i]}`;
}

/**
 * Formate une date relative ("Il y a 5 min", "Hier", etc.) et absolue en français.
 * @param {string|Date} dateInput
 * @returns {{ relative: string, absolute: string }}
 */
export function formatDate(dateInput) {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    return { relative: 'Date inconnue', absolute: '' };
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  const absoluteFormatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const absolute = absoluteFormatter.format(date);

  let relative = '';
  if (diffSec < 60) {
    relative = "À l'instant";
  } else if (diffMin < 60) {
    relative = `Il y a ${diffMin} min`;
  } else if (diffHours < 24) {
    relative = `Il y a ${diffHours} h`;
  } else if (diffDays === 1) {
    relative = 'Hier';
  } else if (diffDays < 7) {
    relative = `Il y a ${diffDays} jours`;
  } else {
    relative = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(date);
  }

  return { relative, absolute };
}

/**
 * Pluralisation correcte en langue française.
 * En français, 0 et 1 prennent le singulier, à partir de 2 prend le pluriel.
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]
 * @returns {string}
 */
export function formatPlural(count, singular, plural = `${singular}s`) {
  const n = Number(count) || 0;
  return `${n} ${n > 1 ? plural : singular}`;
}

/**
 * Calcule le délai restant avant expiration d'une publication temporaire.
 * @param {string|Date} expiresAt
 * @returns {{ text: string, isUrgent: boolean, isExpired: boolean }}
 */
export function formatExpiry(expiresAt) {
  if (!expiresAt) return { text: '', isUrgent: false, isExpired: false };
  const expDate = new Date(expiresAt);
  const diffMs = expDate.getTime() - Date.now();

  if (diffMs <= 0) {
    return { text: 'Expiré', isUrgent: true, isExpired: true };
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 1) {
    return { text: `expire dans ${diffDays} jours`, isUrgent: false, isExpired: false };
  } else if (diffDays === 1) {
    return { text: 'expire demain', isUrgent: true, isExpired: false };
  } else if (diffHours >= 1) {
    return { text: `expire aujourd'hui (${diffHours} h)`, isUrgent: true, isExpired: false };
  } else {
    const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return { text: `expire dans ${diffMins} min`, isUrgent: true, isExpired: false };
  }
}

/**
 * Génère des icônes SVG légères et nettes.
 * @param {string} name
 * @param {string} [className='']
 * @returns {SVGElement}
 */
export function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `svg-icon ${className}`.trim());

  const icons = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    externalLink: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
    chevronRight: '<polyline points="9 18 15 12 9 6"/>',
    bookOpen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
  };

  svg.innerHTML = icons[name] || icons.fileText;
  return svg;
}

// ==============================================================================
// GÉNIE CIVIL SECTION B — ROUTEUR CLIENT HASH-BASED (router.js)
// ==============================================================================

export class Router {
  constructor() {
    /** @type {Array<{ pattern: RegExp, paramNames: string[], handler: Function }>} */
    this.routes = [];
    /** @type {Function|null} */
    this.notFoundHandler = null;
    /** @type {Function|null} */
    this.beforeEachHook = null;
    /** @type {Function|null} */
    this.afterEachHook = null;
    this.currentPath = '';
  }

  /**
   * Enregistre un filtre de garde exécuté avant chaque transition de route.
   * @param {Function} hook (toPath: string) => Promise<boolean|string>
   */
  beforeEach(hook) {
    this.beforeEachHook = hook;
  }

  /**
   * Enregistre une fonction exécutée après chaque rendu de route.
   * @param {Function} hook (path: string) => void
   */
  afterEach(hook) {
    this.afterEachHook = hook;
  }

  /**
   * Enregistre une route avec gestion des paramètres nommés (ex: '/cours/:moduleId').
   * @param {string} path Chemin de la route
   * @param {Function} handler (params: Object) => Promise<void>|void
   */
  add(path, handler) {
    const paramNames = [];
    const normalized = path.replace(/^\/?#?\/?/, '');

    // Conversion du chemin en expression régulière
    const regexStr = '^' + normalized
      .replace(/:([a-zA-Z0-9_]+)/g, (_, paramName) => {
        paramNames.push(paramName);
        return '([^/]+)';
      }) + '$';

    this.routes.push({
      pattern: new RegExp(regexStr),
      paramNames,
      handler,
    });
  }

  /**
   * Gestionnaire pour les routes inexistantes (404).
   * @param {Function} handler
   */
  notFound(handler) {
    this.notFoundHandler = handler;
  }

  /**
   * Navigue programmatiquement vers un chemin de hash.
   * @param {string} path
   */
  navigate(path) {
    const cleanPath = path.startsWith('#') ? path : `#${path.startsWith('/') ? '' : '/'}${path}`;
    window.location.hash = cleanPath;
  }

  /**
   * Résout et exécute la route correspondant au hash actuel.
   */
  async resolve() {
    const rawHash = window.location.hash || '#/';
    const cleanPath = rawHash.replace(/^#\/?/, '').split('?')[0] || '';

    // Exécution du garde de navigation si défini
    if (this.beforeEachHook) {
      const guardResult = await this.beforeEachHook(cleanPath);
      if (guardResult === false) {
        return; // Navigation interrompue
      }
      if (typeof guardResult === 'string' && guardResult !== cleanPath) {
        this.navigate(guardResult);
        return;
      }
    }

    this.currentPath = cleanPath;

    for (const route of this.routes) {
      const match = cleanPath.match(route.pattern);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, idx) => {
          params[name] = decodeURIComponent(match[idx + 1]);
        });

        try {
          await route.handler(params);
        } catch (err) {
          console.error('[Router] Erreur lors de l\'exécution de la route:', err);
        }

        if (this.afterEachHook) {
          this.afterEachHook(cleanPath);
        }
        return;
      }
    }

    // Aucune route correspondante trouvée -> 404
    if (this.notFoundHandler) {
      await this.notFoundHandler(cleanPath);
      if (this.afterEachHook) {
        this.afterEachHook(cleanPath);
      }
    }
  }

  /**
   * Démarre l'écouteur d'événements hashchange.
   */
  start() {
    window.addEventListener('hashchange', () => this.resolve());
    // Résolution initiale au chargement
    this.resolve();
  }
}

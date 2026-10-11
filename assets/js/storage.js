// ==============================================================================
// GÉNIE CIVIL SECTION B — ADAPTATEUR DE STOCKAGE (storage.js)
// ==============================================================================
// Abstraction permettant de basculer ou d'ajouter ultérieurement un second volume
// de stockage gratuit (deuxième projet Supabase ou Backblaze B2) sans retoucher
// au reste de l'application ni migrer les fichiers existants.
// ==============================================================================

import { CONFIG } from '../../config.js';

class SupabaseStorageAdapter {
  constructor(baseUrl, bucketName) {
    this.baseUrl = baseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    this.bucketName = bucketName;
  }

  /**
   * Retourne l'URL publique directe du fichier pour affichage via le CDN.
   * @param {string} storagePath
   * @returns {string}
   */
  getPublicUrl(storagePath) {
    if (!storagePath) return '';
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }
    const cleanPath = storagePath.replace(/^\/+/, '');
    return `${this.baseUrl}/storage/v1/object/public/${this.bucketName}/${cleanPath}`;
  }

  /**
   * Téléverse un Blob/Fichier vers une URL signée avec suivi de progression en temps réel.
   * Utilise XMLHttpRequest pour une compatibilité totale de l'événement onprogress sur Safari iOS & Android.
   * @param {string} uploadUrl URL signée de téléversement
   * @param {Blob|File} data Données binaires du fichier
   * @param {string} mime Type MIME du fichier
   * @param {Function} [onProgress] Callback (loaded: number, total: number) => void
   * @returns {Promise<void>}
   */
  uploadWithProgress(uploadUrl, data, mime, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', mime || 'application/octet-stream');
      // Cache immuable long terme pour économiser la bande passante du forfait gratuit
      xhr.setRequestHeader('Cache-Control', 'max-age=31536000, immutable');

      if (xhr.upload && typeof onProgress === 'function') {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(e.loaded, e.total);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Échec du téléversement HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Erreur réseau lors de l\'envoi du fichier.'));
      };

      xhr.onabort = () => {
        reject(new Error('Téléversement interrompu.'));
      };

      xhr.send(data);
    });
  }
}

// Registre des volumes de stockage
const adapters = {
  primary: new SupabaseStorageAdapter(CONFIG.SUPABASE_URL, CONFIG.STORAGE_BUCKET),
};

export const storage = {
  /**
   * Enregistre un nouvel adaptateur de stockage pour l'extension multi-volume.
   * @param {string} volume Nom du volume (ex: 'volume2', 'backblaze')
   * @param {Object} adapter Instance implémentant getPublicUrl et uploadWithProgress
   */
  registerAdapter(volume, adapter) {
    adapters[volume] = adapter;
  },

  /**
   * Obtient l'URL publique de consultation d'un fichier.
   * @param {string} storagePath
   * @param {string} [volume='primary']
   * @returns {string}
   */
  getPublicUrl(storagePath, volume = 'primary') {
    const adapter = adapters[volume] || adapters.primary;
    return adapter.getPublicUrl(storagePath);
  },

  /**
   * Téléverse un fichier vers son stockage assigné.
   * @param {string} uploadUrl
   * @param {Blob|File} data
   * @param {string} mime
   * @param {Function} [onProgress]
   * @param {string} [volume='primary']
   * @returns {Promise<void>}
   */
  uploadFile(uploadUrl, data, mime, onProgress, volume = 'primary') {
    const adapter = adapters[volume] || adapters.primary;
    return adapter.uploadWithProgress(uploadUrl, data, mime, onProgress);
  },
};

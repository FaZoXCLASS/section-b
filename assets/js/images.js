// ==============================================================================
// GÉNIE CIVIL SECTION B — TRAITEMENT & COMPRESSION D'IMAGES (images.js)
// ==============================================================================

import { CONFIG } from '../../config.js';

/**
 * File d'attente à concurrence limitée (évite le crash mémoire sur smartphones).
 */
class ConcurrencyQueue {
  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.next();
    });
  }

  next() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
    this.running++;
    const { fn, resolve, reject } = this.queue.shift();

    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        this.running--;
        this.next();
      });
  }
}

const compressionQueue = new ConcurrencyQueue(CONFIG.IMAGE_CONCURRENCY || 2);

/**
 * Valide le type de fichier en analysant les premiers octets (magic bytes).
 * @param {File|Blob} file
 * @returns {Promise<'image'|'pdf'|null>}
 */
export async function sniffFileType(file) {
  try {
    const buffer = await file.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // PDF : %PDF- (0x25, 0x50, 0x44, 0x46)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return 'pdf';
    }

    // JPEG : 0xFF, 0xD8, 0xFF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image';
    }

    // PNG : 0x89, 0x50, 0x4E, 0x47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image';
    }

    // WEBP : RIFF .... WEBP
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      return 'image';
    }

    // Fallback MIME type déclaratif
    if (file.type.startsWith('image/')) return 'image';
    if (file.type === 'application/pdf') return 'pdf';

    return null;
  } catch {
    return null;
  }
}

/**
 * Redimensionne et compresse une image côté client avec respect de l'orientation EXIF.
 * Génère l'image haute définition optimisée ainsi qu'une vignette miniature (thumbnail).
 * @param {File} file
 * @returns {Promise<{
 *   fullBlob: Blob,
 *   fullWidth: number,
 *   fullHeight: number,
 *   thumbBlob: Blob,
 *   thumbWidth: number,
 *   thumbHeight: number,
 *   mime: string
 * }>}
 */
export function compressImageWithThumbnail(file) {
  return compressionQueue.run(async () => {
    // 1. Décodage de l'image avec respect de l'orientation EXIF
    let imageSource;
    let origWidth = 0;
    let origHeight = 0;

    if ('createImageBitmap' in window) {
      try {
        imageSource = await createImageBitmap(file, { imageOrientation: 'from-image' });
        origWidth = imageSource.width;
        origHeight = imageSource.height;
      } catch {
        // Fallback sur élément Image classique
        imageSource = await loadImageElement(file);
        origWidth = imageSource.naturalWidth || imageSource.width;
        origHeight = imageSource.naturalHeight || imageSource.height;
      }
    } else {
      imageSource = await loadImageElement(file);
      origWidth = imageSource.naturalWidth || imageSource.width;
      origHeight = imageSource.naturalHeight || imageSource.height;
    }

    // 2. Calcul des dimensions principales (lisibilité tableau: max 1800 px)
    const maxMainDim = CONFIG.MAX_IMAGE_DIMENSION || 1800;
    const { width: fullW, height: fullH } = calculateAspectRatioDimensions(origWidth, origHeight, maxMainDim);

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = fullW;
    fullCanvas.height = fullH;
    const fullCtx = fullCanvas.getContext('2d');
    fullCtx.imageSmoothingEnabled = true;
    fullCtx.imageSmoothingQuality = 'high';
    fullCtx.drawImage(imageSource, 0, 0, fullW, fullH);

    // 3. Calcul des dimensions de la miniature (vignette: max 480 px)
    const maxThumbDim = CONFIG.THUMB_DIMENSION || 480;
    const { width: thumbW, height: thumbH } = calculateAspectRatioDimensions(origWidth, origHeight, maxThumbDim);

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    const thumbCtx = thumbCanvas.getContext('2d');
    thumbCtx.imageSmoothingEnabled = true;
    thumbCtx.imageSmoothingQuality = 'high';
    thumbCtx.drawImage(imageSource, 0, 0, thumbW, thumbH);

    // Libérer la source si ImageBitmap
    if (typeof imageSource.close === 'function') {
      imageSource.close();
    }

    // 4. Encodage WebP avec repli sur JPEG si le navigateur ne supporte pas l'encodage WebP
    const quality = CONFIG.IMAGE_QUALITY || 0.80;
    let [fullBlob, thumbBlob] = await Promise.all([
      canvasToBlob(fullCanvas, 'image/webp', quality),
      canvasToBlob(thumbCanvas, 'image/webp', 0.75),
    ]);

    let finalMime = 'image/webp';
    if (!fullBlob || fullBlob.type !== 'image/webp') {
      // Re-tentative en JPEG si WebP non pris en charge
      [fullBlob, thumbBlob] = await Promise.all([
        canvasToBlob(fullCanvas, 'image/jpeg', quality),
        canvasToBlob(thumbCanvas, 'image/jpeg', 0.75),
      ]);
      finalMime = 'image/jpeg';
    }

    return {
      fullBlob,
      fullWidth: fullW,
      fullHeight: fullH,
      thumbBlob,
      thumbWidth: thumbW,
      thumbHeight: thumbH,
      mime: finalMime,
    };
  });
}

/**
 * Calcule les nouvelles dimensions en conservant strictement le ratio d'aspect.
 */
function calculateAspectRatioDimensions(srcW, srcH, maxDim) {
  if (srcW <= maxDim && srcH <= maxDim) {
    return { width: srcW, height: srcH };
  }
  if (srcW > srcH) {
    return {
      width: maxDim,
      height: Math.max(1, Math.round((srcH * maxDim) / srcW)),
    };
  }
  return {
    width: Math.max(1, Math.round((srcW * maxDim) / srcH)),
    height: maxDim,
  };
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

// ==============================================================================
// GÉNIE CIVIL SECTION B — VISIONNEUSE D'IMAGES LIGHTBOX (lightbox.js)
// ==============================================================================

class Lightbox {
  constructor() {
    this.overlay = null;
    this.viewport = null;
    this.img = null;
    this.counter = null;
    this.closeBtn = null;
    this.prevBtn = null;
    this.nextBtn = null;

    this.images = [];
    this.currentIndex = 0;
    this.isZoomed = false;
    this.previousFocus = null;

    // Gestes tactiles mobiles (swipe & swipe down)
    this.touchStartX = 0;
    this.touchStartY = 0;

    this.initDOM();
  }

  initDOM() {
    this.overlay = document.getElementById('lightbox-overlay');
    if (!this.overlay) return;

    this.viewport = document.getElementById('lightbox-viewport');
    this.img = document.getElementById('lightbox-img');
    this.counter = document.getElementById('lightbox-counter');
    this.closeBtn = document.getElementById('lightbox-close-btn');
    this.prevBtn = document.getElementById('lightbox-prev-btn');
    this.nextBtn = document.getElementById('lightbox-next-btn');

    if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());
    if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prev());
    if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.next());

    // Clic sur l'arrière-plan pour fermer
    this.viewport.addEventListener('click', (e) => {
      if (e.target === this.viewport) {
        this.close();
      }
    });

    // Zoom au double-clic ou clic sur l'image
    this.img.addEventListener('click', () => this.toggleZoom());

    // Navigation clavier
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowLeft') this.prev();
      else if (e.key === 'ArrowRight') this.next();
    });

    // Écouteurs de gestes tactiles mobiles
    this.viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    this.viewport.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) {
        const diffX = e.changedTouches[0].clientX - this.touchStartX;
        const diffY = e.changedTouches[0].clientY - this.touchStartY;

        // Glissement horizontal (Swipe gauche/droite pour changer d'image)
        if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX > 0) this.prev();
          else this.next();
        }
        // Glissement vertical vers le bas (Swipe down pour fermer)
        else if (diffY > 80 && Math.abs(diffY) > Math.abs(diffX)) {
          this.close();
        }
      }
    }, { passive: true });
  }

  isOpen() {
    return this.overlay && this.overlay.classList.contains('is-open');
  }

  /**
   * Ouvre la visionneuse sur une liste d'images.
   * @param {Array<{ url: string, alt?: string }>} images
   * @param {number} [startIndex=0]
   */
  open(images, startIndex = 0) {
    if (!this.overlay || !images || images.length === 0) return;

    this.previousFocus = document.activeElement;
    this.images = images;
    this.currentIndex = Math.max(0, Math.min(startIndex, images.length - 1));
    this.isZoomed = false;

    this.overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    this.renderCurrent();
    if (this.closeBtn) this.closeBtn.focus();
  }

  renderCurrent() {
    const current = this.images[this.currentIndex];
    if (!current) return;

    this.isZoomed = false;
    this.img.style.transform = 'scale(1)';
    this.img.style.cursor = 'zoom-in';

    this.img.src = current.url;
    this.img.alt = current.alt || `Photo ${this.currentIndex + 1}`;

    if (this.counter) {
      this.counter.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
    }

    if (this.prevBtn) {
      this.prevBtn.style.display = this.images.length > 1 ? 'flex' : 'none';
    }
    if (this.nextBtn) {
      this.nextBtn.style.display = this.images.length > 1 ? 'flex' : 'none';
    }

    // Préchargement de l'image suivante pour fluidité
    if (this.currentIndex + 1 < this.images.length) {
      const preloadImg = new Image();
      preloadImg.src = this.images[this.currentIndex + 1].url;
    }
  }

  next() {
    if (this.images.length <= 1) return;
    this.currentIndex = (this.currentIndex + 1) % this.images.length;
    this.renderCurrent();
  }

  prev() {
    if (this.images.length <= 1) return;
    this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
    this.renderCurrent();
  }

  toggleZoom() {
    this.isZoomed = !this.isZoomed;
    if (this.isZoomed) {
      this.img.style.transform = 'scale(2)';
      this.img.style.cursor = 'zoom-out';
    } else {
      this.img.style.transform = 'scale(1)';
      this.img.style.cursor = 'zoom-in';
    }
  }

  close() {
    if (!this.overlay) return;
    this.overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    this.isZoomed = false;
    this.img.style.transform = 'scale(1)';

    if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
      this.previousFocus.focus();
    }
  }
}

export const lightbox = new Lightbox();

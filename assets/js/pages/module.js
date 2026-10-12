// ==============================================================================
// GÉNIE CIVIL SECTION B — PAGE MODULE & FLUX DE PUBLICATIONS (module.js)
// ==============================================================================

import { api } from '../api.js';
import { session } from '../session.js';
import { storage } from '../storage.js';
import { h, icon, formatDate, formatBytes, formatExpiry } from '../utils.js';
import { skeleton } from '../ui/skeleton.js';
import { lightbox } from '../ui/lightbox.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { openCreatePostModal } from '../ui/postModal.js';

export async function renderModule(categoryKey, moduleId) {
  const mainView = document.getElementById('main-view');
  if (!mainView) return;

  mainView.innerHTML = '';
  mainView.appendChild(skeleton.postList(3));

  const token = session.getDeviceToken();

  // 1. Récupération des informations du module
  let currentModule = null;
  try {
    const modules = await api.listModules(token);
    currentModule = modules.find((m) => m.id === moduleId);
  } catch (err) {
    console.error('[Module] Erreur chargement module:', err);
  }

  if (!currentModule) {
    mainView.innerHTML = '';
    mainView.appendChild(h('div', { className: 'empty-state animate-fade' }, [
      icon('folder', 'empty-icon'),
      h('h2', {}, 'Matière introuvable'),
      h('p', {}, 'Ce module n\'existe pas ou a été archivé.'),
      h('a', { href: `#/${categoryKey}`, className: 'btn btn-primary btn-sm' }, 'Retour aux matières'),
    ]));
    return;
  }

  // 2. Récupération des 12 premières publications
  let posts = [];
  try {
    posts = await api.listPosts(token, moduleId, 12);
  } catch (err) {
    console.error('[Module] Erreur chargement publications:', err);
  }

  mainView.innerHTML = '';

  const catNames = { cours: 'Cours', td: 'TD', tp: 'TP' };
  const catLabel = catNames[categoryKey] || 'Cours';

  // Fil d'Ariane
  const breadcrumb = h('nav', { className: 'breadcrumb' }, [
    h('a', { href: '#/' }, 'Accueil'),
    icon('chevronRight'),
    h('a', { href: `#/${categoryKey}` }, catLabel),
    icon('chevronRight'),
    h('span', {}, currentModule.name),
  ]);

  // Bouton d'action Publier
  const publishBtn = h(
    'button',
    {
      type: 'button',
      className: 'btn btn-primary',
      onClick: () => {
        openCreatePostModal({
          preselectedModuleId: moduleId,
          preselectedCategory: categoryKey,
          onPostCreated: () => {
            // Recharger le flux pour afficher le nouveau post en tête
            renderModule(categoryKey, moduleId);
          },
        });
      },
    },
    [icon('plus'), h('span', {}, 'Publier une leçon')]
  );

  // En-tête / Hero du module
  const hero = h('div', { className: 'module-hero animate-fade' }, [
    h('div', {}, [
      breadcrumb,
      h('h1', { style: 'margin: 4px 0 6px;' }, currentModule.name),
      currentModule.teacher ? h('div', { className: 'module-teacher' }, [
        icon('bookOpen'),
        h('span', {}, `Enseignant(e) : ${currentModule.teacher}`),
      ]) : null,
    ]),
    publishBtn,
  ]);

  mainView.appendChild(hero);

  // Flux de publications
  const feedContainer = h('div', { className: 'posts-feed' });
  mainView.appendChild(feedContainer);

  if (posts.length === 0) {
    const emptyState = h('div', { className: 'empty-state animate-fade' }, [
      icon('fileText', 'empty-icon'),
      h('h3', {}, 'Aucune publication pour l\'instant'),
      h('p', {}, 'Sois le premier à partager une photo de cours ou un polycopié pour tes camarades !'),
      h('button', {
        type: 'button',
        className: 'btn btn-primary btn-sm',
        onClick: () => publishBtn.click(),
      }, 'Partager ma première fiche'),
    ]);
    feedContainer.appendChild(emptyState);
    return;
  }

  posts.forEach((post) => {
    feedContainer.appendChild(renderPostCard(post, token, () => {
      renderModule(categoryKey, moduleId);
    }));
  });

  // Bouton "Charger plus" si le lot comporte 12 publications
  if (posts.length >= 12) {
    const loadMoreBtn = h('button', {
      type: 'button',
      className: 'btn btn-secondary',
      style: 'margin: 24px auto 0; display: block;',
      onClick: async () => {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Chargement...';

        const lastPost = posts[posts.length - 1];
        try {
          const olderPosts = await api.listPosts(token, moduleId, 12, lastPost.created_at);
          if (olderPosts.length > 0) {
            olderPosts.forEach((op) => {
              posts.push(op);
              feedContainer.appendChild(renderPostCard(op, token, () => renderModule(categoryKey, moduleId)));
            });
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'Charger plus';
          } else {
            loadMoreBtn.remove();
            toast.info('Toutes les publications ont été chargées.');
          }
        } catch {
          toast.error('Erreur lors du chargement des publications précédentes.');
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = 'Charger plus';
        }
      },
    }, 'Charger plus');

    mainView.appendChild(loadMoreBtn);
  }
}

/**
 * Construit le composant visuel d'une publication.
 */
function renderPostCard(post, token, onDeleted) {
  const authorInitial = (post.author_pseudo || post.author_label || '?').charAt(0).toUpperCase();
  const dateFormatted = formatDate(post.created_at);

  const authorAvatar = h('div', { className: 'avatar-initial' }, authorInitial);

  // Badge d'expiration pour les publications temporaires
  let expiryBadge = null;
  if (post.expires_at) {
    const expInfo = formatExpiry(post.expires_at);
    expiryBadge = h('span', {
      className: 'badge-temporary',
      title: `Suppression automatique le ${formatDate(post.expires_at).absolute}`,
    }, [
      icon('hourglass', 'svg-icon'),
      h('span', {}, `Temporaire · ${expInfo.text}`),
    ]);
  }

  const authorDetails = h('div', {}, [
    h('div', { style: 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;' }, [
      h('span', { className: 'post-author-name' }, post.author_pseudo || post.author_label || 'Anonyme'),
      post.is_admin_post ? h('span', { className: 'badge badge-cours' }, 'Admin') : null,
      expiryBadge,
    ]),
    h('time', {
      className: 'post-date',
      dateTime: post.created_at,
      title: dateFormatted.absolute,
    }, dateFormatted.relative),
  ]);

  const authorBox = h('div', { className: 'post-author-box' }, [authorAvatar, authorDetails]);

  // Bouton Supprimer (affiché uniquement sur ses propres posts ou pour l'administrateur)
  let deleteBtn = null;
  if (post.is_mine) {
    deleteBtn = h('button', {
      type: 'button',
      className: 'btn btn-ghost btn-sm',
      style: 'color: var(--status-danger); padding: 4px 8px;',
      'aria-label': 'Supprimer cette publication',
      title: 'Supprimer',
      onClick: async () => {
        const confirmed = await modal.confirm({
          title: 'Supprimer cette publication ?',
          message: 'Cette publication et tous ses fichiers attachés seront définitivement supprimés pour toute la section. Continuer ?',
          confirmText: 'Supprimer',
          cancelText: 'Annuler',
          isDanger: true,
        });

        if (confirmed) {
          try {
            await api.deletePost(token, post.id);
            toast.success('Publication supprimée.');
            window.dispatchEvent(new CustomEvent('app:post-deleted', { detail: { postId: post.id } }));
            if (typeof onDeleted === 'function') onDeleted();
          } catch (err) {
            toast.error(err.message || 'Impossible de supprimer cette publication.');
          }
        }
      },
    }, [icon('trash'), h('span', { style: 'font-size: 11px;' }, 'Supprimer')]);
  }

  const header = h('div', { className: 'post-header' }, [authorBox, deleteBtn]);

  // Message de la publication
  const messageEl = h('div', { className: 'post-message' }, post.message);

  // Fichiers attachés (séparation Images / PDFs)
  const files = post.files || [];
  const imageFiles = files.filter((f) => f.kind === 'image');
  const pdfFiles = files.filter((f) => f.kind === 'pdf');

  // Galerie d'images
  let galleryEl = null;
  if (imageFiles.length > 0) {
    galleryEl = h('div', { className: 'image-gallery-grid' });

    // Préparation de la liste complète pour la Lightbox
    const fullImagesList = imageFiles.map((img) => ({
      url: storage.getPublicUrl(img.storage_path, img.volume),
      alt: img.original_name,
    }));

    imageFiles.forEach((imgFile, imgIndex) => {
      // Vignette optimisée si disponible, sinon image principale
      const thumbUrl = imgFile.thumb_path
        ? storage.getPublicUrl(imgFile.thumb_path, imgFile.volume)
        : storage.getPublicUrl(imgFile.storage_path, imgFile.volume);

      const imgEl = h('img', {
        src: thumbUrl,
        alt: imgFile.original_name,
        loading: 'lazy',
        decoding: 'async',
        width: imgFile.width || 480,
        height: imgFile.height || 360,
      });

      const wrap = h('div', {
        className: 'gallery-thumbnail-wrap',
        title: `${imgFile.original_name} (cliquer pour agrandir)`,
        onClick: () => {
          lightbox.open(fullImagesList, imgIndex);
        },
      }, imgEl);

      galleryEl.appendChild(wrap);
    });
  }

  // Liste des fichiers PDF
  let pdfListEl = null;
  if (pdfFiles.length > 0) {
    pdfListEl = h('div', { className: 'pdf-files-list' });

    pdfFiles.forEach((pdfFile) => {
      const pdfUrl = storage.getPublicUrl(pdfFile.storage_path, pdfFile.volume);

      const pdfCard = h('div', { className: 'pdf-card' }, [
        h('div', { className: 'pdf-meta' }, [
          h('div', { style: 'color: var(--status-info); flex-shrink: 0;' }, icon('fileText')),
          h('div', { style: 'min-width: 0;' }, [
            h('div', { className: 'pdf-name', title: pdfFile.original_name }, pdfFile.original_name),
            h('div', { className: 'pdf-size' }, formatBytes(pdfFile.size_bytes)),
          ]),
        ]),
        h('div', { style: 'display: flex; gap: 8px; flex-shrink: 0;' }, [
          h('a', {
            href: pdfUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'btn btn-secondary btn-sm',
            title: 'Ouvrir dans un nouvel onglet',
          }, [icon('externalLink'), h('span', {}, 'Ouvrir')]),
          h('a', {
            href: pdfUrl,
            download: pdfFile.original_name,
            className: 'btn btn-ghost btn-sm',
            title: 'Télécharger le PDF',
          }, icon('download')),
        ]),
      ]);

      pdfListEl.appendChild(pdfCard);
    });
  }

  const card = h('article', { className: 'post-card animate-fade' }, [
    header,
    messageEl,
    galleryEl,
    pdfListEl,
  ]);

  return card;
}

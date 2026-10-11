// ==============================================================================
// GÉNIE CIVIL SECTION B — MODALE DE CRÉATION DE PUBLICATION (postModal.js)
// ==============================================================================

import { CONFIG } from '../../../config.js';
import { api } from '../api.js';
import { session } from '../session.js';
import { storage } from '../storage.js';
import { compressImageWithThumbnail, sniffFileType } from '../images.js';
import { h, icon, formatBytes } from '../utils.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

/**
 * Ouvre la modale de création d'une publication avec téléversement et compression.
 * @param {Object} options
 * @param {string} [options.preselectedModuleId]
 * @param {string} [options.preselectedCategory]
 * @param {Function} [options.onPostCreated] Callback après publication
 */
export async function openCreatePostModal({
  preselectedModuleId = '',
  preselectedCategory = 'cours',
  onPostCreated,
} = {}) {
  const token = session.getDeviceToken();

  // Chargement des modules disponibles
  let modulesList = [];
  try {
    modulesList = await api.listModules(token);
  } catch (err) {
    toast.error('Impossible de charger la liste des modules.');
    return;
  }

  if (modulesList.length === 0) {
    toast.warning('Aucun module disponible pour publier.');
    return;
  }

  let selectedCategory = preselectedCategory || 'cours';
  let selectedModuleId = preselectedModuleId || '';

  // Sélection par défaut du premier module de la catégorie si aucun spécifié
  if (!selectedModuleId) {
    const firstMod = modulesList.find((m) => m.category === selectedCategory);
    if (firstMod) selectedModuleId = firstMod.id;
  } else {
    const mod = modulesList.find((m) => m.id === selectedModuleId);
    if (mod) selectedCategory = mod.category;
  }

  // État local des fichiers sélectionnés
  let selectedFiles = []; // { id, file, kind, name, size, previewUrl }
  let isSubmitting = false;

  // Éléments du formulaire
  const categorySelect = h('select', { className: 'select' }, [
    h('option', { value: 'cours' }, 'Cours'),
    h('option', { value: 'td' }, 'Travaux Dirigés (TD)'),
    h('option', { value: 'tp' }, 'Travaux Pratiques (TP)'),
  ]);
  categorySelect.value = selectedCategory;

  const moduleSelect = h('select', { className: 'select', required: true });

  function populateModules(cat) {
    moduleSelect.innerHTML = '';
    const filtered = modulesList.filter((m) => m.category === cat && !m.is_archived);
    filtered.forEach((m) => {
      const opt = h('option', { value: m.id }, m.teacher ? `${m.name} (${m.teacher})` : m.name);
      moduleSelect.appendChild(opt);
    });
    if (filtered.some((m) => m.id === selectedModuleId)) {
      moduleSelect.value = selectedModuleId;
    } else if (filtered.length > 0) {
      selectedModuleId = filtered[0].id;
      moduleSelect.value = selectedModuleId;
    }
  }

  categorySelect.addEventListener('change', () => {
    selectedCategory = categorySelect.value;
    populateModules(selectedCategory);
  });

  moduleSelect.addEventListener('change', () => {
    selectedModuleId = moduleSelect.value;
  });

  populateModules(selectedCategory);

  // Message & Compteur de caractères
  const charCounter = h('span', { style: 'font-size: var(--text-xs); color: var(--text-muted); align-self: flex-end;' }, '0 / 2000');
  const messageInput = h('textarea', {
    className: 'textarea',
    placeholder: 'Ex : Cours du dimanche, chapitre 2 — page 14 à 20 (Théorie des poutres)',
    maxLength: 2000,
    required: true,
  });

  messageInput.addEventListener('input', () => {
    charCounter.textContent = `${messageInput.value.length} / 2000`;
  });

  // Zone de fichiers
  const fileInput = h('input', {
    type: 'file',
    multiple: true,
    accept: 'image/*,application/pdf',
    style: 'display:none;',
  });

  const dropzone = h('div', { className: 'file-dropzone' }, [
    icon('image', 'svg-icon'),
    h('p', { style: 'margin: 8px 0 4px; font-weight: 500; color: var(--text-primary);' },
      'Glisse tes photos ou PDF ici, ou clique pour parcourir'
    ),
    h('span', { style: 'font-size: var(--text-xs); color: var(--text-muted);' },
      'Photos de tableau, polycopiés, fiches de révision (max 30 fichiers)'
    ),
  ]);

  dropzone.addEventListener('click', () => fileInput.click());

  // Glisser-déposer sur desktop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-active');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-active');
    if (e.dataTransfer?.files) {
      handleFilesSelected(Array.from(e.dataTransfer.files));
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files) {
      handleFilesSelected(Array.from(fileInput.files));
      fileInput.value = '';
    }
  });

  // Conteneur de prévisualisation des fichiers
  const previewList = h('div', {
    style: 'display:flex; flex-direction:column; gap:8px; margin-top:12px; max-height:220px; overflow-y:auto;',
  });

  function renderPreviews() {
    previewList.innerHTML = '';
    selectedFiles.forEach((item, index) => {
      const isImg = item.kind === 'image';

      const thumb = isImg
        ? h('img', {
            src: item.previewUrl,
            alt: item.name,
            style: 'width:42px; height:42px; object-fit:cover; border-radius:6px; flex-shrink:0;',
          })
        : h('div', {
            style: 'width:42px; height:42px; border-radius:6px; background:var(--status-info-tint); color:var(--status-info); display:flex; align-items:center; justify-content:center; flex-shrink:0;',
          }, icon('fileText'));

      const fileInfo = h('div', { style: 'flex:1; min-width:0;' }, [
        h('div', {
          style: 'font-size:var(--text-xs); font-weight:500; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;',
        }, item.name),
        h('span', { style: 'font-size:11px; color:var(--text-muted);' }, `${isImg ? 'Photo' : 'PDF'} • ${formatBytes(item.size)}`),
      ]);

      const removeBtn = h('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm',
        style: 'padding:4px; height:32px; width:32px;',
        title: 'Retirer ce fichier',
        onClick: () => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          selectedFiles.splice(index, 1);
          renderPreviews();
        },
      }, icon('x'));

      const row = h('div', {
        style: 'display:flex; align-items:center; gap:12px; padding:6px 10px; background:var(--bg-surface-2); border-radius:8px; border:1px solid var(--border-subtle);',
      }, [thumb, fileInfo, removeBtn]);

      previewList.appendChild(row);
    });
  }

  async function handleFilesSelected(newFiles) {
    const maxFiles = CONFIG.MAX_FILES_PER_POST || 30;
    if (selectedFiles.length + newFiles.length > maxFiles) {
      toast.warning(`Limite de ${maxFiles} fichiers par publication.`);
      newFiles = newFiles.slice(0, maxFiles - selectedFiles.length);
    }

    for (const f of newFiles) {
      const detectedKind = await sniffFileType(f);
      if (!detectedKind) {
        toast.warning(`Fichier ignoré (${f.name}) : seuls les images et PDF sont autorisés.`);
        continue;
      }

      selectedFiles.push({
        id: crypto.randomUUID(),
        file: f,
        kind: detectedKind,
        name: f.name,
        size: f.size,
        previewUrl: detectedKind === 'image' ? URL.createObjectURL(f) : null,
      });
    }

    renderPreviews();
  }

  // Barre de progression d'envoi
  const progressBox = h('div', { style: 'display:none; margin-top:16px;' });
  const progressLabel = h('div', { style: 'font-size:var(--text-xs); color:var(--text-secondary); margin-bottom:6px;' });
  const progressBarTrack = h('div', { className: 'progress-bar-track' });
  const progressBarFill = h('div', {
    style: 'height:100%; width:0%; background:var(--accent-gold); transition:width 150ms ease;',
  });
  progressBarTrack.appendChild(progressBarFill);
  progressBox.appendChild(progressLabel);
  progressBox.appendChild(progressBarTrack);

  // Pied de page : Boutons Annuler et Publier
  const cancelBtn = h('button', {
    type: 'button',
    className: 'btn btn-secondary',
    onClick: () => modal.close(),
  }, 'Annuler');

  const submitBtn = h('button', {
    type: 'button',
    className: 'btn btn-primary',
    onClick: async () => {
      if (isSubmitting) return;

      const messageVal = messageInput.value.trim();
      if (!messageVal) {
        toast.warning('Veuillez renseigner un message décrivant la leçon.');
        messageInput.focus();
        return;
      }
      if (!selectedModuleId) {
        toast.warning('Veuillez sélectionner un module.');
        return;
      }

      isSubmitting = true;
      submitBtn.disabled = true;
      cancelBtn.disabled = true;
      progressBox.style.display = 'block';

      const uploadedStoragePaths = [];

      try {
        // --- ÉTAPE 1 : Préparation & Compression des images côté client ---
        progressLabel.textContent = 'Optimisation des images (1/3)...';
        progressBarFill.style.width = '15%';

        const preparedFiles = [];
        for (let i = 0; i < selectedFiles.length; i++) {
          const item = selectedFiles[i];
          if (item.kind === 'image') {
            const comp = await compressImageWithThumbnail(item.file);
            preparedFiles.push({
              origItem: item,
              fullBlob: comp.fullBlob,
              fullWidth: comp.fullWidth,
              fullHeight: comp.fullHeight,
              thumbBlob: comp.thumbBlob,
              thumbWidth: comp.thumbWidth,
              thumbHeight: comp.thumbHeight,
              mime: comp.mime,
              hasThumb: true,
            });
          } else {
            // PDF
            preparedFiles.push({
              origItem: item,
              fullBlob: item.file,
              fullWidth: null,
              fullHeight: null,
              thumbBlob: null,
              thumbWidth: null,
              thumbHeight: null,
              mime: 'application/pdf',
              hasThumb: false,
            });
          }
        }

        // --- ÉTAPE 2 : Obtention des URLs signées auprès de l'Edge Function ---
        progressLabel.textContent = 'Autorisation des téléversements (2/3)...';
        progressBarFill.style.width = '35%';

        const signPayload = preparedFiles.map((p) => ({
          name: p.origItem.name,
          mime: p.mime,
          size: p.fullBlob.size + (p.thumbBlob ? p.thumbBlob.size : 0),
          kind: p.origItem.kind,
          hasThumb: p.hasThumb,
        }));

        let signedList = [];
        if (signPayload.length > 0) {
          signedList = await api.signUpload(token, signPayload);
        }

        // --- ÉTAPE 3 : Envoi des fichiers avec suivi de progression ---
        progressLabel.textContent = 'Téléversement des fichiers (3/3)...';

        const finalFilesMetadata = [];
        for (let i = 0; i < preparedFiles.length; i++) {
          const prep = preparedFiles[i];
          const signed = signedList[i];
          if (!signed) continue;

          // Téléversement du fichier principal
          await storage.uploadFile(signed.uploadUrl, prep.fullBlob, prep.mime, (loaded, total) => {
            const currentFilePct = total > 0 ? (loaded / total) : 1;
            const globalPct = 35 + Math.round(((i + currentFilePct) / preparedFiles.length) * 55);
            progressBarFill.style.width = `${globalPct}%`;
          });
          uploadedStoragePaths.push(signed.storagePath);

          // Téléversement de la vignette si présente
          if (prep.hasThumb && signed.thumbUploadUrl && prep.thumbBlob) {
            await storage.uploadFile(signed.thumbUploadUrl, prep.thumbBlob, 'image/webp');
            uploadedStoragePaths.push(signed.thumbPath);
          }

          finalFilesMetadata.push({
            kind: signed.kind,
            volume: 'primary',
            storage_path: signed.storagePath,
            thumb_path: signed.thumbPath || null,
            original_name: signed.originalName,
            mime: signed.mime,
            size_bytes: prep.fullBlob.size + (prep.thumbBlob ? prep.thumbBlob.size : 0),
            width: prep.fullWidth,
            height: prep.fullHeight,
            sort_order: i,
          });
        }

        progressBarFill.style.width = '95%';
        progressLabel.textContent = 'Enregistrement de la publication...';

        // --- ÉTAPE 4 : Création du post en base de données ---
        const createdPost = await api.createPost(token, selectedModuleId, messageVal, finalFilesMetadata);

        progressBarFill.style.width = '100%';
        toast.success('Publication partagée avec succès !');

        // Nettoyage des URLs d'aperçu
        selectedFiles.forEach((f) => {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        });

        modal.close();

        if (typeof onPostCreated === 'function') {
          onPostCreated(createdPost);
        }
      } catch (err) {
        console.error('[CreatePost] Erreur:', err);
        toast.error(err.message || 'Erreur lors de la création de la publication.');

        // Nettoyage des éventuels fichiers orphelins déjà envoyés
        if (uploadedStoragePaths.length > 0) {
          api.cancelUpload(token, uploadedStoragePaths);
        }

        isSubmitting = false;
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        progressBox.style.display = 'none';
      }
    },
  }, 'Publier');

  // Corps de la modale
  const modalContent = h('div', { style: 'display:flex; flex-direction:column; gap:16px;' }, [
    h('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:12px;' }, [
      h('div', { className: 'form-group', style: 'margin-bottom:0;' }, [
        h('label', { className: 'form-label' }, 'Catégorie'),
        categorySelect,
      ]),
      h('div', { className: 'form-group', style: 'margin-bottom:0;' }, [
        h('label', { className: 'form-label' }, 'Matière / Module'),
        moduleSelect,
      ]),
    ]),
    h('div', { className: 'form-group', style: 'margin-bottom:0;' }, [
      h('div', { style: 'display:flex; justify-content:space-between; align-items:center;' }, [
        h('label', { className: 'form-label' }, 'Message ou description de la leçon'),
        charCounter,
      ]),
      messageInput,
    ]),
    h('div', { className: 'form-group', style: 'margin-bottom:0;' }, [
      h('label', { className: 'form-label' }, 'Documents & Photos'),
      fileInput,
      dropzone,
      previewList,
    ]),
    progressBox,
  ]);

  modal.open({
    title: 'Nouvelle publication',
    content: modalContent,
    footer: [cancelBtn, submitBtn],
    onClose: () => {
      selectedFiles.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    },
  });
}

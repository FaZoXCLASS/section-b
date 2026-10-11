// ==============================================================================
// GÉNIE CIVIL SECTION B — TABLEAU DE BORD ADMINISTRATEUR (admin.js)
// ==============================================================================

import { CONFIG } from '../../../config.js';
import { api } from '../api.js';
import { session } from '../session.js';
import { router, updateHeader, updateBottomNav } from '../app.js';
import { h, icon, formatDate, formatBytes } from '../utils.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { openCreatePostModal } from '../ui/postModal.js';

let activeAdminTab = 'overview'; // 'overview', 'requests', 'members', 'modules', 'moderation', 'settings'

export async function renderAdmin() {
  const mainView = document.getElementById('main-view');
  if (!mainView) return;

  mainView.innerHTML = '';

  // 1. Si l'administrateur n'est pas encore connecté, afficher le formulaire de connexion
  if (!session.isAdmin) {
    renderAdminLoginForm(mainView);
    return;
  }

  // 2. Administrateur connecté : afficher le tableau de bord complet
  updateHeader(session.getState());
  updateBottomNav(session.getState());

  const container = h('div', { className: 'animate-fade' });

  // Barre d'outils supérieure admin
  const topToolbar = h('div', {
    style: 'display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin-bottom:var(--space-6); padding-bottom:var(--space-4); border-bottom:1px solid var(--border-subtle);',
  }, [
    h('div', {}, [
      h('div', { className: 'badge badge-cours', style: 'margin-bottom:4px;' }, 'Administration'),
      h('h1', { style: 'margin:0; font-size:var(--text-2xl);' }, 'Tableau de bord'),
    ]),
    h('div', { style: 'display:flex; align-items:center; gap:8px;' }, [
      h('button', {
        type: 'button',
        className: 'btn btn-primary btn-sm',
        onClick: () => {
          openCreatePostModal({
            onPostCreated: () => {
              toast.success('Publication administrateur enregistrée !');
              renderAdmin();
            },
          });
        },
      }, [icon('plus'), h('span', {}, 'Publier (Admin)')]),
      h('a', { href: '#/', className: 'btn btn-secondary btn-sm' }, 'Voir le site'),
      h('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm',
        style: 'color:var(--status-danger);',
        onClick: async () => {
          await api.adminLogout();
          session.isAdmin = false;
          session.adminUser = null;
          toast.info('Session administrateur déconnectée.');
          router.navigate('#/');
        },
      }, 'Déconnexion'),
    ]),
  ]);

  container.appendChild(topToolbar);

  // Onglets de navigation admin
  const tabsNav = h('div', { className: 'admin-header-tabs' });
  const tabs = [
    { key: 'overview', label: 'Vue d\'ensemble' },
    { key: 'requests', label: 'Demandes' },
    { key: 'members', label: 'Membres' },
    { key: 'modules', label: 'Matières & Modules' },
    { key: 'moderation', label: 'Modération' },
    { key: 'settings', label: 'Paramètres' },
  ];

  tabs.forEach((t) => {
    const btn = h('button', {
      type: 'button',
      className: `admin-tab-btn ${activeAdminTab === t.key ? 'active' : ''}`,
      onClick: () => {
        activeAdminTab = t.key;
        renderAdmin();
      },
    }, t.label);
    tabsNav.appendChild(btn);
  });

  container.appendChild(tabsNav);

  // Zone d'affichage du contenu de l'onglet actif
  const contentArea = h('div', { id: 'admin-tab-content' });
  container.appendChild(contentArea);
  mainView.appendChild(container);

  if (activeAdminTab === 'overview') {
    await renderOverviewTab(contentArea);
  } else if (activeAdminTab === 'requests') {
    await renderRequestsTab(contentArea);
  } else if (activeAdminTab === 'members') {
    await renderMembersTab(contentArea);
  } else if (activeAdminTab === 'modules') {
    await renderModulesTab(contentArea);
  } else if (activeAdminTab === 'moderation') {
    await renderModerationTab(contentArea);
  } else if (activeAdminTab === 'settings') {
    await renderSettingsTab(contentArea);
  }
}

// ==============================================================================
// FORMULAIRE DE CONNEXION ADMINISTRATEUR
// ==============================================================================
function renderAdminLoginForm(parent) {
  const card = h('div', { className: 'gate-card animate-fade', style: 'margin: 40px auto;' });

  const badge = h('div', { className: 'gate-badge-header' }, [
    icon('shield'),
    h('span', {}, 'Accès Réservé'),
  ]);

  const title = h('h1', { style: 'font-size: var(--text-2xl); margin-bottom: 8px;' }, 'Espace Administrateur');
  const subtitle = h('p', { style: 'margin-bottom: 24px;' },
    'Connecte-toi avec l\'adresse email et le mot de passe de ton compte administrateur Supabase.'
  );

  const emailInput = h('input', {
    type: 'email',
    className: 'input',
    placeholder: 'admin@section-b.univ',
    required: true,
    autocomplete: 'username',
  });

  const passwordInput = h('input', {
    type: 'password',
    className: 'input',
    placeholder: '••••••••••••',
    required: true,
    autocomplete: 'current-password',
  });

  const errorMsg = h('div', { className: 'form-error', style: 'display:none; margin-top:8px;' });

  const submitBtn = h('button', {
    type: 'submit',
    className: 'btn btn-primary btn-lg',
    style: 'width:100%; margin-top:16px;',
  }, 'Se connecter');

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Vérification...';

      try {
        await api.adminLogin(emailInput.value.trim(), passwordInput.value);
        await session.initSession();

        if (!session.isAdmin) {
          throw new Error('Ce compte utilisateur n\'a pas les privilèges administrateur.');
        }

        toast.success('Connexion administrateur réussie.');
        renderAdmin();
      } catch (err) {
        errorMsg.textContent = err.message || 'Identifiants incorrects.';
        errorMsg.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Se connecter';
      }
    },
  }, [
    h('div', { className: 'form-group' }, [
      h('label', { className: 'form-label' }, 'Email administrateur'),
      emailInput,
    ]),
    h('div', { className: 'form-group' }, [
      h('label', { className: 'form-label' }, 'Mot de passe'),
      passwordInput,
      errorMsg,
    ]),
    submitBtn,
  ]);

  card.appendChild(badge);
  card.appendChild(title);
  card.appendChild(subtitle);
  card.appendChild(form);

  parent.appendChild(card);
}

// ==============================================================================
// 1. ONGLET : VUE D'ENSEMBLE & JAUGE DE STOCKAGE
// ==============================================================================
async function renderOverviewTab(container) {
  let stats = null;
  try {
    stats = await api.getStorageStats();
  } catch (err) {
    console.error('[Admin] Erreur stats:', err);
  }

  const quota = stats?.quota_bytes || 1073741824;
  const used = stats?.used_bytes || 0;
  const imageBytes = stats?.image_bytes || 0;
  const pdfBytes = stats?.pdf_bytes || 0;
  const usagePct = stats?.usage_percent || 0;

  // Calcul du statut de couleur de la jauge
  let gaugeStatusColor = 'var(--accent-gold)';
  let gaugeBadge = 'Normal (< 70%)';
  let gaugeBadgeClass = 'badge-cours';

  if (usagePct >= 90) {
    gaugeStatusColor = 'var(--status-danger)';
    gaugeBadge = 'Critique (≥ 90%)';
    gaugeBadgeClass = 'badge-danger';
  } else if (usagePct >= 70) {
    gaugeStatusColor = 'var(--status-warning)';
    gaugeBadge = 'Avertissement (≥ 70%)';
    gaugeBadgeClass = 'badge-warning';
  }

  const imagePct = quota > 0 ? (imageBytes / quota) * 100 : 0;
  const pdfPct = quota > 0 ? (pdfBytes / quota) * 100 : 0;

  // Carte de la jauge de stockage
  const gaugeCard = h('div', { className: 'storage-gauge-card' }, [
    h('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;' }, [
      h('div', {}, [
        h('h3', { style: 'margin:0; font-size:var(--text-lg);' }, 'Espace de stockage (Plan Gratuit)'),
        h('span', { style: 'font-size:var(--text-xs); color:var(--text-muted);' }, 'Surveillance du quota de 1 Go'),
      ]),
      h('span', { className: `badge ${gaugeBadgeClass}` }, gaugeBadge),
    ]),
    h('div', { className: 'progress-bar-track', style: 'height:16px;' }, [
      h('div', { className: 'progress-bar-fill-images', style: `width:${imagePct}%;` }),
      h('div', { className: 'progress-bar-fill-pdfs', style: `width:${pdfPct}%;` }),
    ]),
    h('div', { style: 'display:flex; flex-wrap:wrap; justify-content:space-between; font-size:var(--text-xs); color:var(--text-secondary); margin-top:8px;' }, [
      h('span', {}, `${formatBytes(used)} utilisés sur ${formatBytes(quota)} (${usagePct} %)`),
      h('div', { style: 'display:flex; gap:16px;' }, [
        h('span', { style: 'color:var(--accent-gold);' }, `● Photos : ${formatBytes(imageBytes)} (${stats?.image_count || 0})`),
        h('span', { style: 'color:var(--status-info);' }, `● PDFs : ${formatBytes(pdfBytes)} (${stats?.pdf_count || 0})`),
      ]),
    ]),
  ]);

  // Grille des compteurs clés
  const metricsGrid = h('div', {
    style: 'display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:24px;',
  }, [
    createMetricCard('Demandes en attente', stats?.pending_requests_count || 0, 'shield', 'badge-warning', () => {
      activeAdminTab = 'requests';
      renderAdmin();
    }),
    createMetricCard('Membres actifs', stats?.active_members_count || 0, 'users', 'badge-cours', () => {
      activeAdminTab = 'members';
      renderAdmin();
    }),
    createMetricCard('Publications totales', stats?.posts_count || 0, 'fileText', 'badge-info', () => {
      activeAdminTab = 'moderation';
      renderAdmin();
    }),
    createMetricCard('Fichiers hébergés', (stats?.image_count || 0) + (stats?.pdf_count || 0), 'database', 'badge-td'),
  ]);

  container.appendChild(gaugeCard);
  container.appendChild(metricsGrid);
}

function createMetricCard(label, val, iconName, badgeClass, onClick) {
  return h('div', {
    className: `card ${onClick ? 'card-interactive' : ''}`,
    style: 'padding: var(--space-5);',
    onClick,
  }, [
    h('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;' }, [
      h('span', { style: 'font-size:var(--text-xs); color:var(--text-muted); font-weight:500;' }, label),
      icon(iconName, 'svg-icon'),
    ]),
    h('div', { style: 'font-size:var(--text-3xl); font-family:var(--font-serif); font-weight:700; color:var(--text-primary);' }, String(val)),
  ]);
}

// ==============================================================================
// 2. ONGLET : DEMANDES EN ATTENTE & LIAISON D'APPAREIL
// ==============================================================================
async function renderRequestsTab(container) {
  let requests = [];
  try {
    requests = await api.adminListRequests();
  } catch (err) {
    toast.error('Erreur chargement des demandes.');
  }

  if (requests.length === 0) {
    container.appendChild(h('div', { className: 'empty-state animate-fade' }, [
      icon('check', 'empty-icon'),
      h('h3', {}, 'Aucune demande en attente'),
      h('p', {}, 'Toutes les demandes d\'accès des étudiants ont été traitées.'),
    ]));
    return;
  }

  // Récupération préalable de la liste des membres actifs pour le choix de liaison
  let allMembers = [];
  try {
    allMembers = await api.adminGetMembers();
  } catch {
    // Non bloquant
  }
  const activeMembers = allMembers.filter((m) => m.status === 'active');

  const list = h('div', { style: 'display:flex; flex-direction:column; gap:12px;' });

  requests.forEach((req) => {
    const card = h('div', {
      className: 'card animate-fade',
      style: 'display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:16px;',
    }, [
      h('div', {}, [
        h('div', { style: 'display:flex; align-items:center; gap:8px;' }, [
          h('span', { style: 'font-weight:600; font-size:var(--text-base); color:var(--text-primary);' }, req.real_name),
          req.has_duplicate_name ? h('span', {
            className: 'badge badge-warning',
            title: 'Un compte avec ce même nom existe déjà dans la base',
          }, 'Homonyme / Changement d\'appareil') : null,
        ]),
        h('div', { style: 'font-size:var(--text-xs); color:var(--text-muted); margin-top:2px;' },
          `Demande reçue : ${formatDate(req.created_at).absolute}`
        ),
      ]),
      h('div', { style: 'display:flex; align-items:center; gap:8px;' }, [
        h('button', {
          type: 'button',
          className: 'btn btn-primary btn-sm',
          onClick: () => openApproveModal(req, activeMembers, () => renderAdmin()),
        }, 'Approuver'),
        h('button', {
          type: 'button',
          className: 'btn btn-danger btn-sm',
          onClick: async () => {
            const confirmed = await modal.confirm({
              title: 'Rejeter cette demande ?',
              message: `Refuser l'accès à ${req.real_name} ?`,
              confirmText: 'Refuser',
              cancelText: 'Annuler',
              isDanger: true,
            });
            if (confirmed) {
              await api.adminRejectRequest(req.id);
              toast.info('Demande rejetée.');
              renderAdmin();
            }
          },
        }, 'Refuser'),
      ]),
    ]);

    list.appendChild(card);
  });

  container.appendChild(list);
}

function openApproveModal(req, activeMembers, onSuccess) {
  let selectedMode = 'new'; // 'new' ou 'link'
  let targetMemberId = activeMembers.length > 0 ? activeMembers[0].id : '';

  const memberSelect = h('select', { className: 'select', style: 'margin-top:8px;' });
  activeMembers.forEach((m) => {
    const opt = h('option', { value: m.id }, `${m.real_name} (Pseudo: ${m.pseudo || 'aucun'})`);
    memberSelect.appendChild(opt);
  });
  memberSelect.addEventListener('change', () => { targetMemberId = memberSelect.value; });

  const radioNew = h('input', { type: 'radio', name: 'approve_type', value: 'new', checked: true });
  const radioLink = h('input', { type: 'radio', name: 'approve_type', value: 'link' });

  const linkOptionsBox = h('div', { style: 'display:none; margin-top:12px;' }, [
    h('label', { className: 'form-label' }, 'Sélectionner le compte de l\'étudiant à associer :'),
    memberSelect,
  ]);

  radioNew.addEventListener('change', () => {
    selectedMode = 'new';
    linkOptionsBox.style.display = 'none';
  });

  radioLink.addEventListener('change', () => {
    selectedMode = 'link';
    linkOptionsBox.style.display = 'block';
  });

  const content = h('div', { style: 'display:flex; flex-direction:column; gap:16px;' }, [
    h('p', {}, `Validation de la demande pour : <strong>${req.real_name}</strong>`),
    h('div', { style: 'display:flex; flex-direction:column; gap:10px;' }, [
      h('label', { style: 'display:flex; align-items:center; gap:8px; cursor:pointer;' }, [
        radioNew,
        h('span', {}, 'Nouveau membre (il choisira son propre pseudo)'),
      ]),
      h('label', { style: 'display:flex; align-items:center; gap:8px; cursor:pointer;' }, [
        radioLink,
        h('span', {}, 'Nouvel appareil d\'un membre existant (changement de téléphone)'),
      ]),
    ]),
    linkOptionsBox,
  ]);

  const cancelBtn = h('button', {
    type: 'button',
    className: 'btn btn-secondary',
    onClick: () => modal.close(),
  }, 'Annuler');

  const confirmBtn = h('button', {
    type: 'button',
    className: 'btn btn-primary',
    onClick: async () => {
      try {
        if (selectedMode === 'link') {
          if (!targetMemberId) {
            toast.warning('Veuillez sélectionner un membre existant.');
            return;
          }
          await api.adminApproveRequest(req.id, targetMemberId);
          toast.success('Appareil associé avec succès au compte existant.');
        } else {
          await api.adminApproveRequest(req.id, null);
          toast.success('Demande approuvée. L\'étudiant peut maintenant choisir son pseudo.');
        }
        modal.close();
        if (onSuccess) onSuccess();
      } catch (err) {
        toast.error(err.message || 'Erreur lors de l\'approbation.');
      }
    },
  }, 'Confirmer l\'accès');

  modal.open({
    title: 'Approuver la demande d\'accès',
    content,
    footer: [cancelBtn, confirmBtn],
  });
}

// ==============================================================================
// 3. ONGLET : GESTION DES MEMBRES
// ==============================================================================
async function renderMembersTab(container) {
  let members = [];
  try {
    members = await api.adminGetMembers();
  } catch (err) {
    toast.error('Erreur chargement des membres.');
  }

  const tableWrapper = h('div', { className: 'admin-table-wrapper animate-fade' });
  const table = h('table', { className: 'admin-table' });

  const thead = h('thead', {}, h('tr', {}, [
    h('th', {}, 'Nom réel (Admin)'),
    h('th', {}, 'Pseudo public'),
    h('th', {}, 'Statut'),
    h('th', {}, 'Publications'),
    h('th', {}, 'Date'),
    h('th', { style: 'text-align:right;' }, 'Actions'),
  ]));

  const tbody = h('tbody', {});

  members.forEach((m) => {
    const postCount = Array.isArray(m.posts) ? m.posts.length : (m.posts?.count || 0);

    const statusBadgeClass = {
      active: 'badge-cours',
      approved: 'badge-info',
      pending: 'badge-warning',
      removed: 'badge-danger',
      rejected: 'badge-danger',
    }[m.status] || 'badge-secondary';

    const editPseudoBtn = h('button', {
      type: 'button',
      className: 'btn btn-ghost btn-sm',
      title: 'Modifier le pseudo',
      onClick: () => {
        openEditPseudoModal(m, () => renderAdmin());
      },
    }, icon('settings'));

    let banRestoreBtn = null;
    if (m.status === 'active' || m.status === 'approved') {
      banRestoreBtn = h('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm',
        style: 'color:var(--status-danger);',
        title: 'Bannir / Retirer l\'accès',
        onClick: () => openBanMemberModal(m, () => renderAdmin()),
      }, icon('shield'));
    } else if (m.status === 'removed' || m.status === 'rejected') {
      banRestoreBtn = h('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm',
        style: 'color:var(--status-success);',
        title: 'Réactiver ce membre',
        onClick: async () => {
          await api.adminSetMemberStatus(m.id, 'active');
          toast.success('Accès réactivé.');
          renderAdmin();
        },
      }, icon('check'));
    }

    const row = h('tr', {}, [
      h('td', { style: 'font-weight:600;' }, m.real_name),
      h('td', {}, m.pseudo || '— (non choisi)'),
      h('td', {}, h('span', { className: `badge ${statusBadgeClass}` }, m.status)),
      h('td', {}, String(postCount)),
      h('td', { style: 'font-size:12px; color:var(--text-muted);' }, formatDate(m.created_at).relative),
      h('td', { style: 'text-align:right;' }, [
        editPseudoBtn,
        banRestoreBtn,
      ]),
    ]);

    tbody.appendChild(row);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);
}

function openEditPseudoModal(m, onSuccess) {
  const input = h('input', {
    type: 'text',
    className: 'input',
    value: m.pseudo || '',
    placeholder: 'Nouveau pseudo',
    minlength: 3,
    maxlength: 20,
  });

  const saveBtn = h('button', {
    type: 'button',
    className: 'btn btn-primary',
    onClick: async () => {
      const val = input.value.trim();
      if (!val) return;
      try {
        await api.adminUpdatePseudo(m.id, val);
        toast.success('Pseudo mis à jour.');
        modal.close();
        if (onSuccess) onSuccess();
      } catch (err) {
        toast.error(err.message || 'Erreur mise à jour pseudo.');
      }
    },
  }, 'Enregistrer');

  modal.open({
    title: `Modifier le pseudo de ${m.real_name}`,
    content: h('div', { className: 'form-group' }, [
      h('label', { className: 'form-label' }, 'Pseudonyme'),
      input,
    ]),
    footer: [
      h('button', { type: 'button', className: 'btn btn-secondary', onClick: () => modal.close() }, 'Annuler'),
      saveBtn,
    ],
  });
}

function openBanMemberModal(m, onSuccess) {
  const deletePostsCheckbox = h('input', { type: 'checkbox', id: 'del_posts' });

  const confirmBtn = h('button', {
    type: 'button',
    className: 'btn btn-danger',
    onClick: async () => {
      try {
        await api.adminSetMemberStatus(m.id, 'removed', deletePostsCheckbox.checked);
        toast.success(`Accès révoqué pour ${m.real_name}.`);
        modal.close();
        if (onSuccess) onSuccess();
      } catch (err) {
        toast.error(err.message || 'Erreur lors de la révocation.');
      }
    },
  }, 'Confirmer la révocation');

  modal.open({
    title: `Révoquer l'accès : ${m.real_name}`,
    content: h('div', { style: 'display:flex; flex-direction:column; gap:16px;' }, [
      h('p', {}, 'Cet étudiant ne pourra plus accéder aux leçons ni publier.'),
      h('label', { style: 'display:flex; align-items:center; gap:8px; cursor:pointer;' }, [
        deletePostsCheckbox,
        h('span', {}, 'Supprimer également toutes ses publications et fichiers de Storage'),
      ]),
    ]),
    footer: [
      h('button', { type: 'button', className: 'btn btn-secondary', onClick: () => modal.close() }, 'Annuler'),
      confirmBtn,
    ],
  });
}

// ==============================================================================
// 4. ONGLET : CRUD DES MODULES & MATIÈRES
// ==============================================================================
async function renderModulesTab(container) {
  let modules = [];
  try {
    modules = await api.listModules();
  } catch (err) {
    toast.error('Erreur chargement des modules.');
  }

  const toolbar = h('div', {
    style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;',
  }, [
    h('h3', { style: 'margin:0;' }, 'Matières du semestre'),
    h('button', {
      type: 'button',
      className: 'btn btn-primary btn-sm',
      onClick: () => openModuleCreateModal(() => renderAdmin()),
    }, [icon('plus'), h('span', {}, 'Nouvelle matière')]),
  ]);

  const tableWrapper = h('div', { className: 'admin-table-wrapper animate-fade' });
  const table = h('table', { className: 'admin-table' });

  const thead = h('thead', {}, h('tr', {}, [
    h('th', {}, 'Catégorie'),
    h('th', {}, 'Nom de la matière'),
    h('th', {}, 'Enseignant'),
    h('th', {}, 'Ordre'),
    h('th', {}, 'Statut'),
    h('th', { style: 'text-align:right;' }, 'Actions'),
  ]));

  const tbody = h('tbody', {});

  modules.forEach((mod) => {
    const editBtn = h('button', {
      type: 'button',
      className: 'btn btn-ghost btn-sm',
      title: 'Modifier',
      onClick: () => openModuleEditModal(mod, () => renderAdmin()),
    }, icon('settings'));

    const toggleArchiveBtn = h('button', {
      type: 'button',
      className: 'btn btn-ghost btn-sm',
      title: mod.is_archived ? 'Désarchiver' : 'Archiver',
      onClick: async () => {
        await api.adminUpdateModule(mod.id, { is_archived: !mod.is_archived });
        toast.info(mod.is_archived ? 'Module réactivé.' : 'Module archivé (masqué aux étudiants).');
        renderAdmin();
      },
    }, icon(mod.is_archived ? 'check' : 'folder'));

    const deleteBtn = h('button', {
      type: 'button',
      className: 'btn btn-ghost btn-sm',
      style: 'color:var(--status-danger);',
      title: 'Supprimer',
      onClick: async () => {
        const confirmed = await modal.confirm({
          title: `Supprimer ${mod.name} ?`,
          message: 'Attention : toutes les publications et fichiers associés à cette matière seront définitivement supprimés !',
          confirmText: 'Supprimer définitivement',
          cancelText: 'Annuler',
          isDanger: true,
        });
        if (confirmed) {
          await api.adminDeleteModule(mod.id);
          toast.success('Module supprimé.');
          renderAdmin();
        }
      },
    }, icon('trash'));

    const row = h('tr', {}, [
      h('td', {}, h('span', { className: `badge badge-${mod.category}` }, mod.category.toUpperCase())),
      h('td', { style: 'font-weight:600;' }, mod.name),
      h('td', {}, mod.teacher || '—'),
      h('td', {}, String(mod.sort_order)),
      h('td', {}, mod.is_archived ? h('span', { className: 'badge badge-warning' }, 'Archivé') : 'Actif'),
      h('td', { style: 'text-align:right;' }, [
        editBtn,
        toggleArchiveBtn,
        deleteBtn,
      ]),
    ]);

    tbody.appendChild(row);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrapper.appendChild(table);

  container.appendChild(toolbar);
  container.appendChild(tableWrapper);
}

function openModuleCreateModal(onSuccess) {
  const catSelect = h('select', { className: 'select' }, [
    h('option', { value: 'cours' }, 'Cours'),
    h('option', { value: 'td' }, 'TD'),
    h('option', { value: 'tp' }, 'TP'),
  ]);
  const nameInput = h('input', { type: 'text', className: 'input', placeholder: 'Ex : Résistance des Matériaux' });
  const teacherInput = h('input', { type: 'text', className: 'input', placeholder: 'Ex : M. KACI' });
  const orderInput = h('input', { type: 'number', className: 'input', value: '1' });

  const saveBtn = h('button', {
    type: 'button',
    className: 'btn btn-primary',
    onClick: async () => {
      const name = nameInput.value.trim();
      if (!name) {
        toast.warning('Le nom de la matière est obligatoire.');
        return;
      }
      try {
        await api.adminCreateModule(catSelect.value, name, teacherInput.value, parseInt(orderInput.value, 10) || 0);
        toast.success('Matière créée avec succès.');
        modal.close();
        if (onSuccess) onSuccess();
      } catch (err) {
        toast.error(err.message || 'Erreur lors de la création.');
      }
    },
  }, 'Créer');

  modal.open({
    title: 'Ajouter une nouvelle matière',
    content: h('div', { style: 'display:flex; flex-direction:column; gap:12px;' }, [
      h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Catégorie'), catSelect]),
      h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Nom de la matière'), nameInput]),
      h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Enseignant (optionnel)'), teacherInput]),
      h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Ordre d\'affichage'), orderInput]),
    ]),
    footer: [
      h('button', { type: 'button', className: 'btn btn-secondary', onClick: () => modal.close() }, 'Annuler'),
      saveBtn,
    ],
  });
}

function openModuleEditModal(mod, onSuccess) {
  const nameInput = h('input', { type: 'text', className: 'input', value: mod.name });
  const teacherInput = h('input', { type: 'text', className: 'input', value: mod.teacher || '' });
  const orderInput = h('input', { type: 'number', className: 'input', value: String(mod.sort_order || 0) });

  const saveBtn = h('button', {
    type: 'button',
    className: 'btn btn-primary',
    onClick: async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      try {
        await api.adminUpdateModule(mod.id, {
          name,
          teacher: teacherInput.value.trim() || null,
          sort_order: parseInt(orderInput.value, 10) || 0,
        });
        toast.success('Matière modifiée.');
        modal.close();
        if (onSuccess) onSuccess();
      } catch (err) {
        toast.error(err.message || 'Erreur lors de la modification.');
      }
    },
  }, 'Enregistrer');

  modal.open({
    title: `Modifier la matière : ${mod.name}`,
    content: h('div', { style: 'display:flex; flex-direction:column; gap:12px;' }, [
      h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Nom de la matière'), nameInput]),
      h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Enseignant'), teacherInput]),
      h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Ordre d\'affichage'), orderInput]),
    ]),
    footer: [
      h('button', { type: 'button', className: 'btn btn-secondary', onClick: () => modal.close() }, 'Annuler'),
      saveBtn,
    ],
  });
}

// ==============================================================================
// 5. ONGLET : MODÉRATION DES PUBLICATIONS
// ==============================================================================
async function renderModerationTab(container) {
  let posts = [];
  try {
    posts = await api.adminListModerationPosts();
  } catch (err) {
    toast.error('Erreur chargement des publications.');
  }

  if (posts.length === 0) {
    container.appendChild(h('div', { className: 'empty-state animate-fade' }, [
      icon('fileText', 'empty-icon'),
      h('h3', {}, 'Aucune publication'),
      h('p', {}, 'Aucune leçon n\'a encore été partagée sur le site.'),
    ]));
    return;
  }

  const list = h('div', { style: 'display:flex; flex-direction:column; gap:12px;' });

  posts.forEach((p) => {
    const authorName = p.members?.pseudo
      ? `${p.members.pseudo} (${p.members.real_name})`
      : (p.author_label || 'Admin');

    const modName = p.modules ? `${p.modules.name} [${p.modules.category.toUpperCase()}]` : 'Module inconnu';
    const filesCount = p.post_files?.length || 0;

    const card = h('div', { className: 'card animate-fade', style: 'padding: var(--space-4);' }, [
      h('div', { style: 'display:flex; justify-content:space-between; align-items:flex-start; gap:12px;' }, [
        h('div', {}, [
          h('div', { style: 'display:flex; align-items:center; gap:8px; margin-bottom:4px;' }, [
            h('span', { className: 'badge badge-cours' }, modName),
            h('span', { style: 'font-size:12px; font-weight:600; color:var(--text-primary);' }, authorName),
            h('span', { style: 'font-size:11px; color:var(--text-muted);' }, formatDate(p.created_at).relative),
          ]),
          h('p', { style: 'font-size:var(--text-sm); color:var(--text-primary); margin:6px 0;' }, p.message),
          h('span', { style: 'font-size:11px; color:var(--text-muted);' }, `${filesCount} fichier${filesCount > 1 ? 's' : ''} attaché(s)`),
        ]),
        h('button', {
          type: 'button',
          className: 'btn btn-danger btn-sm',
          onClick: async () => {
            const confirmed = await modal.confirm({
              title: 'Supprimer cette publication ?',
              message: 'Cette publication et tous ses fichiers seront définitivement purgés.',
              confirmText: 'Supprimer',
              cancelText: 'Annuler',
              isDanger: true,
            });
            if (confirmed) {
              await api.deletePost(null, p.id);
              toast.success('Publication supprimée.');
              renderAdmin();
            }
          },
        }, icon('trash')),
      ]),
    ]);

    list.appendChild(card);
  });

  container.appendChild(list);
}

// ==============================================================================
// 6. ONGLET : PARAMÈTRES GLOBAUX
// ==============================================================================
async function renderSettingsTab(container) {
  let settings = {};
  try {
    settings = await api.adminGetSettings();
  } catch (err) {
    console.warn('[Admin] Erreur chargement paramètres:', err);
  }

  const siteNameInput = h('input', { type: 'text', className: 'input', value: settings.site_name || CONFIG.SITE_NAME });
  const adminNameInput = h('input', { type: 'text', className: 'input', value: settings.admin_display_name || 'Admin (Section B)' });
  const quotaInput = h('input', { type: 'number', className: 'input', value: settings.storage_quota_bytes || String(CONFIG.STORAGE_QUOTA_BYTES) });
  const maxFilesInput = h('input', { type: 'number', className: 'input', value: settings.max_files_per_post || String(CONFIG.MAX_FILES_PER_POST) });

  const saveBtn = h('button', {
    type: 'button',
    className: 'btn btn-primary',
    onClick: async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Enregistrement...';
      try {
        await api.adminUpdateSetting('site_name', siteNameInput.value.trim());
        await api.adminUpdateSetting('admin_display_name', adminNameInput.value.trim());
        await api.adminUpdateSetting('storage_quota_bytes', quotaInput.value);
        await api.adminUpdateSetting('max_files_per_post', maxFilesInput.value);
        toast.success('Paramètres enregistrés.');
      } catch (err) {
        toast.error(err.message || 'Erreur lors de l\'enregistrement.');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Enregistrer les paramètres';
      }
    },
  }, 'Enregistrer les paramètres');

  const card = h('div', { className: 'card animate-fade', style: 'max-width:600px;' }, [
    h('h3', { style: 'margin-bottom:16px;' }, 'Configuration générale'),
    h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Nom du site'), siteNameInput]),
    h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Nom de l\'auteur lors des publications admin'), adminNameInput]),
    h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Quota de stockage d\'avertissement (octets)'), quotaInput]),
    h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Nombre maximum de fichiers par publication'), maxFilesInput]),
    h('div', { style: 'margin-top:20px;' }, saveBtn),
  ]);

  container.appendChild(card);
}

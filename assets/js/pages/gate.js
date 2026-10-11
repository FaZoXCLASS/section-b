// ==============================================================================
// GÉNIE CIVIL SECTION B — PORTAIL D'ACCÈS & VALIDATION (gate.js)
// ==============================================================================

import { CONFIG } from '../../../config.js';
import { api } from '../api.js';
import { session } from '../session.js';
import { router, updateHeader, updateBottomNav } from '../app.js';
import { h, icon } from '../utils.js';
import { toast } from '../ui/toast.js';

/**
 * Affiche l'écran du portail approprié au statut actuel du membre.
 * @param {'none'|'pending'|'approved'|'rejected'|'removed'} status
 */
export function renderGate(status) {
  const mainView = document.getElementById('main-view');
  if (!mainView) return;

  // Masquer l'en-tête et la barre mobile pendant le passage au portail
  updateHeader({});
  updateBottomNav({});

  mainView.innerHTML = '';

  const gateWrapper = h('div', { className: 'gate-container' });

  if (status === 'none') {
    gateWrapper.appendChild(createRequestForm());
  } else if (status === 'pending') {
    gateWrapper.appendChild(createPendingScreen());
  } else if (status === 'approved') {
    gateWrapper.appendChild(createSetPseudoForm());
  } else if (status === 'rejected') {
    gateWrapper.appendChild(createRejectedScreen());
  } else if (status === 'removed') {
    gateWrapper.appendChild(createRemovedScreen());
  } else {
    // Par défaut, formulaire de demande
    gateWrapper.appendChild(createRequestForm());
  }

  mainView.appendChild(gateWrapper);
}

// ==============================================================================
// 1. FORMULAIRE DE DEMANDE D'ACCÈS (STATUT: none)
// ==============================================================================
function createRequestForm() {
  const card = h('div', { className: 'gate-card animate-fade' });

  const badge = h('div', { className: 'gate-badge-header' }, [
    icon('shield'),
    h('span', {}, CONFIG.ACADEMIC_YEAR),
  ]);

  const title = h('h1', { style: 'font-size: var(--text-2xl); margin-bottom: 8px;' }, 'Demande d\'accès');
  const subtitle = h('p', { style: 'margin-bottom: 24px;' },
    'Espace privé de la section B. Renseigne ton nom et prénom pour que l\'admin valide ton identité. Ton vrai nom ne sera jamais visible par tes camarades.'
  );

  const realNameInput = h('input', {
    type: 'text',
    id: 'gate-real-name',
    className: 'input',
    placeholder: 'Ex : Sarah Bouzid',
    required: true,
    minlength: 2,
    maxlength: 60,
    autocomplete: 'name',
  });

  // Champ piège anti-spam (honeypot) masqué
  const honeypotInput = h('input', {
    type: 'text',
    name: 'hp_field',
    style: 'display:none; position:absolute; left:-9999px;',
    tabindex: '-1',
    autocomplete: 'off',
  });

  const errorMsg = h('div', { className: 'form-error', style: 'display:none;' });

  const submitBtn = h(
    'button',
    {
      type: 'submit',
      className: 'btn btn-primary btn-lg',
      style: 'width: 100%; margin-top: 12px;',
    },
    'Envoyer ma demande'
  );

  const form = h(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        errorMsg.style.display = 'none';

        // Détection honeypot anti-spam
        if (honeypotInput.value) {
          return;
        }

        const nameVal = realNameInput.value.trim();
        if (nameVal.length < 2) {
          errorMsg.textContent = 'Veuillez saisir au moins 2 caractères.';
          errorMsg.style.display = 'block';
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Envoi en cours...';

        try {
          const token = session.getDeviceToken();
          const res = await api.submitRequest(token, nameVal);

          toast.success('Demande envoyée avec succès !');
          session.status = res.status || 'pending';
          renderGate('pending');
        } catch (err) {
          errorMsg.textContent = err.message || 'Erreur lors de l\'envoi de la demande.';
          errorMsg.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Envoyer ma demande';
        }
      },
    },
    [
      honeypotInput,
      h('div', { className: 'form-group' }, [
        h('label', { htmlFor: 'gate-real-name', className: 'form-label' }, 'Nom et prénom'),
        realNameInput,
        errorMsg,
      ]),
      submitBtn,
    ]
  );

  card.appendChild(badge);
  card.appendChild(title);
  card.appendChild(subtitle);
  card.appendChild(form);

  return card;
}

// ==============================================================================
// 2. ÉCRAN DE DEMANDE EN ATTENTE AVEC RADAR & SONDAGE (STATUT: pending)
// ==============================================================================
function createPendingScreen() {
  const card = h('div', { className: 'gate-card animate-fade' });

  // Animation Radar
  const radar = h('div', { className: 'radar-pulse-box' }, [
    h('div', { className: 'radar-circle' }),
    h('div', { className: 'radar-circle' }),
    h('div', { className: 'radar-circle' }),
    h('div', { className: 'radar-center-icon' }, icon('shield')),
  ]);

  const title = h('h2', { style: 'font-size: var(--text-xl); margin-bottom: 8px;' }, 'Demande en attente');
  const text = h('p', { style: 'margin-bottom: 24px; line-height: 1.5;' },
    'Ta demande a été envoyée. L\'administrateur doit la valider, reviens dans un moment.'
  );

  const statusHint = h('div', {
    style: 'font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 20px;',
  }, 'Actualisation automatique active dès validation...');

  const refreshBtn = h(
    'button',
    {
      type: 'button',
      className: 'btn btn-secondary btn-sm',
      onClick: async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Vérification...';
        const newStatus = await session.refreshMemberStatus();
        if (newStatus !== 'pending') {
          renderGate(newStatus);
        } else {
          toast.info('Demande toujours en attente de validation.');
          refreshBtn.disabled = false;
          refreshBtn.textContent = 'Vérifier maintenant';
        }
      },
    },
    'Vérifier maintenant'
  );

  card.appendChild(radar);
  card.appendChild(title);
  card.appendChild(text);
  card.appendChild(statusHint);
  card.appendChild(refreshBtn);

  // Démarre le sondage automatique en tâche de fond avec back-off
  session.startPendingPoll((newStatus) => {
    if (newStatus !== 'pending') {
      renderGate(newStatus);
    }
  });

  return card;
}

// ==============================================================================
// 3. FORMULAIRE DE CHOIX DU PSEUDONYME (STATUT: approved)
// ==============================================================================
function createSetPseudoForm() {
  session.stopPendingPoll(); // Arrêt du sondage une fois approuvé

  const card = h('div', { className: 'gate-card animate-fade' });

  const badge = h('div', { className: 'gate-badge-header' }, [
    icon('check'),
    h('span', {}, 'Accès approuvé !'),
  ]);

  const title = h('h2', { style: 'font-size: var(--text-xl); margin-bottom: 8px;' }, 'Choisis ton pseudo');
  const subtitle = h('p', { style: 'margin-bottom: 20px;' },
    'C\'est ce pseudonyme qui apparaîtra sur tes publications de cours et fiches partagées.'
  );

  const pseudoInput = h('input', {
    type: 'text',
    id: 'gate-pseudo-input',
    className: 'input',
    placeholder: 'Ex : Sarah.B',
    required: true,
    minlength: 3,
    maxlength: 20,
    autocomplete: 'nickname',
  });

  const validationMsg = h('div', { className: 'form-error', style: 'display:none;' });
  const hintMsg = h('div', { className: 'form-hint', style: 'margin-top: 6px;' },
    '3 à 20 caractères : lettres (accents compris), chiffres, espaces, . _ -'
  );

  const submitBtn = h(
    'button',
    {
      type: 'submit',
      className: 'btn btn-primary btn-lg',
      style: 'width: 100%; margin-top: 16px;',
    },
    'Valider mon pseudo'
  );

  // Validation en direct lors de la frappe
  pseudoInput.addEventListener('input', () => {
    const val = pseudoInput.value.trim();
    if (!val) {
      validationMsg.style.display = 'none';
      submitBtn.disabled = false;
      return;
    }

    if (val.length < 3) {
      validationMsg.textContent = 'Le pseudo doit comporter au moins 3 caractères.';
      validationMsg.style.display = 'block';
      submitBtn.disabled = true;
      return;
    }

    const validCharsRegex = /^[a-zA-Z0-9À-ÿ\s\._\-]+$/;
    if (!validCharsRegex.test(val)) {
      validationMsg.textContent = 'Caractères non autorisés (lettres, chiffres, espaces, . _ - uniquement).';
      validationMsg.style.display = 'block';
      submitBtn.disabled = true;
      return;
    }

    const reservedWords = ['admin', 'administrateur', 'moderateur', 'modérateur', 'root', 'system'];
    if (reservedWords.includes(val.toLowerCase())) {
      validationMsg.textContent = 'Ce pseudo est réservé.';
      validationMsg.style.display = 'block';
      submitBtn.disabled = true;
      return;
    }

    validationMsg.style.display = 'none';
    submitBtn.disabled = false;
  });

  const form = h(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        validationMsg.style.display = 'none';

        const pseudoVal = pseudoInput.value.trim();
        submitBtn.disabled = true;
        submitBtn.textContent = 'Validation...';

        try {
          const token = session.getDeviceToken();
          const res = await api.setPseudo(token, pseudoVal);

          session.status = 'active';
          session.pseudo = res.pseudo;
          session.memberId = res.member_id;

          toast.success(`Bienvenue dans la section, ${res.pseudo} !`);

          // Activer l'en-tête et naviguer vers le site
          updateHeader(session.getState());
          updateBottomNav(session.getState());
          router.navigate('#/');
        } catch (err) {
          validationMsg.textContent = err.message || 'Erreur lors de la validation du pseudo.';
          validationMsg.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Valider mon pseudo';
        }
      },
    },
    [
      h('div', { className: 'form-group' }, [
        h('label', { htmlFor: 'gate-pseudo-input', className: 'form-label' }, 'Pseudonyme'),
        pseudoInput,
        hintMsg,
        validationMsg,
      ]),
      submitBtn,
    ]
  );

  card.appendChild(badge);
  card.appendChild(title);
  card.appendChild(subtitle);
  card.appendChild(form);

  return card;
}

// ==============================================================================
// 4. ÉCRAN DE DEMANDE REFUSÉE (STATUT: rejected)
// ==============================================================================
function createRejectedScreen() {
  const card = h('div', { className: 'gate-card animate-fade' });

  const iconWrap = h('div', {
    style: 'width:60px; height:60px; border-radius:50%; background:var(--status-danger-tint); color:var(--status-danger); display:flex; align-items:center; justify-content:center; margin:0 auto 16px;',
  }, icon('x'));

  const title = h('h2', { style: 'font-size: var(--text-xl); margin-bottom: 8px;' }, 'Demande refusée');
  const text = h('p', { style: 'margin-bottom: 24px; line-height: 1.5;' },
    'Ta demande d\'accès n\'a pas été validée. Si tu es bien étudiant en Génie Civil Section B, contacte directement l\'administrateur ou tes délégués.'
  );

  card.appendChild(iconWrap);
  card.appendChild(title);
  card.appendChild(text);

  return card;
}

// ==============================================================================
// 5. ÉCRAN D'ACCÈS RETIRÉ (STATUT: removed)
// ==============================================================================
function createRemovedScreen() {
  const card = h('div', { className: 'gate-card animate-fade' });

  const iconWrap = h('div', {
    style: 'width:60px; height:60px; border-radius:50%; background:var(--status-danger-tint); color:var(--status-danger); display:flex; align-items:center; justify-content:center; margin:0 auto 16px;',
  }, icon('shield'));

  const title = h('h2', { style: 'font-size: var(--text-xl); margin-bottom: 8px;' }, 'Accès retiré');
  const text = h('p', { style: 'margin-bottom: 24px; line-height: 1.5;' },
    'L\'accès à ce site a été révoqué pour cet appareil. Pour toute réclamation, adresse-toi à l\'administrateur de la section.'
  );

  card.appendChild(iconWrap);
  card.appendChild(title);
  card.appendChild(text);

  return card;
}

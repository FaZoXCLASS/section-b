# Guide de Déploiement & Maintenance — Génie civil Section B

Ce guide a été spécialement rédigé pour vous permettre de déployer et d'administrer le site d'entraide de la **Section B** (1ère année ingénieur en Génie Civil), sans aucune compétence avancée en programmation.

Le site fonctionne à **100 % gratuitement**, sans aucune carte bancaire requise, grâce à :
- **GitHub Pages** : Hébergement du site web statique (fichiers HTML, CSS, JavaScript).
- **Supabase (Plan gratuit)** : Base de données PostgreSQL sécurisée, stockage des fichiers et fonction serveur pour les autorisations.

---

## Sommaire

1. [Création du projet Supabase gratuit](#1-création-du-projet-supabase-gratuit)
2. [Exécution des scripts SQL (`schema.sql` et `seed.sql`)](#2-exécution-des-scripts-sql)
3. [Vérification du compartiment de stockage (`Storage`)](#3-vérification-du-compartiment-de-stockage-storage)
4. [Sécurisation & Création du compte administrateur](#4-sécurisation--création-du-compte-administrateur)
5. [Déploiement de l'Edge Function (`files`)](#5-déploiement-de-ledge-function-files)
6. [Configuration du site (`config.js`)](#6-configuration-du-site-configjs)
7. [Mise en ligne sur GitHub Pages](#7-mise-en-ligne-sur-github-pages)
8. [Configuration du Keep-Alive automatique (GitHub Actions)](#8-configuration-du-keep-alive-automatique)
9. [Checklist de première utilisation](#9-checklist-de-première-utilisation)
10. [Maintenance & Évolution](#10-maintenance--évolution)
11. [Limites du plan gratuit & Atténuations](#11-limites-du-plan-gratuit--atténuations)
12. [Auto-contrôle de Sécurité (Tests de résistance avec la clé publique)](#12-auto-contrôle-de-sécurité)
13. [Plan de Test Manuel Complet](#13-plan-de-test-manuel-complet)

---

## 1. Création du projet Supabase gratuit

1. Rendez-vous sur [supabase.com](https://supabase.com) et cliquez sur **« Start your project »**.
2. Connectez-vous avec votre compte GitHub (aucun moyen de paiement demandé).
3. Cliquez sur **« New project »**.
4. Remplissez les champs :
   - **Name** : `genie-civil-section-b`
   - **Database Password** : Définissez un mot de passe robuste et notez-le précieusement.
   - **Region** : Choisissez une région proche (par exemple `Central EU (Frankfurt)`).
   - **Pricing Plan** : `Free` (0 $/mois).
5. Cliquez sur **« Create new project »** et patientez environ 1 à 2 minutes pendant que Supabase initialise votre serveur.
6. Une fois le projet prêt, récupérez vos clés d'accès :
   - Dans le menu de gauche, cliquez sur la roue crantée **Project Settings** (en bas).
   - Cliquez sur **API** (sous *Configuration*).
   - Vous y trouverez :
     - **Project URL** (ex : `https://abcdefghijklm.supabase.co`).
     - **Project API Keys** → La clé **`anon` / `public`** (commençant par `eyJhb...`).
   - *Règle d'or* : Ne partagez jamais votre clé `service_role` (secrète).

---

## 2. Exécution des scripts SQL

Vous devez exécuter deux scripts SQL dans l'éditeur de Supabase pour configurer les tables, la sécurité et les matières de l'emploi du temps.

### Étape 2.1 : `schema.sql` (Tables & Sécurité)
1. Dans le menu de gauche de Supabase, cliquez sur l'icône **SQL Editor** (icône `>_`).
2. Cliquez sur **« + New query »**.
3. Ouvrez le fichier local [`supabase/schema.sql`](./supabase/schema.sql), copiez l'intégralité de son contenu et collez-le dans l'éditeur SQL de Supabase.
4. Cliquez sur le bouton vert **« Run »** (en bas à droite ou en haut).
5. Vous devez voir le message : `Success. No rows returned`. Toutes les tables (`members`, `modules`, `posts`, `post_files`, `admins`, `settings`), les fonctions sécurisées et les règles RLS sont créées.

### Étape 2.2 : `seed.sql` (Matières officielles de la Section B)
1. Toujours dans **SQL Editor**, ouvrez un nouvel onglet avec **« + New query »**.
2. Ouvrez le fichier local [`supabase/seed.sql`](./supabase/seed.sql), copiez son contenu et collez-le dans l'éditeur.
3. Cliquez sur **« Run »**.
4. Les 15 modules officiels de votre emploi du temps (Chimie, Physique 1, Algèbre 1, Prob&Stat, Analyse 1, Histoire, Éthique, StrucOrd&App) sont insérés avec le nom de leurs professeurs respectifs.

---

## 3. Vérification du compartiment de stockage (`Storage`)

Le script `schema.sql` a déjà créé automatiquement le bucket de stockage nommé `class-files`. Vérifions sa configuration :

1. Dans le menu de gauche, cliquez sur **Storage** (icône de carton d'archive).
2. Vous devez voir un bucket nommé **`class-files`**.
3. Cliquez sur les trois petits points `...` à droite de `class-files` puis **« Edit bucket »** :
   - **Public bucket** : Doit être **activé (vert)** (pour que les images et PDF soient accessibles directement via lien CDN).
   - **File size limit** : `50 MB` (ou 52428800 octets).
   - **Allowed MIME types** : `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
4. Si le bucket n'était pas présent, créez-le simplement avec ces paramètres en cliquant sur **« New bucket »**.

---

## 4. Sécurisation & Création du compte administrateur

### Étape 4.1 : Désactiver les inscriptions publiques
Les étudiants n'ont pas de mot de passe (ils passent par le portail avec leur appareil). Seul vous (l'admin) disposez d'un compte de connexion.

1. Dans le menu de gauche, cliquez sur **Authentication** (icône d'utilisateurs).
2. Allez dans **Providers** → **Email**.
3. **Décochez la case** : `Allow new users to sign up` (Empêche quiconque de créer un compte utilisateur classique).
4. Cliquez sur **« Save »**.

### Étape 4.2 : Créer votre compte administrateur
1. Toujours dans **Authentication**, cliquez sur l'onglet **Users** (en haut).
2. Cliquez sur le bouton vert **« Add user »** → **« Create user »**.
3. Renseignez :
   - **User Email** : Votre adresse email personnelle (ex : `admin@section-b.univ`).
   - **User Password** : Un mot de passe robuste de votre choix.
   - **Auto Confirm User?** : **Cochez la case** (pour valider le compte immédiatement sans email de confirmation).
4. Cliquez sur **« Create user »**.
5. Une fois créé, copiez l'identifiant unique **User UID** de votre nouvel utilisateur (une suite du type `a1b2c3d4-e5f6-7890-...`).

### Étape 4.3 : Vous déclarer administrateur dans la base
1. Retournez dans le **SQL Editor**.
2. Exécutez cette commande en remplaçant par votre UID copié à l'étape précédente :
   ```sql
   INSERT INTO public.admins (user_id) 
   VALUES ('VOTRE_UID_COPIE_ICI');
   ```
3. Cliquez sur **« Run »**. Vous êtes désormais le seul administrateur reconnu par le système.

---

## 5. Déploiement de l'Edge Function (`files`)

L'Edge Function permet de contrôler les droits de téléversement, d'appliquer le quota de 95 % et de générer des liens d'envoi signés. Vous pouvez la déployer selon l'une des deux méthodes ci-dessous.

### Méthode A : Directement dans le Dashboard Supabase (Plus simple)
1. Dans le menu de gauche de Supabase, cliquez sur **Edge Functions** (icône d'éclair).
2. Cliquez sur **« Create function »**.
3. Nommez la fonction exactement : **`files`**.
4. Dans l'éditeur de code qui apparaît, supprimez tout le contenu existant et collez l'intégralité du fichier local [`supabase/functions/files/index.ts`](./supabase/functions/files/index.ts).
5. Cliquez sur **« Deploy »** ou **« Save »**.

### Méthode B : Via la CLI Supabase (Optionnel)
Si vous disposez de Node.js et de la CLI Supabase :
```bash
npx supabase login
npx supabase link --project-ref VOTRE_PROJECT_ID
npx supabase functions deploy files --no-verify-jwt
```

---

## 6. Configuration du site (`config.js`)

Ouvrez le fichier [`config.js`](./config.js) à la racine du projet avec un éditeur de texte (Bloc-notes ou VS Code).

Remplissez les deux premières lignes avec les valeurs de votre projet obtenues à l'étape 1 :
```javascript
export const CONFIG = {
  // 1. Paramètres Supabase
  SUPABASE_URL: 'https://votre-projet.supabase.co',
  SUPABASE_ANON_KEY: 'votre-cle-publique-anon-ici',

  // 2. Nom de l'Edge Function et du Bucket (laissez par défaut)
  EDGE_FUNCTION_NAME: 'files',
  STORAGE_BUCKET: 'class-files',

  // 3. Route d'administration secrète (modifiable si vous souhaitez la personnaliser)
  ADMIN_ROUTE: '#/admin',
  ...
};
```
Enregistrez le fichier.

---

## 7. Mise en ligne sur GitHub Pages

1. Rendez-vous sur [github.com](https://github.com) et créez un nouveau dépôt public (ex : `section-b`).
2. Poussez l'intégralité des fichiers de ce dossier sur votre dépôt :
   ```bash
   git init
   git add .
   git commit -m "Mise en ligne initiale - Génie civil Section B"
   git branch -M main
   git remote add origin https://github.com/VOTRE_PSEUDO/section-b.git
   git push -u origin main
   ```
3. Sur GitHub, ouvrez votre dépôt et allez dans **Settings** → **Pages** (dans le menu de gauche).
4. Sous **Build and deployment** :
   - **Source** : `Deploy from a branch`
   - **Branch** : Choisissez `main` et le dossier `/(root)`
   - Cliquez sur **« Save »**.
5. Patientez environ 60 secondes et rafraîchissez la page : GitHub Pages vous affiche l'adresse publique de votre site (ex : `https://votre-pseudo.github.io/section-b/`).

---

## 8. Configuration du Keep-Alive automatique

Les projets gratuits de Supabase se mettent automatiquement en pause après 7 jours sans visite. Pour éviter cela, le projet contient un workflow GitHub Actions ([`.github/workflows/keepalive.yml`](./.github/workflows/keepalive.yml)) qui « réveille » Supabase tous les 3 jours.

1. Sur votre dépôt GitHub, allez dans **Settings** → **Secrets and variables** → **Actions**.
2. Cliquez sur **« New repository secret »** :
   - **Name** : `SUPABASE_URL`
   - **Secret** : Collez l'URL de votre projet Supabase (ex : `https://abcdef.supabase.co`).
   - Cliquez sur **Add secret**.
3. Cliquez à nouveau sur **« New repository secret »** :
   - **Name** : `SUPABASE_ANON_KEY`
   - **Secret** : Collez votre clé publique `anon`.
   - Cliquez sur **Add secret**.
4. Testez manuellement le déclencheur :
   - Cliquez sur l'onglet **Actions** de votre dépôt GitHub.
   - Cliquez sur le workflow **« Supabase Keep-Alive »** dans la liste à gauche.
   - Cliquez sur le bouton **« Run workflow »** puis validez.
   - En quelques secondes, le job doit afficher une coche verte.

> **Note importante** : GitHub désactive automatiquement les workflows programmés si un dépôt ne reçoit aucun commit pendant 60 jours consécutifs. Pour le réactiver, il vous suffira de vous rendre dans l'onglet **Actions** et de cliquer sur le bandeau jaune pour réactiver, ou de faire un commit mineur.

---

## 9. Checklist de première utilisation

1. **Connexion admin** :
   - Ouvrez votre site à l'adresse secrète : `https://votre-site.github.io/#/admin`.
   - Connectez-vous avec vos identifiants admin créés à l'étape 4.2.
   - Vous devez accéder au tableau de bord avec les compteurs et la jauge de stockage.
2. **Test étudiant (sur téléphone portable)** :
   - Ouvrez le lien du site sur votre smartphone (sans `#/admin`).
   - L'écran **« Demande d'accès »** s'affiche.
   - Saisissez un prénom de test (ex : `Karim Test`) et envoyez.
   - L'écran passe immédiatement en **« Demande en attente »** avec l'animation radar.
3. **Validation admin (sur votre ordinateur)** :
   - Sur votre tableau de bord admin (`#/admin`), allez dans l'onglet **Demandes**.
   - Vous voyez la demande de `Karim Test`. Cliquez sur **« Approuver »** → **« Nouveau membre »**.
4. **Choix du pseudo (sur le téléphone)** :
   - L'écran du téléphone bascule automatiquement vers **« Choisis ton pseudo »** (grâce au polling).
   - Choisissez un pseudonyme (ex : `Karim.GC`) et validez.
   - Le téléphone entre directement sur l'accueil du site avec le message *« Salut, Karim.GC ! »*.
5. **Publication de test** :
   - Cliquez sur **« Publier »** ou rendez-vous dans le module `Physique 1`.
   - Rédigez une description, ajoutez 2 photos ou 1 PDF.
   - Observez la barre de progression : les photos sont compressées sur le téléphone puis téléversées.
   - La publication apparaît instantanément en tête de liste.
6. **Suppression** :
   - L'étudiant peut cliquer sur **« Supprimer »** sur son propre post. L'admin a le bouton sur tous les posts.

---

## 10. Maintenance & Évolution

### Changement de semestre (Nouveaux modules)
Dans le tableau de bord admin, onglet **Matières & Modules** :
- Vous pouvez **Archiver** les modules du semestre 1 qui sont terminés (ils ne s'affichent plus aux étudiants mais leurs publications restent conservées).
- Vous pouvez cliquer sur **« + Nouvelle matière »** pour créer les cours du semestre 2.

### Étudiant ayant changé de téléphone
Si un camarade a changé d'appareil ou réinitialisé son navigateur :
1. Il soumet une nouvelle demande avec son vrai nom.
2. Dans votre onglet **Demandes**, un badge **« Homonyme / Changement d'appareil »** apparaît.
3. Cliquez sur **« Approuver »** et cochez **« Nouvel appareil d'un membre existant »**.
4. Choisissez son compte dans la liste : son nouvel appareil est immédiatement associé, et il conserve son pseudo et ses publications passées !

### Extension de stockage (Ajout d'un second volume gratuit)
Si vous atteignez 90 % du quota gratuit (1 Go) de Supabase :
- Le module [`storage.js`](./assets/js/storage.js) est spécialement conçu avec une architecture d'adaptateurs.
- Vous pouvez créer un **second projet Supabase gratuit** ou un compte **Backblaze B2** (10 Go gratuits), déclarer l'adaptateur dans `storage.js` (`storage.registerAdapter('volume2', ...)`), et continuer à publier sans jamais migrer ou déplacer les fichiers existants.

---

## 11. Limites du plan gratuit & Atténuations

| Limite Supabase Free Tier | Contrainte brute | Solution apportée par le projet |
| :--- | :--- | :--- |
| **Espace de stockage** | 1 Go max inclus | **Compression WebP côté client** avant envoi (réduit les photos de 5 Mo à ~250 Ko). Les notes sur tableau restent parfaitement nettes (1800 px max). |
| **Bande passante** | 2 Go / mois | Affichage exclusif de **miniatures légères (480 px, ~30 Ko)** dans les galeries. L'image complète ne se charge que si l'étudiant clique dessus. Cache navigateur immuable (`max-age=31536000`). |
| **Mise en veille** | Pause après 7 jours sans visite | Workflow GitHub Actions automatique pingant la base tous les 3 jours. |
| **Sécurité / Clé anon** | Clé publique dans le code | **Toutes les tables sont fermées (RLS strict)**. Aucune lecture ni écriture directe n'est possible sans passer par les fonctions RPC avec jeton d'appareil validé. |

---

## 12. Auto-contrôle de Sécurité

Pour vous assurer que votre site est impénétrable, même si un utilisateur inspecte le code et récupère l'URL et la clé `anon` dans `config.js`, vous pouvez exécuter ces requêtes de test dans votre terminal (avec `curl` ou dans la console de votre navigateur) :

### Test 1 : Tentative de lecture directe des membres et de leurs vrais noms
```bash
curl -X GET "https://VOTRE_PROJET.supabase.co/rest/v1/members" \
  -H "apikey: VOTRE_CLE_ANON" \
  -H "Authorization: Bearer VOTRE_CLE_ANON"
```
**Résultat attendu** : `[]` (tableau vide) ou `401 / 403 Permission Denied`. Aucun nom d'étudiant ni jeton ne peut être lu.

### Test 2 : Tentative d'insertion directe d'une publication
```bash
curl -X POST "https://VOTRE_PROJET.supabase.co/rest/v1/posts" \
  -H "apikey: VOTRE_CLE_ANON" \
  -H "Authorization: Bearer VOTRE_CLE_ANON" \
  -H "Content-Type: application/json" \
  -d '{"message": "Piratage", "module_id": "00000000-0000-0000-0000-000000000000"}'
```
**Résultat attendu** : `{"message": "new row violates row-level security policy"}` ou erreur d'autorisation. Rejet immédiat.

### Test 3 : Tentative de téléversement direct dans Storage sans URL signée
```bash
curl -X POST "https://VOTRE_PROJET.supabase.co/storage/v1/object/class-files/test.jpg" \
  -H "apikey: VOTRE_CLE_ANON" \
  -H "Authorization: Bearer VOTRE_CLE_ANON" \
  --data-binary "fake image"
```
**Résultat attendu** : `{"statusCode": "403", "error": "Unauthorized"}`. Seule l'Edge Function peut autoriser l'envoi.

---

## 13. Plan de Test Manuel Complet

| Étape | Scénario testé | Comportement attendu |
| :--- | :--- | :--- |
| **1** | Visite sur un nouvel appareil | Affichage du formulaire *« Demande d'accès »*. Le menu et les cours sont inaccessibles. |
| **2** | Envoi de la demande | Passage sur l'écran *« Demande en attente »* avec l'animation radar. Le sondage s'active. |
| **3** | Validation par l'administrateur | Dès validation dans `#/admin`, le téléphone bascule tout seul sur *« Choisis ton pseudo »*. |
| **4** | Choix du pseudo | Contrôle en direct (refus des pseudos de moins de 3 caractères et des mots réservés comme `admin`). Redirection vers l'accueil dès validation. |
| **5** | Téléversement lourd (10+ photos) | Les photos sont compressées deux par deux sans bloquer le téléphone. Les barres de progression s'animent et le post apparaît en tête. |
| **6** | Téléchargement PDF | Le bouton *« Ouvrir »* ouvre le document dans un nouvel onglet, *« Télécharger »* lance le téléchargement direct. |
| **7** | Visionneuse Lightbox | Ouverture nette au clic sur une photo, défilement avec les flèches ou par glissement au doigt (*swipe*), fermeture avec la touche Échap ou en glissant vers le bas. |
| **8** | Contrôle des suppressions | L'étudiant peut supprimer sa propre publication (dialogue de confirmation). Il ne voit aucun bouton de suppression sur les publications de ses camarades. |
| **9** | Changement d'appareil d'un membre | Liaison par l'administrateur : le nouvel appareil reprend l'accès sans ressaisir de pseudo et retrouve ses publications. |
| **10** | Révocation d'un membre | Le membre est immédiatement éjecté et voit l'écran *« Accès retiré »*. |

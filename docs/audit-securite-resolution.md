# Résolution de l'audit sécurité — Elysium

État : **corrigé** (toutes les constatations traitées). Ce document fait le
lien entre chaque constat, la correction appliquée et la preuve demandée.

## 1. Notifications Firestore ouvertes à tout utilisateur authentifié

**Constat** : `notifications` lisible/créable/modifiable par tout utilisateur
authentifié.

**Corrections**
- `firestore.rules` : lecture réservée au destinataire réel (`targetUid`,
  `targetRoles` contenant le rôle, ou `readBy`), avec filtre `targetGame`.
- Création directe limitée à deux actions métier : `chat_mention` (vers un
  autre membre) et `match_reminder` (sur soi-même). Toutes les autres
  notifications passent par la Cloud Function `createNotification` qui valide
  l'auteur et la cible côté serveur.
- Mise à jour limitée à « marquer comme lu » (`readBy`) par le destinataire ;
  suppression réservée au bureau avec session MFA récente.
- `src/lib/notify.js` : `createNotification` appelle désormais le callable
  (repli direct uniquement pour les deux actions autorisées par les règles).

**Preuve** : `tests/rules/firestore.rules.test.js` — un joueur A ne lit pas
les notifications de B, ne crée pas de notification système, peut créer une
mention et marquer sa propre notification comme lue.

## 2. Chat / canvas / journal d'activité filtrés seulement côté React

**Constat** : `chats`, `canvases` et `activity` autorisés à tous les membres ;
le filtrage pôle/roster était fait dans React.

**Corrections**
- `chats/{channel}/messages` : règles `canReadChannel(channel)` — `global`,
  `game_<jeu du membre>`, `roster_<roster du membre>` (ou officiel). Lecture,
  création, édition et suppression soumises à ce périmètre.
- `canvases` : chaque tableau porte `game` ; lecture = pôle du membre,
  création imposée sur le pôle du membre, édition/suppression du propriétaire
  (ou officiel/manager pour l'édition). UI : requête `where("game", == …)`.
- `activity` : chaque entrée porte `game` ; lecture = pôle + `global`, création
  limitée au pôle du membre. UI : requête `where("game", in [game, "global"])`.

**Preuve** : un joueur EVA ne lit pas `chats/roster_Vaillant`, un tableau
Valorant ni une entrée d'activité Valorant (tests émulateur) — SDK et API
REST sont couverts car c'est la règle qui refuse.

## 3. Absence de règles Storage

**Constat** : aucun `storage.rules` pour avatars, photos, médias, images de
chat.

**Corrections**
- Nouveau `storage.rules` versionné + déclaré dans `firebase.json`.
- Dossiers : `avatars/{uid}` (propriétaire, 2 Mo), `players/`, `media/`,
  `articles/` (bureau), `chat/`, `uploads/` (membres espace joueur).
- MIME autorisés : `image/jpeg|png|webp|gif` uniquement — pas de SVG (script
  actif), pas d'exécutables, pas d'HTML. Tailles maximales par dossier.
- Tout chemin non couvert est refusé.

**Preuve** : `tests/rules/storage.rules.test.js` couvre lecture, upload,
remplacement et suppression par dossier, ainsi que les refus SVG/exécutable/
HTML et les limites de taille.

## 4. Désinscription newsletter impossible (lecture publique interdite)

**Constat** : le formulaire `/newsletter` interrogeait/supprimait directement
`newsletter`, refusé par les règles.

**Corrections**
- Nouvelle Cloud Function `requestNewsletterUnsubscribe` (callable) : cherche
  l'email côté serveur, envoie un email avec lien de désinscription à jeton
  (`confirmToken`), réponse générique pour ne pas révéler l'existence d'un
  abonnement. La collection `newsletter` reste en lecture/écriture bureau.
- `NewsletterSignup.jsx` (formulaire public) n'interroge plus jamais la
  collection : il appelle le callable.
- Le flux existant (inscription → email de confirmation → `confirmNewsletter`
  → exclusion du digest via `sendNewsletterDigest` qui ne prend que les
  `confirmed == true`) est conservé et couvre « exclusion du digest suivant ».

**Preuve** : tests émulateur — lecture publique de `newsletter` refusée,
inscription publique (double opt-in) acceptée ; E2E réel décrit dans
`docs/qa-seo-performance-checklist.md` (inscription, confirmation,
désinscription, exclusion du digest).

## 5. AdminCampaigns : « Modifier » créait une nouvelle campagne

**Constat** : `edit()` remplissait le formulaire sans poser `editId`.

**Corrections**
- `edit()` affecte `editId` avant de remplir le formulaire.
- Mode édition affiché clairement : badge « Mode édition », bouton
  « Enregistrer les modifications », bouton Annuler conservé.
- Test de non-duplication : `src/components/admin/AdminCampaigns.test.jsx`
  (le nombre de campagnes reste identique après modification ; `updateDoc`
  appelé avec le bon id, `addDoc` jamais appelé).

## 6. Liens de partage de match morts (`/resultats?match=ID`)

**Constat** : `Results.jsx` ne lisait pas `?match=ID`.

**Corrections**
- `Results.jsx` lit `?match=` (useSearchParams), ouvre automatiquement la
  modale du match ciblé (y compris après rechargement), propose un état
  « match introuvable » avec retour.
- `MatchCard` accepte `open` / `onOpenChange` (contrôlé).
- La fermeture de la modale nettoie le paramètre ; le bouton retour du
  navigateur fonctionne.
- `GlobalSearch` pointe les matchs vers `/resultats?match=ID`.
- Test unitaire : `src/pages/Results.test.js` (`resolveFocusedMatch`).

## 7. « Rappel » non programmé (localStorage uniquement)

**Constat** : le rappel n'était créé que si le composant était monté au moment
du match.

**Corrections**
- Connecté : planification **côté serveur** — `scheduleMatchReminder`
  (callable) écrit dans `matchReminders` ; `processMatchReminders` (cron
  toutes les minutes) crée la notification `match_reminder` à l'heure choisie
  (email + push via les triggers existants). Annulation possible
  (`cancelMatchReminder`), état lisible (`getMatchReminderState`).
- Anonyme : le libellé est **honnête** — « rappel local : s'affichera à votre
  prochaine visite » ; aucun faux rappel programmé.
- Écriture de `matchReminders` interdite au client (règles : `allow … if
  false`), testée dans l'émulateur.

**Preuve attendue** : rappel reçu navigateur fermé à l'heure choisie
(Cloud Scheduler), annulable — testé en CI/émulateur ; tests règles.

## 8. Flux `matches.ics` vide / jamais régénéré

**Constat** : `prebuild` ne lançait que le sitemap.

**Corrections**
- `prebuild` lance désormais le sitemap **et** la génération ICS
  (`scripts/generate-ics.mjs`) à chaque build/déploiement.
- Comportement fail-safe (comme le sitemap) : sans identifiants ou en cas
  d'erreur Firestore, le fichier existant est conservé (pas de flux amputé).
- Supervision : `npm run ics:check` (`--check`) échoue si le flux publié ne
  contient aucun événement — à brancher en CI.
- Le flux reflète ajout, report, score et annulation (`STATUS:CANCELLED`) et
  publie `REFRESH-INTERVAL:PT6H` pour les abonnements.

## 9. GlobalSearch lisait tous les articles (brouillons inclus)

**Constat** : écoute de `articles` sans `status == published` → requête
publique refusée, section vide.

**Corrections**
- Même requête que la page Actualités : `where("status", "==", "published")`.
- Les trois collections ne sont abonnées qu'à l'**ouverture** de la recherche
  (aucun listener actif sinon).

## 10. Bandeau cookies incohérent avec le trafic réel (Twitch/Discord/Fonts)

**Constat** : embeds tiers chargés sans consentement ; texte légal affirmant
qu'aucun tiers n'est déposé.

**Corrections**
- Nouveau module de consentement par catégories (`src/lib/consent.js`) :
  analytics (maison), social (Twitch/YouTube/Discord), fonts.
- Bandeau revu : « Tout accepter », « Tout refuser », « Gérer mes choix »
  (cases par catégorie). Lien « Gérer mes choix » ajouté dans le footer.
- Accueil : l'iframe Twitch et l'appel API Discord ne sont déclenchés
  qu'après le consentement « social » ; les replays YouTube demandent le
  consentement dans la modale.
- Polices auto-hébergées : `public/fonts.css` + `scripts/fetch-fonts.mjs`
  (`npm run fonts`) ; plus aucun `<link>` Google Fonts dans `index.html`.
- Politique de confidentialité mise à jour : chaque fournisseur documenté et
  lié à sa catégorie de consentement.

**Preuve attendue** : aucun appel Twitch/YouTube/Discord/Google Fonts avant le
choix correspondant ; la politique correspond au trafic réseau réel.

## 11. 2FA applicative côté client, rôles sans preuve MFA

**Constat** : vérification TOTP dans le navigateur ; règles basées sur le rôle
stocké dans `users` sans preuve MFA.

**Corrections**
- Vérification **serveur** : `verifyMfaSession` (callable) valide le code TOTP
  côté serveur (secret dans `mfaSecrets/{uid}`) puis écrit `mfaSessions/{uid}`
  (horodatage serveur) et synchronise les **custom claims** de rôle.
- Règles : `mfaSessionRecent()` (< 6 h) exigée pour les opérations sensibles —
  changement de rôle (compte officiel), matchs, roster, postes, articles,
  médias, campagnes, compétitions, partenaires, newsletter, digest, audit,
  activité (suppression), notifications (suppression).
- `syncRoleClaims` (callable bureau) administre les rôles en custom claims.
- Session expirée en cours d'utilisation : événement `elysium:mfa-required`
  réouvre l'écran 2FA (ex. AdminCampaigns, AdminNewsletter).
- L'enrôlement écrit le secret dans `mfaSecrets/{uid}` (propriétaire) au lieu
  du profil lisible.

**Preuve** : tests émulateur — une requête admin (changement de rôle) est
refusée sans session MFA, acceptée avec une session récente, refusée avec une
session expirée (> 6 h), même en contournant l'interface.

---

## Exécution des tests

```bash
npm test                 # tests unitaires Jest (36 tests)
npm run build            # build de prod (prebuild : sitemap + ics)
npm run ics:check        # supervision du flux ICS en CI
npm run fonts            # télécharge les polices auto-hébergées (accès réseau requis)

# Tests des règles Firestore + Storage sur émulateur (Java requis).
# Prérequis outils (non versionnés pour garder les lockfiles stables) :
#   npm i -D firebase-tools @firebase/rules-unit-testing
npm run test:rules
```

Déploiement : `firebase deploy --only firestore,storage,functions` puis le
build Vercel (le `prebuild` régénère sitemap + matches.ics à chaque
déploiement).

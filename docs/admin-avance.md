# Admin avancé — exploitation et déploiement

Ce document décrit les briques ajoutées aux onglets `/admin` : boîte de réception
centralisée, annonces, analytics, contenus éditables, médiathèque enrichie,
permissions/invitations, redirections et feature flags.

## 1. Ordre de déploiement (important)

1. **Règles Firestore** : `npm run deploy:rules` (ou `firebase deploy --only firestore:rules`).
2. **Amorçage du compte officiel** — les règles ne contiennent plus d'UID en dur.
   Créer une fois le document `config/officials` :

   ```json
   { "uids": ["<UID du compte officiel historique>"] }
   ```

   Ce document n'est **pas** modifiable depuis le client (`allow write: if false`).
   Alternative : passer `users/<uid>.official` à `true` en console.
   Ensuite, la bascule définitive se fait depuis **Admin → Équipe**.
3. **Cloud Functions** : `firebase deploy --only functions` (nouvelle fonction
   `redeemInvitation`, région `FUNCTIONS_REGION` ou `us-central1`).
4. **Front** : déployer via Vercel. Vérifier `.env.example` (flags, analytics).

> ⚠️ Tant que `config/officials` n'existe pas et qu'aucun compte n'a
> `official: true`, plus personne n'a les pleins droits côté serveur. Faire
> l'étape 2 immédiatement après l'étape 1.

## 2. Nouvelles collections Firestore

| Collection | Lecture | Écriture | Rôle |
|---|---|---|---|
| `siteContent/{about,partners,legal,homeGames,donate}` | publique | `content.edit` | Pages statiques éditables |
| `announcements` | publique | `announcements.manage` | Bannière + notifications |
| `analytics_events` | `analytics.view` | création publique validée | Collecte analytics (immuable) |
| `redirects` | publique | `redirects.manage` | Redirections client |
| `featureFlags` | publique | `flags.manage` | Feature flags / staging |
| `cannedReplies` | staff inbox | `inbox.canned` | Réponses types |
| `invitations` | `team.manage` | `team.manage` + Function | Invitations (jeton = doc ID) |
| `config/officials` | authentifié | console uniquement | Amorçage officiel |

Les documents `users` acceptent désormais `permissions: string[]` (liste blanche
limitée à 24 clés) et `official: boolean`. Un utilisateur ne peut jamais modifier
ces deux champs lui-même.

## 3. Permissions & invitations

- Clés et rôles par défaut : `src/lib/permissions.js` (source unique partagée
  avec `firestore.rules` et `functions/invitations.js`).
- Le rôle `bureau` reçoit toutes les permissions ; `manager` reçoit par défaut
  candidatures, médias, événements, tryouts et postes. Un rôle `visitor` peut
  recevoir une permission explicite (ex. `analytics.view`) sans devenir bureau.
- **Invitation** : Admin → Équipe → « Inviter un membre ». Le lien
  `/invitation/<jeton>` + QR code sont générés côté navigateur. À l'acceptation :
  - l'utilisateur doit être connecté ;
  - si un email est renseigné, il doit correspondre au compte ;
  - l'invitation doit être `pending` et non expirée ;
  - la Function applique rôle + permissions, marque l'invitation `accepted`
    et journalise l'action dans `admin_audit`.
- Révocation : bouton « Révoquer » (statut `revoked`). Suppression : corbeille.
- Garde-fous : seul un membre du bureau peut attribuer le rôle `bureau` (UI et
  règles), et personne ne peut modifier son propre rôle ou ses permissions —
  `team.manage` sert à gérer les autres comptes, pas à s'auto-promouvoir.
  L'onglet `/admin?tab=users` (historique) reste en lecture seule pour les
  comptes marqués officiels.

### Ajouter une permission

1. Ajouter la clé dans `PERMISSION` et `PERMISSION_GROUPS` (`src/lib/permissions.js`).
2. L'ajouter à `isValidPermissions` dans `firestore.rules` et à
   `ALLOWED_PERMISSIONS` dans `functions/invitations.js`.
3. L'utiliser dans les règles (`hasPerm('ma.permission')`) et dans l'UI.

## 4. Boîte de réception (Support + Candidatures)

`Admin → Réception` agrège `supportThreads` et `recruitThreads` :

- filtres statut / catégorie / priorité / jeu / assignation / recherche ;
- tri SLA (retard ≥ 72 h en premier) et badge d'ancienneté ;
- assignation à un membre du staff (`assigneeUid`, `assigneeName`) ;
- changement de statut et de priorité ;
- réponses types (collection `cannedReplies` + 4 modèles intégrés) ;
- envoi direct d'une réponse dans la conversation + notification au demandeur ;
- export CSV (filtré ou sélection) ;
- actions en masse (statut, assignation, export).

Le badge de la navbar (`useInboxBadge`) compte les dossiers ouverts
(`open`/`in_progress` et `pending`/`reviewing`/`interviewing`/`pending_parental_consent`).

## 5. Annonces

`Admin → Annonces` publie une bannière publique et/ou une notification ciblée :

- champs : titre, message, niveau (`info`, `success`, `warning`, `critical`),
  lien interne/externe, épinglage, fermeture possible, début/fin ;
- ciblage : rôles et/ou jeux (vide = tout le monde) ;
- « Publier + notifier » crée un document `notifications` par couple rôle × jeu ;
  le déclencheur existant envoie email/push ;
- la bannière est masquée après fermeture (localStorage) et désactivable par le
  flag `publicAnnouncements`.

## 6. Analytics

Deux destinations, activées uniquement après consentement explicite (bandeau
`AnalyticsConsent`, mémorisé dans `localStorage.elysium_analytics_consent`) :

1. `POST` vers `REACT_APP_ANALYTICS_ENDPOINT` (optionnel) ;
2. collection `analytics_events` (dashboard admin). Le SDK Firebase est chargé
   à la demande pour ne pas impacter les pages qui ne collectent rien.

Plan de tracking (`ANALYTICS_EVENTS`) :

| Événement | Déclencheur |
|---|---|
| `page_view` | changement de route (`AnalyticsTracker`) |
| `recruitment_click` | CTA navbar/mobile |
| `application_started` / `application_submitted` | parcours de candidature |
| `tryout_booked` | réservation de créneau |
| `support_guest_ticket` / `help_article_open` | support |
| `article_view`, `match_view` | contenus |
| `global_search` | sélection dans la recherche (longueur de requête seulement) |
| `share` | X / Facebook / WhatsApp / copie |
| `discord_click`, `live_click` | communauté |
| `merch_click`, `shop_click`, `donate_click`, `partner_click`, `newsletter_signup` | monétisation |
| `announcement_click`, `redirect_hit` | admin/trafic |

Dashboard : vues de page, sessions, clics don/partenaires, entonnoir
recrutement, top pages, événements, export CSV — périodes 7/14/30 jours.

**Index Firestore** : aucun index composite requis (filtre et tri sur
`timestamp`). Si la console en réclame un, accepter l'index proposé.

**RGPD** : `analytics_events` ne contient ni email, ni UID, ni nom (les clés
sensibles sont supprimées par `scrub`). Prévoir une purge périodique (par ex.
24 mois) via la tâche de rétention.

## 7. Contenus éditables

`Admin → Contenus` (permission `content.edit`) :

- **À propos** : intro, histoire, valeurs, chronologie ;
- **Offres partenaires** : intro + grille JSON (`grille`, `rows`) ;
- **Pages légales** : mentions, confidentialité, CGU en Markdown ;
- **Accueil — Nos jeux** : cartes EVA / Rocket League, piliers ;
- **Dons** : intro, usages (avec pourcentages), transparence ;
- **Presse** : groupes de logos/charte et exports recommandés (JSON).

Chaque section est un document `siteContent/{section}`. En son absence, les
valeurs de `src/lib/siteContent.js` sont utilisées : une page ne peut pas être
vide. Les composants `About`, `Partners`, `LegalPage`, `Home` et `Donate`
fusionnent le document avec ces valeurs par défaut.

## 8. Médiathèque

`media` accepte désormais `folder`, `tags[]`, `alt`, `matchId`, `articleId` :

- recherche plein texte, filtres dossier/tag, compteurs ;
- création avec dossier + tags, liaison match/article via listes ;
- actions en masse : déplacement de dossier, ajout de tag, suppression ;
- galerie publique : filtres dossier/tag + recherche, liens « Voir le match »
  / « Voir l'article » dans la visionneuse.

Les dossiers sont des chaînes normalisées (slug) : aucun document à créer.

## 9. Redirections

`Admin → Redirections` gère `redirects` (`from`, `to`, `enabled`, `permanent`,
`note`). Résolution côté client avant les routes (`RedirectGate`).
La redirection historique `/dons → /soutenir` est permanente (des liens
circulent depuis des années) : une ligne Firestore peut changer sa cible, mais
elle ne peut pas être désactivée. Les autres redirections se désactivent avec
`enabled: false`.

## 10. Feature flags & staging

`Admin → Flags` (+ surcharges `.env`) :

| Flag | Effet |
|---|---|
| `publicAnnouncements` | affiche la bannière d'annonces |
| `donationsEnabled` | masque les CTA de don |
| `recruitmentOpen` | état des candidatures (info admin) |
| `analyticsDashboard` | affiche l'onglet Analytics |
| `newInbox` | affiche l'onglet Réception |
| `stagingMode` | bandeau préproduction + `robots noindex` |

Surcharges prioritaires sur Firestore :
`REACT_APP_STAGING=true`, `REACT_APP_FEATURE_FLAGS='{"flag":false}'`.
Un flag personnalisé peut être créé depuis l'admin ; il est lu via
`useFeatureFlag('mon.flag')` (`src/lib/featureFlags.js`).

## 11. Actions en masse

- **Articles** : sélection multiple, publier / repasser en brouillon / corbeille.
- **Réception** : statut, assignation, export CSV.
- **Médias** : déplacement de dossier, ajout de tag, suppression.
- **Matchs** : statut à venir/terminé, suppression, export CSV de la sélection.
- Hook réutilisable : `src/hooks/useBulkSelection.js`.

## 12. Vérifications avant mise en production

- `npm run test` (unitaires) et `npm run build`.
- Ouvrir `/admin` avec un compte `bureau` puis avec un compte `manager` :
  les onglets doivent correspondre aux permissions.
- Créer une annonce de test, vérifier la bannière et la notification.
- Vérifier l'acceptation d'une invitation (email correspondant, puis email
  différent → refus attendu).
- Ouvrir `/dons`, puis une redirection personnalisée.
- Activer `stagingMode` : bandeau + meta `noindex` ; le désactiver ensuite.

# Elysium — Cloud Functions (relais email)

Cette fonction transforme les **notifications in-app** (collection Firestore
`notifications`) en **emails** envoyés aux joueurs/staff concernés, via
**Resend** (par défaut) ou **Brevo** (si la clé Brevo est fournie).

## Protection des formulaires publics

Les formulaires publics ne peuvent **plus écrire directement dans Firestore**
(règles fermées) : toutes les soumissions passent par des callables qui
appliquent la défense en profondeur côté serveur :

| Callable                        | Formulaire                          | Auth requise |
| ------------------------------- | ----------------------------------- | ------------ |
| `submitPartnerRequest`          | Demande de partenariat              | non          |
| `subscribeNewsletter`           | Inscription newsletter              | non          |
| `requestNewsletterUnsubscribe`  | Désinscription newsletter           | non          |
| `submitSupportTicket`           | Ticket support (compte)             | oui          |
| `submitSupportTicketGuest`      | Ticket support **sans compte**      | non          |
| `getGuestSupportTicket`         | Suivi d'un ticket invité (jeton)   | non          |
| `submitRecruitApplication`      | Candidature (poste ou spontanée) + consentement parental | oui |
| `bookTryoutSlot`                | Réservation d'un créneau d'essai    | oui          |
| `rsvpCommunityEvent`            | RSVP calendrier communautaire       | non          |

Chaque callable applique (voir `lib/abuse.js` et `lib/validate.js`) :

1. **App Check** — jeton exigé si `ENFORCE_APP_CHECK=true` (sinon logué).
   Côté web : `REACT_APP_FIREBASE_APPCHECK_SITE_KEY` (reCAPTCHA v3) +
   enregistrement de l'app dans la console Firebase → App Check.
2. **Quotas par IP et par compte** — fenêtre glissante transactionnelle dans
   la collection `rateLimits` (inaccessible aux clients). Le pré-filtre
   `sessionStorage` côté client n'est plus qu'un confort UX.
3. **CAPTCHA adaptatif** — sous le seuil « soft », aucun captcha. Au-delà, le
   serveur répond `captcha-required` : le client obtient un jeton reCAPTCHA v3
   (`REACT_APP_RECAPTCHA_SITE_KEY`) rejoué automatiquement, vérifié côté
   serveur via siteverify (`firebase functions:secrets:set RECAPTCHA_SECRET`).
4. **Validation serveur des champs** — longueurs, formats email/URL,
   énumérations, honeypot, consentements obligatoires.

## RSVP calendrier communautaire

`rsvpCommunityEvent` est transactionnelle : un visiteur connecté est identifié
par son uid, un visiteur anonyme reçoit un **jeton secret** (seul le hash est
stocké dans `communityEvents/{id}/rsvps/{participantId}`). Chacun ne peut donc
ajouter/retirer **que sa propre participation** — l'ancien remplacement complet
du tableau `participants` par le client est fermé dans les règles.

## Support sans compte (ticket invité)

Un visiteur qui ne peut pas se connecter — cas le plus fréquent sur la page
Support — peut désormais écrire sans compte via `submitSupportTicketGuest` :

- quotas par IP plus serrés que le ticket connecté (3/h, captcha dès le 2ᵉ) ;
- ticket créé avec `uid: null` (donc **invisible des règles Firestore** côté
  client) et un `guestTokenHash` ;
- email de confirmation contenant un **lien de suivi** (`/suivi-demande?token=…`),
  également affiché sur le site si aucun fournisseur email n'est configuré ;
- `getGuestSupportTicket` relit la conversation à partir du seul jeton secret et
  ne renvoie **aucune donnée personnelle** (ni email, ni uid, ni jeton).

## Candidature spontanée & tryouts

`submitRecruitApplication` accepte `spontaneous: true` : le poste devient
facultatif (remplacé par « Candidature spontanée »), un champ `game` optionnel
permet de router le dossier vers le bon pôle. Aucune modification de règles.

`bookTryoutSlot` réserve un créneau d'essai public (`tryoutSlots/{id}`) :

- capacité vérifiée **et** décrémentée dans une transaction (impossible de
  surcharger un créneau complet) ;
- réservation écrite par le serveur dans `tryoutSlots/{id}/bookings/{uid}`
  (écriture client fermée par les règles) ;
- la candidature la plus récente du candidat est rattachée : statut
  `interviewing` (« Essai / Entretien ») + message système dans le fil, ce qui
  rend l'essai visible dans son suivi.

## Consentement parental (moins de 15 ans)

`submitRecruitApplication` exige, pour la tranche « -15 » : nom + email du
titulaire de l'autorité parentale et case d'accord dédiée. La candidature est
créée en statut `pending_parental_consent`, un email avec lien signé est envoyé
au parent (`confirmParentalConsent`), et les managers ne sont notifiés qu'après
confirmation. Sans confirmation sous 30 jours, la candidature est purgée
(`purgeStalePendingParentalConsent`).

## Export RGPD

`exportMyData` (auth requise) produit côté serveur l'archive JSON complète du
compte : profil, annuaire joueur, notes (+versions), tickets support,
candidatures, messages de chat, tableaux, disponibilités (ponctuelles et
récurrentes), absences, notifications, jetons push, journaux d'activité et
d'audit, abonnement newsletter, demande de suppression. Les secrets (TOTP,
jetons de confirmation) ne sont jamais exportés.

## Tâches planifiées de rétention

| Fonction                            | Planification        | Rôle                                             |
| ----------------------------------- | -------------------- | ------------------------------------------------ |
| `purgeNotesTrash`                   | tous les jours 04:00 | Corbeille Notes vidée après **30 jours**          |
| `purgeAgedThreads`                  | tous les jours 04:30 | Support + candidatures archivés (anonymisés dans `archivedThreads`) puis supprimés après **24 mois** |
| `purgeStalePendingParentalConsent`  | tous les jours 05:00 | Candidatures mineurs non confirmées après 30 jours |
| `cleanupRateLimits`                 | tous les jours 05:30 | Ménage des compteurs de quotas expirés            |

> Les fonctions planifiées nécessitent le plan Blaze (Cloud Scheduler).

> **Index requis** : `exportMyData` et `purgeDeletedAccount` utilisent des
> requêtes *collection group* sur `messages.uid` et `rsvps.uid`. Activez la
> portée « groupe de collections » pour le champ `uid` de ces collections dans
> la console Firestore (Index → Champ unique) — sinon ces sections sont
> signalées dans `exportErrors` de l'archive.

## 2FA / TOTP

Sur le plan **Spark**, Firebase Identity Platform (TOTP natif) n'est pas
disponible. L'app utilise alors une 2FA applicative (secret TOTP dans
`mfaSecrets/{uid}`, vérification dans le navigateur).

`ensureTotpMfa` reste utile uniquement si le projet passe en **Blaze** +
Identity Platform.

```bash
firebase deploy --only functions:ensureTotpMfa
```

Prérequis : le projet doit être passé en **Firebase Authentication with
Identity Platform** (console → Authentication → Mettre à niveau). Sans ça,
l'API refuse d'activer le TOTP.

## Cas couverts

| Événement métier              | Type de notification | Qui est notifié            |
| ----------------------------- | -------------------- | -------------------------- |
| Convocation (planning)        | `event_new`          | joueurs/managers du pôle   |
| Absence déclarée              | `absence_declared`   | managers + bureau          |
| Réponse de présence           | `attendance`         | managers + bureau          |
| Réponse à un ticket           | `thread_reply`       | l'auteur du ticket         |
| Nouveau ticket support        | `support_new`        | bureau                     |
| Nouvelle candidature          | `recruit_new`        | managers + bureau          |
| Mention chat (@pseudo)        | `chat_mention`       | le joueur mentionné        |

Aucune logique côté front n'est nécessaire : toute notification écrite dans
`notifications/{id}` est automatiquement relayée par email si un fournisseur
est configuré. Sans fournisseur, l'app reste en mode **in-app uniquement**.

## Déploiement

```bash
cd functions
npm install

# 1) Configurer les secrets (interactif)
firebase functions:secrets:set RESEND_API_KEY     # clé API Resend
firebase functions:secrets:set MAIL_FROM          # "Elysium <noreply@elysium-esport.fr>"
# Optionnel : utiliser Brevo au lieu de Resend
firebase functions:secrets:set BREVO_API_KEY

# 2) Déployer
firebase deploy --only functions
```

## Variables d'environnement

| Variable         | Obligatoire | Description                                                |
| ---------------- | ----------- | ---------------------------------------------------------- |
| `RESEND_API_KEY` | oui\*       | Clé API Resend. (\*sauf si `BREVO_API_KEY` est fournie)    |
| `BREVO_API_KEY`  | non         | Si défini, Brevo est utilisé à la place de Resend.         |
| `MAIL_FROM`      | oui         | Expéditeur, **vérifié** chez le fournisseur.              |
| `APP_URL`        | non         | URL du site (défaut `https://elysium-esport.fr`).         |
| `RECAPTCHA_SECRET` | oui (secret) | Clé secrète reCAPTCHA v3 pour le CAPTCHA adaptatif. Le secret doit exister au déploiement : `firebase functions:secrets:set RECAPTCHA_SECRET` (mettez la valeur `disabled` pour désactiver le captcha — le seuil « soft » devient alors bloquant). |
| `ENFORCE_APP_CHECK` | non      | `true` pour refuser tout appel de formulaire sans jeton App Check valide (activer une fois l'app web enregistrée dans App Check). |

> L'adresse `MAIL_FROM` doit être un domaine vérifié chez Resend/Brevo,
> sinon l'envoi sera rejeté. Le domaine `elysium-esport.fr` doit donc être
> ajouté dans la console du fournisseur (DNS SPF/DKIM).

---

## Envoi d'images

L'envoi d'images **ne passe pas par les Functions**. Cloud Storage est
inaccessible sur le plan gratuit (bucket = Blaze depuis février 2026) : le
navigateur envoie directement chez imgbb, avec la clé `REACT_APP_IMGBB_KEY`
définie dans les variables d'environnement Vercel.

Aucune fonction n'est donc requise ici ; `src/lib/imageUpload.js` côté site fait
le travail, garde-fous de délai et limite de taille compris. La marche à suivre
est dans [`docs/deploiement-firebase.md`](../docs/deploiement-firebase.md).

# Elysium — Cloud Functions (relais email, notifications, 2FA, rappels)

Ces fonctions transforment les **notifications in-app** (collection Firestore
`notifications`) en **emails** envoyés aux joueurs/staff concernés, via
**Resend** (par défaut) ou **Brevo** (si la clé Brevo est fournie), et
hébergent la validation serveur sensible : création de notifications,
désinscription newsletter à jeton, rappels de match planifiés, 2FA TOTP et
custom claims de rôle.

## 2FA / TOTP

Sur le plan **Spark**, Firebase Identity Platform (TOTP natif) n'est pas
disponible. L'app utilise une 2FA applicative dont la **vérification est
serveur** :

- le secret TOTP vit dans `mfaSecrets/{uid}` (accès propriétaire uniquement,
  jamais le staff) ;
- `verifyMfaSession` (callable) vérifie le code **côté serveur** puis écrit
  `mfaSessions/{uid}` avec un horodatage serveur ;
- les règles Firestore exigent cette session **récente (< 6 h)** pour toute
  opération sensible (changement de rôle, matchs, campagnes, newsletter,
  audit…) — contourner l'interface ne suffit plus ;
- `syncRoleClaims` (callable bureau) administre les rôles en **custom claims**
  côté serveur.

`ensureTotpMfa` reste utile uniquement si le projet passe en **Blaze** +
Identity Platform.

```bash
firebase deploy --only functions:ensureTotpMfa
```

Prérequis : le projet doit être passé en **Firebase Authentication with
Identity Platform** (console → Authentication → Mettre à niveau). Sans ça,
l'API refuse d'activer le TOTP.

## Autres fonctions

| Callable | Rôle |
| -------- | ---- |
| `createNotification` | Crée une notification après validation serveur de l'auteur et du type (mention chat, rappel, convocation, ticket, candidature…). Les règles interdisent la création directe hors mentions/rappels. |
| `requestNewsletterUnsubscribe` | Désinscription publique **sans lecture de la collection** `newsletter` : envoi d'un email avec lien à jeton ; réponse générique (pas d'énumération). |
| `scheduleMatchReminder` / `cancelMatchReminder` / `getMatchReminderState` | Planification des rappels de match côté serveur (`matchReminders`). |
| `processMatchReminders` | Cron (toutes les minutes) : crée la notification + email + push à l'heure choisie, navigateur fermé ou pas. |
| `verifyMfaSession` | Vérifie le code TOTP côté serveur et ouvre une session MFA récente (6 h). |
| `syncRoleClaims` | Synchronise le rôle d'un utilisateur vers ses custom claims (bureau uniquement). |

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

> L'adresse `MAIL_FROM` doit être un domaine vérifié chez Resend/Brevo,
> sinon l'envoi sera rejeté. Le domaine `elysium-esport.fr` doit donc être
> ajouté dans la console du fournisseur (DNS SPF/DKIM).

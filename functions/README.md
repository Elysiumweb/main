# Elysium — Cloud Functions (relais email)

Cette fonction transforme les **notifications in-app** (collection Firestore
`notifications`) en **emails** envoyés aux joueurs/staff concernés, via
**Resend** (par défaut) ou **Brevo** (si la clé Brevo est fournie).

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

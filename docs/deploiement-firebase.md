# Variables d'environnement et déploiement

Le site est déployé sur **Vercel**, la base de données et l'authentification sur
**Firebase**. Tout se règle depuis les interfaces web : aucune commande à taper
sur ta machine n'est nécessaire pour l'envoi d'images.

---

## 1. Envoyer des images depuis l'admin

**Pourquoi ?** Cloud Storage n'existe pas sur le plan gratuit Firebase : depuis
le 3 février 2026, un bucket exige le plan Blaze. Les images sont donc hébergées
chez **imgbb** — l'hébergeur de tes visuels `i.ibb.co`.

Deux réglages possibles, **aucun ne demande de commande à taper**. Choisis celui
qui te va (le premier garde la clé secrète).

### Option A — clé secrète, via la passerelle `/api/upload` (recommandé)

Le dépôt contient `api/upload.js`, une fonction Vercel qui relaie l'envoi vers
imgbb. La clé y est lue **côté serveur**.

1. Régénère ta clé sur <https://api.imgbb.com/> si elle a déjà été écrite dans
   un message ou un fichier.
2. Vercel → *Settings → Environment Variables* :
   - **Key** : `IMGBB_KEY` — sans préfixe `REACT_APP_`, donc la visibilité
     **Secret** est acceptée et la valeur n'arrive jamais dans le navigateur.
   - **Environments** : *Production*.
3. **Save**, puis **redeploy**. Vercel publie automatiquement le dossier `/api`,
   rien à déployer à la main.

### Option B — envoi direct depuis le navigateur

Si ton projet n'a pas de fonctions serveur, le navigateur poste lui-même chez
imgbb. La clé doit alors être publique :

- **Key** : `REACT_APP_IMGBB_KEY` — le préfixe `REACT_APP_` est obligatoire,
  Create React App n'injecte que les variables de cette famille dans le bundle.
- **Visibilité** : `config` (Vercel refuse `secret` sur une variable publique,
  et il a raison : la valeur finit dans le JavaScript du site).

### Vérification (les deux options)

Admin → Résultats → un match → choisis un logo → *Envoyer*. L'aperçu doit
apparaître, et le logo est enregistré dans Firestore avec son URL imgbb.

Sans configuration, l'écran d'envoi affiche « Le service d'envoi d'images n'est
pas configuré sur ce site » au lieu de rester bloqué.

### Le compromis de l'option B

La clé est visible dans le code source du site. Une clé imgbb permet d'**ajouter**
des images à ton compte — pas d'en lire d'autres ni d'en supprimer, car chaque
image possède sa propre URL de suppression. Si ça ne te va pas, passe à
l'option A : c'est le seul endroit à changer, `src/lib/imageUpload.js` sert les
deux transports et tente la passerelle en premier.

### Qui peut envoyer quoi

| Dossier | Utilisé par |
|---|---|
| `media`, `articles`, `matches`, `opponents`, `uploads` | formulaires d'administration (bureau) |
| `players/<uid>`, `avatars/<uid>` | la fiche et l'avatar du joueur connecté |
| `chat` | les images de discussion |

## 2. Autres variables Vercel (Firebase)

Elles sont déjà en place si le site fonctionne ; la liste pour référence :

```
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
REACT_APP_RECAPTCHA_SITE_KEY=...      (optionnel — anti-robot)
REACT_APP_FIREBASE_APPCHECK_SITE_KEY=...  (optionnel)
IMGBB_KEY=...                        (option A — secret, côté serveur)
REACT_APP_IMGBB_KEY=...              (option B — public, envoi direct)
```

`REACT_APP_FIREBASE_STORAGE_BUCKET` n'est plus utilisé : supprime-le, il ne sert
plus à rien depuis que les images ne passent plus par Firebase.

---

## 3. Règles Firestore

Si tu modifies `firestore.rules`, le déploiement se fait soit depuis la
console Firebase (aperçu du projet → Firestore Database → Rules →
*Publish*), soit en CLI pour ceux qui l'utilisent :

```bash
firebase deploy --only firestore:rules
```

Sans rapport avec les images : c'est ce qui protège les collections.

---

## Erreurs fréquentes

| Message | Cause | Solution |
|---|---|---|
| « Le service d'envoi d'images n'est pas configuré » | `IMGBB_KEY` (option A) ou `REACT_APP_IMBB_KEY` (option B) absente, ou build antérieur à l'ajout | Vérifier la variable, puis **redeploy** sur Vercel |
| L'envoi part puis échoue | clé imgbb révoquée / régénérée | Reprendre une nouvelle clé sur api.imgbb.com et la remettre dans Vercel |
| 404 sur `/api/upload` | Projet Vercel sans fonctions (option A impossible) | Passer en option B, ou vérifier que le dossier `/api` est bien déployé |
| L'écran reste sur « Envoi en cours » | Réseau instable ou imgbb injoignable | L'envoi abandonne seul après 45 s ; réessaie |
| « Image invalide ou trop lourde » | Fichier > 5 Mo ou format non supporté | Recadrer, ou laisser la compression automatique agir |
| `Error: Failed to authenticate` | Session Firebase CLI expirée | `firebase login` (uniquement pour les règles Firestore) |

---

## Fonctions

Le reste de la documentation des functions est dans
[`functions/README.md`](../functions/README.md).
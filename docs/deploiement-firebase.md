# Variables d'environnement et déploiement

Le site est déployé sur **Vercel**, la base de données et l'authentification sur
**Firebase**. Tout se règle depuis les interfaces web : aucune commande à taper
sur ta machine n'est nécessaire pour l'envoi d'images.

---

## 1. Envoyer des images depuis l'admin

**Pourquoi cette procédure ?** Cloud Storage n'existe pas sur le plan gratuit
Firebase : depuis le 3 février 2026, un bucket exige le plan Blaze. Les images
sont donc hébergées chez **imgbb** — l'hébergeur de tes visuels `i.ibb.co` — et
l'envoi se fait directement depuis le navigateur.

### Marche à suivre (dans l'interface Vercel)

1. Régénère ta clé sur <https://api.imgbb.com/> — surtout si elle a déjà été
   écrite dans un message ou un fichier.
2. Dans Vercel : **ton projet → Settings → Environment Variables**
   - **Key** : `REACT_APP_IMGBB_KEY`
   - **Value** : la clé imgbb
   - **Environments** : *Production* (coche aussi *Preview* si tu veux tester
     les aperçus de déploiement).
3. **Save**, puis **redeploy** le projet (Deployments → ⋮ → Redeploy sur le
   dernier déploiement). Les variables sont figées **au build** : sans
   redéploiement, rien ne change.

### Vérification

Admin → Résultats → un match → choisis un logo → *Envoyer*. L'aperçu doit
apparaître, et le logo est enregistré dans Firestore avec son URL imgbb.

### Le compromis assumé

La clé est lue par le navigateur : elle est donc visible dans le code source du
site, comme toute valeur `REACT_APP_*`. Avec une clé imgbb, un visiteur
malveillant pourrait **ajouter** des images à ton compte (pas en lire d'autres,
pas en supprimer : la suppression exige une URL propre à chaque image). Si ça
t'inquiète, deux options :

- **Cloudinary** : même principe mais avec un *preset* d'envoi, concept fait
  pour ça ;
- **une Cloud Function** qui relaie l'envoi et garde la clé secrète
  (`firebase functions:secrets:set IMGBB_KEY` + un déploiement).

Dans les deux cas, seul `src/lib/imageUpload.js` est à modifier.

### Qui peut envoyer quoi

Le contrôle est fait côté client, donc il protège des oublis, pas d'un attaquant :

| Dossier | Utilisé par |
|---|---|
| `media`, `articles`, `matches`, `opponents`, `uploads` | formulaires d'administration (bureau) |
| `players/<uid>`, `avatars/<uid>` | la fiche et l'avatar du joueur connecté |
| `chat` | les images de discussion |

---

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
REACT_APP_IMGBB_KEY=...              (envoi d'images)
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
| « Le service d'envoi d'images n'est pas configuré » | `REACT_APP_IMGBB_KEY` absente, ou build fait avant l'ajout | Vérifier la variable, puis **redeploy** sur Vercel |
| L'envoi part puis échoue | clé imgbb révoquée / régénérée | Reprendre une nouvelle clé sur api.imgbb.com et la remettre dans Vercel |
| L'écran reste sur « Envoi en cours » | Réseau instable ou imgbb injoignable | L'envoi abandonne seul après 45 s ; réessaie |
| « Image invalide ou trop lourde » | Fichier > 5 Mo ou format non supporté | Recadrer, ou laisser la compression automatique agir |
| `Error: Failed to authenticate` | Session Firebase CLI expirée | `firebase login` (uniquement pour les règles Firestore) |

---

## Fonctions

Le reste de la documentation des functions est dans
[`functions/README.md`](../functions/README.md).
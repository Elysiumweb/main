# Déploiement Firebase (images, règles, fonctions)

Tout se fait **depuis un terminal, sur ta machine**, dans un dossier contenant ce
dépôt (`git clone` ou ta copie locale). Les commandes ci-dessous supposent que
tu es à la **racine du projet** — celle qui contient `firebase.json`.

> Depuis un environnement sans accès réseau (agent, CI restreint…), le déploiement
> est impossible : il faut être sur une machine connectée.

---

## Envoyer des images depuis l'admin

**Pourquoi cette procédure ?** Cloud Storage n'existe pas sur le plan gratuit :
depuis le 3 février 2026, un bucket exige le plan Blaze. Les images sont donc
hébergées chez **imgbb** — l'hébergeur de tes visuels `i.ibb.co` — et l'envoi
passe par la Cloud Function `uploadImage`, qui garde la clé API en secret.

```bash
# 1. Clé API imgbb (compte gratuit) : https://api.imgbb.com/
#    La clé affichée se colle telle quelle à l'étape 2.

# 2. La déposer en secret — elle ne sera jamais dans le dépôt
firebase functions:secrets:set IMGBB_KEY

# 3. Déployer la fonction
firebase deploy --only functions:uploadImage
```

Ou, une fois le secret en place : `npm run deploy:upload`.

**Vérification :** Admin → Résultats → un match → choisis un logo → *Envoyer*.
L'aperçu doit apparaître et le logo est enregistré dans Firestore avec son URL
imgbb.

> ⚠️ **Fais tourner ta clé.** Si tu l'as écrite dans un message, un canal ou un
> fichier, passe sur https://api.imgbb.com/ pour en générer une nouvelle, puis
> remplace le secret. Elle n'est jamais versionnée dans ce dépôt — un test
> (`src/lib/imageUploadPath.test.js`) échoue d'ailleurs si une clé de 32
> caractères apparaît dans le code.

### Qui peut envoyer quoi

| Dossier | Autorisé |
|---|---|
| `media`, `articles`, `matches`, `opponents`, `uploads` | bureau et manager |
| `players/<uid>` | le joueur concerné, ou le staff |
| `avatars/<uid>` | le joueur concerné |
| `chat` | tout membre connecté |

Même découpage que `firestore.rules`, contrôlé côté serveur : un compte sans
le rôle n'obtient qu'un `permission-denied`, pas une image envoyée. Le quota est
de 40 envois par heure et par compte.

---

## Règles Firestore

```bash
firebase deploy --only firestore:rules     # ou : npm run deploy:rules
```

Sans rapport avec les images : c'est ce qui protège les collections. Voir
`firestore.rules` (en-tête commenté) pour le détail des rôles.

---

## Ce qu'il faut vérifier avant

1. **Variables d'environnement du build.** L'envoi d'images passe par une
   callable Firebase, donc il faut au minimum :
   ```
   REACT_APP_FIREBASE_API_KEY=...
   REACT_APP_FIREBASE_PROJECT_ID=...
   ```
   Ces variables sont figées **au moment du build** (Create React App), pas au
   démarrage du site : un nouveau build est nécessaire après les avoir
   ajoutées. Elles ne sont pas versionnées (`.env` est ignoré par Git).
   `REACT_APP_FIREBASE_STORAGE_BUCKET` n'est plus utilisé — supprime-le de ta
   configuration.

2. **La fonction doit être déployée** avant le premier envoi. Sans elle,
   l'admin affiche « Le service d'envoi d'images n'est pas configuré sur ce
   site » au lieu de bloquer.

---

## Erreurs fréquentes

| Message | Cause | Solution |
|---|---|---|
| « Le service d'envoi d'images n'est pas configuré » | `IMGBB_KEY` absent, fonction non déployée, ou `REACT_APP_FIREBASE_PROJECT_ID` manquant | Étapes 2 et 3, puis rebuild du site |
| « Tu n'as pas le droit d'envoyer une image ici » | Compte sans rôle bureau/manager sur un dossier admin | Vérifier le rôle dans `users/{uid}` |
| « Trop d'images envoyées récemment » | Quota de 40 envois/heure atteint | Attendre, ou relever la limite dans `functions/upload.js` |
| `storage/unauthorized` ou écran figé | Ancien build deployed | Rebuild + redéploiement du site |
| `Error: Failed to authenticate, have you run firebase login?` | Session CLI expirée | `firebase login` |

---

## Fonctions

Le reste de la documentation des functions est dans
[`functions/README.md`](../functions/README.md).
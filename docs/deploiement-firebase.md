# Déploiement Firebase (règles, fonctions)

Tout se fait **depuis un terminal, sur ta machine**, dans un dossier contenant ce
dépôt (`git clone` ou ta copie locale). Les commandes ci-dessous supposent que
tu es à la **racine du projet** — celle qui contient `firebase.json`.

> Depuis un environnement sans accès réseau (agent, CI restreint…), le déploiement
> est impossible : il faut être sur une machine connectée.

---

## Publier les règles de stockage (`storage.rules`)

Sans cette étape, **aucun téléversement d'image ne fonctionne** dans l'admin :
le bucket refuse toute écriture. Firestore et Storage sont indépendants —
publier les règles Firestore ne suffit pas.

```bash
# 1. Installer l'outil Firebase (une seule fois)
npm install -g firebase-tools

# 2. Se connecter (ouvre le navigateur)
firebase login

# 3. Relier ce dossier à ton projet Firebase (crée le fichier .firebaserc)
firebase use --add          # choisis le projet Elysium dans la liste

# 4. Publier les règles
firebase deploy --only storage
```

Le déploiement affiche `✔ Deploy complete!` quand c'est bon.

Vérification : console Firebase → **Storage** → onglet **Règles**. Tu dois voir
le contenu de `storage.rules`. Côté application, ouvre *Admin → Résultats → un
match* et dépose un fichier logo : l'aperçu doit apparaître.

### Raccourci

```bash
npm run deploy:rules   # = firebase deploy --only storage,firestore
```

---

## Ce qu'il faut vérifier avant

1. **Le stockage doit être activé** sur le projet.
   Console Firebase → **Storage** → *Get started*. Si la rubrique n'existe pas ou
   reste vide, le déploiement échoue : active-la d'abord. Un *bucket* est créé
   au passage, il s'appelle `<project-id>.appspot.com` ou
   `<project-id>.firebasestorage.app`.

2. **Les variables d'environnement du build** doivent contenir le bucket, sinon
   l'application affiche « Le stockage d'images n'est pas configuré sur ce site » :
   ```
   REACT_APP_FIREBASE_API_KEY=...
   REACT_APP_FIREBASE_AUTH_DOMAIN=...
   REACT_APP_FIREBASE_PROJECT_ID=...
   REACT_APP_FIREBASE_STORAGE_BUCKET=<project-id>.firebasestorage.app
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
   REACT_APP_FIREBASE_APP_ID=...
   ```
   Ces variables sont figées **au moment du build** (Create React App), pas au
   démarrage du site. Un nouveau build est nécessaire après les avoir ajoutées.
   Elles ne sont pas versionnées (`.env` est ignoré par Git).

3. **Le compte qui téléverse** doit avoir le rôle `bureau` (ou être le compte
   officiel) pour la médiathèque, les matchs, les adversaires et les articles.
   Chaque joueur peut téléverser sa propre photo de fiche et son avatar ; les
   images de discussion sont ouvertes à tout membre connecté.

---

## Erreurs fréquentes

| Message | Cause | Solution |
|---|---|---|
| `Error: Failed to authenticate, have you run firebase login?` | Session expirée | `firebase login` |
| `Error: HTTP Error: 404 ... storage bucket` | Stockage non activé | Console → Storage → *Get started* |
| `storage/unauthorized` | Règles non déployées, ou rôle insuffisant | `firebase deploy --only storage` |
| « Le stockage d'images n'est pas configuré » | `REACT_APP_FIREBASE_STORAGE_BUCKET` absent du build | Ajouter la variable puis rebuild |
| L'écran reste sur « Envoi en cours » | Ancien build sans le garde-fou de délai | Rebuild + redéploiement du site |

---

## Fonctions

Le reste de la documentation des functions est dans
[`functions/README.md`](../functions/README.md).
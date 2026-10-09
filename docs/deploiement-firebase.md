# Variables d'environnement et déploiement

Le site est déployé sur **Vercel**, la base de données et l'authentification sur
**Firebase**. Tout se règle depuis les interfaces web : aucune commande à taper
sur ta machine n'est nécessaire pour l'envoi d'images.

---

## 1. Envoyer des images depuis l'admin

**Pourquoi cette manip ?** Cloud Storage n'existe pas sur le plan gratuit
Firebase : un bucket exige le plan Blaze. Les images téléversées sont donc
**compressées dans le navigateur** puis rangées **en base64 dans Firestore**,
dans la collection `images`. Aucun hébergeur tiers, aucune clé d'API, aucune
fonction à déployer : Firestore est déjà en place pour le reste du site.

Le format stocké est une data URL (`data:image/jpeg;base64,…`), réutilisable
directement dans tous les `<img src={…}>` existants, sans changement ailleurs
dans le code.

### Ce que tu dois faire (une seule fois)

1. Ouvre la [console Firebase](https://console.firebase.google.com/) et choisis
   ton projet.
2. Menu de gauche → **Firestore Database** → onglet **Rules**.
3. Remplace le contenu affiché par celui du fichier `firestore.rules` de ce dépôt
   (la partie `match /images/{id}` est celle qui compte ici), puis clique sur
   **Publish**.

Rien d'autre : aucune variable d'environnement, aucun bucket, aucune commande.

> Sans cette publication, Firestore refuse l'écriture et l'admin affiche « Tu
> n'as pas le droit d'envoyer une image ici. »

### Vérification

Admin → Résultats → un match → choisis un logo → *Envoyer*. L'aperçu doit
apparaître, et le document est enregistré dans Firestore → collection `images`.

### Taille des images

Un document Firestore plafonne à **1 Mio**. Le client comprime donc chaque image
jusqu'à **600 Ko** (qualité 0,82 → 0,7 → 0,55) avant l'envoi, et refuse
explicitement ce qui reste trop lourd plutôt que d'envoyer une image cassée.
Pour un logo ou un visuel d'article, c'est largement suffisant ; pour de très
grandes photos, recadre avant.

### Qui peut envoyer quoi

| Dossier | Utilisé par |
|---|---|
| `media`, `articles`, `matches`, `opponents`, `uploads` | formulaires d'administration (bureau) |
| `players/<uid>`, `avatars/<uid>` | la fiche et l'avatar du joueur connecté |
| `chat` | les images de discussion |

Les règles `firestore.rules` laissent lire les images publiquement (c'est un
`<img src>`, pas une donnée privée), mais réservent l'écriture au bureau — ou au
membre qui a lui-même déposé l'image. Seuls les membres du bureau peuvent
modifier ou supprimer une image.

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
```

`REACT_APP_FIREBASE_STORAGE_BUCKET` n'est plus utilisé : supprime-le, il ne sert
plus à rien depuis que les images ne passent plus par Firebase.

---

## 3. Règles Firestore

Si tu modifies `firestore.rules`, le déploiement se fait depuis la console
Firebase : aperçu du projet → **Firestore Database** → onglet **Rules** →
coller le fichier → **Publish**. Aucune commande à taper n'est nécessaire, et
c'est la seule méthode décrite ici volontairement.

Sans rapport avec les images : c'est ce qui protège les collections.

---

## Erreurs fréquentes

| Message | Cause | Solution |
|---|---|---|
| « Tu n'as pas le droit d'envoyer une image ici. » | Règles Firestore non publiées, ou session expirée | Publier `firestore.rules` (section 1) puis recharger la page |
| « L'envoi n'a pas abouti à temps. » | Onglets en arrière-plan ou réseau instable | L'envoi abandonne seul après 30 s ; réessaie, la compression sera plus légère |
| « L'image est trop lourde après compression. » | Photo bien plus grande que 600 Ko une fois recompressée | Recadre l'image avant de l'envoyer |
| « Image invalide ou trop lourde » | Fichier > 5 Mo ou format non supporté | Recadrer, ou laisser la compression automatique agir |
| Preview protégé par mot de passe | Vercel Authentication active sur les aperçus | Tester depuis une session Vercel authentifiée, ou merger en production |
| L'écran reste sur « Envoi en cours » | Onglet suspendu par le navigateur pendant la compression | Revenir sur l'onglet : l'envoi est abandonné après 30 s et l'écran se libère seul |

---

## Fonctions

Le reste de la documentation des functions est dans
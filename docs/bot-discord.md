# Bot Discord Elysium Esport (`bot/`)

Bot Discord officiel relié en temps réel au site **Elysium Esport** (Firebase Firestore).

---

## Fonctionnalités implémentées

### Restriction stricte aux 2 serveurs officiels
Le bot fonctionne **exclusivement** sur :
- **`1526866278462001202`** *(Serveur Matchs / Esport)* : `/ask-result`, `/link`, `/link-discord`, `/scrim`, `/cancel`, `/command-allowed`
- **`1565264995078508554`** *(Serveur Communauté / Commandes Graphiques)* : messages de bienvenue & au revoir, `/send-message`, `/command-allowed`

Si le bot est ajouté sur n'importe quel autre serveur, il le quitte automatiquement. En messages privés (MP), seul l'administrateur principal (`520496557146243072`) peut interagir avec le studio de réponse aux tickets.

Tous les embeds envoyés par le bot intègrent automatiquement **le logo Elysium** ainsi que **la bannière Elysium tout en bas du message**.

---

### Serveur `1526866278462001202` (Matchs & Liaison site)

1. **`/command-allowed`** *(réservée exclusivement à `520496557146243072`)*
   - Donne (ou retire / affiche) la permission à un autre utilisateur Discord d'utiliser `/ask-result`, `/link`, `/link-discord` et `/send-message`.
2. **`/link`** *(réservée à `520496557146243072` et aux membres autorisés)*
   - Saisie manuelle d'un pseudo en jeu / replay + sélection dynamique dans la liste des fiches joueurs présentes sur le site (`roster`).
   - Plusieurs pseudos peuvent être attribués à un même joueur : lors de l'import des replays (via le bot **ou** depuis le panel Admin du site), les pseudos sont automatiquement rattachés à la fiche joueur correspondante.
3. **`/link-discord`** *(réservée à `520496557146243072` et aux membres autorisés)*
   - Relie un compte Discord (`@membre`) à la fiche d'un joueur du site (`roster`).
   - Permet d'identifier automatiquement le joueur et son roster lorsqu'il utilise `/scrim` ou `/cancel` (avec affichage du compte Discord lié dans le panel Admin du site).
4. **`/scrim`** *(réservée exclusivement aux joueurs dont le compte Discord est lié via `/link-discord`)*
   - Le joueur indique l'heure souhaitée du scrim pour la journée (ex: `20:00`, `21h00`).
   - **Règle des 2h minimum** : si l'heure demandée débute dans moins de **2 heures**, la demande est automatiquement rejetée.
   - **Notification privée** : envoie en MP à `520496557146243072` l'heure demandée, le jeu, le roster du joueur (récupéré automatiquement depuis sa fiche joueur) et le joueur à l'origine de la demande.
   - **Illusion d'IA côté joueurs** : la réponse affichée aux joueurs ne mentionne jamais `520496557146243072` ni un envoi humain, mais annonce que **l'IA de matchmaking Elysium lance ses recherches** pour ce créneau.
5. **`/cancel`** *(réservée exclusivement aux joueurs dont le compte Discord est lié via `/link-discord`)*
   - Annule tous les scrims liés au roster du joueur pour la journée en cours.
   - Si des matchs pour ce roster étaient déjà notés pour aujourd'hui sur le site (`matches`), ils passent automatiquement en statut **Annulé** (`status: "cancelled"`).
   - Envoie un message privé d'annulation à `520496557146243072` récapitulant l'annulation de la journée pour ce roster.
6. **`/ask-result`** *(réservée à `520496557146243072` et aux membres autorisés)*
   - Demande les 10 informations du match :
     - **Quel jeu ?** *(liste dynamique issue du site)*
     - **Quel roster ?** *(liste dynamique des rosters du site filtrée par jeu)*
     - **La date** *(ex: `30/10/2026`, `2026-10-30`, `aujourd'hui`, `demain`)*
     - **Heure du match** *(ex: `20:00`)*
     - **Heure de fin** *(ex: `21:00`)*
     - **Format** *(ex: `BO5`, `BO7`, `BO3`...)*
     - **Identifiant du match** *(Nom + Mot de passe du lobby)*
     - **Nom équipe adverse**
     - **Logo équipe adverse** *(compressé automatiquement en base64 `< 600 Ko` et enregistré dans la banque d'images Firestore du site)*
     - **ID du channel à envoyer** *(autocomplétion des salons ou saisie directe de l'ID)*
   - **Création immédiate sur le site** : le match apparaît dans les matchs **À venir** (`status: "upcoming"`) avec jeu, roster, équipe adverse, logo, date, heure et format.
   - **Passage automatique en « En direct » (`live`)** : dès que le match est en cours (à l'heure du début), le match bascule automatiquement en **En direct** sur le site (sur la page d'accueil, la page Résultats et la fiche du match), et le bot envoie dans le salon indiqué la présentation complète avec l'équipe adverse, le format, les identifiants (nom + mot de passe) et précise que **c'est la Elysium qui ouvre**.
   - **À l'heure de fin du match** : demande dans le salon la liste de **tous les replays** (l'utilisateur peut déposer **autant de fichiers `.replay` que nécessaire**, en un ou plusieurs messages) ainsi que le **score déclaré** (ex: `4` Elysium – `1` Adversaire).
   - **Validation & mise à jour du site** : passe le match en **Terminé** (`status: "finished"`), choisit automatiquement la bonne couleur d'équipe (`Bleu` ou `Orange`) pour correspondre au score déclaré (inverse automatiquement si nécessaire, et garantit la victoire à la bonne équipe même en présence d'un replay en double), calcule le MVP et lie automatiquement les statistiques individuelles aux fiches joueurs du site.

---

### Serveur `1565264995078508554` (Bienvenue, Au revoir & Tickets Design)

1. **Arrivées & Départs automatiques**
   - Arrivée d'un membre → message de bienvenue dans le salon `1565265445752152125`
   - Départ d'un membre → message d'au revoir dans le salon `1565265516992401489`
2. **`/send-message`** *(réservée à `520496557146243072` et aux membres autorisés)*
   - Envoie un message embed personnalisé avec un bouton au texte de votre choix dans un salon spécifique.
   - Chaque panneau génère un préfixe de salon unique (`#ticket-<identifiant>-001-<pseudo>`) permettant d'identifier immédiatement de quel message provient chaque ticket, sans jamais mélanger les tickets de différents panneaux.
3. **Parcours complet d'un Ticket**
   - À l'ouverture du ticket, le membre renseigne :
     1. *Décrivez-nous de manière très détaillée ce que vous désirez* (**obligatoire**)
     2. *Exemple de design souhaité* (**facultatif**, lien et/ou image(s) envoyée(s) dans le salon)
   - Dans le ticket, le bot indique que la demande est prise en charge et remercie de patienter.
   - L'utilisateur `520496557146243072` reçoit la demande complète en **message privé** avec un bouton **`Répondre`**.
   - En cliquant sur **`Répondre`**, il dispose de **3 boutons** : **`Preview`**, **`Final`** et **`Envoyée`**, et peut importer **autant de fichiers qu'il le souhaite** dans `Preview` comme dans `Final` (en un ou plusieurs messages MP).
   - Une fois **`Envoyée`** cliqué : le client reçoit l'image de **Preview** dans son ticket avec le choix entre **`Accepter`** et **`Demander une modification`**.
   - Si **`Demander une modification`** : formulaire obligatoire (*Quelles modifications souhaitez-vous apporter au design ?* — texte + images acceptés), renvoyé en privé à `520496557146243072` qui peut à nouveau répondre.
   - Si **`Accepter`** : tous les fichiers importés dans **`Final`** sont envoyés dans le ticket, suivis d'un message d'incitation à faire une donation avec le bouton PayPal :  
     👉 <https://www.paypal.com/ncp/payment/8R9PKMBPRB45N>

---

## Installation et mise en route

### 1. Activer les Intents dans le Portail Développeur Discord
1. Ouvrez <https://discord.com/developers/applications> et sélectionnez votre application bot (`1565640632779677796`).
2. Onglet **Bot** → section **Privileged Gateway Intents** → activez :
   - ✅ **SERVER MEMBERS INTENT** *(requis pour les messages de bienvenue et d'au revoir)*
   - ✅ **MESSAGE CONTENT INTENT** *(requis pour collecter les fichiers `.replay` et images en salon / MP)*
3. Cliquez sur **Save Changes**.

### 2. Inviter le bot sur les deux serveurs
Utilisez ce lien d'invitation (coche `bot` + `applications.commands` et les permissions salons/messages/fichiers) sur les deux serveurs `1526866278462001202` et `1565264995078508554` :

```
https://discord.com/oauth2/authorize?client_id=1565640632779677796&permissions=274878033360&scope=bot%20applications.commands
```

### 3. Relier le bot à la base Firebase du site (une seule fois)
1. Ouvrez la [Console Firebase](https://console.firebase.google.com/) et sélectionnez le projet Firebase de votre site Elysium.
2. Cliquez sur l'icône ⚙️ **Paramètres du projet** → onglet **Comptes de service**.
3. Cliquez sur **Générer une nouvelle clé privée**.
4. Placez le fichier JSON téléchargé dans le dossier `bot/` sous le nom :
   ```
   bot/serviceAccountKey.json
   ```
   *(Ce fichier est ignoré par Git dans `.gitignore` pour protéger vos accès. Sur un hébergeur cloud sans fichier local comme Railway ou Render, vous pouvez à la place coller le contenu du JSON dans la variable d'environnement `FIREBASE_SERVICE_ACCOUNT_JSON`.)*

### 4. Configurer `bot/.env` et démarrer le bot
Le fichier `bot/.env` est déjà pré-rempli localement pour vos tests (pensez à régénérer votre `DISCORD_TOKEN` dans le portail Discord avant la mise en production !).

```bash
cd bot
npm install
npm start
```

> Les commandes Slash (`/ask-result`, `/link`, `/link-discord`, `/scrim`, `/cancel`, `/command-allowed`, `/send-message`) sont synchronisées automatiquement sur chacun des deux serveurs dès le démarrage du bot (ou manuellement via `npm run register`).

---

## Hébergement 24h/24 (Production)

Contrairement au site React hébergé sur Vercel (serverless), un bot Discord maintient une connexion WebSocket permanente avec Discord. Vous pouvez héberger le dossier `bot/` (qui est **100 % autonome**) sur n'importe quel hébergeur Node.js 20+ :
- **Railway / Render / Fly.io** : définissez le dossier racine (`Root Directory`) sur `bot`, la commande de démarrage sur `npm start`, et ajoutez les variables `DISCORD_TOKEN`, `SITE_URL` et `FIREBASE_SERVICE_ACCOUNT_JSON`.
- **VPS / Dédié (Ubuntu / Debian avec PM2)** :
  ```bash
  cd bot
  npm install --omit=dev
  npx pm2 start src/index.js --name elysium-bot
  npx pm2 save
  ```
- **Hébergeur spécialisé Bot Discord (Discloud, PebbleHost, Wispbyte, Pterodactyl)** : compressez simplement le dossier `bot/` (sans `node_modules`) avec votre `serviceAccountKey.json` et `.env`, puis lancez `src/index.js`.

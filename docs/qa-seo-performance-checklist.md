# Checklist QA SEO / performance / accessibilité

À exécuter avant mise en production après `npm run build`.

## Lighthouse

1. Servir le build : `npx serve -s build -l 3000`.
2. Lancer Lighthouse mobile et desktop sur : `/`, `/resultats`, `/recrutement`, `/support`, `/actus`, `/equipe`, `/calendrier`, `/route-inconnue` (`npm run test:lighthouse` cible `http://127.0.0.1:3000`).
3. Vérifier les budgets cibles : Performance ≥ 90, Accessibilité ≥ 95, Best Practices ≥ 95, SEO ≥ 95.
4. Contrôler LCP sur mobile : image hero non lazy si elle devient critique, polices chargées avec `display=swap`, CLS proche de 0.

## Navigateurs / devices

- Mobile réel iOS Safari : menu, formulaires, espace joueur, planning/absences.
- Android Chrome : navigation mobile, Discord/live externe, recrutement.
- Firefox desktop : résultats, modale match, médias.
- Safari/WebKit : login, support, candidature, 404.

## Connexions lentes

Dans DevTools ou WebPageTest : Fast 3G / Slow 4G.

- La page reste utilisable pendant le chargement Firestore.
- Les images hors hero chargent en lazy-loading.
- Les iframes live/replay ne bloquent pas la navigation principale.

## E2E automatisé

- Installation navigateurs : `npx playwright install`.
- Lancement : `npm run test:e2e`.
- Les tests couvrent navigation mobile, connexion anonyme, candidature/login prompt, résultats/modale match, support/login prompt et visibilité du raccourci d'absence planning.

## Règles de sécurité (Firestore / Storage) — émulateur

Les règles sont couvertes par des tests d'émulateur (Java requis ; outils à
installer une fois : `npm i -D firebase-tools @firebase/rules-unit-testing`) :

```bash
npm run test:rules
# équivalent : npx firebase emulators:exec --only firestore,storage \
#   "npx jest tests/rules --testEnvironment=node --runInBand --maxWorkers=1"
```

Couverture (cf. audit sécurité) :
- Notifications : lecture/marquage réservés au destinataire réel ; création
  directe limitée aux mentions chat et rappels personnels ; le reste passe
  par la Cloud Function `createNotification`.
- Chats / canvas / journal d'activité : pôle et roster imposés par les règles
  (un joueur EVA ne lit pas un canal ou un tableau Valorant via SDK ou REST).
- Newsletter : aucune lecture publique (désinscription par jeton via
  Cloud Functions).
- Storage : dossiers (avatars, players, media, articles, chat), propriétaires,
  rôles, MIME autorisés (interdiction SVG/exécutables/HTML) et tailles max.
- MFA : session serveur récente (< 6 h) requise pour les opérations sensibles
  (changement de rôle, matchs, campagne, newsletter, audit…).

Rappels de match : `npm run ics` régénère `public/matches.ics` à chaque build
(prebuild) ; `npm run ics:check` supervise en CI que le flux publié contient
bien des événements (échoue si vide). Polices auto-hébergées : `npm run fonts`
télécharge Orbitron/Rajdhani dans `public/fonts` (exécuter avec accès réseau).

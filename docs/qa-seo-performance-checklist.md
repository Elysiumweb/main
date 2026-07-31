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

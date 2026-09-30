# Contenus éditoriaux (2.3) — articles, médias, newsletter

Référence d'implémentation des fonctionnalités éditoriales : articles liés,
tags/recherche, version EN, publication planifiée, réactions modérées, albums
médias et archives publiques de la newsletter.

## Articles

### Nouveaux champs (collection `articles`)

| Champ          | Type     | Rôle                                                          |
|----------------|----------|---------------------------------------------------------------|
| `author`       | string   | Byline affichée (défaut : « Rédaction Elysium »)              |
| `tags`         | array    | Tags normalisés (`parseTags`, max 8 × 30 caractères)          |
| `game`         | string?  | `EVA` / `Rocket League` / null → filtre /actus                |
| `roster`       | string?  | Nom de roster (collection `rosters`) → filtre /actus          |
| `titleEn`      | string   | Traduction EN (repli FR si absente)                           |
| `excerptEn`    | string   | Traduction EN de l'extrait                                    |
| `contentEn`    | string   | Traduction EN du corps (Markdown)                             |
| `publishAt`    | ts?      | Date de publication **planifiée**                            |
| `status`       | string   | `draft` · `published` · `scheduled` · `deleted`                |

- **Version EN** (`lib/articles.js` → `localizedArticle`) : en mode EN, la
  traduction n'est utilisée que si `titleEn` **et** `contentEn` sont présents ;
  sinon repli français + badge « non traduit ». Le SEO (`useArticleSEO`)
  suit la même règle et expose l'auteur en JSON-LD (`Person`).
- **Temps de lecture** : `readingTimeMinutes(content)` — 200 mots/minute,
  calculé sur le texte nettoyé du Markdown.
- **Sommaire** : `extractHeadings(source)` (`lib/markdown.jsx`) extrait les
  h2/h3 avec des ancres dédupliquées ; `<Markdown/>` pose les `id`
  correspondants sur les titres rendus (source de vérité unique).
- **Articles liés** : `relatedArticles(current, all)` — score tags partagés
  (×3) > catégorie (×2) > jeu/roster (×1), repli sur les plus récents.

### Publication planifiée

1. Admin → champ *Date de publication planifiée* + bouton **Planifier**
   → `status: "scheduled"`, `publishAt`.
2. Cloud Function `publishScheduledArticles` (`functions/articles.js`, cron
   15 min, même mécanisme que `retention.js`) bascule les articles échus en
   `published` — `publishedAt` conserve la **date planifiée**.
3. Publication manuelle en admin → `publishAt` remis à null (pas de flip-flop
   avec le cron).

Un article `scheduled` n'est lisible que par le bureau (règles Firestore
existantes : `status == 'published' || isBureau()`).

### Recherche / filtres `/actus`

`src/components/FiltersBar.jsx` = barre de filtres commune (D-08), adoptée sur
`/actus` et `/medias` : recherche plein texte insensible aux accents
(`articleMatchesQuery`), selects (jeu, roster) et puces de tags. Le tag actif
est partageable par URL : `/actus?tag=lan`.

## Réactions / commentaires modérés (collection `articleComments`)

```
{ articleId, uid, authorName, text (≤1000), status: pending|approved|rejected,
  createdAt, moderatedAt?, moderatedBy?, source: "function" }
```

- **Soumission** : callable `submitArticleComment` (`functions/comments.js`)
  — compte requis, validation serveur, quotas IP/compte + CAPTCHA adaptatif
  (`lib/abuse.js`), notification bureau (`comment_new`). Écriture directe
  interdite côté client (règles).
- **Pré-modération** : un commentaire naît `pending` ; seuls les `approved`
  sont publics. Chacun voit toujours les siens (badge de statut).
- **Modération** : onglet Admin **Modération** (`AdminComments.jsx`) — filtres
  par statut, recherche, approuver/refuser/supprimer, actions rapides en
  contexte sur l'article, tout tracé dans `admin_audit`.
- **RGPD** : les commentaires d'un compte supprimé sont purgés
  (`purgeAccountData`).
- Aucun index composite nécessaire : requêtes égalité-seulement (fusion des
  index simples automatique).

## Médias (collection `media`)

Nouveaux champs : `album` (regroupement éditorial : LAN, shooting…),
`credit` (photographe), `caption` (légende), `hdUrl` (version haute
définition). `/medias` gagne le filtre par album, l'affichage crédit/légende
(surtout en lightbox) et un bouton de téléchargement (HD si renseignée).

## Archives publiques de la newsletter

- `sendNewsletterDigest` écrit en plus une copie assainie dans
  `newsletterArchive` (lecture publique) : `{ subject, body, sent, total, sentAt }`.
- Page `/newsletter/archives` (`NewsletterArchives.jsx`), liée depuis la page
  newsletter et le panel admin ; ajoutée au sitemap.

## Déploiement

```bash
firebase deploy --only firestore:rules
firebase deploy --only functions   # publishScheduledArticles + submitArticleComment
npm run build                      # sitemap inclut /newsletter/archives
```

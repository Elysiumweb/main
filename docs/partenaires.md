# Partenaires — logos, fiches et bandeau « Ils nous font confiance »

Les partenaires affichés sur le site sont entièrement pilotés depuis
l'administration : aucun déploiement n'est nécessaire pour ajouter un logo.

## Où gérer les partenaires

`/admin` → onglet **Partenaires** (`partnerLogos`), composant
`src/components/admin/AdminPartners.jsx`. Accès réservé au bureau
(`isBureau`), comme l'onglet « Demandes partenaires » qui reste dédié aux
demandes entrantes du formulaire public.

Chaque partenaire est un document de la collection Firestore `partners` :

| Champ | Rôle |
| --- | --- |
| `name` | Nom affiché (obligatoire) |
| `slug` | URL de la fiche : `/partenaires/<slug>` (généré depuis le nom si vide, unicité vérifiée dans l'admin) |
| `tier` | `gold` \| `silver` \| `bronze` — utilisé pour regrouper les logos |
| `order` | Ordre d'affichage (petit nombre = en premier) |
| `active` | `false` = masqué du site **et** de sa fiche, même par URL directe (`published` est écrit en miroir) |
| `logoUrl` | Logo, envoyé via `ImageUpload` (base64 Firestore, aucun service tiers) |
| `bannerUrl` | Bannière de la fiche, affichée en fond du hero |
| `description` | Description Markdown (moteur `src/lib/markdown.jsx`, XSS-safe) |
| `ctaLabel` / `ctaUrl` | Bouton affiché **sous la description** de la fiche (URL `https://…` ou chemin interne `/…`) |
| `website` | Site officiel (lien dans le hero et la fiche ; sert aussi de CTA de repli) |

Les règles Firestore (`firestore.rules`) autorisent la lecture publique et
réservent l'écriture au bureau.

## Où les partenaires apparaissent

- **`/partenaires`** — grille des logos groupée par palier. Chaque logo est un
  lien vers la fiche du partenaire (plus de lien externe direct).
- **`/partenaires/:slug`** — fiche publique : bannière, logo, palier, site,
  description Markdown et bouton de lien. Affiche aussi les autres partenaires.
  SEO/JSON-LD gérés via `useSEO`.
- **Page d'accueil** — section « Ils nous font confiance » entre la communauté
  et les dons ; masquée automatiquement tant qu'aucun partenaire publié
  n'existe (10 logos maximum).
- **Recherche globale** (`Ctrl/⌘ + K`) — les partenaires publiés sont
  recherchables et ouvrent leur fiche.
- **`public/sitemap.xml`** — les fiches publiées sont ajoutées au build par
  `scripts/generate-sitemap.mjs`.

## Compatibilité

Les anciens documents écrivant `logo` / `banner` (sans suffixe) ou sans palier
restent supportés : voir `src/lib/partners.js` (`partnerLogoSrc`,
`partnerBannerSrc`, `partnerTier`).

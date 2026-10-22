/**
 * Ressources presse (valeurs par défaut)
 * ============================================================================
 * Ces listes étaient codées en dur dans `Press.jsx`. Elles servent désormais de
 * repli aux documents `siteContent/press` éditables depuis l'admin.
 */

export const ASSETS = [
  {
    group: "logo",
    kind: "logo",
    items: [
      { name: "Logo horizontal — blanc", file: "logo-horizontal-white.png", w: 963, h: 304, ratio: "963×304 · 3,17:1" },
      { name: "Logo horizontal — or", file: "logo-horizontal-gold.png", w: 963, h: 304, ratio: "963×304 · 3,17:1" },
      { name: "Logo vertical — or", file: "logo-vertical-gold.png", w: 817, h: 690, ratio: "817×690 · 1,18:1" },
      { name: "Icône — or", file: "logo-icon-gold.png", w: 808, h: 798, ratio: "808×798 · 1,01:1" },
      { name: "Icône — blanc", file: "logo-icon-white.png", w: 808, h: 798, ratio: "808×798 · 1,01:1" },
      { name: "Wordmark — blanc", file: "wordmark-white.png", w: 914, h: 126, ratio: "914×126 · 7,25:1" },
      { name: "Wordmark — or", file: "wordmark-gold.png", w: 914, h: 126, ratio: "914×126 · 7,25:1" },
    ],
  },
  {
    group: "charte",
    kind: "document",
    items: [
      { name: "Accent — lame dorée", file: "accent-blade.png", w: 787, h: 658, ratio: "787×658 · 1,20:1" },
      { name: "Accent — chevrons", file: "accent-brackets-gold.png", w: 600, h: 754, ratio: "600×754 · 0,80:1" },
      { name: "Motif / texture", file: "pattern.png", w: 756, h: 992, ratio: "756×992 · 0,76:1" },
    ],
  },
];

export const GROUP_TITLES = { logo: "press.assets.logo", charte: "press.assets.charte" };

export const USAGE_EXPORTS = [
  { label: "Horizontal · header/nav · 963×304", file: "logo-horizontal-gold.png", use: "En-tête, barre de navigation, email signature — toujours width auto, height auto" },
  { label: "Icône · favicon / avatar · 808×798", file: "logo-icon-gold.png", use: "Icône carrée, favicon, réseaux — ratio 1:1, ne pas étirer en 512×512 si source 808×798" },
  { label: "Vertical · affiche / dossier presse · 817×690", file: "logo-vertical-gold.png", use: "Affiches, dossiers de presse — conserver ratio 1,18:1, ne pas forcer 400×500" },
  { label: "Wordmark · titrage · 914×126", file: "wordmark-gold.png", use: "Titrages larges, footer — 7,25:1, ne jamais écraser à 600×160" },
];

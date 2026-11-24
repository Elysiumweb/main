# Design system — ELYSIUM (obsidian + divine gold)

The visual layer of the site follows the [Elysium-design](https://github.com/Elysiumweb/Elysium-design)
direction: obsidian surfaces, divine-gold accents, blade-cut corners, and a fixed 3D gold
emblem behind every public page.

**Content, routes, Firebase collections, business rules and `data-testid`s are unchanged.**
Only the presentation layer lives here.

## Where things live

| File | Role |
| --- | --- |
| `src/index.css` | Design tokens (oklch), utilities (`panel`, `text-gold`, `clip-blade`, `eyebrow`, …), animations |
| `tailwind.config.js` | Maps tokens to Tailwind (`bg-background`, `text-primary`, `border-border`, `font-display`/`font-label`) |
| `src/components/site/Headings.jsx` | `RiseTitle`, `SectionHeading`, `PageHero`, `Container` |
| `src/components/site/Reveal.jsx` | Scroll-reveal wrapper (IntersectionObserver) |
| `src/components/site/TiltCard.jsx` | Pointer-tilt card with gold glare |
| `src/components/site/SceneBackground.jsx` | Fixed backdrop: lazy, WebGL-checked 3D emblem + veil |
| `src/three/*` | three.js emblem (path, per-route poses, canvas) |
| `src/components/ui/button.jsx` | Variants `gold`, `frame`, `outline`, `ghost`, … |

## Tokens

Colors are oklch custom properties in `:root`, consumed through
`oklch(var(--token) / <alpha-value>)`, so every opacity modifier keeps working.

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `0.12 0.006 85` | Page obsidian |
| `--foreground` | `0.95 0.012 95` | Body text |
| `--card` | `0.16 0.008 85` | Panels |
| `--primary` | `0.84 0.095 98` | Divine gold |
| `--muted-foreground` | `0.72 0.02 90` | Secondary text |
| `--destructive` | `0.62 0.2 27` | Errors |

Fonts: **Orbitron** (`.font-display`), **Chakra Petch** (`.font-label`, `.eyebrow`),
**Rajdhani** (body). Loaded from Google Fonts in `public/index.html`.

## Class recipes

```jsx
// Page hero
<h1 className="font-display text-[clamp(2.2rem,8vw,5.5rem)] font-black uppercase leading-[0.95]">
  <RiseTitle text="Résultats" className="text-gold" />
</h1>
<p className="eyebrow mb-3">Saison 2026</p>

// Card
<div className="panel clip-blade p-6 hover:border-primary/50 transition-colors" />

// Section rule
<div className="flex-1 gold-line opacity-50" />

// CTA
<Button variant="gold" size="lg">Rejoindre</Button>
<Button variant="frame" size="lg">Voir les résultats</Button>
```

With motion: `<Reveal delay={120}>…</Reveal>` and `<TiltCard max={8}>…</TiltCard>`.

## Rules of thumb

- One `text-gold` gradient headline per screen; everything else is `font-display` in `--foreground`.
- Gold is an accent: interactive states, eyebrows, rules, one CTA. Never a large fill behind text.
- Cards use `panel` + `clip-blade(-sm)` instead of `bg-card border border-white/10`.
- Section labels are `.eyebrow` (Chakra Petch, 0.38em tracking), not small Orbitron caps.
- All effects collapse under `prefers-reduced-motion`; the 3D scene is skipped entirely.
- The 3D emblem only renders when WebGL exists and motion is allowed, is code-split
  (`three` ships in its own chunk), and mounts 300 ms after first paint.

## Adding a page

1. Wrap content in `<div className="min-h-[70vh] bg-transparent">` so the emblem shows through.
2. Header band: `<section className="relative overflow-hidden pt-6 sm:pt-10">` with `PageBreadcrumb`,
   a `text-gold` `font-display` `<h1>` (keep its `data-testid`), and a `text-muted-foreground` lede.
3. Sections: `eyebrow` label, `gold-line` rule, `panel clip-blade` cards.
4. Keep every existing `data-testid`, route and Firestore call untouched.

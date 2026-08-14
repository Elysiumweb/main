/**
 * Génère public/sitemap.xml et public/rss.xml à partir de Firestore.
 *
 * Le sitemap était figé : les articles, les profils joueurs et les nouvelles
 * pages n'y apparaissaient jamais. Ce script est lancé avant chaque build
 * (voir le script npm `prebuild`), donc chaque déploiement Vercel publie un
 * sitemap à jour sans intervention manuelle.
 *
 *   npm run sitemap
 *
 * Les collections sont lues via l'API REST publique avec la clé web du projet
 * (mêmes données que celles déjà servies au navigateur, aucune donnée privée).
 *
 * Principe de prudence : si les identifiants manquent ou si Firestore répond
 * une erreur, on NE touche PAS au fichier existant. Écraser un sitemap complet
 * par une version tronquée ferait désindexer des pages ; mieux vaut déployer
 * un sitemap légèrement daté qu'un sitemap amputé.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(root, "public");
const SITEMAP_OUT = path.join(PUBLIC_DIR, "sitemap.xml");
const RSS_OUT = path.join(PUBLIC_DIR, "rss.xml");

const SITE_URL = (process.env.REACT_APP_SITE_URL || "https://elysium-esport.fr").replace(/\/$/, "");
const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
const apiKey = process.env.REACT_APP_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";

/**
 * Pages statiques indexables. Doit rester aligné avec `routeSEO`
 * (src/components/SEOManager.jsx) : les pages en noIndex (connexion, profil,
 * admin, espace joueur, /offline) sont volontairement absentes.
 */
const STATIC_ROUTES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/resultats", changefreq: "daily", priority: "0.9" },
  { path: "/actus", changefreq: "daily", priority: "0.8" },
  { path: "/equipe", changefreq: "weekly", priority: "0.8" },
  { path: "/recrutement", changefreq: "weekly", priority: "0.8" },
  { path: "/calendrier", changefreq: "daily", priority: "0.7" },
  { path: "/competitions", changefreq: "weekly", priority: "0.7" },
  { path: "/statistiques", changefreq: "weekly", priority: "0.7" },
  { path: "/a-propos", changefreq: "monthly", priority: "0.6" },
  { path: "/presse", changefreq: "monthly", priority: "0.6" },
  { path: "/medias", changefreq: "weekly", priority: "0.6" },
  { path: "/partenaires", changefreq: "monthly", priority: "0.6" },
  { path: "/soutenir", changefreq: "monthly", priority: "0.6" },
  { path: "/support", changefreq: "monthly", priority: "0.5" },
  { path: "/newsletter", changefreq: "monthly", priority: "0.5" },
  { path: "/mentions-legales", changefreq: "yearly", priority: "0.3" },
  { path: "/confidentialite", changefreq: "yearly", priority: "0.3" },
  { path: "/cgu", changefreq: "yearly", priority: "0.3" },
];

const xmlEscape = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Déplie une valeur typée de l'API REST Firestore. */
const unwrap = (f) => {
  if (!f) return undefined;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return Number(f.doubleValue);
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.timestampValue !== undefined) return f.timestampValue;
  if (f.mapValue !== undefined) {
    return Object.fromEntries(
      Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, unwrap(v)])
    );
  }
  return undefined;
};

const docToObject = (doc) => {
  const out = { id: doc.name.split("/").pop() };
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = unwrap(v);
  return out;
};

/** Récupère une collection entière en suivant la pagination. */
async function fetchCollection(collection) {
  const docs = [];
  let pageToken = "";
  do {
    const url =
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}` +
      `?pageSize=300&key=${encodeURIComponent(apiKey)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore ${res.status} sur "${collection}"`);
    const data = await res.json();
    docs.push(...(data.documents || []).map(docToObject));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return docs;
}

/** Date ISO courte (YYYY-MM-DD) ou undefined si la valeur est inexploitable. */
const isoDay = (value) => {
  if (!value) return undefined;
  const d = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};

const buildSitemap = (entries) => {
  const urls = entries
    .map(({ loc, lastmod, changefreq, priority }) =>
      [
        "  <url>",
        `<loc>${xmlEscape(SITE_URL + loc)}</loc>`,
        lastmod ? `<lastmod>${lastmod}</lastmod>` : "",
        changefreq ? `<changefreq>${changefreq}</changefreq>` : "",
        priority ? `<priority>${priority}</priority>` : "",
        "</url>",
      ].join("")
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
};

const buildRss = (articles) => {
  const items = articles
    .slice(0, 30)
    .map((a) => {
      const link = `${SITE_URL}/actus/${a.id}`;
      const date = a.publishedAt || a.createdAt;
      const pub = date?.seconds ? new Date(date.seconds * 1000) : date ? new Date(date) : null;
      const summary = String(a.excerpt || a.summary || a.content || "")
        .replace(/[#*_>`[\]]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
      return [
        "    <item>",
        `      <title>${xmlEscape(a.title || "Article")}</title>`,
        `      <link>${xmlEscape(link)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
        pub && !isNaN(pub.getTime()) ? `      <pubDate>${pub.toUTCString()}</pubDate>` : "",
        summary ? `      <description>${xmlEscape(summary)}</description>` : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ELYSIUM Esport — Actualités</title>
    <link>${SITE_URL}/actus</link>
    <description>Les actualités de l'équipe esport Elysium.</description>
    <language>fr-FR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
};

async function main() {
  const staticEntries = STATIC_ROUTES.map((r) => ({
    loc: r.path,
    changefreq: r.changefreq,
    priority: r.priority,
  }));

  if (!projectId || !apiKey) {
    // Sans identifiants on ne peut produire que les pages statiques : écraser
    // le fichier existant retirerait articles et joueurs déjà indexés.
    if (existsSync(SITEMAP_OUT)) {
      console.warn(
        "[sitemap] Identifiants Firebase absents — sitemap.xml existant conservé (aucune régression d'indexation)."
      );
      return;
    }
    mkdirSync(PUBLIC_DIR, { recursive: true });
    writeFileSync(SITEMAP_OUT, buildSitemap(staticEntries), "utf8");
    console.warn(`[sitemap] Identifiants Firebase absents — ${staticEntries.length} pages statiques seulement.`);
    return;
  }

  let articles = [];
  let roster = [];
  try {
    [articles, roster] = await Promise.all([fetchCollection("articles"), fetchCollection("roster")]);
  } catch (err) {
    if (existsSync(SITEMAP_OUT)) {
      console.warn(`[sitemap] ${err.message} — sitemap.xml existant conservé.`);
      return;
    }
    throw err;
  }

  const published = articles.filter((a) => a.status === "published");
  const articleEntries = published
    .map((a) => ({
      loc: `/actus/${a.id}`,
      lastmod: isoDay(a.updatedAt || a.publishedAt || a.createdAt),
      changefreq: "monthly",
      priority: "0.7",
    }))
    .sort((a, b) => (b.lastmod || "").localeCompare(a.lastmod || ""));

  // Le détail joueur n'existe que pour les membres visibles sur /equipe.
  const rosterEntries = roster
    .filter((m) => ["player", "sub", "staff"].includes(m.status))
    .map((m) => ({
      loc: `/equipe/${m.id}`,
      lastmod: isoDay(m.updatedAt),
      changefreq: "monthly",
      priority: "0.6",
    }))
    .sort((a, b) => a.loc.localeCompare(b.loc));

  const entries = [...staticEntries, ...articleEntries, ...rosterEntries];

  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(SITEMAP_OUT, buildSitemap(entries), "utf8");
  writeFileSync(RSS_OUT, buildRss(published.sort(
    (a, b) =>
      ((b.publishedAt?.seconds ?? Date.parse(b.publishedAt) / 1000) || 0) -
      ((a.publishedAt?.seconds ?? Date.parse(a.publishedAt) / 1000) || 0)
  )), "utf8");

  console.log(
    `[sitemap] ${entries.length} URL(s) : ${staticEntries.length} statiques, ` +
      `${articleEntries.length} article(s), ${rosterEntries.length} joueur(s).`
  );
  console.log(`[sitemap] rss.xml : ${Math.min(published.length, 30)} article(s).`);
}

main().catch((err) => {
  console.error("[sitemap] Erreur :", err.message || err);
  process.exit(1);
});

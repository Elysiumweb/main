#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SITE_URL = (process.env.REACT_APP_SITE_URL || "https://elysium-esport.fr").replace(/\/$/, "");
const BUILD_INDEX = "build/index.html";
const SEO_SOURCE = "src/components/SEOManager.jsx";
const PRERENDER_PATHS = [
  "/",
  "/equipe",
  "/resultats",
  "/competitions",
  "/actus",
  "/calendrier",
  "/medias",
  "/a-propos",
  "/presse",
  "/support",
  "/recrutement",
  "/statistiques",
  "/partenaires",
  "/soutenir",
  "/newsletter",
];

if (!existsSync(BUILD_INDEX)) {
  console.error("[prerender] build/index.html introuvable. Lancez ce script en postbuild.");
  process.exit(1);
}

const htmlTemplate = readFileSync(BUILD_INDEX, "utf8");
const seoSource = readFileSync(SEO_SOURCE, "utf8");

const routeMeta = new Map();
for (const line of seoSource.split(/\r?\n/)) {
  const pathMatch = line.match(/path:\s*"([^"]+)"/);
  if (!pathMatch || line.includes("noIndex: true") || pathMatch[1].includes(":")) continue;
  const title = line.match(/title:\s*"([^"]+)"/)?.[1];
  const description = line.match(/description:\s*"([^"]+)"/)?.[1];
  const canonical = line.match(/url:\s*"([^"]+)"/)?.[1] || pathMatch[1];
  if (title && description) routeMeta.set(pathMatch[1], { title, description, canonical });
}

const escapeAttr = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/"/g, "&quot;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const replaceTag = (html, regex, tag) => regex.test(html) ? html.replace(regex, tag) : html.replace("</head>", `        ${tag}\n    </head>`);
const setMeta = (html, attr, name, content) => replaceTag(
  html,
  new RegExp(`<meta\\s+[^>]*${attr}=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i"),
  `<meta ${attr}="${escapeAttr(name)}" content="${escapeAttr(content)}" />`,
);
const setLink = (html, rel, href) => replaceTag(
  html,
  new RegExp(`<link\\s+[^>]*rel=["']${rel}["'][^>]*>`, "i"),
  `<link rel="${escapeAttr(rel)}" href="${escapeAttr(href)}" />`,
);

const renderRoute = (routePath, meta) => {
  const canonicalPath = meta.canonical === "/" ? "/" : meta.canonical.replace(/\/$/, "");
  const url = `${SITE_URL}${canonicalPath === "/" ? "/" : canonicalPath}`;
  let html = htmlTemplate;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(meta.title)}</title>`);
  html = setMeta(html, "name", "description", meta.description);
  html = setMeta(html, "name", "robots", "index,follow");
  html = setMeta(html, "property", "og:title", meta.title);
  html = setMeta(html, "property", "og:description", meta.description);
  html = setMeta(html, "property", "og:url", url);
  html = setMeta(html, "property", "og:type", "website");
  html = setMeta(html, "name", "twitter:title", meta.title);
  html = setMeta(html, "name", "twitter:description", meta.description);
  html = setLink(html, "canonical", url);
  html = html.replace('<div id="root"></div>', `<div id="root" data-prerender-path="${escapeAttr(routePath)}"></div>`);
  return html;
};

let count = 0;
for (const routePath of PRERENDER_PATHS) {
  const meta = routeMeta.get(routePath);
  if (!meta) {
    console.warn(`[prerender] Métadonnées introuvables pour ${routePath}, route ignorée.`);
    continue;
  }
  const output = routePath === "/" ? BUILD_INDEX : path.join("build", routePath.replace(/^\//, ""), "index.html");
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, renderRoute(routePath, meta), "utf8");
  count += 1;
}

console.log(`[prerender] ${count} page(s) publiques avec métadonnées statiques.`);

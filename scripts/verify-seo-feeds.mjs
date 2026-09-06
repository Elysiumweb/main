#!/usr/bin/env node
import { readFileSync } from "node:fs";

const SITE_URL = (process.env.REACT_APP_SITE_URL || "https://elysium-esport.fr").replace(/\/$/, "");

const read = (file) => readFileSync(file, "utf8");
const app = read("src/App.js");
const seo = read("src/components/SEOManager.jsx");
const sitemapScript = read("scripts/generate-sitemap.mjs");
const sitemap = read("public/sitemap.xml");
const robots = read("public/robots.txt");
const rss = read("public/rss.xml");

const unique = (items) => [...new Set(items)].sort();
const fail = (message) => failures.push(message);
const failures = [];

const dynamicOrPrivate = (path) =>
  !path || path === "*" || path.includes(":") || ["/connexion", "/profil", "/admin", "/offline"].includes(path) || path.startsWith("/espace-joueur") || path === "/dons";

const appRoutes = unique([...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((route) => route.startsWith("/")).filter((route) => !dynamicOrPrivate(route)));

const seoRoutes = unique(seo.split(/\r?\n/)
  .map((line) => {
    const match = line.match(/path:\s*"([^"]+)"/);
    if (!match) return null;
    return { path: match[1], noIndex: /noIndex:\s*true/.test(line) };
  })
  .filter(Boolean)
  .filter((route) => route.path.startsWith("/") && !route.path.includes(":") && !route.noIndex && route.path !== "/dons")
  .map((route) => route.path));

const staticRoutesBlock = sitemapScript.match(/const STATIC_ROUTES = \[([\s\S]*?)\];/)?.[1] || "";
const staticRoutes = unique([...staticRoutesBlock.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]));
const sitemapPaths = unique([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].replace(/&amp;/g, "&"))
  .filter((loc) => loc.startsWith(SITE_URL))
  .map((loc) => loc.slice(SITE_URL.length) || "/"));

for (const route of appRoutes) {
  if (!seoRoutes.includes(route)) fail(`${route} est dans App.js mais absent de routeSEO`);
  if (!staticRoutes.includes(route)) fail(`${route} est dans App.js mais absent de STATIC_ROUTES`);
  if (!sitemapPaths.includes(route)) fail(`${route} est dans App.js mais absent de public/sitemap.xml`);
}

for (const route of seoRoutes) {
  if (!appRoutes.includes(route)) fail(`${route} est indexable dans routeSEO mais absent de App.js`);
  if (!staticRoutes.includes(route)) fail(`${route} est indexable dans routeSEO mais absent de STATIC_ROUTES`);
}

for (const route of staticRoutes) {
  if (!sitemapPaths.includes(route)) fail(`${route} est dans STATIC_ROUTES mais absent du sitemap publié`);
}

for (const disallow of ["/admin", "/profil", "/connexion", "/espace-joueur"]) {
  if (!new RegExp(`^Disallow:\\s*${disallow.replace(/\//g, "\\/")}$`, "m").test(robots)) {
    fail(`robots.txt ne bloque pas ${disallow}`);
  }
}
if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) fail("robots.txt ne référence pas le sitemap canonique");

const rssItems = [...rss.matchAll(/<item>[\s\S]*?<\/item>/g)];
if (process.env.REQUIRE_RSS_ITEMS === "true" && rssItems.length === 0) fail("RSS sans article alors que REQUIRE_RSS_ITEMS=true");
for (const item of rssItems) {
  const link = item[0].match(/<link>([^<]+)<\/link>/)?.[1]?.replace(/&amp;/g, "&") || "";
  if (!link.startsWith(`${SITE_URL}/actus/`)) fail(`Item RSS hors /actus : ${link || "lien manquant"}`);
}

if (!/rel="self" type="application\/rss\+xml"/.test(rss)) fail("RSS sans atom:link self");

if (failures.length) {
  console.error("Vérification SEO/sitemap/RSS échouée :");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[seo] OK — ${appRoutes.length} routes statiques, ${sitemapPaths.length} URLs sitemap, ${rssItems.length} item(s) RSS.`);

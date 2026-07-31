import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const SITE_URL = (process.env.REACT_APP_SITE_URL || "https://elysium-esport.fr").replace(/\/$/, "");
export const SITE_NAME = "ELYSIUM Esport";
export const DEFAULT_TITLE = "ELYSIUM Esport — Not given. Earned.";
export const DEFAULT_DESCRIPTION = "Équipe esport française sur EVA et Rocket League : résultats, actualités, effectif, recrutement et communauté.";
export const DEFAULT_IMAGE = `${SITE_URL}/brand/logo-icon-gold.png`;

const defaultOrganizationJsonLd = () => ({
  "@context": "https://schema.org",
  "@type": "SportsOrganization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  alternateName: "Elysium",
  url: SITE_URL,
  logo: DEFAULT_IMAGE,
  foundingDate: "2026",
  slogan: "Not given. Earned.",
  sport: ["Esport", "EVA", "Rocket League"],
  sameAs: [
    "https://discord.gg/RH3ZZkMJsw",
    "https://www.twitch.tv/elysiumxeva",
    "https://www.youtube.com/@elysiumfr",
  ],
});

const absoluteUrl = (value) => {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_URL}${value.startsWith("/") ? value : `/${value}`}`;
};

const cleanPath = (path) => {
  const pathname = path || "/";
  return pathname === "/" ? "/" : pathname.replace(/\/$/, "");
};

export const useSEO = ({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  noIndex = false,
  jsonLd = [],
  publishedTime,
  modifiedTime,
} = {}) => {
  const location = useLocation();
  const canonicalPath = cleanPath(url || location.pathname);
  const fullUrl = absoluteUrl(canonicalPath);
  const imageUrl = absoluteUrl(image) || DEFAULT_IMAGE;
  const structuredData = [defaultOrganizationJsonLd(), ...[jsonLd].flat().filter(Boolean)]
    .map((node) => (node["@context"] ? node : { "@context": "https://schema.org", ...node }));

  useEffect(() => {
    document.title = title;

    setMeta("description", description);
    setMeta("robots", noIndex ? "noindex,nofollow" : "index,follow");
    setMeta("theme-color", "#111111");

    setMeta("og:site_name", SITE_NAME);
    setMeta("og:locale", "fr_FR");
    setMeta("og:title", title);
    setMeta("og:description", description);
    setMeta("og:image", imageUrl);
    setMeta("og:url", fullUrl);
    setMeta("og:type", type);
    if (publishedTime) setMeta("article:published_time", publishedTime); else removeMeta("article:published_time");
    if (modifiedTime) setMeta("article:modified_time", modifiedTime); else removeMeta("article:modified_time");

    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
    setMeta("twitter:image", imageUrl);

    setCanonical(fullUrl);
    setJsonLd("elysium-jsonld", structuredData);
  }, [title, description, imageUrl, fullUrl, type, noIndex, publishedTime, modifiedTime, JSON.stringify(structuredData)]); // eslint-disable-line react-hooks/exhaustive-deps
};

function setMeta(name, content) {
  if (!content) return;
  const attr = name.startsWith("og:") || name.startsWith("article:") ? "property" : "name";
  const otherAttr = attr === "name" ? "property" : "name";
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    // Re-use tags that may have been authored with the wrong attribute in older builds.
    el = document.querySelector(`meta[${otherAttr}="${name}"]`);
    if (el) el.removeAttribute(otherAttr);
  }
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  el.setAttribute(attr, name);
  el.setAttribute("content", content);
}

function removeMeta(name) {
  const propertyEl = document.querySelector(`meta[property="${name}"]`);
  const nameEl = document.querySelector(`meta[name="${name}"]`);
  propertyEl?.remove();
  nameEl?.remove();
}

function setCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setJsonLd(id, data) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("script");
    el.id = id;
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data.length === 1 ? data[0] : data);
}

/**
 * Call from a page component. Always safe to call — does nothing if player is null/undefined.
 * Must be called unconditionally from the component body.
 */
export const usePlayerSEO = (player) => {
  const title = player ? `${player.pseudo} — Profil joueur Elysium Esport` : undefined;
  const role = player?.ingameRole ? ` · ${player.ingameRole}` : "";
  const description = player
    ? `${player.pseudo} — ${player.game || "Elysium"}${role}${player.bio ? `. ${player.bio.slice(0, 120)}` : ""}`
    : undefined;
  const image = player?.photo || undefined;
  const url = player ? `/equipe/${player.id}` : undefined;
  const jsonLd = player ? {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${SITE_URL}/equipe/${player.id}#profile`,
    url: `${SITE_URL}/equipe/${player.id}`,
    name: `${player.pseudo} — Elysium Esport`,
    about: {
      "@type": "Person",
      name: player.pseudo,
      image: absoluteUrl(player.photo),
      description: player.bio || description,
      memberOf: { "@id": `${SITE_URL}/#organization` },
      knowsAbout: [player.game, player.ingameRole, player.roster].filter(Boolean),
    },
  } : undefined;
  useSEO({ title, description, image, url, type: "profile", jsonLd });
};

export const useMatchSEO = (match) => {
  const title = match ? `Elysium vs ${match.opponentName} — ${match.competition || "Match"}` : undefined;
  const description = match ? `${match.scoreUs ?? "?"} – ${match.scoreThem ?? "?"} · ${match.date || ""}${match.competition ? ` · ${match.competition}` : ""}` : undefined;
  const image = match?.opponentLogo || undefined;
  const startDate = match?.date ? `${match.date}${match.time ? `T${match.time}` : ""}` : undefined;
  const jsonLd = match ? {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": `${SITE_URL}/resultats#match-${match.id}`,
    name: `Elysium vs ${match.opponentName || "adversaire"}`,
    startDate,
    eventStatus: match.status === "upcoming" ? "https://schema.org/EventScheduled" : "https://schema.org/EventCompleted",
    sport: match.game || "Esport",
    competitor: [
      { "@id": `${SITE_URL}/#organization` },
      { "@type": "SportsTeam", name: match.opponentName || "Adversaire", logo: absoluteUrl(match.opponentLogo) },
    ],
    location: match.platform ? { "@type": "VirtualLocation", name: match.platform, url: match.watchUrl } : undefined,
  } : undefined;
  useSEO({ title, description, image, url: "/resultats", jsonLd });
};

export const useArticleSEO = (article) => {
  const title = article ? `${article.title} — Elysium Esport` : undefined;
  const description = article?.excerpt || (article?.content ? article.content.replace(/\s+/g, " ").slice(0, 160) : undefined);
  const image = article?.coverUrl || undefined;
  const url = article ? `/actus/${article.id}` : undefined;
  const published = article?.publishedAt?.toDate?.()?.toISOString?.() || article?.createdAt?.toDate?.()?.toISOString?.() || article?.date;
  const modified = article?.updatedAt?.toDate?.()?.toISOString?.() || published;
  const jsonLd = article ? {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${SITE_URL}/actus/${article.id}#article`,
    headline: article.title,
    description,
    image: absoluteUrl(image),
    datePublished: published,
    dateModified: modified,
    author: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: SITE_NAME },
    publisher: { "@id": `${SITE_URL}/#organization` },
    mainEntityOfPage: `${SITE_URL}/actus/${article.id}`,
  } : undefined;
  useSEO({ title, description, image, url, type: "article", jsonLd, publishedTime: published, modifiedTime: modified });
};

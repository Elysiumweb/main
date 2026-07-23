import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const BASE_URL = typeof window !== "undefined" ? window.location.origin : "https://elysium-esport.fr";
const DEFAULT_IMAGE = `${BASE_URL}/brand/logo-icon-gold.png`;

export const useSEO = ({ title, description, image, url }) => {
  const location = useLocation();
  const fullUrl = url ? `${BASE_URL}${url}` : `${BASE_URL}${location.pathname}`;

  useEffect(() => {
    if (title) {
      document.title = title;
      setMeta("og:title", title);
      setMeta("twitter:title", title);
    }
    if (description) {
      setMeta("description", description);
      setMeta("og:description", description);
      setMeta("twitter:description", description);
    }
    setMeta("og:image", image || DEFAULT_IMAGE);
    setMeta("twitter:image", image || DEFAULT_IMAGE);
    setMeta("og:url", fullUrl);
    setMeta("twitter:card", "summary_large_image");
    setMeta("og:type", "website");
  }, [title, description, image, fullUrl]);
};

function setMeta(name, content) {
  const isProperty = name.startsWith("og:") || name.startsWith("twitter:");
  const attr = isProperty ? "property" : "name";
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * Call from a page component. Always safe to call — does nothing if player is null/undefined.
 * Must be called unconditionally from the component body.
 */
export const usePlayerSEO = (player) => {
  const title = player ? `${player.pseudo} — Elysium Esport` : undefined;
  const role = player?.ingameRole ? ` · ${player.ingameRole}` : "";
  const description = player ? `${player.pseudo} — ${player.game || "Elysium"}${role}${player.bio ? `. ${player.bio.slice(0, 120)}` : ""}` : undefined;
  const image = player?.photo || undefined;
  const url = player ? `/equipe/${player.id}` : undefined;
  useSEO({ title, description, image, url });
};

export const useMatchSEO = (match) => {
  const title = match ? `Elysium vs ${match.opponentName} — ${match.competition || "Match"}` : undefined;
  const description = match ? `${match.scoreUs ?? "?"} – ${match.scoreThem ?? "?"} · ${match.date || ""}${match.competition ? ` · ${match.competition}` : ""}` : undefined;
  const image = match?.opponentLogo || undefined;
  useSEO({ title, description, image, url: "/resultats" });
};

export const useArticleSEO = (article) => {
  const title = article ? `${article.title} — Elysium Esport` : undefined;
  const description = article?.content ? article.content.slice(0, 160) : undefined;
  const image = article?.coverUrl || undefined;
  const url = article ? `/actus/${article.id}` : undefined;
  useSEO({ title, description, image, url });
};

import { useEffect, useState } from "react";

/**
 * Gestion du consentement par catégories.
 *
 * Catégories :
 *  - analytics : mesure d'audience maison (endpoint interne, aucune donnée
 *    envoyée à un tiers). Toujours optionnelle.
 *  - social    : embeds tiers de l'accueil — Twitch, YouTube (replays) et
 *    l'API Discord (compteurs). Aucun appel réseau tant que non accordé.
 *  - fonts     : polices web. Auto-hébergées ; Google Fonts n'est chargé en
 *    secours que si les fichiers locaux sont absents et que l'utilisateur
 *    l'a accepté.
 *
 * Seul l'essentiel (authentification, langue, consentement lui-même) est
 * stocké sans accord préalable.
 */

const STORAGE_KEY = "elysium_consent_v3";
const LEGACY_BANNER_KEY = "elysium_cookie_consent";

export const CONSENT_CATEGORIES = [
  { id: "analytics", labelKey: "consent.cat.analytics", descKey: "consent.cat.analytics.desc" },
  { id: "social", labelKey: "consent.cat.social", descKey: "consent.cat.social.desc" },
  { id: "fonts", labelKey: "consent.cat.fonts", descKey: "consent.cat.fonts.desc" },
];

const DEFAULTS = { analytics: false, social: false, fonts: false };

const readStored = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    // Migration de l'ancien bandeau binaire « tout ou rien ».
    const legacy = localStorage.getItem(LEGACY_BANNER_KEY);
    if (legacy === "accepted") return { analytics: true, social: true, fonts: true };
    if (legacy === "declined") return { ...DEFAULTS };
    return null; // aucun choix enregistré
  } catch {
    return null;
  }
};

export const getConsent = () => readStored() || { ...DEFAULTS };

export const isConsentDecided = () => readStored() !== null;

export const hasConsent = (category) => !!getConsent()[category];

export const setConsent = (partial) => {
  const next = { ...getConsent(), ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // stockage indisponible : on garde l'état en mémoire pour la session
  }
  window.dispatchEvent(new CustomEvent("elysium:consent", { detail: next }));
  return next;
};

/** Ouvre le gestionnaire de consentement (bandeau étendu) depuis n'importe où. */
export const openConsentManager = () => {
  window.dispatchEvent(new CustomEvent("elysium:open-consent-manager"));
};

/** Hook : re-rend quand le consentement change. */
export const useConsent = () => {
  const [consent, setLocal] = useState(() => getConsent());
  useEffect(() => {
    const onChange = (e) => setLocal(e.detail || getConsent());
    window.addEventListener("elysium:consent", onChange);
    return () => window.removeEventListener("elysium:consent", onChange);
  }, []);
  return consent;
};

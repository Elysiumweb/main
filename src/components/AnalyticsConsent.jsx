import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { analyticsConsentGranted, setAnalyticsConsent, trackPageView } from "../lib/analytics";

const CONSENT_KEY = "elysium_analytics_consent";

const readChoice = () => {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch (_) {
    return null;
  }
};

/**
 * Bandeau de consentement à la mesure d'audience
 * ----------------------------------------------------------------------------
 * Sans choix explicite, aucun événement n'est envoyé : la collecte (Firestore
 * et endpoint HTTP) est conditionnée par `analyticsConsentGranted()`.
 * Un refus est mémorisé et n'est plus demandé.
 */
export const AnalyticsConsent = () => {
  const [choice, setChoice] = useState(readChoice);
  const [granted, setGranted] = useState(() => analyticsConsentGranted());

  useEffect(() => {
    const onConsent = (event) => setGranted(!!event?.detail?.granted);
    window.addEventListener("elysium:analytics-consent", onConsent);
    return () => window.removeEventListener("elysium:analytics-consent", onConsent);
  }, []);

  // Le bandeau réapparaît si l'utilisateur efface son choix depuis un autre onglet.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === CONSENT_KEY) setChoice(readChoice());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (choice || granted) return null;

  const choose = (value) => {
    setAnalyticsConsent(value);
    setChoice(value ? "granted" : "denied");
    // La vue courante n'a pas été comptée avant le choix : on l'enregistre
    // maintenant pour ne pas perdre la première page de la session.
    if (value) trackPageView(window.location.pathname, document.title);
  };

  return (
    <div
      role="dialog"
      aria-label="Consentement à la mesure d'audience"
      className="fixed bottom-3 left-3 right-3 sm:right-auto sm:max-w-md z-[70] border border-[#D8CA82]/30 bg-[#111111]/95 backdrop-blur px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
      data-testid="analytics-consent"
    >
      <div className="flex items-start gap-2">
        <BarChart3 size={15} className="text-[#D8CA82] mt-0.5 shrink-0" />
        <div className="space-y-2">
          <p className="text-xs text-[#f7f7f7]/80 leading-relaxed">
            Nous mesurons l'audience du site de façon <strong className="text-[#f7f7f7]">anonyme</strong> (pages
            vues, clics sur les dons et candidatures) pour améliorer Elysium. Aucune donnée personnelle
            n'est enregistrée.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => choose(true)}
              className="bg-[#D8CA82] text-[#111111] text-[10px] font-display font-bold uppercase tracking-widest px-4 py-2 hover:bg-[#e6d99a]"
              data-testid="analytics-consent-accept"
            >
              Accepter
            </button>
            <button
              onClick={() => choose(false)}
              className="border border-white/20 text-[#f7f7f7]/70 text-[10px] uppercase tracking-widest px-4 py-2 hover:border-white/40"
              data-testid="analytics-consent-decline"
            >
              Refuser
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

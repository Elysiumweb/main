import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../lib/analytics";

/**
 * Émet `page_view` à chaque changement de route.
 * Le consentement est vérifié dans `trackEvent` : sans consentement, seul
 * l'événement local (CustomEvent) est émis, aucune écriture distante.
 */
export const AnalyticsTracker = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    // Les paramètres de requête peuvent contenir des jetons : on ne conserve
    // que le chemin dans l'événement.
    const timer = setTimeout(() => {
      trackPageView(pathname, typeof document !== "undefined" ? document.title : "");
    }, 0);
    return () => clearTimeout(timer);
  }, [pathname, search]);

  return null;
};

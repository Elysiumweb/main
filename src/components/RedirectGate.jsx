import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { resolveRedirect, useRedirects } from "../lib/redirects";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";

/**
 * Résout les redirections configurées dans l'admin, avant le rendu des routes.
 * Les redirections intégrées (/dons → /soutenir) restent disponibles en repli.
 */
export const RedirectGate = () => {
  const { pathname } = useLocation();
  const { map, loaded } = useRedirects();
  const target = loaded ? resolveRedirect(map, pathname) : null;

  useEffect(() => {
    if (target && target !== pathname) {
      trackEvent(ANALYTICS_EVENTS.REDIRECT_HIT, { from: pathname, to: target });
    }
  }, [target, pathname]);

  if (target && target !== pathname) {
    return <Navigate to={target} replace />;
  }
  return null;
};

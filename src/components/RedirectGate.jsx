import { Navigate, useLocation } from "react-router-dom";
import { useRedirects } from "../hooks/useRedirects";
import { resolveRedirect } from "../lib/redirects";

/**
 * Applique les redirections gérées depuis l'admin avant le rendu des routes.
 * Placé à l'intérieur du Router (App), il ne rend rien d'autre qu'un
 * `<Navigate replace>` le cas échéant — la query string est conservée.
 */
export const RedirectGate = () => {
  const { pathname, search } = useLocation();
  const redirects = useRedirects();
  const target = resolveRedirect(redirects, pathname);
  if (!target) return null;
  return <Navigate to={`${target}${search}`} replace />;
};

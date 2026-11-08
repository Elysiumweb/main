/**
 * Gestionnaire de redirections.
 * ----------------------------------------------------------------------------
 * Les redirections « historiques » restent en code (DEFAULT_REDIRECTS) pour
 * fonctionner même si Firestore est indisponible ; l'admin peut en ajouter
 * d'autres dans la collection `redirects`, sans redéploiement.
 *
 * La résolution suit les chaînes (A → B → C) avec un garde-fou : au-delà de
 * `maxHops`, on s'arrête pour éviter une boucle infinie.
 */

export const DEFAULT_REDIRECTS = [
  { id: "default-dons", from: "/dons", to: "/soutenir", active: true, note: "Ancienne page dons", system: true },
];

/** Normalise un chemin : slash initial, pas de slash final, pas d'espaces. */
export const normalizePath = (path) => {
  const raw = String(path ?? "").trim();
  if (!raw) return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const collapsed = withSlash.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return collapsed || "/";
};

export const isInternalPath = (path) => normalizePath(path).startsWith("/") && !normalizePath(path).startsWith("//");

export const mergeRedirects = (custom = []) => {
  const map = new Map();
  [...DEFAULT_REDIRECTS, ...(Array.isArray(custom) ? custom : [])].forEach((rule) => {
    if (!rule || !rule.from) return;
    const key = normalizePath(rule.from);
    // Une règle personnalisée remplace la règle par défaut sur le même chemin.
    map.set(key, { ...rule, from: key, to: normalizePath(rule.to) });
  });
  return [...map.values()];
};

/**
 * Retourne la destination finale, ou `null` si le chemin n'est pas redirigé.
 * `pathname` est comparé sans slash final ni query string.
 */
export const resolveRedirect = (redirects = [], pathname = "/", maxHops = 5) => {
  const rules = mergeRedirects(redirects).filter((rule) => rule.active !== false);
  const start = normalizePath(pathname);
  let current = start;
  const seen = new Set([start]);
  for (let hop = 0; hop < maxHops; hop += 1) {
    const rule = rules.find((r) => normalizePath(r.from) === current);
    if (!rule) break;
    const next = normalizePath(rule.to);
    if (seen.has(next)) return null; // boucle : on n'applique rien
    seen.add(next);
    current = next;
  }
  return current === start ? null : current;
};

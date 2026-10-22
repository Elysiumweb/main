import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Gestion des redirections
 * ============================================================================
 * Une seule redirection vivait dans `App.js` (`/dons` → `/soutenir`), en dur.
 * Renommer une page laissait donc des liens morts partout (réseaux, presse,
 * partenaires).
 *
 * Les redirections sont maintenant des documents `redirects` (lecture publique,
 * écriture bureau), résolus côté client au changement d'URL. La redirection
 * historique reste un repli intégré : supprimer la ligne dans l'admin ne casse
 * pas `/dons`.
 */

export const BUILTIN_REDIRECTS = [
  { id: "builtin-dons", from: "/dons", to: "/soutenir", enabled: true, permanent: true, builtin: true },
];

export const normalizePath = (value) => {
  if (typeof value !== "string") return "/";
  let path = value.trim();
  if (!path) return "/";
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return "/";
    }
  }
  if (!path.startsWith("/")) path = `/${path}`;
  const [withoutQuery] = path.split(/[?#]/);
  const collapsed = withoutQuery.replace(/\/{2,}/g, "/");
  if (collapsed.length > 1) return collapsed.replace(/\/+$/, "") || "/";
  return collapsed;
};

/** Un chemin de redirection doit être interne, différent de sa cible. */
export const isValidRedirect = ({ from, to } = {}) => {
  if (typeof from !== "string" || typeof to !== "string") return false;
  if (!from.trim().startsWith("/") || !to.trim().startsWith("/")) return false;
  if (from.includes("://") || to.includes("://")) return false;
  if (from.trim().length > 300 || to.trim().length > 300) return false;
  return normalizePath(from) !== normalizePath(to);
};

/**
 * Construit la table de redirection effective.
 * Les redirections intégrées sont permanentes : une ligne Firestore peut en
 * changer la cible, mais une ligne désactivée ne peut pas casser un ancien lien
 * (des URLs circulent dans la presse et sur les réseaux depuis des années).
 */
export const buildRedirectMap = (rows = []) => {
  const map = new Map();
  BUILTIN_REDIRECTS.forEach((row) => map.set(normalizePath(row.from), row));
  const seen = new Set();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row || typeof row.from !== "string") return;
    const from = normalizePath(row.from);
    const isBuiltin = map.has(from) && map.get(from).builtin === true;
    seen.add(from);
    if (row.enabled === false) {
      // Une redirection intégrée reste active quoi qu'il arrive.
      if (!isBuiltin) map.delete(from);
      return;
    }
    if (!isValidRedirect({ from: row.from, to: row.to })) return;
    map.set(from, { ...row, from, to: normalizePath(row.to) });
  });
  return map;
};

/** Cible pour un chemin donné, ou null. */
export const resolveRedirect = (map, pathname) => {
  if (!map || !pathname) return null;
  const match = map.get(normalizePath(pathname));
  if (!match) return null;
  return match.to;
};

export const useRedirects = () => {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    return onSnapshot(
      collection(db, "redirects"),
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoaded(true);
      },
      (err) => {
        console.error("redirects sync", err);
        setLoaded(true);
      },
    );
  }, []);

  const map = useMemo(() => buildRedirectMap(rows), [rows]);
  return { rows, map, loaded };
};

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { mergeRedirects } from "../lib/redirects";

/**
 * Redirections actives : règles par défaut (code) + collection `redirects`.
 * Lecture publique, écriture bureau. En cas d'échec, on garde les défauts
 * pour que /dons continue de fonctionner.
 */
export const useRedirects = () => {
  const [custom, setCustom] = useState([]);

  useEffect(() => {
    return onSnapshot(collection(db, "redirects"), (snap) => {
      setCustom(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setCustom([]));
  }, []);

  return useMemo(() => mergeRedirects(custom), [custom]);
};

export const useCustomRedirects = () => {
  const [custom, setCustom] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    return onSnapshot(collection(db, "redirects"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => String(a.from || "").localeCompare(String(b.from || "")));
      setCustom(list);
      setLoading(false);
    }, () => setLoading(false));
  }, []);
  return { custom, loading };
};

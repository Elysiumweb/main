import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

/**
 * Rosters dynamiques — créés/supprimés par le compte officiel depuis le panel
 * admin (collection Firestore `rosters`, documents `{ name, game }`).
 * Remplace l'ancien objet prédéfini `ROSTERS` : plus aucune modification de
 * code n'est nécessaire pour ajouter ou retirer un roster.
 */
export const useRosters = () => {
  const [rosters, setRosters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      collection(db, "rosters"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) =>
          (a.game || "").localeCompare(b.game || "") || (a.name || "").localeCompare(b.name || "")
        );
        setRosters(list);
        setLoading(false);
      },
      (err) => {
        console.error("rosters sync", err);
        setLoading(false);
      }
    );
  }, []);

  const byGame = useMemo(() => {
    const map = {};
    rosters.forEach((r) => {
      if (!r.game || !r.name) return;
      if (!map[r.game]) map[r.game] = [];
      map[r.game].push(r.name);
    });
    Object.values(map).forEach((names) => names.sort((a, b) => a.localeCompare(b)));
    return map;
  }, [rosters]);

  const rostersForGame = useMemo(
    () => (game) => (game ? [...(byGame[game] || [])] : []),
    [byGame]
  );

  const gameHasRosters = useMemo(
    () => (game) => (game ? (byGame[game] || []).length > 0 : false),
    [byGame]
  );

  const allNames = useMemo(() => Object.values(byGame).flat(), [byGame]);

  return { rosters, byGame, allNames, rostersForGame, gameHasRosters, loading };
};

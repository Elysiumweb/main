import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { CLOSED_STATUSES } from "../lib/inbox";

const needsAttention = (thread) =>
  !CLOSED_STATUSES.includes(thread.status) && !thread.assignedTo;

/**
 * Compteur de la boîte de réception pour la navbar.
 * `attention` = fils non terminés sans responsable (tickets support + candidatures).
 * Écoute uniquement les collections auxquelles l'utilisateur a droit : les
 * règles Firestore refuseraient la lecture des autres.
 */
export const useInboxCounts = () => {
  const { user, canSeeSupport, canSeeRecruit } = useAuth();
  const [support, setSupport] = useState([]);
  const [recruit, setRecruit] = useState([]);

  useEffect(() => {
    if (!user || !canSeeSupport) { setSupport([]); return undefined; }
    return onSnapshot(collection(db, "supportThreads"),
      (snap) => setSupport(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setSupport([]));
  }, [user, canSeeSupport]);

  useEffect(() => {
    if (!user || !canSeeRecruit) { setRecruit([]); return undefined; }
    return onSnapshot(collection(db, "recruitThreads"),
      (snap) => setRecruit(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setRecruit([]));
  }, [user, canSeeRecruit]);

  const threads = [...support, ...recruit];
  const open = threads.filter((th) => !CLOSED_STATUSES.includes(th.status)).length;
  const attention = threads.filter((th) => needsAttention(th)).length;
  return { open, attention, total: threads.length };
};

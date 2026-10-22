import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { PERMISSION } from "../lib/permissions";

const OPEN_SUPPORT = ["open", "in_progress"];
const OPEN_RECRUIT = ["pending", "reviewing", "interviewing", "pending_parental_consent"];

/**
 * Compteur de dossiers en attente pour la navbar (badge « admin »).
 * Abonnements montés uniquement pour le staff autorisé : un visiteur ne
 * déclenche aucune lecture supplémentaire.
 */
export const useInboxBadge = () => {
  const { user, can } = useAuth();
  const canSupport = !!user && can(PERMISSION.INBOX_SUPPORT);
  const canRecruit = !!user && can(PERMISSION.INBOX_RECRUIT);
  const [support, setSupport] = useState(0);
  const [recruit, setRecruit] = useState(0);

  useEffect(() => {
    if (!canSupport) { setSupport(0); return; }
    return onSnapshot(
      query(collection(db, "supportThreads"), where("status", "in", OPEN_SUPPORT)),
      (snap) => setSupport(snap.size),
      () => setSupport(0),
    );
  }, [canSupport]);

  useEffect(() => {
    if (!canRecruit) { setRecruit(0); return; }
    return onSnapshot(
      query(collection(db, "recruitThreads"), where("status", "in", OPEN_RECRUIT)),
      (snap) => setRecruit(snap.size),
      () => setRecruit(0),
    );
  }, [canRecruit]);

  return { support, recruit, total: support + recruit };
};

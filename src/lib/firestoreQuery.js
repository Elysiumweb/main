import { useQuery } from "@tanstack/react-query";
import { collection, doc, getDoc, getDocs, query } from "firebase/firestore";
import { db } from "./firebase";

const DEFAULT_STALE_TIME = 5 * 60 * 1000;

export const mapFirestoreDoc = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });

const cleanPath = (path) => String(path || "").replace(/^\/+|\/+$/g, "");

/**
 * @param {string} collectionPath
 * @param {import("firebase/firestore").QueryConstraint[]} constraints
 */
export async function fetchFirestoreCollection(collectionPath, constraints = []) {
  const ref = collection(db, cleanPath(collectionPath));
  const q = constraints.length ? query(ref, ...constraints) : ref;
  const snap = await getDocs(q);
  return snap.docs.map(mapFirestoreDoc);
}

/**
 * @param {string} collectionPath
 * @param {string} id
 */
export async function fetchFirestoreDocument(collectionPath, id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, cleanPath(collectionPath), id));
  return snap.exists() ? mapFirestoreDoc(snap) : null;
}

/**
 * Lecture Firestore non temps-réel pour les pages publiques.
 * Les listeners onSnapshot restent réservés aux écrans collaboratifs/admin qui
 * ont réellement besoin du temps réel ; ici React Query mutualise le cache,
 * évite les abonnements doublonnés et limite les lectures initiales.
 */
export function useFirestoreCollection(queryKey, collectionPath, constraints = [], options = {}) {
  const { enabled = true, staleTime = DEFAULT_STALE_TIME, gcTime = 30 * 60 * 1000, select } = options;
  return useQuery({
    queryKey,
    enabled,
    staleTime,
    gcTime,
    retry: 1,
    queryFn: () => fetchFirestoreCollection(collectionPath, constraints),
    select,
  });
}

export function useFirestoreDocument(queryKey, collectionPath, id, options = {}) {
  const { enabled = true, staleTime = DEFAULT_STALE_TIME, gcTime = 30 * 60 * 1000 } = options;
  return useQuery({
    queryKey,
    enabled: enabled && Boolean(id),
    staleTime,
    gcTime,
    retry: 1,
    queryFn: () => fetchFirestoreDocument(collectionPath, id),
  });
}

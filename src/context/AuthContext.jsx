import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { canAccessAdmin, hasPermission, resolvePermissions } from "../lib/permissions";

/**
 * Publie une fiche minimale dans `profiles/{uid}` (annuaire privé entre joueurs).
 * Utilisée par le chat (@mentions) et l'en-tête « absents aujourd'hui » du staff.
 * On ne synchronise QUE les joueurs ayant accès à l'espace privé, et on évite
 * toute écriture inutile si rien n'a changé.
 */
const publishProfileDirectory = ({ uid, displayName, game, roster, photoURL, hasPlayerAccess, discordId }) => {
  if (!uid || !hasPlayerAccess) return;
  const payload = {
    uid,
    displayName: displayName || "",
    game: game || null,
    roster: roster || null,
    photoURL: photoURL || null,
    discordId: discordId || null,
    updatedAt: serverTimestamp(),
  };
  setDoc(doc(db, "profiles", uid), payload, { merge: true }).catch((e) => console.error("profiles sync", e));
};

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [officialUids, setOfficialUids] = useState([]);
  const [loading, setLoading] = useState(true);

  // Liste d'amorçage des comptes officiels, lue sur le même document que les
  // règles Firestore (`config/officials`). Sans ce document, le statut vient
  // uniquement de `users/{uid}.official`.
  useEffect(() => {
    if (!user) { setOfficialUids([]); return undefined; }
    return onSnapshot(
      doc(db, "config", "officials"),
      (snap) => {
        const uids = snap.exists() ? snap.data().uids : [];
        setOfficialUids(Array.isArray(uids) ? uids : []);
      },
      () => setOfficialUids([]),
    );
  }, [user]);

  useEffect(() => {
    let unsubProfile = null;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const ref = doc(db, "users", u.uid);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const base = {
            email: u.email || "",
            photoURL: u.photoURL || "",
            role: "visitor",
            game: null,
            createdAt: serverTimestamp(),
          };
          if (u.displayName) base.displayName = u.displayName;
          await setDoc(ref, base, { merge: true });
        } else {
          await setDoc(ref, { email: u.email || "", photoURL: u.photoURL || "" }, { merge: true });
        }
      } catch (e) { console.error("profile init", e); }
      unsubProfile = onSnapshot(ref, (s) => {
          const data = s.data() || null;
          setProfile(data);
          setLoading(false);
          const hasAccess = ["player", "manager", "bureau"].includes(data?.role);
          publishProfileDirectory({
            uid: u.uid,
            displayName: data?.displayName || u.displayName || (u.email ? u.email.split("@")[0] : ""),
            game: data?.game || null,
            roster: data?.roster || null,
            photoURL: u.photoURL || data?.photoURL || null,
            discordId: data?.discordId || null,
            hasPlayerAccess: hasAccess,
          });
        },
        () => setLoading(false));
    });
    return () => { unsub(); if (unsubProfile) unsubProfile(); };
  }, []);

  // Le statut officiel vient exclusivement des données (`users/{uid}.official`
  // ou `config/officials.uids`), exactement comme les règles Firestore. Aucun
  // UID n'est codé en dur : l'interface ne peut pas afficher des droits que le
  // serveur refuserait.
  const isOfficial = !!user && (profile?.official === true || officialUids.includes(user.uid));
  const role = isOfficial ? "bureau" : profile?.role || "visitor";
  const game = profile?.game || null;
  const roster = profile?.roster || null;
  const permissions = useMemo(
    () => resolvePermissions({ role, permissions: profile?.permissions || [], official: isOfficial }),
    [role, profile?.permissions, isOfficial],
  );
  const can = useCallback(
    (permission) => hasPermission(permissions, permission),
    [permissions],
  );
  const hasPlayerAccess = isOfficial || ["player", "manager", "bureau"].includes(profile?.role);
  const canSeeSupport = can("inbox.support");
  const canSeeRecruit = can("inbox.recruit");
  const canManage = isOfficial || ["manager", "bureau"].includes(profile?.role) || can("inbox.manage");
  const canAccessAdminPanel = canAccessAdmin(permissions);
  const displayName = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "";

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, isOfficial, role, game, roster, permissions, can, canAccessAdmin: canAccessAdminPanel, hasPlayerAccess, canSeeSupport, canSeeRecruit, canManage, displayName, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

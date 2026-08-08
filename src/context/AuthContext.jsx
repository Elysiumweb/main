import { createContext, useContext, useEffect, useState } from "react";
import { multiFactor, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { OFFICIAL_UID } from "../lib/constants";

/**
 * Publie une fiche minimale dans `profiles/{uid}` (annuaire privé entre joueurs).
 * Utilisée par le chat (@mentions) et l'en-tête « absents aujourd'hui » du staff.
 * On ne synchronise QUE les joueurs ayant accès à l'espace privé, et on évite
 * toute écriture inutile si rien n'a changé.
 */
const publishProfileDirectory = ({ uid, displayName, game, roster, photoURL, hasPlayerAccess }) => {
  if (!uid || !hasPlayerAccess) return;
  const payload = {
    uid,
    displayName: displayName || "",
    game: game || null,
    roster: roster || null,
    photoURL: photoURL || null,
    updatedAt: serverTimestamp(),
  };
  setDoc(doc(db, "profiles", uid), payload, { merge: true }).catch((e) => console.error("profiles sync", e));
};

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mfaVersion, setMfaVersion] = useState(0);

  useEffect(() => {
    const onMfaChanged = () => setMfaVersion((v) => v + 1);
    window.addEventListener("elysium:mfa-changed", onMfaChanged);
    return () => window.removeEventListener("elysium:mfa-changed", onMfaChanged);
  }, []);

  useEffect(() => {
    let unsubProfile = null;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      setUser(u);
      if (!u) { setProfile(null); setLoading(false); return; }
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
          const hasAccess = !!OFFICIAL_UID && u.uid === OFFICIAL_UID
            || ["player", "manager", "bureau"].includes(data?.role);
          publishProfileDirectory({
            uid: u.uid,
            displayName: data?.displayName || u.displayName || (u.email ? u.email.split("@")[0] : ""),
            game: data?.game || null,
            roster: data?.roster || null,
            photoURL: u.photoURL || data?.photoURL || null,
            hasPlayerAccess: hasAccess,
          });
        },
        () => setLoading(false));
    });
    return () => { unsub(); if (unsubProfile) unsubProfile(); };
  }, []);

  const isOfficial = !!user && user.uid === OFFICIAL_UID;
  const role = isOfficial ? "bureau" : profile?.role || "visitor";
  const game = profile?.game || null;
  const roster = profile?.roster || null;
  const hasPlayerAccess = isOfficial || ["player", "manager", "bureau"].includes(profile?.role);
  // mfaVersion force un recalcul après enrôlement/retrait TOTP sans attendre une reconnexion.
  const mfaEnrolled = !!user && mfaVersion >= 0 && (multiFactor(user).enrolledFactors || []).some((factor) => factor.factorId === "totp");
  const requiresMfa = !!user && (isOfficial || profile?.role === "bureau");
  const canSeeSupport = isOfficial || profile?.role === "bureau";
  const canSeeRecruit = isOfficial || ["manager", "bureau"].includes(profile?.role);
  const canManage = isOfficial || ["manager", "bureau"].includes(profile?.role);
  const displayName = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "";

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isOfficial, role, game, roster, hasPlayerAccess, canSeeSupport, canSeeRecruit, canManage, displayName, mfaEnrolled, requiresMfa, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

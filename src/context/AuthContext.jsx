import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { OFFICIAL_UID } from "../lib/constants";
import { syncEnrolledFactors } from "../lib/mfa";
import { clearMfaSession, isMfaSessionOk, markMfaSessionOk } from "../lib/totp";

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
  const [enrolledFactors, setEnrolledFactors] = useState([]);
  const [mfaVerified, setMfaVerified] = useState(false);

  const refreshMfa = useCallback(async () => {
    const factors = await syncEnrolledFactors(auth.currentUser);
    setEnrolledFactors(factors);
    if (auth.currentUser) setUser(auth.currentUser);
    return factors;
  }, []);

  const confirmMfaSession = useCallback(() => {
    if (!auth.currentUser) return;
    markMfaSessionOk(auth.currentUser.uid);
    setMfaVerified(true);
  }, []);

  useEffect(() => {
    let unsubProfile = null;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      setUser(u);
      if (!u) {
        setProfile(null);
        setEnrolledFactors([]);
        setMfaVerified(false);
        setLoading(false);
        return;
      }
      setMfaVerified(isMfaSessionOk(u.uid));
      setEnrolledFactors(await syncEnrolledFactors(u).catch(() => []));
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
  const mfaEnrolled = !!profile?.totpEnabled || enrolledFactors.length > 0;
  const mfaPending = !!user && !!profile?.totpEnabled && !mfaVerified;
  const requiresMfa = !!user && (isOfficial || profile?.role === "bureau");
  const canSeeSupport = isOfficial || profile?.role === "bureau";
  const canSeeRecruit = isOfficial || ["manager", "bureau"].includes(profile?.role);
  const canManage = isOfficial || ["manager", "bureau"].includes(profile?.role);
  const displayName = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "";

  const logout = async () => {
    clearMfaSession(user?.uid);
    setMfaVerified(false);
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, isOfficial, role, game, roster, hasPlayerAccess, canSeeSupport, canSeeRecruit, canManage, displayName, mfaEnrolled, mfaPending, mfaVerified, requiresMfa, enrolledFactors, refreshMfa, confirmMfaSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

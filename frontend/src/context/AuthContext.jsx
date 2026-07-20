import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { OFFICIAL_UID } from "../lib/constants";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Si Firebase non configuré (auth factice), on ne tente pas d'écouter
    if (!auth || auth._isFake || typeof onAuthStateChanged !== "function") {
      setLoading(false);
      return () => {};
    }
    let unsubProfile = null;
    let unsubAuth = null;
    try {
      unsubAuth = onAuthStateChanged(auth, async (u) => {
        if (unsubProfile) { unsubProfile(); unsubProfile = null; }
        setUser(u);
        if (!u) { setProfile(null); setLoading(false); return; }
        // db peut être fake
        if (!db || db._isFake) {
          setLoading(false);
          return;
        }
        try {
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
          unsubProfile = onSnapshot(ref, (s) => { setProfile(s.data() || null); setLoading(false); },
            () => setLoading(false));
        } catch (e) {
          console.error("AuthContext profile listener", e);
          setLoading(false);
        }
      });
    } catch (e) {
      console.error("onAuthStateChanged failed", e);
      setLoading(false);
    }
    return () => {
      try { if (unsubAuth) unsubAuth(); } catch {}
      try { if (unsubProfile) unsubProfile(); } catch {}
    };
  }, []);

  const isOfficial = !!user && user.uid === OFFICIAL_UID;
  const role = isOfficial ? "bureau" : profile?.role || "visitor";
  const game = profile?.game || null;
  const hasPlayerAccess = isOfficial || ["player", "manager", "bureau"].includes(profile?.role);
  const canSeeSupport = isOfficial || profile?.role === "bureau";
  const canSeeRecruit = isOfficial || ["manager", "bureau"].includes(profile?.role);
  const canManage = isOfficial || ["manager", "bureau"].includes(profile?.role);
  const displayName = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "";

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isOfficial, role, game, hasPlayerAccess, canSeeSupport, canSeeRecruit, canManage, displayName, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, updateProfile, sendPasswordResetEmail, sendEmailVerification,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { auth, db, googleProvider } from "../lib/firebase";
import { useLang } from "../lib/i18n";

const errMsg = (code) => {
  const map = {
    "auth/invalid-credential": "Identifiants invalides.",
    "auth/email-already-in-use": "Cet email est déjà utilisé.",
    "auth/weak-password": "Mot de passe trop faible (6 caractères min).",
    "auth/invalid-email": "Email invalide.",
    "auth/too-many-requests": "Trop de tentatives. Réessayez plus tard.",
  };
  return map[code] || "Erreur d'authentification.";
};

export default function Login() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const name = pseudo.trim() || email.split("@")[0];
        await setDoc(doc(db, "users", cred.user.uid), { displayName: name, email, role: "visitor", game: null }, { merge: true });
        await updateProfile(cred.user, { displayName: name });
        try { await sendEmailVerification(cred.user); } catch (e) { console.error(e); }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate("/");
    } catch (err) { console.error(err); toast.error(errMsg(err.code)); }
    setBusy(false);
  };

  const google = async () => {
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate("/");
    } catch (err) { console.error(err); if (err.code !== "auth/popup-closed-by-user") toast.error(errMsg(err.code)); }
    setBusy(false);
  };

  const forgot = async () => {
    if (!email) { toast.error(t("login.email")); return; }
    try { await sendPasswordResetEmail(auth, email); toast.success(t("login.resetSent")); }
    catch (err) { toast.error(errMsg(err.code)); }
  };

  return (
    <div className="min-h-[80vh] bg-[#111111] relative flex items-center justify-center px-4 py-16 overflow-hidden">
      <div className="pattern-overlay" />
      <div className="w-full max-w-md border border-white/10 bg-[#1A1A1A] p-8 relative anim-fade-up" data-testid="login-card">
        <img src="/brand/logo-icon-gold.png" alt="Elysium" className="h-14 mx-auto mb-6 gold-glow" />
        <h1 className="font-display font-bold text-2xl text-[#f7f7f7] text-center uppercase tracking-widest mb-8" data-testid="login-title">
          {mode === "login" ? t("login.title") : t("login.register")}
        </h1>
        <form onSubmit={submit} className="space-y-5">
          {mode === "register" && (
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("login.pseudo")}</label>
              <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} required data-testid="login-pseudo-input"
                className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
            </div>
          )}
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("login.email")}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email-input"
              className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("login.password")}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password-input"
              className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
          </div>
          <button type="submit" disabled={busy} data-testid="login-submit-btn"
            className="w-full bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm py-3 disabled:opacity-50 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
            {mode === "login" ? t("login.submit") : t("login.submitRegister")}
          </button>
        </form>
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs uppercase tracking-widest text-[#f7f7f7]/40">{t("login.or")}</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>
        <button onClick={google} disabled={busy} data-testid="login-google-btn"
          className="w-full border border-white/25 text-[#f7f7f7] text-sm py-3 flex items-center justify-center gap-3 hover:border-[#D8CA82] transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {t("login.google")}
        </button>
        <div className="flex justify-between items-center mt-6 text-xs">
          <button onClick={() => setMode(mode === "login" ? "register" : "login")} data-testid="login-toggle-mode-btn"
            className="text-[#D8CA82] hover:underline uppercase tracking-wider">
            {mode === "login" ? t("login.noAccount") : t("login.haveAccount")}
          </button>
          {mode === "login" && (
            <button onClick={forgot} className="text-[#f7f7f7]/40 hover:text-[#D8CA82] transition-colors" data-testid="login-forgot-btn">
              {t("login.forgot")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

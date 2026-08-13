import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, updateProfile, sendPasswordResetEmail, sendEmailVerification,
  TotpMultiFactorGenerator,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { auth, db, googleProvider } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { mfaErrorMessage, resolverFromMfaError } from "../lib/mfa";

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

const inputCls =
  "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

export default function Login() {
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [mfaResolver, setMfaResolver] = useState(null);
  const [mfaCode, setMfaCode] = useState("");

  const safeRedirect = () => {
    const fromState = location.state?.from;
    const statePath = fromState?.pathname ? `${fromState.pathname || ""}${fromState.search || ""}${fromState.hash || ""}` : "";
    const queryPath = new URLSearchParams(location.search).get("redirect") || "";
    const storedPath = sessionStorage.getItem("elysium_auth_redirect") || "";
    const candidate = statePath || queryPath || storedPath || "/";
    sessionStorage.removeItem("elysium_auth_redirect");
    return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";
  };

  const completeLogin = () => navigate(safeRedirect(), { replace: true });

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
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
      completeLogin();
    } catch (err) {
      console.error(err);
      const resolver = resolverFromMfaError(err);
      if (resolver) {
        setMfaResolver(resolver);
        setFormError(mfaErrorMessage(err));
        setBusy(false);
        return;
      }
      const msg = errMsg(err.code);
      setFormError(msg);
      toast.error(msg);
    }
    setBusy(false);
  };

  const google = async () => {
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
      completeLogin();
    } catch (err) {
      console.error(err);
      const resolver = resolverFromMfaError(err);
      if (resolver) {
        setMfaResolver(resolver);
        setFormError(mfaErrorMessage(err));
        setBusy(false);
        return;
      }
      if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        const msg = errMsg(err.code);
        setFormError(msg);
        toast.error(msg);
      }
    }
    setBusy(false);
  };

  const verifyMfa = async (e) => {
    e.preventDefault();
    if (!mfaResolver) return;
    const hint = mfaResolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) || mfaResolver.hints[0];
    if (!hint || hint.factorId !== TotpMultiFactorGenerator.FACTOR_ID) {
      toast.error("Second facteur non supporté.");
      return;
    }
    setBusy(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, mfaCode.trim());
      await mfaResolver.resolveSignIn(assertion);
      setMfaResolver(null);
      setMfaCode("");
      completeLogin();
    } catch (err) {
      console.error(err);
      const msg = mfaErrorMessage(err.code ? err : { code: "auth/invalid-verification-code" });
      setFormError(msg);
      toast.error(msg);
    }
    setBusy(false);
  };

  const forgot = async () => {
    if (!email) {
      const msg = t("login.email");
      setFormError(msg);
      toast.error(msg);
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success(t("login.resetSent"));
    } catch (err) {
      const msg = errMsg(err.code);
      setFormError(msg);
      toast.error(msg);
    }
  };

  // Stable IDs for aria-describedby
  const pseudoId = "login-pseudo";
  const emailId = "login-email";
  const passwordId = "login-password";
  const errorId = "login-error";
  const passwordHintId = "login-password-hint";

  return (
    <div className="min-h-[80vh] bg-[#111111] relative flex items-center justify-center px-4 py-16 overflow-hidden">
      <div className="pattern-overlay" />
      <div
        className="w-full max-w-md border border-white/10 bg-[#1A1A1A] p-8 relative anim-fade-up motion-reduce:animate-none"
        data-testid="login-card"
      >
        <img src="/brand/logo-icon-gold.png" alt="Logo Elysium" className="h-14 mx-auto mb-6 gold-glow" />
        <h1
          className="font-display font-bold text-2xl text-[#f7f7f7] text-center uppercase tracking-widest mb-8"
          data-testid="login-title"
        >
          {mode === "login" ? t("login.title") : t("login.register")}
        </h1>

        {/* Live region for form errors */}
        <div
          id={errorId}
          role="alert"
          aria-live="polite"
          className={formError ? "form-error mb-4" : "sr-only"}
        >
          {formError || ""}
        </div>

        {mfaResolver ? (
          <form onSubmit={verifyMfa} className="space-y-5" data-testid="login-mfa-form">
            <div>
              <label htmlFor="login-mfa-code" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">
                Code d'authentification à 6 chiffres
              </label>
              <input
                id="login-mfa-code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={6}
                data-testid="login-mfa-code-input"
                className={inputCls}
              />
            </div>
            <button type="submit" disabled={busy || mfaCode.length < 6} data-testid="login-mfa-submit"
              className="w-full bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm py-3 disabled:opacity-50 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow motion-reduce:transition-none">
              Valider la double authentification
            </button>
            <button type="button" onClick={() => { setMfaResolver(null); setMfaCode(""); }} className="w-full text-xs text-[#c8c8c8] hover:text-[#D8CA82] uppercase tracking-widest">
              Retour
            </button>
          </form>
        ) : (
        <form onSubmit={submit} className="space-y-5" noValidate={false}>
          {mode === "register" && (
            <div>
              <label
                htmlFor={pseudoId}
                className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2"
              >
                {t("login.pseudo")}
              </label>
              <input
                id={pseudoId}
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                required
                autoComplete="username"
                aria-describedby={formError ? errorId : undefined}
                data-testid="login-pseudo-input"
                className={inputCls}
              />
            </div>
          )}
          <div>
            <label
              htmlFor={emailId}
              className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2"
            >
              {t("login.email")}
            </label>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              aria-describedby={formError ? errorId : undefined}
              data-testid="login-email-input"
              className={inputCls}
            />
          </div>
          <div>
            <label
              htmlFor={passwordId}
              className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2"
            >
              {t("login.password")}
            </label>
            <input
              id={passwordId}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              aria-describedby={`${passwordHintId}${formError ? " " + errorId : ""}`}
              data-testid="login-password-input"
              className={inputCls}
            />
            <p id={passwordHintId} className="form-hint">
              6 caractères minimum.
            </p>
          </div>
          <button
            type="submit"
            disabled={busy}
            data-testid="login-submit-btn"
            className="w-full bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm py-3 disabled:opacity-50 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow motion-reduce:transition-none"
          >
            {mode === "login" ? t("login.submit") : t("login.submitRegister")}
          </button>
        </form>
        )}

        {!mfaResolver && <>
        <div className="flex items-center gap-4 my-6" role="separator" aria-orientation="horizontal">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs uppercase tracking-widest text-[#c8c8c8]">{t("login.or")}</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <button
          onClick={google}
          disabled={busy}
          data-testid="login-google-btn"
          aria-label={t("login.google")}
          className="w-full border border-white/25 text-[#f7f7f7] text-sm py-3 flex items-center justify-center gap-3 hover:border-[#D8CA82] transition-colors motion-reduce:transition-none"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {t("login.google")}
        </button>

        <div className="flex justify-between items-center mt-6 text-xs">
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            data-testid="login-toggle-mode-btn"
            className="text-[#D8CA82] hover:underline uppercase tracking-wider focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
          >
            {mode === "login" ? t("login.noAccount") : t("login.haveAccount")}
          </button>
          {mode === "login" && (
            <button
              onClick={forgot}
              className="text-[#c8c8c8] hover:text-[#D8CA82] transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
              data-testid="login-forgot-btn"
            >
              {t("login.forgot")}
            </button>
          )}
        </div>
        </>}
      </div>
    </div>
  );
}

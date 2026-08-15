import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../context/AuthContext";
import { functions } from "../lib/firebase";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

/**
 * Écran de double authentification.
 *
 * Le code TOTP n'est PAS vérifié dans le navigateur : il est envoyé à la Cloud
 * Function `verifyMfaSession` qui vérifie le code côté serveur (secret stocké
 * dans mfaSecrets/{uid}) puis écrit mfaSessions/{uid} avec un horodatage
 * serveur. Les règles Firestore exigent cette session récente (< 6 h) pour
 * toute opération sensible — contourner l'interface ne suffit plus.
 */
export const MfaChallenge = () => {
  const { user, mfaPending, confirmMfaSession, logout } = useAuth() || {};
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!user || !mfaPending) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const call = httpsCallable(functions, "verifyMfaSession");
      await call({ code });
      confirmMfaSession?.();
      toast.success("Double authentification validée.");
    } catch (err) {
      console.error(err);
      const codeErr = err?.code || "";
      if (codeErr === "functions/unauthenticated" || codeErr === "functions/permission-denied") {
        setError("Code invalide ou expiré.");
      } else if (codeErr === "functions/failed-precondition") {
        setError("Aucun second facteur actif sur ce compte. Réactivez la 2FA depuis votre profil.");
      } else {
        setError(err?.message || "Impossible de vérifier le code pour le moment.");
      }
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-[#111111]/95 flex items-center justify-center px-4" data-testid="mfa-challenge-overlay">
      <div className="w-full max-w-md border border-white/10 bg-[#1A1A1A] p-8 space-y-5">
        <ShieldCheck className="text-[#D8CA82] mx-auto" size={28} aria-hidden="true" />
        <div className="text-center">
          <h2 className="font-display text-lg uppercase tracking-[0.25em] text-[#f7f7f7]">Double authentification</h2>
          <p className="text-xs text-[#c8c8c8] mt-3 leading-relaxed">Entrez le code à 6 chiffres de votre application d'authentification pour continuer.</p>
        </div>
        {error && <p className="form-error text-center" role="alert">{error}</p>}
        <form onSubmit={submit} className="space-y-4" data-testid="login-mfa-form">
          <div>
            <label htmlFor="session-mfa-code" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">Code à 6 chiffres</label>
            <input
              id="session-mfa-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={6}
              className={inputCls}
              data-testid="login-mfa-code-input"
            />
          </div>
          <button type="submit" disabled={busy || code.length < 6} data-testid="login-mfa-submit"
            className="w-full bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm py-3 disabled:opacity-50">
            Valider
          </button>
        </form>
        <button type="button" onClick={() => logout?.()} className="w-full text-xs uppercase tracking-widest text-[#c8c8c8] hover:text-[#D8CA82]">
          Se déconnecter
        </button>
      </div>
    </div>
  );
};
